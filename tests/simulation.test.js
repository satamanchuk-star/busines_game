'use strict';
// ═══════════════════════════════════════════════════════════════════════
//  FMCG-цепочка — полный интеграционный тест
//
//  ЗАПУСК:
//    node tests/simulation.test.js
//
//  Что проверяет:
//    1. UNIT     — calcRound, chainHealth, капы Тура 3, промо-буст
//    2. LOAD     — 36 одновременных WebSocket-соединений (30+ пользователей)
//    3. GAME     — полный игровой флоу: 4 тура, 9 команд, расчёт → итоги → победитель
//    4. PERSIST  — game-state.json записан правильно после каждого тура
//
//  Требования:
//    • Сервер запускается автоматически на порту 3001 с AUTH_ENABLED=0
//    • После теста сервер останавливается, game-state.json удаляется
// ═══════════════════════════════════════════════════════════════════════
const assert = require('assert');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const path = require('path');
const fs = require('fs');

const ROOT      = path.join(__dirname, '..');
const PORT      = 3001;
const WS_URL    = `ws://localhost:${PORT}`;
const PASS      = 'fmcg2024';
const STATE     = path.join(ROOT, 'game-state.json');
const CONFIG    = require('../public/gameconfig.js');

const RETS      = CONFIG.retIds;   // ['R1','R2','R3','R4']
const SUPS      = CONFIG.supIds;   // ['S1','S2','S3','S4']
const ALL       = CONFIG.allTeams; // 9 команд
const P         = CONFIG;

let serverProc  = null;
let passed = 0, failed = 0;

// ─── Цвета для вывода ───
const G = s => `\x1b[32m${s}\x1b[0m`;
const R = s => `\x1b[31m${s}\x1b[0m`;
const B = s => `\x1b[34m${s}\x1b[0m`;
const Y = s => `\x1b[33m${s}\x1b[0m`;

function ok(name)   { passed++; console.log(`  ${G('✓')} ${name}`); }
function fail(name, e) { failed++; console.log(`  ${R('✗')} ${name}\n    ${R(e.message||e)}`); }

async function check(name, fn) {
  try { await fn(); ok(name); }
  catch (e) { fail(name, e); }
}

// ─── WebSocket клиент ───
class Client {
  constructor() {
    this.ws = null;
    this._buf = [];
    this._handlers = [];
  }
  connect(url = WS_URL) {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(url);
      this.ws.once('open', () => resolve(this));
      this.ws.once('error', reject);
      this.ws.on('message', raw => {
        let m; try { m = JSON.parse(raw); } catch { return; }
        this._buf.push(m);
        this._handlers = this._handlers.filter(h => {
          if (h.pred(m)) { clearTimeout(h.t); h.res(m); return false; }
          return true;
        });
      });
    });
  }
  send(obj) { this.ws.send(JSON.stringify(obj)); }
  wait(pred, ms = 5000) {
    const already = this._buf.find(pred);
    if (already) return Promise.resolve(already);
    return new Promise((res, rej) => {
      const t = setTimeout(() => {
        this._handlers = this._handlers.filter(h => h.res !== res);
        rej(new Error(`Timeout ${ms}ms waiting for message`));
      }, ms);
      this._handlers.push({ pred, res, rej, t });
    });
  }
  close() { try { this.ws.terminate(); } catch {} }
}

async function newClient() { return new Client().connect(); }

// ─── Сервер ───
function startServer() {
  return new Promise((resolve, reject) => {
    const env = { ...process.env, AUTH_ENABLED:'0', PORT:String(PORT),
                  NODE_ENV:'test', ADMIN_PASS: PASS };
    serverProc = spawn('node', ['server.js'], { cwd:ROOT, env, stdio:['ignore','pipe','pipe'] });
    let ready = false;
    const onData = d => {
      if (!ready && d.toString().includes('Сервер запущен')) {
        ready = true; serverProc.stdout.off('data', onData); resolve();
      }
    };
    serverProc.stdout.on('data', onData);
    serverProc.stderr.on('data', d => { /* silent */ });
    serverProc.once('error', reject);
    setTimeout(() => { if (!ready) reject(new Error('Server start timeout')); }, 8000);
  });
}

function stopServer() {
  return new Promise(res => {
    if (!serverProc) { res(); return; }
    serverProc.once('exit', res);
    serverProc.kill('SIGTERM');
    setTimeout(res, 1000);
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ─── Построение решения для тура ───
// Возвращает полный объект dec для calcRound(r, dec)
function buildDec(r, opts = {}) {
  const dem = P.demand[r];
  const sups = SUPS.map((_, si) => {
    let base = Math.round(dem[si] * 1.15); // 15% сверх спроса
    if (r === 2 && si === 3) base = 999;   // Тур 3: намеренно сверх квоты (должен срезаться до 30)
    return base;
  });
  const rets = RETS.map((_, ri) => SUPS.map((_, ci) => {
    const base = { asm:1, ord: Math.round(dem[ci] * P.fShare[ci][ri] * 1.1),
                   prc: ri===3 ? 3 : 1, prm:0, dsc:0 };
    if (opts.promoR1 && ri===0 && ci===2) return { ...base, prm:1, dsc:0.12 }; // R1: промо на Снеки
    return base;
  }));
  return {
    tariff:  2.0,
    distCap: r===2 ? 999 : 310,  // Тур 3: намеренно > 200 (должен срезаться)
    sups, rets
  };
}

// ─── Локальная копия движка для unit-тестов ───
const cln = (v,lo,hi) => { v=+v; if(!Number.isFinite(v)) v=0; return Math.max(lo,Math.min(hi,v)); };

function sanitizeDec(r, d) {
  const caps = P.maxProd.map((m,si)=> (r===2&&si===3) ? P.s4Shock : m);
  return {
    tariff:  cln(d.tariff, 0, P.maxTariff),
    distCap: cln(d.distCap, 50, P.distCap[r]),
    sups:    SUPS.map((_,si)=>cln(d.sups?.[si],0,caps[si])),
    rets:    RETS.map((_,ri)=>SUPS.map((_,ci)=>{
      const x=d.rets?.[ri]?.[ci]||{};
      return { asm:x.asm?1:0, ord:cln(x.ord,0,P.maxOrd),
               prc:[0,1,2,3].includes(+x.prc)?+x.prc:1,
               prm:x.prm?1:0, dsc:cln(x.dsc,0,P.maxDsc) };
    })),
    caps,
  };
}

function calcRound(r, dRaw, invArg) {
  const d = sanitizeDec(r, dRaw);
  const { tariff, distCap, sups, rets, caps } = d;
  const prod  = SUPS.map((_,si)=>Math.min(sups[si]||0, caps[si]));
  const oFS   = SUPS.map((_,si)=>RETS.reduce((s,_,ri)=>s+(rets[ri]?.[si]?.ord||0),0));
  const avail = prod.slice();
  const sC    = SUPS.map((_,si)=>oFS[si]>0?Math.min(1,avail[si]/oFS[si]):1);
  const aS    = RETS.map((_,ri)=>SUPS.map((_,ci)=>(rets[ri]?.[ci]?.ord||0)*sC[ci]));
  const totAS = aS.reduce((s,row)=>s+row.reduce((a,v)=>a+v,0),0);
  const dC    = totAS>0?Math.min(1,distCap/totAS):1;
  const del   = aS.map(row=>row.map(v=>v*dC));
  const aD    = RETS.map((_,ri)=>SUPS.map((_,ci)=>{
    const x=rets[ri]?.[ci]; if(!x?.asm) return 0;
    let v=P.demand[r][ci]*P.fShare[ci][ri]*P.price[x.prc??1].dm;
    if(x.prm&&(x.dsc||0)>=P.pThr) v*=P.pBoost; return v;
  }));
  // Перенос запасов (зеркало engine.js): стартовый запас нескоропорта с прошлого тура
  const inv = invArg || RETS.map(()=>SUPS.map(()=>0));
  const sold=[],def=[],over=[],woff=[],osa=[],newInv=[];
  RETS.forEach((_,ri)=>{sold.push([]);def.push([]);over.push([]);woff.push([]);osa.push([]);newInv.push([]);
    SUPS.forEach((_,ci)=>{
      const startInv=P.fresh[ci]?0:(inv[ri]?.[ci]||0);
      const avail=startInv+del[ri][ci];
      const s=Math.min(avail,aD[ri][ci]),leftover=Math.max(0,avail-aD[ri][ci]);
      sold[ri].push(s); def[ri].push(Math.max(0,aD[ri][ci]-avail));
      over[ri].push(leftover); woff[ri].push(P.fresh[ci]?leftover:0);
      newInv[ri].push(P.fresh[ci]?0:leftover);
      osa[ri].push(aD[ri][ci]>0?s/aD[ri][ci]:1);
    });
  });
  const retProfit=RETS.map((_,ri)=>{let p=0;
    SUPS.forEach((_,ci)=>{const x=rets[ri][ci];if(!x.asm)return;
      const opt=P.opt[ci]*(1-x.dsc),rosn=P.rosn[ci]*P.price[x.prc].pm;
      const hold=P.fresh[ci]?0:over[ri][ci]*P.hCost;
      p+=rosn*sold[ri][ci]-(opt+tariff)*del[ri][ci]-hold;});return p;});
  const tD=SUPS.map((_,si)=>RETS.reduce((s,_,ri)=>s+del[ri][si],0));
  const supProfit=SUPS.map((_,si)=>{let rev=0;
    RETS.forEach((_,ri)=>{const opt=P.opt[si]*(1-((rets[ri]?.[si]?.dsc)||0));rev+=opt*del[ri][si];});
    return rev-prod[si]*P.cost[si];});
  const totDel=del.reduce((s,row)=>s+row.reduce((a,v)=>a+v,0),0);
  const retOSA=RETS.map((_,ri)=>{const td=aD[ri].reduce((s,v)=>s+v,0);
    return td>0?aD[ri].reduce((a,v,ci)=>a+sold[ri][ci],0)/td:1;});
  return {r,tariff,distCap:d.distCap,dCoeff:dC,totDelivered:totDel,d,prod,sC,del,actDem:aD,
          sold,def,over,woff,osa,newInv,retProfit,supProfit,dProfit:(tariff-P.tCost)*totDel,
          retOSA,totDel:tD,unsold:SUPS.map((_,si)=>Math.max(0,avail[si]-tD[si]))};
}

const clamp01 = v => Math.max(0,Math.min(1,v));
function chainHealth(res) {
  const totalDef = res.def.flat().reduce((s,v)=>s+v,0);
  const totalWoff= res.woff.flat().reduce((s,v)=>s+v,0);
  const totalOrd = RETS.reduce((s,_,ri)=>s+SUPS.reduce((a,_,ci)=>a+(res.d.rets[ri]?.[ci]?.ord||0),0),0);
  const totalDem = res.actDem.flat().reduce((s,v)=>s+v,0);
  const amp      = totalOrd/Math.max(totalDem,1);
  const OSA      = res.retOSA.reduce((s,v)=>s+v,0)/RETS.length;
  const Deficit  = 1 - clamp01(totalDef/150);
  const Bullwhip = 1 - clamp01((amp-1)/1.5);
  const Waste    = 1 - clamp01(totalWoff/30);
  const H = clamp01(0.35*OSA + 0.25*Deficit + 0.25*Bullwhip + 0.15*Waste);
  return {H, OSA, Deficit, Bullwhip, Waste};
}

// ════════════════════════════════════════════════
//  РАЗДЕЛ 1: UNIT-ТЕСТЫ (без сервера)
// ════════════════════════════════════════════════
async function runUnit() {
  console.log(B('\n── 1. UNIT: движок расчётов ──'));

  await check('calcRound возвращает все ожидаемые поля', () => {
    const res = calcRound(0, buildDec(0));
    assert(['retProfit','supProfit','dProfit','retOSA','sold','def','over','woff',
            'prod','sC','del','dCoeff','totDelivered'].every(k => k in res),
      'Missing fields in calcRound result');
  });

  await check('retProfit — массив из 4 конечных чисел', () => {
    const res = calcRound(0, buildDec(0));
    assert.strictEqual(res.retProfit.length, 4);
    res.retProfit.forEach((v,i) => assert(Number.isFinite(v), `retProfit[${i}] not finite`));
  });

  await check('retOSA — все значения в [0, 1]', () => {
    const res = calcRound(0, buildDec(0));
    res.retOSA.forEach((v,i) => {
      assert(v >= 0 && v <= 1, `retOSA[${i}] = ${v.toFixed(3)} вне [0,1]`);
    });
  });

  await check('supProfit — поставщик без заказов = убыток (только себестоимость)', () => {
    const dec = buildDec(0);
    dec.rets = RETS.map(() => SUPS.map(() => ({ asm:0, ord:0, prc:1, prm:0, dsc:0 })));
    const res = calcRound(0, dec);
    // Производство есть, продаж нет → убыток по каждому поставщику
    res.supProfit.forEach((v,i) => assert(v <= 0, `supProfit[${i}] должен быть ≤0 без заказов, но = ${v.toFixed(2)}`));
  });

  await check('Тур 3: prod[3] срезается до s4Shock=30', () => {
    const dec = buildDec(2);  // sups[3] = 999 намеренно
    const res = calcRound(2, dec);
    assert.strictEqual(res.prod[3], 30, `prod[3] должен быть 30, но = ${res.prod[3]}`);
  });

  await check('Тур 3: distCap срезается до 200', () => {
    const dec = buildDec(2);  // distCap = 999 намеренно
    const res = calcRound(2, dec);
    assert.strictEqual(res.distCap, 200, `distCap должен быть 200, но = ${res.distCap}`);
  });

  await check('Промо-буст × 1.5 при prm=1 + dsc≥10%', () => {
    const decBase  = buildDec(0, { promoR1: false });
    const decPromo = buildDec(0, { promoR1: true  });
    const base  = calcRound(0, decBase);
    const promo = calcRound(0, decPromo);
    // R1 (ri=0) Снеки (ci=2): actDem с промо должен быть больше
    const demBase  = base.actDem[0][2];
    const demPromo = promo.actDem[0][2];
    assert(demPromo > demBase * 1.4, `Промо-буст слабее ожидаемого: ${demPromo.toFixed(1)} vs ${demBase.toFixed(1)}`);
  });

  await check('R4 Премиум: actDem меньше чем R1 (Бакалея, standard vs luxury price)', () => {
    const res = calcRound(0, buildDec(0));
    // R1 dm=1.2 (больший спрос), R4 dm=0.65 (меньший). Но R1 prc=1(dm=1), R4 prc=3(dm=0.65)
    const demR1Bak = res.actDem[0][0]; // R1, Бакалея
    const demR4Bak = res.actDem[3][0]; // R4, Бакалея
    assert(demR4Bak < demR1Bak, `R4 должен иметь меньше спроса чем R1, но ${demR4Bak.toFixed(1)} >= ${demR1Bak.toFixed(1)}`);
  });

  await check('chainHealth H ∈ [0, 1]', () => {
    const res = calcRound(0, buildDec(0));
    const { H, OSA, Deficit, Bullwhip, Waste } = chainHealth(res);
    [H, OSA, Deficit, Bullwhip, Waste].forEach((v,i) => {
      const name = ['H','OSA','Deficit','Bullwhip','Waste'][i];
      assert(v >= 0 && v <= 1, `${name} = ${v.toFixed(3)} вне [0,1]`);
    });
  });

  await check('Дефицит при нулевом производстве → H резко падает', () => {
    const dec = buildDec(0);
    dec.sups = [0, 0, 0, 0]; // ничего не произведено
    const res = calcRound(0, dec);
    const { H } = chainHealth(res);
    assert(H < 0.5, `H должен быть < 0.5 при нулевом производстве, но = ${H.toFixed(3)}`);
  });

  await check('Дистрибьютор: dProfit = (tariff - tCost) × totDelivered', () => {
    const dec = buildDec(0);
    const res = calcRound(0, dec);
    const expected = (res.tariff - P.tCost) * res.totDelivered;
    assert(Math.abs(res.dProfit - expected) < 0.001, `dProfit мismatch: ${res.dProfit} vs ${expected}`);
  });

  await check('Скоропорт (Молочка ci=1): перезапас = полное списание', () => {
    const dec = buildDec(0);
    // Заказать в 3 раза больше молочки чем спрос → будет overstock → woff
    RETS.forEach((_,ri) => { dec.rets[ri][1].ord = 500; });
    dec.sups[1] = 140;
    const res = calcRound(0, dec);
    // woff[ri][1] === over[ri][1] для молочки
    RETS.forEach((_,ri) => {
      assert.strictEqual(res.woff[ri][1], res.over[ri][1],
        `Молочка woff[${ri}][1] должна равняться over[${ri}][1]`);
    });
  });
}

// ════════════════════════════════════════════════
//  РАЗДЕЛ 2: LOAD-ТЕСТ (36+ соединений)
// ════════════════════════════════════════════════
async function runLoad() {
  console.log(B('\n── 2. LOAD: 36 одновременных соединений ──'));

  await check('Сервер принимает 36 WS-соединений одновременно', async () => {
    // 4 игрока × 9 команд = 36 участников + 1 admin + 1 live = 38
    const conns = [];
    const t0 = Date.now();
    for (const tid of ALL) {
      for (let i = 0; i < 4; i++) {
        const c = await newClient();
        c.send({ type:'join', role:'team', teamId:tid, name:`${tid}-P${i+1}` });
        conns.push(c);
      }
    }
    // Все 36 должны получить joined в течение 3 сек
    await Promise.all(conns.map(c => c.wait(m => m.type === 'joined', 3000)));
    const dt = Date.now() - t0;
    assert(dt < 5000, `Подключение 36 клиентов заняло ${dt}ms (> 5 сек)`);
    conns.forEach(c => c.close());
    await sleep(200);
  });

  await check('Broadcast от admin доходит до всех 36 клиентов за ≤1 сек', async () => {
    const admin = await newClient();
    admin.send({ type:'join', role:'admin', password:PASS, name:'TestAdmin' });
    await admin.wait(m => m.type === 'joined');

    const conns = [];
    for (const tid of ALL) {
      for (let i = 0; i < 4; i++) {
        const c = await newClient();
        c.send({ type:'join', role:'team', teamId:tid, name:`${tid}-U${i}` });
        await c.wait(m => m.type === 'joined');
        conns.push(c);
      }
    }

    const t0 = Date.now();
    admin.send({ type:'cmd', cmd:'announce', p:{ text:'LOAD_TEST_PING' } });
    await Promise.all(conns.map(c =>
      c.wait(m => m.type === 'upd' && m.announce === 'LOAD_TEST_PING', 1000)
    ));
    const dt = Date.now() - t0;
    assert(dt < 1000, `Broadcast до 36 клиентов занял ${dt}ms (> 1 сек)`);

    admin.close();
    conns.forEach(c => c.close());
    await sleep(200);
  });

  await check('Сервер не падает при одновременном закрытии 36 соединений', async () => {
    const conns = await Promise.all(ALL.flatMap(tid =>
      [0,1,2,3].map(async i => {
        const c = await newClient();
        c.send({ type:'join', role:'team', teamId:tid, name:`${tid}-C${i}` });
        await c.wait(m => m.type === 'joined', 2000);
        return c;
      })
    ));
    conns.forEach(c => c.close());
    await sleep(300);
    // Сервер должен всё ещё отвечать
    const probe = await newClient();
    probe.send({ type:'join', role:'team', teamId:'D', name:'probe' });
    await probe.wait(m => m.type === 'joined', 2000);
    probe.close();
  });
}

// ════════════════════════════════════════════════
//  РАЗДЕЛ 3: ПОЛНЫЙ ИГРОВОЙ ФЛОУ
// ════════════════════════════════════════════════
async function runGame() {
  console.log(B('\n── 3. GAME: полный флоу 4 тура ──'));

  // Подготовка
  const admin = await newClient();
  admin.send({ type:'join', role:'admin', password:PASS, name:'Ведущий' });
  await admin.wait(m => m.type === 'joined');

  admin.send({ type:'cmd', cmd:'reset' });
  await admin.wait(m => m.type === 'reset', 2000);

  const live = await newClient();
  live.send({ type:'join', role:'player', teamId:'live', name:'Проектор' });
  await live.wait(m => m.type === 'joined');

  // Подключить 9 команд (по 1 игроку)
  const teams = {};
  for (const tid of ALL) {
    const c = await newClient();
    c.send({ type:'join', role:'team', teamId:tid, name:`Команда ${tid}` });
    const j = await c.wait(m => m.type === 'joined', 2000);
    teams[tid] = c;
    assert.strictEqual(j.teamId, tid, `Неверный teamId при join: ${j.teamId}`);
  }

  await check('Все 9 команд подключились', () => {
    assert.strictEqual(Object.keys(teams).length, 9);
  });

  // Раздать роли — сохраняем upd-сообщение для проверки
  admin.send({ type:'cmd', cmd:'deal', p:{ teamSize:4 } });
  const dealUpd = await admin.wait(m => m.type === 'upd' && m.rolesDealt === true, 2000);

  await check('После deal: все команды получили ростер', () => {
    // deal broadcast: {type:'upd', rosters, teamSize, rolesDealt:true}
    assert(dealUpd.rolesDealt, 'rolesDealt не установлен в upd');
    assert(dealUpd.rosters && Object.keys(dealUpd.rosters).length === 9,
      `Ростеры не для всех 9 команд: ${Object.keys(dealUpd.rosters||{}).length}`);
  });

  const roundResults = [];
  let refInv = null;   // эталонный перенос запасов между турами (как G.invByRound на сервере)

  // ── 4 тура ──
  for (let r = 0; r < 4; r++) {
    console.log(Y(`\n  → Тур ${r+1} (r=${r})`));
    if (r > 0) {
      admin.send({ type:'cmd', cmd:'next' });
      await admin.wait(m => m.type === 'upd' && m.round === r, 2000);
    } else {
      admin.send({ type:'cmd', cmd:'phase', p:{ phase:'briefing' } });
      await admin.wait(m => m.type === 'upd' && m.phase === 'briefing', 2000);
    }

    // Фаза решений
    admin.send({ type:'cmd', cmd:'phase', p:{ phase:'decisions' } });
    await admin.wait(m => m.type === 'upd' && m.phase === 'decisions', 2000);

    // Каждая команда подаёт решение
    const dec = buildDec(r, { promoR1: r === 1 }); // В туре 2 R1 активирует промо
    const submitted = {};
    const subPromises = ALL.map(tid =>
      admin.wait(m => m.type === 'teamSub' && m.teamId === tid && m.round === r, 5000)
        .then(m => { submitted[tid] = m; })
    );

    // Команды отправляют своё решение
    for (const tid of ALL) {
      teams[tid].send({ type:'submit', round:r, data:dec });
    }
    await Promise.all(subPromises);

    await check(`Тур ${r+1}: все 9 команд подали решение`, () => {
      assert.strictEqual(Object.keys(submitted).length, 9, 'Не все команды подали решение');
    });

    // Admin рассчитывает итоги
    admin.send({ type:'cmd', cmd:'calculate', p:{ dec } });

    const [result, adminResult] = await Promise.all([
      admin.wait(m => m.type === 'result' && m.round === r, 5000),
      admin.wait(m => m.type === 'adminResult' && m.round === r, 5000),
    ]);

    // Каждая команда получает личный результат (фильтруем по туру, т.к. буфер накапливает)
    const teamResultPromises = ALL.map(tid =>
      teams[tid].wait(m => m.type === 'myResult' && m.result?.r === r, 3000)
    );
    const teamResults = await Promise.all(teamResultPromises);

    // Эталонный расчёт для сверки (с переносом запасов, как на сервере)
    const expected = calcRound(r, dec, refInv);
    refInv = expected.newInv;   // остаток нескоропорта → стартовый запас след. тура
    const expectedH = chainHealth(expected);
    roundResults.push({ r, result: result.result, expected, expectedH });

    await check(`Тур ${r+1}: retProfit совпадает с эталонным (±0.001)`, () => {
      RETS.forEach((tid, ri) => {
        const got  = result.result.retProfit[ri];
        const exp  = expected.retProfit[ri];
        assert(Math.abs(got - exp) < 0.001,
          `retProfit[${ri}] (${tid}): ${got.toFixed(3)} vs expected ${exp.toFixed(3)}`);
      });
    });

    await check(`Тур ${r+1}: supProfit совпадает с эталонным (±0.001)`, () => {
      SUPS.forEach((tid, si) => {
        const got = result.result.supProfit[si];
        const exp = expected.supProfit[si];
        assert(Math.abs(got - exp) < 0.001,
          `supProfit[${si}] (${tid}): ${got.toFixed(3)} vs expected ${exp.toFixed(3)}`);
      });
    });

    await check(`Тур ${r+1}: health.H в [0,1]`, () => {
      const H = result.result.health?.H;
      assert(H >= 0 && H <= 1, `H = ${H?.toFixed(3)} вне [0,1]`);
    });

    await check(`Тур ${r+1}: retOSA все в [0,1]`, () => {
      result.result.retOSA.forEach((v,ri) =>
        assert(v >= 0 && v <= 1, `retOSA[${ri}] = ${v?.toFixed(3)} вне [0,1]`));
    });

    await check(`Тур ${r+1}: каждая команда получила myResult с личными данными`, () => {
      assert.strictEqual(teamResults.length, 9, 'Не все команды получили myResult');
      teamResults.forEach((msg, i) => {
        assert(msg.result && msg.result.type, `команда ${ALL[i]}: myResult без поля type`);
      });
    });

    if (r === 2) { // Тур 3 — проверяем шок
      await check('Тур 3: production S4 (П4) срезан до 30 (квота)', () => {
        const prod3 = adminResult.result.prod[3];
        assert(prod3 <= 30, `prod[3] = ${prod3} > 30 — квота не применена`);
      });
      await check('Тур 3: distCap срезан до 200', () => {
        const dc = adminResult.result.distCap;
        assert(dc <= 200, `distCap = ${dc} > 200 — лимит не применён`);
      });
    }

    if (r === 1) { // Тур 2 — проверяем промо
      await check('Тур 2: R1 с промо имеет больше actDem на Снеки чем без промо', () => {
        const decBase = buildDec(1, { promoR1: false });
        const resBase = calcRound(1, decBase);
        const demPromo = adminResult.result.actDem[0][2]; // R1, Снеки
        const demBase  = resBase.actDem[0][2];
        assert(demPromo > demBase * 1.4,
          `Промо-буст R1 Снеки: ${demPromo.toFixed(1)} vs без промо ${demBase.toFixed(1)}`);
      });
    }

    // Проектор должен видеть обновление
    await check(`Тур ${r+1}: live-экран получил result с публичными данными`, async () => {
      const liveResult = await live.wait(m => m.type === 'result' && m.round === r, 3000);
      assert(liveResult.result.retProfit, 'live: нет retProfit в result');
      assert(liveResult.cumScores, 'live: нет cumScores');
      assert.strictEqual(Object.keys(liveResult.cumScores).length, 9, 'live: cumScores не для 9 команд');
    });
  }

  // ── Финал и победитель ──
  admin.send({ type:'cmd', cmd:'phase', p:{ phase:'final' } });
  await admin.wait(m => m.type === 'upd' && m.phase === 'final', 2000);

  await check('Финал: накопленные очки = сумма по 4 турам', async () => {
    // Получить финальный adminView
    admin.send({ type:'cmd', cmd:'phase', p:{ phase:'final' } });
    await sleep(200);
    // Запросить текущее состояние через переподключение
    const probe = await newClient();
    probe.send({ type:'join', role:'admin', password:PASS, name:'probe' });
    const j = await probe.wait(m => m.type === 'joined', 2000);
    const scores = j.state.scores;
    const results = j.state.results;

    ALL.forEach(tid => {
      const cumFromResults = results.reduce((s, res) => s + (res?.scores?.[tid] || 0), 0);
      const cumFromScores  = scores?.[tid] || 0;
      assert(Math.abs(cumFromResults - cumFromScores) < 0.01,
        `${tid}: scores[${cumFromScores.toFixed(2)}] ≠ sum из results [${cumFromResults.toFixed(2)}]`);
    });
    probe.close();
  });

  await check('Победитель — команда с максимальным счётом', async () => {
    const probe = await newClient();
    probe.send({ type:'join', role:'admin', password:PASS, name:'probe2' });
    const j = await probe.wait(m => m.type === 'joined', 2000);
    const scores = j.state.scores;
    const winner = Object.entries(scores).sort((a,b) => b[1]-a[1])[0];
    assert(winner, 'Не удалось определить победителя');
    assert(Number.isFinite(winner[1]), `Счёт победителя не число: ${winner[1]}`);
    console.log(Y(`     Победитель: ${winner[0]} (${P.LBL[winner[0]]}) — ${winner[1].toFixed(1)} очков`));
    probe.close();
  });

  await check('Переход тур→тур: round инкрементируется корректно', () => {
    // Уже проверено выше (4 тура прошли), этот check валидирует что r=0..3 прошли успешно
    assert.strictEqual(roundResults.length, 4, 'Прошло не 4 тура');
    roundResults.forEach(({r}, i) => assert.strictEqual(r, i));
  });

  // Закрываем соединения
  admin.close(); live.close();
  Object.values(teams).forEach(c => c.close());
  await sleep(300);
}

// ════════════════════════════════════════════════
//  РАЗДЕЛ 4: ПЕРСИСТЕНТНОСТЬ
// ════════════════════════════════════════════════
async function runPersist() {
  console.log(B('\n── 4. PERSIST: сохранение и восстановление состояния ──'));

  await check('game-state.json существует после игры', () => {
    assert(fs.existsSync(STATE), `Файл состояния не найден: ${STATE}`);
  });

  await check('game-state.json содержит корректную структуру', () => {
    const s = JSON.parse(fs.readFileSync(STATE, 'utf8'));
    assert.strictEqual(typeof s.phase, 'string', 'phase не строка');
    assert.strictEqual(typeof s.round, 'number', 'round не число');
    assert(Array.isArray(s.results), 'results не массив');
    assert(s.results.length > 0, 'results пустой');
    assert(s.scores && typeof s.scores === 'object', 'scores отсутствует');
  });

  await check('game-state.json содержит результаты всех 4 туров', () => {
    const s = JSON.parse(fs.readFileSync(STATE, 'utf8'));
    assert.strictEqual(s.results.length, 4, `Ожидалось 4 тура, найдено ${s.results.length}`);
    s.results.forEach((res, r) => {
      assert(res, `results[${r}] = null`);
      assert(res.retProfit?.length === 4, `results[${r}]: retProfit не для 4 ритейлеров`);
      assert(res.supProfit?.length === 4, `results[${r}]: supProfit не для 4 поставщиков`);
      assert(typeof res.dProfit === 'number', `results[${r}]: dProfit не число`);
    });
  });

  await check('Восстановление состояния: новое соединение видит финальную фазу', async () => {
    const probe = await newClient();
    probe.send({ type:'join', role:'admin', password:PASS, name:'restore-check' });
    const j = await probe.wait(m => m.type === 'joined', 3000);
    assert(j.state.results.length >= 4, 'Результаты не восстановлены');
    assert(j.state.scores && Object.keys(j.state.scores).length === 9, 'scores не восстановлены');
    probe.close();
  });
}

// ════════════════════════════════════════════════
//  RUNNER
// ════════════════════════════════════════════════
async function main() {
  console.log(B('═══════════════════════════════════════════'));
  console.log(B('  FMCG-цепочка — Integration Test Suite   '));
  console.log(B('═══════════════════════════════════════════'));

  // Удалить старый game-state.json чтобы начать чисто
  if (fs.existsSync(STATE)) fs.unlinkSync(STATE);

  console.log('\nЗапуск тестового сервера на порту', PORT, '...');
  await startServer();
  console.log(G('Сервер запущен ✓\n'));

  try {
    await runUnit();
    await runLoad();
    await runGame();
    await runPersist();
  } finally {
    await stopServer();
    // Не удаляем game-state.json — может пригодиться для диагностики
  }

  console.log(B('\n═══════════════════════════════════════════'));
  const total = passed + failed;
  if (failed === 0) {
    console.log(G(`  ВСЕ ТЕСТЫ ПРОШЛИ: ${passed}/${total} ✓`));
  } else {
    console.log(R(`  ПРОВАЛЕНО: ${failed}/${total}`));
    console.log(G(`  Прошло:    ${passed}/${total}`));
  }
  console.log(B('═══════════════════════════════════════════\n'));

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => {
  console.error(R('\nFATAL ERROR:'), e);
  stopServer().finally(() => process.exit(1));
});
