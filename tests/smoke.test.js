const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const config = require('../public/gameconfig.js');
const indexHtml = read('public/index.html');
const playHtml = read('public/play.html');
const liveHtml = read('public/live.html');
const printHtml = read('public/print.html');
const demoHtml = read('public/demo.html');
const startScript = read('start.sh');

// Скрипты play/live/sim/demo вынесены из инлайна в отдельные .js (рефактор монолитов).
// Разметка/CSS остались в HTML, поведение — в .js. Контентные проверки идут по
// объединённому источнику: тест не должен ломаться от того, где физически лежит код.
const playJs = read('public/play.js');
const liveJs = read('public/live.js');
const demoJs = read('public/demo.js');
const playSrc = playHtml + '\n' + playJs;
const liveSrc = liveHtml + '\n' + liveJs;
const demoSrc = demoHtml + '\n' + demoJs;

assert.strictEqual(config.allTeams.length, 9, 'game config should expose 9 teams');
assert.deepStrictEqual(config.retIds, ['R1', 'R2', 'R3', 'R4'], 'retailers should include R4');
assert.deepStrictEqual(
  config.allTeams,
  [...config.retIds, ...config.supIds, 'D'],
  'all teams should be derived from retailers, suppliers, and distributor'
);
assert.strictEqual(config.price.length, config.retIds.length, 'retailer price settings should match retailer count');
assert.strictEqual(config.fShare.length, config.catIds.length, 'demand shares should cover every category');
config.fShare.forEach((row, idx) => {
  assert.strictEqual(row.length, config.retIds.length, `category ${idx} shares should cover every retailer`);
  const total = row.reduce((sum, value) => sum + value, 0);
  assert(Math.abs(total - 1) < 0.000001, `category ${idx} retailer shares should add up to 1`);
});
['cost', 'opt', 'rosn', 'fresh', 'maxProd'].forEach(field => {
  assert.strictEqual(config[field].length, config.supIds.length, `${field} should match supplier count`);
});
assert.strictEqual(config.demand.length, config.roundNames.length, 'demand table should cover every round');
config.demand.forEach((row, idx) => {
  assert.strictEqual(row.length, config.catIds.length, `round ${idx} demand should cover every category`);
});
assert.strictEqual(config.distCap.length, config.roundNames.length, 'distribution capacity should cover every round');

assert(indexHtml.includes('До 36 участников'), 'landing page should show the 36-player capacity');
assert(indexHtml.includes('9 команд'), 'landing page should show 9 teams');
assert(indexHtml.includes('<div class="role-name">Премиум</div>'), 'landing page should include Premium retailer');

assert(
  playSrc.includes('<option value="3"${op(prc,3)}>Люкс</option>'),
  'admin decision form should preserve the Lux price option'
);
assert(playHtml.includes('.ret-hdr.r3'), 'admin retailer cards should style the fourth retailer');
assert(!playSrc.includes("['R1','R2','R3','R4']"), 'play screen should not hard-code retailer ids');
assert(!playSrc.includes("['S1','S2','S3','S4']"), 'play screen should not hard-code supplier ids');

assert(!liveSrc.includes('/8 подали решения'), 'projector footer should not hard-code 8 submitted teams');
assert(!liveSrc.includes('из 8 онлайн'), 'projector lobby should not hard-code 8 online teams');
assert(liveSrc.includes('${G.allTeams.length}'), 'projector should use the configured team count');
assert(!liveSrc.includes("['R1','R2','R3','R4']"), 'projector should not hard-code retailer ids');
assert(!liveSrc.includes("['S1','S2','S3','S4']"), 'projector should not hard-code supplier ids');

assert(printHtml.includes('4 тура · 9 команд · до 36 участников'), 'print cover should show 9 teams');
assert(printHtml.includes('<!-- Р4 Премиум -->'), 'print role cards should include Premium retailer');
assert(startScript.includes('R1 R2 R3 R4 S1 S2 S3 S4 D'), 'start script should print all team codes');

// demo.html — автономный презентационный лендинг «Как проходит игра» (не движок:
// ничего не вычисляет, данные сценарные). Поэтому проверяем не загрузку общего конфига,
// а консистентность со структурой 9 команд и синхронность спроса с эталоном (анти-дрейф).
config.allTeams.forEach(team =>
  assert(demoSrc.includes(`{id:'${team}'`), `demo should list team ${team} in its ACTORS`));
config.demand.forEach((row, idx) =>
  assert(demoSrc.includes(`demand:[${row.join(',')}]`),
    `demo round ${idx + 1} demand should match the shared game config (no drift)`));

// ─── Константы штрафной системы (используются в calculate) ───
assert(typeof config.pStrafThr === 'number' && config.pStrafThr > 0,
  'pStrafThr (порог штрафа) должен быть положительным числом');
assert(typeof config.pStrafCoef === 'number' && config.pStrafCoef > 0,
  'pStrafCoef (коэффициент штрафа) должен быть положительным числом');
assert(config.pStrafThr < 1,
  `pStrafThr=${config.pStrafThr} должен быть меньше 1 (иначе штрафа не бывает никогда)`);

// ─── s4Shock: квота П4 в Туре 3 должна быть меньше нормальной мощности ───
assert(typeof config.s4Shock === 'number',
  's4Shock должен быть числом');
assert(config.s4Shock < config.maxProd[3],
  `s4Shock=${config.s4Shock} должен быть < maxProd[3]=${config.maxProd[3]} (это и есть шок)`);
assert(config.s4Shock > 0,
  's4Shock должен быть положительным (полный запрет не предусмотрен механикой)');

// ─── distCap Тура 3 должен быть меньше нормального (шок логистики) ───
assert(config.distCap[2] < config.distCap[0],
  `distCap[2]=${config.distCap[2]} Тура 3 должен быть ниже distCap[0]=${config.distCap[0]}`);

// ─── bonusFund: единый источник в gameconfig.js (server.js и sim.html читают отсюда) ───
assert(typeof config.bonusFund === 'number' && config.bonusFund > 0,
  'bonusFund (фонд бонуса здоровья) должен быть положительным числом в конфиге');
assert(config.pStrafCoef !== config.bonusFund,
  'pStrafCoef не должен случайно совпадать с bonusFund');

console.log('smoke tests passed');
