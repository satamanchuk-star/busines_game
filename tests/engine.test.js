'use strict';
// ─── Unit-тесты движка (без запуска сервера) ───────────────────────────────
// Покрывает: sanitizeDec, chainHealth, contribOf, roundProfit, dealRoles
// Тестируем РЕАЛЬНЫЙ движок public/engine.js (тот же, что грузит server.js и sim.html) —
// не копию. Любое расхождение прод-логики ловится здесь автоматически.
// Запуск: node tests/engine.test.js
const assert = require('assert');
const CONFIG = require('../public/gameconfig.js');
const { sanitizeDec, chainHealth, contribOf, roundProfit, clamp01 } = require('../public/engine.js');

const RETS = CONFIG.retIds;   // ['R1','R2','R3','R4']
const SUPS = CONFIG.supIds;   // ['S1','S2','S3','S4']
const ALL_TEAMS = CONFIG.allTeams;
const P = CONFIG;

const ROLE_SETS = {
  ret:  [{ico:'🎩',title:'Директор сети'},{ico:'🏷️',title:'Категорийный менеджер'},{ico:'📦',title:'Менеджер закупок'},{ico:'📈',title:'Аналитик спроса'}],
  sup:  [{ico:'🎩',title:'Генеральный директор'},{ico:'🏭',title:'Директор производства'},{ico:'💼',title:'Коммерческий директор'},{ico:'📊',title:'Планировщик S&OP'}],
  dist: [{ico:'🎩',title:'Управляющий директор'},{ico:'🚚',title:'Директор логистики'},{ico:'🤝',title:'Менеджер по клиентам'},{ico:'🧮',title:'Аналитик загрузки'}],
};
const CHAR_NAMES = ['Жёсткий','Кооперативный','Хитрый','Упрямый','Аналитик'];
const teamType = tid => RETS.includes(tid) ? 'ret' : SUPS.includes(tid) ? 'sup' : 'dist';

function dealRoles(n) {
  n = Math.max(1, Math.min(4, n || 4));
  const rosters = {};
  const pick = a => a[Math.floor(Math.random() * a.length)];
  ALL_TEAMS.forEach(tid => {
    const set = ROLE_SETS[teamType(tid)];
    rosters[tid] = Array.from({ length: n }, (_, i) => ({ role: set[i], char: pick(CHAR_NAMES) }));
  });
  return { teamSize: n, rosters };
}

// Минимальный фейковый результат для тестов chainHealth / contribOf
function fakeResult(overrides = {}) {
  const base = {
    r: 0,
    retOSA:   RETS.map(() => 1),
    supC:     SUPS.map(() => 1),
    dCoeff:   1,
    ordFromSup: SUPS.map(() => 100),   // у каждого поставщика есть заказы (активность)
    totAS:    400,                      // дистрибьютору есть что везти
    def:      RETS.map(() => SUPS.map(() => 0)),
    woff:     RETS.map(() => SUPS.map(() => 0)),
    actDem:   RETS.map(() => SUPS.map(() => 25)),
    d:        { rets: RETS.map(() => SUPS.map(() => ({ ord: 25 }))) },
    retProfit:  RETS.map((_, i) => 100 + i * 10),
    supProfit:  SUPS.map((_, i) => 80 + i * 5),
    dProfit:    200,
  };
  return Object.assign(base, overrides);
}

// ─── Бегунок тестов ───
let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failed++; console.error(`  ✗ ${name}\n    ${e.message}`); }
}

// ════════════════════════════════════════════════════
console.log('\n── sanitizeDec ──');

test('полностью пустой объект не бросает, все поля имеют дефолты', () => {
  const s = sanitizeDec(0, {});
  assert.strictEqual(s.tariff, 0);
  assert.strictEqual(s.distCap, 50);          // минимальный cap
  assert.strictEqual(s.sups.length, SUPS.length);
  assert.strictEqual(s.rets.length, RETS.length);
  s.sups.forEach(v => assert.strictEqual(v, 0));
  s.rets.forEach(row => row.forEach(cell => {
    assert.strictEqual(cell.asm, 0);
    assert.strictEqual(cell.ord, 0);
    assert.strictEqual(cell.prc, 1);
    assert.strictEqual(cell.prm, 0);
    assert.strictEqual(cell.dsc, 0);
  }));
});

test('null в полях не бросает', () => {
  const s = sanitizeDec(0, { tariff: null, distCap: null, sups: null, rets: null });
  assert.strictEqual(s.tariff, 0);
  assert.ok(Array.isArray(s.sups));
});

test('NaN и строки в tariff → 0', () => {
  assert.strictEqual(sanitizeDec(0, { tariff: NaN }).tariff, 0);
  assert.strictEqual(sanitizeDec(0, { tariff: 'abc' }).tariff, 0);
});

test('отрицательный tariff → 0', () => {
  assert.strictEqual(sanitizeDec(0, { tariff: -99 }).tariff, 0);
});

test('tariff > maxTariff → maxTariff', () => {
  assert.strictEqual(sanitizeDec(0, { tariff: 999 }).tariff, P.maxTariff);
});

test('distCap < 50 → 50 (нижний клэмп)', () => {
  assert.strictEqual(sanitizeDec(0, { distCap: 10 }).distCap, 50);
});

test('distCap > distCap[0] → distCap[0]', () => {
  assert.strictEqual(sanitizeDec(0, { distCap: 9999 }).distCap, P.distCap[0]);
});

test('Тур 3 (r=2): distCap[2]=200 — жёсткий cap логистики', () => {
  assert.strictEqual(sanitizeDec(2, { distCap: 9999 }).distCap, P.distCap[2]);
  assert.ok(P.distCap[2] < P.distCap[0], 'distCap Тура 3 должен быть < обычного');
});

test('sups отрицательные → 0', () => {
  const s = sanitizeDec(0, { sups: [-10, -5, -1, -999] });
  s.sups.forEach(v => assert.strictEqual(v, 0));
});

test('sups > maxProd → maxProd (обычный тур)', () => {
  const s = sanitizeDec(0, { sups: [999, 999, 999, 999] });
  s.sups.forEach((v, si) => assert.strictEqual(v, P.maxProd[si]));
});

test('Тур 3 (r=2): sups[3] ограничен s4Shock, а не maxProd[3]', () => {
  const s = sanitizeDec(2, { sups: [999, 999, 999, 999] });
  assert.strictEqual(s.sups[3], P.s4Shock, 'квота П4 в Туре 3');
  assert.ok(P.s4Shock < P.maxProd[3], 's4Shock должен быть меньше maxProd[3]');
  // Остальные поставщики — обычные caps
  assert.strictEqual(s.sups[0], P.maxProd[0]);
});

test('caps[si=3] в r=2 — это s4Shock', () => {
  const s = sanitizeDec(2, {});
  assert.strictEqual(s.caps[3], P.s4Shock);
  assert.strictEqual(s.caps[0], P.maxProd[0]);
});

test('rets[ri][ci].prc: невалидное значение → 1 (дефолт)', () => {
  const s = sanitizeDec(0, { rets: [[{ prc: 99 }, {}, {}, {}], [], [], []] });
  assert.strictEqual(s.rets[0][0].prc, 1, 'prc=99 → 1');
  assert.strictEqual(s.rets[0][1].prc, 1, 'missing → 1');
});

test('rets[ri][ci].prc: валидные значения 0..3 сохраняются', () => {
  const s = sanitizeDec(0, { rets: [[{ prc: 0 }, { prc: 2 }, { prc: 3 }, {}], [], [], []] });
  assert.strictEqual(s.rets[0][0].prc, 0);
  assert.strictEqual(s.rets[0][1].prc, 2);
  assert.strictEqual(s.rets[0][2].prc, 3);
});

test('rets[ri][ci].dsc > maxDsc → maxDsc', () => {
  const s = sanitizeDec(0, { rets: [[{ dsc: 0.99 }], [], [], []] });
  assert.strictEqual(s.rets[0][0].dsc, P.maxDsc);
});

test('rets[ri][ci].ord < 0 → 0, > maxOrd → maxOrd', () => {
  const s = sanitizeDec(0, { rets: [[{ ord: -5 }, { ord: 9999 }], [], [], []] });
  assert.strictEqual(s.rets[0][0].ord, 0);
  assert.strictEqual(s.rets[0][1].ord, P.maxOrd);
});

// ════════════════════════════════════════════════════
console.log('\n── chainHealth ──');

test('идеальный сценарий: H ≈ 1', () => {
  const res = fakeResult(); // OSA=1, def=0, woff=0, ord=dem
  const { H } = chainHealth(res);
  assert.ok(H > 0.95, `ожидаем H>0.95, получили ${H.toFixed(3)}`);
});

test('H всегда в [0, 1]', () => {
  const cases = [
    fakeResult({ retOSA: RETS.map(() => 0) }),
    fakeResult({ def: RETS.map(() => SUPS.map(() => 9999)) }),
    fakeResult({ woff: RETS.map(() => SUPS.map(() => 9999)) }),
    fakeResult({ d: { rets: RETS.map(() => SUPS.map(() => ({ ord: 9999 }))) } }),
  ];
  cases.forEach((res, i) => {
    const { H } = chainHealth(res);
    assert.ok(H >= 0 && H <= 1, `кейс ${i}: H=${H.toFixed(3)} вне [0,1]`);
  });
});

test('нулевой OSA тянет H вниз', () => {
  const bad = fakeResult({ retOSA: RETS.map(() => 0) });
  const good = fakeResult({ retOSA: RETS.map(() => 1) });
  assert.ok(chainHealth(bad).H < chainHealth(good).H, 'OSA=0 должен ухудшить H');
});

test('максимальный дефицит (totalDef≥150) → Deficit=0', () => {
  const res = fakeResult({ def: RETS.map(() => SUPS.map(() => 50)) }); // 4×4×50=800 ≥ 150
  const { Deficit } = chainHealth(res);
  assert.strictEqual(Deficit, 0);
});

test('максимальные списания (totalWoff≥30) → Waste=0', () => {
  const res = fakeResult({ woff: RETS.map(() => SUPS.map(() => 10)) }); // 4×4×10=160 ≥ 30
  const { Waste } = chainHealth(res);
  assert.strictEqual(Waste, 0);
});

test('сильный хлыст (ord >> dem) → Bullwhip снижается', () => {
  const normal = fakeResult();
  const bullwhip = fakeResult({
    d: { rets: RETS.map(() => SUPS.map(() => ({ ord: 250 }))) }, // 10× больше actDem
  });
  assert.ok(chainHealth(bullwhip).Bullwhip < chainHealth(normal).Bullwhip, 'перезаказ ухудшает Bullwhip');
});

test('нулевой суммарный спрос (actDem=0) → amp=0 → Bullwhip=1', () => {
  const res = fakeResult({ actDem: RETS.map(() => SUPS.map(() => 0)), d: { rets: RETS.map(() => SUPS.map(() => ({ ord: 0 }))) } });
  const { Bullwhip } = chainHealth(res);
  assert.strictEqual(Bullwhip, 1, 'нет спроса → нет хлыста');
});

// ════════════════════════════════════════════════════
console.log('\n── contribOf ──');

test('retailer R1 (ri=0): возвращает retOSA[0]', () => {
  const res = fakeResult({ retOSA: [0.8, 0.9, 0.7, 0.6] });
  assert.strictEqual(contribOf(res, 'R1'), 0.8);
});

test('retailer R4 (ri=3): возвращает retOSA[3]', () => {
  const res = fakeResult({ retOSA: [0.8, 0.9, 0.7, 0.6] });
  assert.strictEqual(contribOf(res, 'R4'), 0.6);
});

test('supplier S1 (si=0): возвращает supC[0]', () => {
  const res = fakeResult({ supC: [0.75, 0.85, 0.9, 0.5] });
  assert.strictEqual(contribOf(res, 'S1'), 0.75);
});

test('supplier S4 (si=3): возвращает supC[3]', () => {
  const res = fakeResult({ supC: [0.75, 0.85, 0.9, 0.5] });
  assert.strictEqual(contribOf(res, 'S4'), 0.5);
});

test('distributor D: возвращает dCoeff', () => {
  const res = fakeResult({ dCoeff: 0.65 });
  assert.strictEqual(contribOf(res, 'D'), 0.65);
});

test('contribOf зажимает в [0, 1] (защита от некорректных значений)', () => {
  const res = fakeResult({ retOSA: [1.5, -0.2, 1, 1], supC: [2, -1, 1, 1], dCoeff: 9 });
  assert.strictEqual(contribOf(res, 'R1'), 1);
  assert.strictEqual(contribOf(res, 'R2'), 0);
  assert.strictEqual(contribOf(res, 'S1'), 1);
  assert.strictEqual(contribOf(res, 'S2'), 0);
  assert.strictEqual(contribOf(res, 'D'), 1);
});

// ─── Антиэксплойт: бездействие = нулевой вклад (иначе бонус за пассивность) ───
test('ритейлер с пустым ассортиментом (actDem=0) → contrib 0, а не 1', () => {
  const res = fakeResult({ actDem: RETS.map(() => SUPS.map(() => 0)), retOSA: RETS.map(() => 1) });
  assert.strictEqual(contribOf(res, 'R1'), 0, 'пустой спрос не должен давать полный бонус');
});
test('поставщик без заказов (ordFromSup=0) → contrib 0, а не 1', () => {
  const res = fakeResult({ ordFromSup: SUPS.map(() => 0), supC: SUPS.map(() => 1) });
  assert.strictEqual(contribOf(res, 'S1'), 0, 'нет заказов — нет вклада');
});
test('дистрибьютор без груза (totAS=0) → contrib 0, а не 1', () => {
  const res = fakeResult({ totAS: 0, dCoeff: 1 });
  assert.strictEqual(contribOf(res, 'D'), 0, 'нечего везти — нет вклада');
});
test('частичная активность сохраняет реальный contrib', () => {
  const res = fakeResult({ ordFromSup: [100, 0, 100, 100], supC: [0.7, 1, 0.8, 0.9] });
  assert.strictEqual(contribOf(res, 'S1'), 0.7, 'S1 с заказами → реальный fill');
  assert.strictEqual(contribOf(res, 'S2'), 0, 'S2 без заказов → 0, несмотря на supC=1');
});

// ════════════════════════════════════════════════════
console.log('\n── roundProfit ──');

test('retailer → retProfit[ri]', () => {
  const res = fakeResult({ retProfit: [100, 200, 300, 400] });
  assert.strictEqual(roundProfit(res, 'R1'), 100);
  assert.strictEqual(roundProfit(res, 'R3'), 300);
});

test('supplier → supProfit[si]', () => {
  const res = fakeResult({ supProfit: [50, 60, 70, 80] });
  assert.strictEqual(roundProfit(res, 'S2'), 60);
  assert.strictEqual(roundProfit(res, 'S4'), 80);
});

test('distributor D → dProfit', () => {
  const res = fakeResult({ dProfit: 999 });
  assert.strictEqual(roundProfit(res, 'D'), 999);
});

// ════════════════════════════════════════════════════
console.log('\n── dealRoles ──');

test('n=4: каждая команда получает 4 слота', () => {
  const { rosters, teamSize } = dealRoles(4);
  assert.strictEqual(teamSize, 4);
  ALL_TEAMS.forEach(tid => assert.strictEqual(rosters[tid].length, 4, `${tid} должен иметь 4 слота`));
});

test('n=1: каждая команда получает 1 слот', () => {
  const { rosters, teamSize } = dealRoles(1);
  assert.strictEqual(teamSize, 1);
  ALL_TEAMS.forEach(tid => assert.strictEqual(rosters[tid].length, 1));
});

test('n=2: каждая команда получает 2 слота', () => {
  const { rosters } = dealRoles(2);
  ALL_TEAMS.forEach(tid => assert.strictEqual(rosters[tid].length, 2));
});

test('n=0 (falsy) → дефолт 4; n=99 → clamp до 4; null → дефолт 4', () => {
  // 0 и null — falsy, сервер трактует их как «не передано» → дефолт 4
  assert.strictEqual(dealRoles(0).teamSize, 4, 'n=0 falsy → использует дефолт 4');
  assert.strictEqual(dealRoles(null).teamSize, 4, 'null → использует дефолт 4');
  assert.strictEqual(dealRoles(99).teamSize, 4, 'n=99 зажимается до max 4');
});

test('все 9 команд представлены в rosters', () => {
  const { rosters } = dealRoles(4);
  assert.deepStrictEqual(Object.keys(rosters).sort(), ALL_TEAMS.slice().sort());
});

test('retailer-команды получают ret-роли (иконка Директора сети = 🎩)', () => {
  const { rosters } = dealRoles(4);
  RETS.forEach(tid => {
    assert.strictEqual(rosters[tid][0].role.ico, '🎩');
    assert.strictEqual(rosters[tid][0].role.title, 'Директор сети');
  });
});

test('supplier-команды получают sup-роли (Директор = ГД)', () => {
  const { rosters } = dealRoles(4);
  SUPS.forEach(tid => {
    assert.strictEqual(rosters[tid][0].role.title, 'Генеральный директор');
  });
});

test('D получает dist-роли', () => {
  const { rosters } = dealRoles(4);
  assert.strictEqual(rosters['D'][0].role.title, 'Управляющий директор');
});

test('каждый слот содержит role.ico, role.title, char из валидного набора', () => {
  const { rosters } = dealRoles(4);
  ALL_TEAMS.forEach(tid => {
    rosters[tid].forEach(slot => {
      assert.ok(slot.role.ico, `${tid}: у роли должна быть ico`);
      assert.ok(slot.role.title, `${tid}: у роли должен быть title`);
      assert.ok(CHAR_NAMES.includes(slot.char), `${tid}: char "${slot.char}" не в CHAR_NAMES`);
    });
  });
});

// ════════════════════════════════════════════════════
const total = passed + failed;
console.log(`\n${'─'.repeat(48)}`);
console.log(`engine tests: ${passed}/${total} passed${failed ? ` (${failed} FAILED)` : ''}`);
if (failed) process.exit(1);
