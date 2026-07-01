'use strict';
try { require('dotenv').config({ path: require('path').join(__dirname, '.env') }); } catch (e) { /* .env опционален */ }
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

// ━━━ АВТОРИЗАЦИЯ (заявка + одобрение владельцем; гейт перед статикой) ━━━
const auth = require('./auth');
app.use(express.json({ limit: '32kb' }));
auth.mount(app);                  // /auth/* — заявки, статус, одобрение
app.use(auth.gate);               // нет валидного доступа → редирект на /login.html
// no-cache: браузер обязан ревалидировать при каждой загрузке. После деплоя свежая
// версия отдаётся сразу (без ручного Ctrl+Shift+R); ETag/Last-Modified дают 304,
// если файл не изменился — лишнего трафика нет.
app.use(express.static(path.join(__dirname, 'public'), {
  etag: true, lastModified: true,
  setHeaders(res) { res.setHeader('Cache-Control', 'no-cache'); },
}));

// ━━━ CONSTANTS (из единого конфига public/gameconfig.js) ━━━
const RETS = CONFIG.retIds;
const SUPS = CONFIG.supIds;
const ALL_TEAMS = CONFIG.allTeams;

const P = CONFIG;   // экономика и константы движка — эталон для всех клиентов

// ━━━ ДВИЖОК — единственная копия в public/engine.js (его же грузит sim.html, его же тестируют) ━━━
const ENGINE = require('./public/engine.js');
const { sanitizeDec, calcRound, chainHealth, contribOf, roundProfit, volOf } = ENGINE;

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
     desc:'Голос команды на переговорах. Слушает аналитика, директора по закупкам и категорийщика, но финальное слово — за ним.',
     decide:'Ведёт переговоры с производителями и перевозчиком, утверждает итоговое решение команды.',
     watch:'Баланс: договориться о скидках, но не обрушить отношения и не остаться без товара.'},
    {ico:'🏷️',title:'Категорийный менеджер', duty:'Цена и промо',
     desc:'Отвечает за то, по какой цене и с каким промо продавать каждую категорию на полке.',
     decide:'Уровень цены (агрессивная/стандарт/премиум) и включение промо по каждой категории.',
     watch:'Промо со скидкой ≥10% даёт всплеск спроса, но режет маржу. Премиум-цена работает только если товар свежий и в наличии.'},
    {ico:'📦',title:'Директор по закупкам', duty:'Объёмы заказов производителям',
     desc:'Решает, сколько и чего заказать у производителей под прогноз спроса.',
     decide:'Объёмы заказа по каждой категории товара.',
     watch:'Перезаказ скоропорта (молочка/фреш) = списания в убыток. Недозаказ = пустые полки и потеря покупателя.'},
    {ico:'📈',title:'Аналитик спроса', duty:'Прогноз и чтение рынка',
     desc:'Читает вводные рынка и событие тура, переводит их в прогноз для команды.',
     decide:'Не вводит цифры сам — даёт прогноз директору по закупкам и категорийщику.',
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
// Иконка+цвет берём из единой палитры (gameconfig), локально добавляем desc.
const CHAR_DESC = {
  'Жёсткий':       'Диктует условия, почти не уступает',
  'Кооперативный': 'Ищет win-win, легко идёт навстречу',
  'Хитрый':        'Завышает запрос, делает ложные уступки',
  'Упрямый':       'Держит позицию, не реагирует на аргументы',
  'Аналитик':      'Обосновывает цифрами, принимает взвешенно',
};
const CHARS = Object.fromEntries(
  Object.entries(CONFIG.CHARS_PALETTE).map(([k, v]) => [k, {...v, desc: CHAR_DESC[k]}])
);
const CHAR_NAMES = Object.keys(CHARS);
const BONUS_FUND = CONFIG.bonusFund; // фонд здоровья цепочки за тур (единый источник — gameconfig.js)
const teamType = tid => RETS.includes(tid)?'ret':SUPS.includes(tid)?'sup':'dist';
const pick = a => a[Math.floor(Math.random()*a.length)];

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

// Оценка ведущего (0..100, «качество переговоров») — множитель бонусной части.
// 80 = нейтрально (×1.0), 100 → ×1.25, 0 → ×0. Не оценено → нейтрально.
// Бьёт ТОЛЬКО по бонусу здоровья, прибыль команды не трогает.
function manualMult(round, tid) {
  const m = G.manual?.[round]?.[tid];
  if (m == null) return 1;
  return Math.max(0, Math.min(1.25, (+m||0)/80));
}
function recomputeScores() {
  G.scores = {}; ALL_TEAMS.forEach(t=>G.scores[t]=0);
  G.results.forEach((res, round)=>{ if(!res||!res.scores) return;
    ALL_TEAMS.forEach(t=>{
      const bonus = res.bonus?.[t] ?? 0;       // старые результаты с диска бонус не хранят
      G.scores[t] += (res.scores[t]||0) + bonus*(manualMult(round,t)-1);
    });
  });
}

// ━━━ GAME STATE ━━━
function mkState() {
  return {
    phase: 'lobby',
    round: 0,
    names: { R1:'Дискаунтер', R2:'Супермаркет', R3:'Гипермаркет', R4:'Премиум',
             S1:'Базовый', S2:'Fresh', S3:'Промо-хиты', S4:'Импорт', D:'Дистрибьютор' },
    timer: { on:false, end:null, mins:0 },
    decisions: {},     // {[round]: {[teamId]: {submitted, data}}}
    results: [],
    invByRound: [],    // [round]: стартовый запас ритейлеров [ri][ci] (перенос нескоропорта)
    negStage: 'A',     // раунд переговоров: 'A' (4 пары магазин↔поставщик) / 'B' (спотлайт магазин+Д+поставщики)
    negWave: 0,        // волна внутри раунда (0..3)
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
    phase:G.phase, round:G.round, names:G.names, timer:G.timer, announce:G.announce, negStage:G.negStage, negWave:G.negWave,
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
           del:res.del,   // матрица поставок [ритейлер][поставщик] — для ролевой истории спроса
           health:res.health, scores:res.scores, contrib:res.contrib, vol:res.vol,
           penalties:res.penalties };
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

// ━━━ ДВИЖОК: sanitizeDec / calcRound / chainHealth / contribOf / roundProfit — в public/engine.js (см. require выше) ━━━

// ━━━ WEBSOCKET ━━━
wss.on('connection', (ws, req) => {
  if (!auth.wsAllowed(req)) { try { ws.close(4001, 'unauthorized'); } catch (e) {} return; }
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

    if (cmd==='phase')  {
      G.phase=p.phase;
      if (p.phase==='negotiation') { G.negStage='A'; G.negWave=0; }   // сброс переговоров при входе
      bcastAll({type:'upd',phase:G.phase,negStage:G.negStage,negWave:G.negWave});
    }
    if (cmd==='negNav') {   // ведущий листает раунд/волну переговоров
      if (p.stage==='A'||p.stage==='B') G.negStage=p.stage;
      G.negWave = Math.max(0, Math.min(3, parseInt(p.wave)||0));
      bcastAll({type:'upd',negStage:G.negStage,negWave:G.negWave});
    }
    if (cmd==='timer')  {
      G.timer = p.on ? {on:true,end:Date.now()+p.mins*60000,mins:p.mins} : {on:false,end:null,mins:0};
      bcastAll({type:'upd',timer:G.timer});
    }
    if (cmd==='announce') { G.announce=p.text; bcastAll({type:'upd',announce:G.announce}); }
    if (cmd==='manual') {
      if (!G.manual[p.round]) G.manual[p.round]={};
      G.manual[p.round][p.teamId]=p.score;
      recomputeScores();                          // оценка ведущего теперь влияет на бонус
      tx(ws, {type:'upd',manual:G.manual});       // сами оценки — только ведущему
      bcastAll({type:'upd',scores:G.scores});     // обновлённый рейтинг — всем
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
      // Перенос запасов: стартовый запас этого тура = остаток с прошлого (или нули в Туре 1)
      const startInv = (G.invByRound && G.invByRound[G.round]) || null;
      const res = calcRound(G.round, p.dec, startInv ? { inv: startInv } : undefined);
      if (!G.invByRound) G.invByRound = [];
      G.invByRound[G.round+1] = res.newInv;   // остаток нескоропорта → стартовый запас след. тура
      // ─ Штрафы за нарушение договорённостей (структурные сделки с qty) ─
      // Формат agreement.structured: {ret:'R1', sup:'S1', qty:50}
      // Штраф = excess_units × cost[si] × pStrafCoef; платит нарушитель (поставщик = недопоставил, ритейлер = недовыбрал)
      const agrs = (G.agreements||[]).filter(a=>a.round===G.round && a.structured?.qty);
      const retPenalty = RETS.map(()=>0), supPenalty = SUPS.map(()=>0);
      agrs.forEach(agr=>{
        const ri=RETS.indexOf(agr.structured.ret), si=SUPS.indexOf(agr.structured.sup);
        if(ri<0||si<0)return;
        const agreed = +agr.structured.qty, actual = res.del[ri][si];
        const dev = Math.abs(actual-agreed)/Math.max(agreed,1);
        if(dev<=P.pStrafThr)return;
        const excess = Math.abs(actual-agreed)-agreed*P.pStrafThr;
        const penalty = excess*P.cost[si]*P.pStrafCoef;
        if(actual<agreed) supPenalty[si]+=penalty; else retPenalty[ri]+=penalty;
      });
      res.retProfit = res.retProfit.map((v,i)=>v-retPenalty[i]);
      res.supProfit = res.supProfit.map((v,i)=>v-supPenalty[i]);
      res.penalties = {ret:retPenalty, sup:supPenalty};
      // Здоровье цепочки и счёт команд за тур: бонус = H × фонд × личный вклад
      res.health = chainHealth(res);
      res.contrib = {}; res.bonus = {}; res.scores = {}; res.vol = {};
      ALL_TEAMS.forEach(t=>{
        res.contrib[t] = contribOf(res,t);
        res.vol[t]     = volOf(res,t);                              // своё прохождение за тур (для награды «Антихлыст»)
        res.bonus[t]   = res.health.H*BONUS_FUND*res.contrib[t];   // бонус здоровья (до оценки ведущего)
        res.scores[t]  = roundProfit(res,t) + res.bonus[t];         // нейтральный счёт; оценку применяет recomputeScores
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
    clients.forEach((c,w)=>{ if(c.role==='admin') tx(w,{type:'teamSub',teamId:me.teamId,round,data,anomaly:msg.anomaly||null}); });
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
  const a = auth.status();
  console.log(`  Авторизация:  ${a.enabled?'ВКЛ':'выкл'}  ·  SMTP: ${a.smtp?'настроен':'НЕ настроен (заявки в лог)'}  ·  владелец: ${a.owner}`);
  console.log(`  Режим воркшопа:  ${a.workshop?'ВКЛ (вход по общему коду игры)':'выкл (только заявка+одобрение)'}`);
  console.log(line + '\n');
});

function getIP() {
  const ifaces = os.networkInterfaces();
  for (const n of Object.keys(ifaces))
    for (const i of ifaces[n])
      if (i.family==='IPv4' && !i.internal) return i.address;
  return 'localhost';
}
