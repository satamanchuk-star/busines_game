'use strict';
const express = require('express');
const { WebSocketServer } = require('ws');
const http = require('http');
const path = require('path');
const os = require('os');
const fs = require('fs');

const CONFIG = require('./public/gameconfig.js');   // единый источник данных и экономики

const PORT = process.env.PORT || 3000;
const ADMIN_PASS = process.env.ADMIN_PASS || 'fmcg2024';
const STATE_FILE = path.join(__dirname, 'game-state.json');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });
app.use(express.static(path.join(__dirname, 'public')));

// ━━━ CONSTANTS (из единого конфига public/gameconfig.js) ━━━
const RETS = CONFIG.retIds;
const SUPS = CONFIG.supIds;
const ALL_TEAMS = CONFIG.allTeams;

const P = CONFIG;   // экономика и константы движка — эталон для всех клиентов

// ━━━ ОБОЗНАЧЕНИЯ (внутренние ключи R/S/D, отображение Р/П/Д) ━━━
const LBL = CONFIG.LBL;
const LBL2ID = {}; Object.entries(LBL).forEach(([k,v])=>{ LBL2ID[v.toUpperCase()]=k; });
// Старые короткие коды остаются валидными алиасами при ручном вводе
Object.entries({R1:'Р1',R2:'Р2',R3:'Р3',S1:'П1',S2:'П2',S3:'П3',S4:'П4',D:'Д'}).forEach(([k,v])=>{ LBL2ID[v.toUpperCase()]=k; });
function normTeam(t) {
  if(!t) return t;
  t = String(t).trim().toUpperCase();
  if(ALL_TEAMS.includes(t)) return t;   // R1 / S1 / D (латиница)
  if(LBL2ID[t]) return LBL2ID[t];        // Р1 / П1 / Д (кириллица)
  return t;
}

// ━━━ ВНУТРИКОМАНДНЫЕ РОЛИ (роль[0] = Директор, ведёт переговоры) ━━━
// duty — короткая подпись; desc — что делает; decide — что решает в форме; watch — на что смотреть
const ROLE_SETS = {
  ret: [
    {ico:'🎩',title:'Директор сети', duty:'Финальное решение, переговоры', lead:true,
     desc:'Голос команды на переговорах. Слушает аналитика, закупщика и категорийщика, но финальное слово — за ним.',
     decide:'Ведёт переговоры с производителями и перевозчиком, утверждает итоговое решение команды.',
     watch:'Баланс: договориться о скидках, но не обрушить отношения и не остаться без товара.'},
    {ico:'🏷️',title:'Категорийный менеджер', duty:'Цена и промо',
     desc:'Отвечает за то, по какой цене и с каким промо продавать каждую категорию на полке.',
     decide:'Уровень цены (агрессивная/стандарт/премиум) и включение промо по каждой категории.',
     watch:'Промо со скидкой ≥10% даёт всплеск спроса, но режет маржу. Премиум-цена работает только если товар свежий и в наличии.'},
    {ico:'📦',title:'Менеджер закупок', duty:'Объёмы заказов производителям',
     desc:'Решает, сколько и чего заказать у производителей под прогноз спроса.',
     decide:'Объёмы заказа по каждой категории товара.',
     watch:'Перезаказ скоропорта (молочка/фреш) = списания в убыток. Недозаказ = пустые полки и потеря покупателя.'},
    {ico:'📈',title:'Аналитик спроса', duty:'Прогноз и чтение рынка',
     desc:'Читает вводные рынка и событие тура, переводит их в прогноз для команды.',
     decide:'Не вводит цифры сам — даёт прогноз закупщику и категорийщику.',
     watch:'Как изменился спрос к прошлому туру, какое событие объявлено, где будет дефицит или всплеск.'},
  ],
  sup: [
    {ico:'🎩',title:'Генеральный директор', duty:'Стратегия, переговоры', lead:true,
     desc:'Ведёт переговоры с магазинами и перевозчиком, держит общую стратегию производителя.',
     decide:'Переговоры о скидках и объёмах, утверждение итогового решения команды.',
     watch:'Скидка ниже себестоимости = работа в убыток. Но без скидок магазины уйдут к конкуренту.'},
    {ico:'🏭',title:'Директор производства', duty:'Объём выпуска',
     desc:'Решает, сколько единиц товара произвести в этом туре.',
     decide:'Объём производства (в пределах мощности).',
     watch:'Произвёл больше, чем заказали магазины — остаток. Для скоропорта остаток = прямой убыток.'},
    {ico:'💼',title:'Коммерческий директор', duty:'Отпускные цены и скидки',
     desc:'Отвечает за отпускные цены и размер скидок конкретным магазинам.',
     decide:'Скидки по каждому магазину (обычно итог переговоров).',
     watch:'Каждый процент скидки — это ваша маржа. Давайте скидку за объём или лояльность, а не просто так.'},
    {ico:'📊',title:'Планировщик S&OP', duty:'Баланс мощности и спроса',
     desc:'Сводит прогноз спроса с производственной мощностью, ищет узкие места.',
     decide:'Не вводит цифры сам — советует директору производства точный объём.',
     watch:'Где мощности не хватит под спрос, где есть риск перепроизводства.'},
  ],
  dist: [
    {ico:'🎩',title:'Управляющий директор', duty:'Тариф, переговоры', lead:true,
     desc:'Ведёт переговоры со всеми: перевозчик в цепочке один, и все зависят от него.',
     decide:'Тариф за доставку, переговоры о приоритете и надбавках.',
     watch:'Высокий тариф = ваша маржа, но он душит магазины и производителей и роняет здоровье цепочки (а это общий бонус).'},
    {ico:'🚚',title:'Директор логистики', duty:'Распределение мощностей',
     desc:'Решает, как распределить ограниченную мощность доставки между всеми заказами.',
     decide:'Заявленная мощность доставки на тур.',
     watch:'В Туре 3 мощность урезается — товара довезёте меньше, чем хотят все вместе. Кому отдать приоритет?'},
    {ico:'🤝',title:'Менеджер по клиентам', duty:'Приоритеты при дефиците',
     desc:'Договаривается с магазинами, чьи заказы везти первыми, когда на всех не хватает.',
     decide:'Приоритеты доставки (итог переговоров при дефиците).',
     watch:'За приоритет можно требовать надбавку — но обиженный клиент это запомнит.'},
    {ico:'🧮',title:'Аналитик загрузки', duty:'Оптимизация тарифа',
     desc:'Считает, при каком тарифе и загрузке перевозчик заработает максимум, не убив цепочку.',
     decide:'Не вводит цифры сам — советует директору оптимальный тариф.',
     watch:'Слишком высокий тариф → меньше заказов → ниже загрузка → меньше прибыль. Ищите баланс.'},
  ],
};
const CHARS = {
  'Жёсткий':       {ico:'🦁',clr:'#f85149',desc:'Диктует условия, почти не уступает'},
  'Кооперативный': {ico:'🤝',clr:'#3fb950',desc:'Ищет win-win, легко идёт навстречу'},
  'Хитрый':        {ico:'🦊',clr:'#d29922',desc:'Завышает запрос, делает ложные уступки'},
  'Упрямый':       {ico:'😤',clr:'#f0883e',desc:'Держит позицию, не реагирует на аргументы'},
  'Аналитик':      {ico:'📊',clr:'#58a6ff',desc:'Обосновывает цифрами, принимает взвешенно'},
};
const CHAR_NAMES = Object.keys(CHARS);
const BONUS_FUND = 250; // фонд здоровья цепочки за тур
const teamType = tid => RETS.includes(tid)?'ret':SUPS.includes(tid)?'sup':'dist';
const pick = a => a[Math.floor(Math.random()*a.length)];
const clamp01 = v => Math.max(0,Math.min(1,v));

function dealRoles(n) {
  n = Math.max(1, Math.min(4, n||4));
  G.teamSize = n; G.rosters = {};
  ALL_TEAMS.forEach(tid=>{
    const set = ROLE_SETS[teamType(tid)], slots=[];
    for(let i=0;i<n;i++) slots.push({role:set[i], char:pick(CHAR_NAMES)});
    G.rosters[tid]=slots;
  });
  G.rolesDealt = true;
}

function roundProfit(res, tid) {
  const ri=RETS.indexOf(tid), si=SUPS.indexOf(tid);
  if(ri>=0) return res.retProfit[ri];
  if(si>=0) return res.supProfit[si];
  return res.dProfit;
}

// Личный вклад команды в здоровье цепочки [0..1] — масштабирует бонус.
// Р — собственный OSA, П — выполнение заказов (fill rate), Д — доля довезённого.
function contribOf(res, tid) {
  const ri=RETS.indexOf(tid), si=SUPS.indexOf(tid);
  if(ri>=0) return clamp01(res.retOSA[ri]);
  if(si>=0) return clamp01(res.supC[si]);
  return clamp01(res.dCoeff);
}

function chainHealth(res) {
  const r=res.r;
  const OSA      = res.retOSA.reduce((s,v)=>s+v,0)/RETS.length;
  const totalDef = res.def.flat().reduce((s,v)=>s+v,0);
  const totalWoff= res.woff.flat().reduce((s,v)=>s+v,0);
  const totalOrd = RETS.reduce((s,_,ri)=>s+SUPS.reduce((a,_,ci)=>a+(res.d.rets[ri]?.[ci]?.ord||0),0),0);
  // Хлыст сравниваем с ФАКТИЧЕСКИМ спросом (цена/промо меняют его легально)
  const totalDem = res.actDem.flat().reduce((s,v)=>s+v,0);
  const amp      = totalOrd/Math.max(totalDem,1);
  const Deficit  = 1 - clamp01(totalDef/150);
  const Bullwhip = 1 - clamp01((amp-1)/1.5);
  const Waste    = 1 - clamp01(totalWoff/30);
  const H = clamp01(0.35*OSA + 0.25*Deficit + 0.25*Bullwhip + 0.15*Waste);
  return {H, OSA, Deficit, Bullwhip, Waste, totalDef, totalWoff};
}

function recomputeScores() {
  G.scores = {}; ALL_TEAMS.forEach(t=>G.scores[t]=0);
  G.results.forEach(res=>{ if(!res||!res.scores) return;
    ALL_TEAMS.forEach(t=>{ G.scores[t]+=res.scores[t]||0; }); });
}

// ━━━ GAME STATE ━━━
function mkState() {
  return {
    phase: 'lobby',
    round: 0,
    names: { R1:'Дискаунтер', R2:'Супермаркет', R3:'Гипермаркет',
             S1:'Базовый', S2:'Fresh', S3:'Промо-хиты', S4:'Импорт', D:'Дистрибьютор' },
    timer: { on:false, end:null, mins:0 },
    decisions: {},     // {[round]: {[teamId]: {submitted, data}}}
    results: [],
    manual: {},        // {[round]: {[teamId]: score}}
    proposals: [],
    agreements: [],
    announce: '',
    teamSize: 4,
    rosters: {},       // {[teamId]: [{role:{ico,title,duty,lead}, char}]}
    rolesDealt: false,
    scores: {},        // {[teamId]: накопленный счёт (прибыль + здоровье)}
  };
}
let G = mkState();

// ━━━ ПЕРСИСТЕНТНОСТЬ СОСТОЯНИЯ ━━━
// G хранится в памяти, но дублируется в game-state.json, чтобы игра пережила
// перезапуск сервера (launchd KeepAlive, краш, рестарт ноутбука) без потери прогресса.
let saveTimer = null, saveDirty = false;
let restoredFromDisk = false;   // true, если при старте подняли игру с прогрессом — ведущий увидит баннер
function scheduleSave() {                       // дебаунс: пачка изменений = одна запись
  saveDirty = true;
  if (saveTimer) return;
  saveTimer = setTimeout(flushSave, 400);
}
function flushSave() {
  saveTimer = null;
  if (!saveDirty) return;
  saveDirty = false;
  try { fs.writeFileSync(STATE_FILE, JSON.stringify(G)); }
  catch (e) { console.error('  ⚠ Ошибка сохранения состояния:', e.message); }
}
function loadState() {
  try {
    if (!fs.existsSync(STATE_FILE)) return;
    const s = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    // Минимальная валидация формы — не восстанавливаем мусор
    if (s && typeof s.phase === 'string' && typeof s.round === 'number') {
      G = Object.assign(mkState(), s);          // новые поля схемы получают дефолты
      // Баннер показываем только при реальном прогрессе, а не при пустом лобби
      const hasProgress = G.phase !== 'lobby' || G.round > 0 || (G.results && G.results.length > 0);
      if (hasProgress) {
        restoredFromDisk = true;
        console.log(`  ↻ Состояние восстановлено: фаза «${G.phase}», тур ${G.round + 1}`);
      }
    }
  } catch (e) { console.error('  ⚠ Ошибка загрузки состояния:', e.message); }
}
// Гарантированно сбрасываем на диск при остановке сервиса
process.on('SIGINT',  () => { flushSave(); process.exit(0); });
process.on('SIGTERM', () => { flushSave(); process.exit(0); });

// ━━━ CLIENTS ━━━
const clients = new Map(); // ws → {id, role, teamId, name}
let seq = 0;

const tx = (ws, msg) => { if (ws.readyState===1) ws.send(JSON.stringify(msg)); };
const bcast = (msg, fn=null) => clients.forEach((c,ws) => (!fn||fn(c)) && tx(ws, msg));
const bcastAll = msg => bcast(msg);

// ━━━ STATE VIEWS ━━━
function pubView() {
  return {
    phase:G.phase, round:G.round, names:G.names, timer:G.timer, announce:G.announce,
    submitted: subList(),
    connected: [...new Set([...clients.values()].filter(c=>c.teamId).map(c=>c.teamId))],
    results: G.results.map(pubResult),
    rosters: G.rosters, teamSize: G.teamSize, rolesDealt: G.rolesDealt,
    scores: G.scores, labels: LBL,
    health: G.results.map(r=>r?r.health:null),
  };
}
function adminView() {
  return { ...pubView(), decisions:G.decisions, manual:G.manual,
           proposals:G.proposals, agreements:G.agreements,
           restored: restoredFromDisk,
           results: G.results,
           users: [...clients.values()].map(c=>({id:c.id,role:c.role,teamId:c.teamId,name:c.name})) };
}
function teamView(tid) {
  const r=G.round;
  return { ...pubView(),
    myDec: G.decisions[r]?.[tid]||null,
    myProposals: G.proposals.filter(p=>(p.from===tid||p.to===tid)&&p.round===G.round),
    agreements: G.agreements.filter(a=>a.from===tid||a.to===tid),
    myResult: G.results[r] ? myResult(G.results[r],tid) : null,
    history: G.results.map(res=>myResult(res,tid)),
    myRoster: G.rosters[tid]||null,
  };
}
function subList() {
  const d=G.decisions[G.round]||{};
  return ALL_TEAMS.filter(t=>d[t]?.submitted);
}
function pubResult(res) {
  if(!res)return null;
  return { r:res.r, retProfit:res.retProfit, supProfit:res.supProfit, dProfit:res.dProfit,
           retOSA:res.retOSA, totDel:res.totDel, ordFromSup:res.ordFromSup,
           totDelivered:res.totDelivered, dCoeff:res.dCoeff, tariff:res.tariff,
           sold:res.sold, def:res.def, over:res.over, woff:res.woff, unsold:res.unsold,
           health:res.health, scores:res.scores, contrib:res.contrib };
}
function myResult(res, tid) {
  if(!res)return null;
  const base = pubResult(res);
  const extra = { score:res.scores?.[tid], chainH:res.health?.H, contrib:res.contrib?.[tid] };
  const ri=RETS.indexOf(tid), si=SUPS.indexOf(tid);
  if(ri>=0) return {...base,...extra,type:'ret',ri, profit:res.retProfit[ri], osa:res.retOSA[ri], sold:res.sold[ri], def:res.def[ri]};
  if(si>=0) return {...base,...extra,type:'sup',si, profit:res.supProfit[si], del:res.totDel[si], unsold:res.unsold[si]};
  if(tid==='D') return {...base,...extra,type:'dist', profit:res.dProfit, del:res.totDelivered, coeff:res.dCoeff};
  return base;
}

// ━━━ CALCULATION ENGINE ━━━
const cln = (v,lo,hi) => { v=+v; if(!Number.isFinite(v)) v=0; return Math.max(lo,Math.min(hi,v)); };
// Клэмп входов: отрицательные/запредельные значения ломают расчёт всего тура
function sanitizeDec(r, d) {
  const caps = P.maxProd.map((m,si)=> (r===2 && si===3) ? P.s4Shock : m); // Тур 3: квота П4
  return {
    tariff:  cln(d.tariff, 0, P.maxTariff),
    distCap: cln(d.distCap, 50, 1000),
    sups:    SUPS.map((_,si)=>cln(d.sups?.[si], 0, caps[si])),
    rets:    RETS.map((_,ri)=>SUPS.map((_,ci)=>{
      const x = d.rets?.[ri]?.[ci] || {};
      return { asm: x.asm?1:0, ord: cln(x.ord,0,P.maxOrd),
               prc: [0,1,2].includes(+x.prc)?+x.prc:1,
               prm: x.prm?1:0, dsc: cln(x.dsc,0,P.maxDsc) };
    })),
    caps,
  };
}

function calcRound(r, dRaw) {
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
    const x=rets[ri]?.[ci]; if(!x?.asm)return 0;
    let v=P.demand[r][ci]*P.fShare[ci][ri]*P.price[x.prc||1].dm;
    if(x.prm&&(x.dsc||0)>=P.pThr)v*=P.pBoost; return v;
  }));
  const sold=[],def=[],over=[],woff=[],osa=[];
  RETS.forEach((_,ri)=>{sold.push([]);def.push([]);over.push([]);woff.push([]);osa.push([]);
    SUPS.forEach((_,ci)=>{
      const s=Math.min(del[ri][ci],aD[ri][ci]), ov=Math.max(0,del[ri][ci]-s);
      sold[ri].push(s); def[ri].push(Math.max(0,aD[ri][ci]-s));
      over[ri].push(ov); woff[ri].push(P.fresh[ci]?ov:0);
      osa[ri].push(aD[ri][ci]>0?s/aD[ri][ci]:1);
    });
  });
  // Ритейлер платит за всё ПОСТАВЛЕННОЕ (закупка + тариф), выручка — только с проданного.
  // Fresh-перезапас теряется полностью; прочий перезапас сохраняет salv×закупка минус холдинг.
  const retProfit=RETS.map((_,ri)=>{let p=0;
    SUPS.forEach((_,ci)=>{const x=rets[ri][ci];if(!x.asm)return;
      const opt=P.opt[ci]*(1-x.dsc), rosn=P.rosn[ci]*P.price[x.prc].pm;
      const salv=P.fresh[ci]?0:P.salv*opt*over[ri][ci];
      const hold=P.fresh[ci]?0:over[ri][ci]*P.hCost;
      p+=rosn*sold[ri][ci]-(opt+tariff)*del[ri][ci]+salv-hold;});return p;});
  const tD=SUPS.map((_,si)=>RETS.reduce((s,_,ri)=>s+del[ri][si],0));
  const supProfit=SUPS.map((_,si)=>{let rev=0;
    RETS.forEach((_,ri)=>{const opt=P.opt[si]*(1-((rets[ri]?.[si]?.dsc)||0));rev+=opt*del[ri][si];});
    return rev-prod[si]*P.cost[si];});
  const totDel=del.reduce((s,row)=>s+row.reduce((a,v)=>a+v,0),0);
  const retOSA=RETS.map((_,ri)=>{const td=aD[ri].reduce((s,v)=>s+v,0);
    return td>0?aD[ri].reduce((a,v,ci)=>a+sold[ri][ci],0)/td:1;});
  return {r,tariff,distCap,dCoeff:dC,totDelivered:totDel,d,prod,avail,ordFromSup:oFS,supC:sC,
          del,actDem:aD,sold,def,over,woff,osa,retProfit,supProfit,dProfit:(tariff-P.tCost)*totDel,
          retOSA,totDel:tD,unsold:SUPS.map((_,si)=>Math.max(0,avail[si]-tD[si]))};
}

// ━━━ WEBSOCKET ━━━
wss.on('connection', ws => {
  const id = ++seq;
  clients.set(ws, { id, role:null, teamId:null, name:null });

  ws.on('close', () => {
    const c=clients.get(ws); clients.delete(ws);
    bcastAll({ type:'userLeft', id });
    console.log(`[-] ${c?.role||'?'} "${c?.name||id}"`);
  });

  ws.on('message', raw => {
    try {
      const m = JSON.parse(raw);
      handle(ws, m);
      if (m.type !== 'ping') scheduleSave();   // персист после любой обработки (кроме keep-alive)
    }
    catch(e) { console.error('msg err:', e.message); }
  });
});

function handle(ws, msg) {
  const me = clients.get(ws);

  // ─ JOIN ─
  if (msg.type === 'join') {
    let { role, teamId, name, password } = msg;
    if (role==='admin' && password!==ADMIN_PASS)
      return tx(ws, {type:'err', msg:'Неверный пароль администратора'});
    // 'live' (проектор) подключается как player без команды — не засоряет список команд
    if (role==='player' && teamId==='live') { teamId=null; name=name||'Проектор'; }
    else if (role==='team'||role==='player') {
      teamId = normTeam(teamId);
      if (!ALL_TEAMS.includes(teamId))
        return tx(ws, {type:'err', msg:`Неверный код команды: ${msg.teamId}`});
    }
    Object.assign(me, { role, teamId: teamId||null, name: name||(role==='admin'?'Ведущий':teamId) });
    const sv = role==='admin' ? adminView() : role==='team' ? teamView(teamId) : pubView();
    tx(ws, { type:'joined', role, teamId, state: sv });
    bcastAll({ type:'userEvent', event:'join', user:{id:me.id,role,teamId,name:me.name} });
    console.log(`[+] ${role} "${me.name}"`);
    return;
  }

  if (!me.role) return;

  // ─ RENAME ─
  if (msg.type === 'rename') {
    const tid = me.role==='admin' ? msg.teamId : me.teamId;
    if (tid && ALL_TEAMS.includes(tid)) G.names[tid] = msg.name;
    bcastAll({ type:'upd', names: G.names });
    return;
  }

  // ─ ADMIN COMMANDS ─
  if (msg.type === 'cmd') {
    if (me.role !== 'admin') {
      // Команды управления игрой — только ведущему. Логируем попытки обхода (DevTools и т.п.)
      console.warn(`  ⚠ Отклонена admin-команда "${msg.cmd}" от ${me.role||'?'} "${me.name||me.teamId||'?'}"`);
      return;
    }
    const { cmd, p={} } = msg;

    if (cmd==='phase')  { G.phase=p.phase; bcastAll({type:'upd',phase:G.phase}); }
    if (cmd==='timer')  {
      G.timer = p.on ? {on:true,end:Date.now()+p.mins*60000,mins:p.mins} : {on:false,end:null,mins:0};
      bcastAll({type:'upd',timer:G.timer});
    }
    if (cmd==='announce') { G.announce=p.text; bcastAll({type:'upd',announce:G.announce}); }
    if (cmd==='manual') {
      if (!G.manual[p.round]) G.manual[p.round]={};
      G.manual[p.round][p.teamId]=p.score;
      tx(ws, {type:'upd',manual:G.manual});
    }
    if (cmd==='setDec') {
      const {round,teamId,data}=p;
      if (!G.decisions[round]) G.decisions[round]={};
      G.decisions[round][teamId]={submitted:true,data,by:'admin'};
      bcastAll({type:'upd',submitted:subList()});
      clients.forEach((c,w)=>{ if(c.teamId===teamId) tx(w,{type:'decSet',data}); });
    }
    if (cmd==='deal') {
      dealRoles(p.teamSize||G.teamSize||4);
      bcastAll({type:'upd', rosters:G.rosters, teamSize:G.teamSize, rolesDealt:true});
      return;
    }
    if (cmd==='calculate') {
      const res = calcRound(G.round, p.dec);
      // Здоровье цепочки и счёт команд за тур: бонус = H × фонд × личный вклад
      res.health = chainHealth(res);
      res.contrib = {}; res.scores = {};
      ALL_TEAMS.forEach(t=>{
        res.contrib[t] = contribOf(res,t);
        res.scores[t]  = roundProfit(res,t) + res.health.H*BONUS_FUND*res.contrib[t];
      });
      if (G.results.length>G.round) G.results[G.round]=res;
      else { while(G.results.length<G.round) G.results.push(null); G.results.push(res); }
      recomputeScores();
      G.phase='results';
      bcastAll({type:'result', round:G.round, result:pubResult(res), phase:'results', cumScores:G.scores});
      tx(ws, {type:'adminResult', round:G.round, result:res, phase:'results', cumScores:G.scores});
      // Send team-specific results to each team
      clients.forEach((c,w)=>{ if(c.teamId) tx(w,{type:'myResult',result:myResult(res,c.teamId), cumScores:G.scores}); });
    }
    if (cmd==='round') {
      const rn = Math.max(0, Math.min(3, parseInt(p.round)||0));
      G.round = rn;
      bcastAll({type:'upd', round:G.round});
    }
    if (cmd==='next') {
      G.round = Math.min(4, G.round+1);
      G.phase = G.round>=4 ? 'final' : 'briefing';
      bcastAll({type:'upd', round:G.round, phase:G.phase});
    }
    if (cmd==='reset') { G=mkState(); restoredFromDisk=false; bcastAll({type:'reset'}); }
    if (cmd==='ackRestore') { restoredFromDisk=false; }   // ведущий закрыл баннер восстановления
    return;
  }

  // ─ TEAM SUBMIT DECISION ─
  if (msg.type === 'submit') {
    if (me.role!=='team') return;
    const {round,data}=msg;
    if (!G.decisions[round]) G.decisions[round]={};
    G.decisions[round][me.teamId]={submitted:true,data,by:'team',at:Date.now()};
    bcastAll({type:'upd',submitted:subList()});
    clients.forEach((c,w)=>{ if(c.role==='admin') tx(w,{type:'teamSub',teamId:me.teamId,round,data}); });
    tx(ws, {type:'upd',submitted:subList()});
    console.log(`  → ${me.teamId} submitted R${round+1}`);
    return;
  }

  // ─ PROPOSAL ─
  if (msg.type === 'proposal') {
    if (!me.teamId) return;
    const prop = { id:`${Date.now()}-${Math.random().toString(36).slice(2,6)}`,
      round:G.round, from:me.teamId, to:msg.to, text:msg.text,
      structured:msg.structured||null, status:'pending', at:Date.now() };
    G.proposals.push(prop);
    clients.forEach((c,w)=>{
      if(c.teamId===prop.to||c.teamId===prop.from||c.role==='admin') tx(w,{type:'proposal',prop});
    });
    return;
  }

  // ─ PROPOSAL REPLY ─
  if (msg.type === 'propReply') {
    const prop=G.proposals.find(p=>p.id===msg.id);
    if (!prop||prop.to!==me.teamId) return;
    prop.status = msg.accept ? 'accepted' : 'rejected';
    if (msg.accept) G.agreements.push({...prop,acceptedAt:Date.now()});
    clients.forEach((c,w)=>{
      if(c.teamId===prop.to||c.teamId===prop.from||c.role==='admin')
        tx(w,{type:'propReply',id:msg.id,accept:msg.accept,prop});
    });
    return;
  }

  if (msg.type==='ping') tx(ws,{type:'pong'});
}

// ━━━ HTTP ━━━
loadState();   // восстановить игру, если сервер падал/перезапускался
server.listen(PORT, '0.0.0.0', () => {
  const ip = getIP();
  const line = '─'.repeat(52);
  console.log('\n' + line);
  console.log('  🏪  FMCG-цепочка  ·  Сервер запущен!');
  console.log(line);
  console.log(`  Ведущий (этот ноутбук):  http://localhost:${PORT}`);
  console.log(`  Участники (по WiFi):      http://${ip}:${PORT}`);
  console.log(`  Проектор:                 http://${ip}:${PORT}/live.html`);
  console.log(line);
  console.log(`  Пароль ведущего:  ${ADMIN_PASS}`);
  console.log(`  Коды команд:  ${ALL_TEAMS.map(t=>LBL[t]).join('  ')}  (вводятся как ${ALL_TEAMS.join(' ')})`);
  console.log(line + '\n');
});

function getIP() {
  const ifaces = os.networkInterfaces();
  for (const n of Object.keys(ifaces))
    for (const i of ifaces[n])
      if (i.family==='IPv4' && !i.internal) return i.address;
  return 'localhost';
}
