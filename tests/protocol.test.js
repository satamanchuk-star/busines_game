'use strict';
// ─── WS-протокол: граничные и негативные сценарии ──────────────────────────
// Покрывает: неверный пароль, невалидный код команды, cmd от team,
//            малформированный JSON, ping/pong, proposals/propReply,
//            rename, unknown message type
// Запуск: node tests/protocol.test.js
const assert = require('assert');
const { spawn } = require('child_process');
const WebSocket = require('ws');

const PORT   = 3003;
const PASS   = 'fmcg2024';
const ROOT   = require('path').resolve(__dirname, '..');

// ─── Инфраструктура ───
const delay = ms => new Promise(r => setTimeout(r, ms));

function wsClient(url) {
  const ws = new WebSocket(url);
  const msgs = [];
  const pending = [];

  ws.on('message', raw => {
    let m;
    try { m = JSON.parse(raw); } catch (e) { return; }
    msgs.push(m);
    for (let i = pending.length - 1; i >= 0; i--) {
      if (pending[i].pred(m)) {
        pending[i].res(m);
        pending.splice(i, 1);
      }
    }
  });

  // Сохраняем оригинальный send до переопределения
  const nativeSend = ws.send.bind(ws);

  ws.sendRaw = (str) => new Promise((res, rej) => {
    nativeSend(str, err => err ? rej(err) : res());
  });

  ws.send = (obj) => new Promise((res, rej) => {
    nativeSend(JSON.stringify(obj), err => err ? rej(err) : res());
  });

  ws.wait = (pred, timeout = 3000) => {
    const found = msgs.find(pred);
    if (found) return Promise.resolve(found);
    return new Promise((res, rej) => {
      const entry = { pred, res };
      pending.push(entry);
      setTimeout(() => {
        const idx = pending.indexOf(entry);
        if (idx >= 0) { pending.splice(idx, 1); rej(new Error(`wait timeout: ${pred.toString().slice(0, 80)}`)); }
      }, timeout);
    });
  };

  ws.messages = msgs;
  return ws;
}

function connect(url) {
  return new Promise((res, rej) => {
    const ws = wsClient(url);
    ws.on('open', () => res(ws));
    ws.on('error', rej);
  });
}

// ─── Управление сервером ───
let serverProc;
async function startServer() {
  serverProc = spawn('node', ['server.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT), AUTH_ENABLED: '0', ADMIN_PASS: PASS, NODE_ENV: 'test' },
    stdio: 'pipe',
  });
  serverProc.stderr.on('data', () => {});
  serverProc.stdout.on('data', () => {});
  const url = `ws://localhost:${PORT}`;
  const end = Date.now() + 8000;
  while (Date.now() < end) {
    try {
      const ws = new WebSocket(url);
      await new Promise((res, rej) => { ws.on('open', () => { ws.close(); res(); }); ws.on('error', rej); });
      return;
    } catch (e) { await delay(100); }
  }
  throw new Error('Server did not start in time');
}

function stopServer() {
  if (serverProc) { serverProc.kill('SIGTERM'); serverProc = null; }
}

// ─── Тест-бегунок ───
let passed = 0, failed = 0;
async function testAsync(name, fn) {
  try { await fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failed++; console.error(`  ✗ ${name}\n    ${e.message}`); }
}

const URL = `ws://localhost:${PORT}`;

async function runTests() {
  await startServer();

  // ── Неверный пароль admin ──
  console.log('\n── join: аутентификация ──');

  await testAsync('неверный пароль → {type:"err"}', async () => {
    const ws = await connect(URL);
    await ws.send({ type: 'join', role: 'admin', password: 'WRONG', name: 'Bad' });
    const err = await ws.wait(m => m.type === 'err');
    assert.strictEqual(err.type, 'err');
    assert.ok(err.msg, 'должно быть сообщение об ошибке');
    ws.close();
    await delay(50);
  });

  await testAsync('правильный пароль → {type:"joined", role:"admin"}', async () => {
    const ws = await connect(URL);
    await ws.send({ type: 'join', role: 'admin', password: PASS, name: 'Admin' });
    const m = await ws.wait(m => m.type === 'joined');
    assert.strictEqual(m.role, 'admin');
    ws.close();
    await delay(50);
  });

  await testAsync('невалидный код команды → {type:"err"}', async () => {
    const ws = await connect(URL);
    await ws.send({ type: 'join', role: 'team', teamId: 'X99', name: 'Test' });
    const err = await ws.wait(m => m.type === 'err');
    assert.ok(err.msg.toLowerCase().includes('код') || err.msg.toLowerCase().includes('team') || err.msg.length > 0);
    ws.close();
    await delay(50);
  });

  await testAsync('валидный код команды (R1) → {type:"joined", teamId:"R1"}', async () => {
    const ws = await connect(URL);
    await ws.send({ type: 'join', role: 'team', teamId: 'R1', name: 'Дискаунтер' });
    const m = await ws.wait(m => m.type === 'joined');
    assert.strictEqual(m.teamId, 'R1');
    ws.close();
    await delay(50);
  });

  await testAsync('кириллический код команды "Р1" нормализуется → R1', async () => {
    const ws = await connect(URL);
    await ws.send({ type: 'join', role: 'team', teamId: 'Р1', name: 'Test' });
    const m = await ws.wait(m => m.type === 'joined');
    assert.strictEqual(m.teamId, 'R1');
    ws.close();
    await delay(50);
  });

  // ── Команды только для admin ──
  console.log('\n── cmd: авторизация роли ──');

  await testAsync('team не может отправить cmd (молча отклоняется)', async () => {
    const admin = await connect(URL);
    const team  = await connect(URL);

    await admin.send({ type: 'join', role: 'admin', password: PASS, name: 'Admin' });
    await admin.wait(m => m.type === 'joined');
    await team.send({ type: 'join', role: 'team', teamId: 'R2', name: 'Test' });
    await team.wait(m => m.type === 'joined');

    // team пытается сменить фазу
    await team.send({ type: 'cmd', cmd: 'phase', p: { phase: 'briefing' } });
    await delay(200);

    // admin должен НЕ получить upd с phase=briefing от этой команды
    const badUpd = team.messages.find(m => m.type === 'upd' && m.phase === 'briefing');
    assert.ok(!badUpd, 'team не должен получить подтверждение смены фазы через cmd');
    admin.close(); team.close();
    await delay(50);
  });

  await testAsync('admin может сменить фазу через cmd', async () => {
    const admin = await connect(URL);
    await admin.send({ type: 'join', role: 'admin', password: PASS, name: 'Admin2' });
    await admin.wait(m => m.type === 'joined');
    // Сбросим состояние
    await admin.send({ type: 'cmd', cmd: 'reset' });
    await admin.wait(m => m.type === 'reset');
    await admin.send({ type: 'cmd', cmd: 'phase', p: { phase: 'briefing' } });
    const upd = await admin.wait(m => m.type === 'upd' && m.phase === 'briefing');
    assert.strictEqual(upd.phase, 'briefing');
    admin.close();
    await delay(50);
  });

  // ── Ping / Pong ──
  console.log('\n── ping / pong ──');

  await testAsync('ping → pong', async () => {
    const ws = await connect(URL);
    await ws.send({ type: 'join', role: 'team', teamId: 'S1', name: 'Test' });
    await ws.wait(m => m.type === 'joined');
    await ws.send({ type: 'ping' });
    const pong = await ws.wait(m => m.type === 'pong');
    assert.strictEqual(pong.type, 'pong');
    ws.close();
    await delay(50);
  });

  // ── Устойчивость к некорректным сообщениям ──
  console.log('\n── устойчивость ──');

  await testAsync('малформированный JSON не роняет сервер', async () => {
    const ws = await connect(URL);
    // Нужен join — handle() проверяет me.role перед ping, без него pong не вернётся
    await ws.send({ type: 'join', role: 'team', teamId: 'R4', name: 'ResTest' });
    await ws.wait(m => m.type === 'joined');
    // Отправляем невалидный JSON напрямую (минуя JSON.stringify)
    await ws.sendRaw('{{{invalid json');
    await delay(200);
    // Соединение всё ещё работает — сервер поймал ошибку и продолжает
    await ws.send({ type: 'ping' });
    const pong = await ws.wait(m => m.type === 'pong', 2000);
    assert.strictEqual(pong.type, 'pong', 'сервер должен оставаться рабочим после плохого JSON');
    ws.close();
    await delay(50);
  });

  await testAsync('неизвестный type сообщения игнорируется (нет краша, нет ответа)', async () => {
    const ws = await connect(URL);
    await ws.send({ type: 'join', role: 'team', teamId: 'S2', name: 'Test' });
    await ws.wait(m => m.type === 'joined');
    const before = ws.messages.length;
    await ws.send({ type: 'unknownTypeXYZ', data: 42 });
    await delay(200);
    // Нет новых сообщений (кроме возможных userEvent)
    const newMsgs = ws.messages.slice(before).filter(m => m.type !== 'userEvent');
    assert.strictEqual(newMsgs.length, 0, `неожиданные сообщения: ${JSON.stringify(newMsgs)}`);
    ws.close();
    await delay(50);
  });

  await testAsync('msg до join игнорируется (нет role)', async () => {
    const ws = await connect(URL);
    // Не делаем join, сразу отправляем ping
    await ws.send({ type: 'ping' });
    await delay(200);
    assert.strictEqual(ws.messages.length, 0, 'без join не должно быть ответа');
    ws.close();
    await delay(50);
  });

  // ── Rename ──
  console.log('\n── rename ──');

  await testAsync('admin переименовывает команду → upd с новым именем', async () => {
    const admin = await connect(URL);
    await admin.send({ type: 'join', role: 'admin', password: PASS, name: 'Admin' });
    await admin.wait(m => m.type === 'joined');
    await admin.send({ type: 'cmd', cmd: 'reset' });
    await admin.wait(m => m.type === 'reset');
    await admin.send({ type: 'rename', teamId: 'R1', name: 'НовоеИмя' });
    const upd = await admin.wait(m => m.type === 'upd' && m.names?.R1 === 'НовоеИмя');
    assert.strictEqual(upd.names.R1, 'НовоеИмя');
    admin.close();
    await delay(50);
  });

  // ── Proposals ──
  console.log('\n── proposals / propReply ──');

  await testAsync('R1 отправляет proposal S1 → оба получают его', async () => {
    const admin = await connect(URL);
    const r1    = await connect(URL);
    const s1    = await connect(URL);

    await admin.send({ type: 'join', role: 'admin', password: PASS, name: 'A' });
    await admin.wait(m => m.type === 'joined');
    await admin.send({ type: 'cmd', cmd: 'reset' });
    await admin.wait(m => m.type === 'reset');

    await r1.send({ type: 'join', role: 'team', teamId: 'R1', name: 'R1' });
    await r1.wait(m => m.type === 'joined');
    await s1.send({ type: 'join', role: 'team', teamId: 'S1', name: 'S1' });
    await s1.wait(m => m.type === 'joined');

    await r1.send({ type: 'proposal', to: 'S1', text: 'Скидка 10% за 100 ед.?' });
    const p1 = await r1.wait(m => m.type === 'proposal');
    const p2 = await s1.wait(m => m.type === 'proposal');
    assert.ok(p1.prop.id, 'R1 должен получить proposal с id');
    assert.strictEqual(p2.prop.from, 'R1');
    assert.strictEqual(p2.prop.to, 'S1');
    assert.strictEqual(p2.prop.text, 'Скидка 10% за 100 ед.?');
    admin.close(); r1.close(); s1.close();
    await delay(50);
  });

  await testAsync('S1 принимает proposal → оба получают propReply со статусом accepted', async () => {
    const admin = await connect(URL);
    const r1    = await connect(URL);
    const s1    = await connect(URL);

    await admin.send({ type: 'join', role: 'admin', password: PASS, name: 'A' });
    await admin.wait(m => m.type === 'joined');
    await admin.send({ type: 'cmd', cmd: 'reset' });
    await admin.wait(m => m.type === 'reset');

    await r1.send({ type: 'join', role: 'team', teamId: 'R1', name: 'R1' });
    await r1.wait(m => m.type === 'joined');
    await s1.send({ type: 'join', role: 'team', teamId: 'S1', name: 'S1' });
    await s1.wait(m => m.type === 'joined');

    await r1.send({ type: 'proposal', to: 'S1', text: 'Сделка' });
    const prop = await s1.wait(m => m.type === 'proposal');
    const propId = prop.prop.id;

    await s1.send({ type: 'propReply', id: propId, accept: true });
    const reply1 = await r1.wait(m => m.type === 'propReply' && m.id === propId);
    const reply2 = await s1.wait(m => m.type === 'propReply' && m.id === propId);

    assert.strictEqual(reply1.accept, true, 'R1 должен получить accept');
    assert.strictEqual(reply2.accept, true, 'S1 должен получить accept');
    assert.strictEqual(reply1.prop.status, 'accepted');
    admin.close(); r1.close(); s1.close();
    await delay(50);
  });

  await testAsync('неправильная команда не может принять proposal (prop.to !== me.teamId)', async () => {
    const admin = await connect(URL);
    const r1    = await connect(URL);
    const s1    = await connect(URL);
    const r2    = await connect(URL);

    await admin.send({ type: 'join', role: 'admin', password: PASS, name: 'A' });
    await admin.wait(m => m.type === 'joined');
    await admin.send({ type: 'cmd', cmd: 'reset' });
    await admin.wait(m => m.type === 'reset');

    await r1.send({ type: 'join', role: 'team', teamId: 'R1', name: 'R1' });
    await r1.wait(m => m.type === 'joined');
    await s1.send({ type: 'join', role: 'team', teamId: 'S1', name: 'S1' });
    await s1.wait(m => m.type === 'joined');
    await r2.send({ type: 'join', role: 'team', teamId: 'R2', name: 'R2' });
    await r2.wait(m => m.type === 'joined');

    await r1.send({ type: 'proposal', to: 'S1', text: 'Test' });
    const prop = await s1.wait(m => m.type === 'proposal');
    const propId = prop.prop.id;

    // R2 пытается принять proposal, адресованный S1
    const r2Before = r2.messages.length;
    await r2.send({ type: 'propReply', id: propId, accept: true });
    await delay(200);
    const r2New = r2.messages.slice(r2Before).filter(m => m.type === 'propReply');
    assert.strictEqual(r2New.length, 0, 'R2 не должен получить propReply — он не адресат');

    admin.close(); r1.close(); s1.close(); r2.close();
    await delay(50);
  });

  await testAsync('S1 отклоняет proposal → status "rejected"', async () => {
    const admin = await connect(URL);
    const r1    = await connect(URL);
    const s1    = await connect(URL);

    await admin.send({ type: 'join', role: 'admin', password: PASS, name: 'A' });
    await admin.wait(m => m.type === 'joined');
    await admin.send({ type: 'cmd', cmd: 'reset' });
    await admin.wait(m => m.type === 'reset');

    await r1.send({ type: 'join', role: 'team', teamId: 'R1', name: 'R1' });
    await r1.wait(m => m.type === 'joined');
    await s1.send({ type: 'join', role: 'team', teamId: 'S1', name: 'S1' });
    await s1.wait(m => m.type === 'joined');

    await r1.send({ type: 'proposal', to: 'S1', text: 'Откажи мне' });
    const prop = await s1.wait(m => m.type === 'proposal');
    await s1.send({ type: 'propReply', id: prop.prop.id, accept: false });
    const reply = await r1.wait(m => m.type === 'propReply');
    assert.strictEqual(reply.accept, false);
    assert.strictEqual(reply.prop.status, 'rejected');
    admin.close(); r1.close(); s1.close();
    await delay(50);
  });

  // ── Submit: только от team ──
  console.log('\n── submit ──');

  await testAsync('submit от team принимается → subList обновляется', async () => {
    const admin = await connect(URL);
    const r3    = await connect(URL);

    await admin.send({ type: 'join', role: 'admin', password: PASS, name: 'A' });
    await admin.wait(m => m.type === 'joined');
    await admin.send({ type: 'cmd', cmd: 'reset' });
    await admin.wait(m => m.type === 'reset');

    await r3.send({ type: 'join', role: 'team', teamId: 'R3', name: 'R3' });
    await r3.wait(m => m.type === 'joined');

    await r3.send({ type: 'submit', round: 0, data: { dummy: true } });
    const upd = await r3.wait(m => m.type === 'upd' && Array.isArray(m.submitted));
    assert.ok(upd.submitted.includes('R3'), `R3 должен быть в submitted: ${JSON.stringify(upd.submitted)}`);
    admin.close(); r3.close();
    await delay(50);
  });

  await testAsync('submit от admin — игнорируется (не team)', async () => {
    const admin = await connect(URL);
    await admin.send({ type: 'join', role: 'admin', password: PASS, name: 'A' });
    await admin.wait(m => m.type === 'joined');
    await admin.send({ type: 'cmd', cmd: 'reset' });
    await admin.wait(m => m.type === 'reset');

    const before = admin.messages.length;
    await admin.send({ type: 'submit', round: 0, data: { dummy: true } });
    await delay(200);
    const newUpds = admin.messages.slice(before).filter(m => m.type === 'upd' && m.submitted);
    // Поскольку admin не team, submit не должен добавлять его в subList
    newUpds.forEach(m => assert.ok(!m.submitted.includes('undefined'), 'admin не должен быть в submitted'));
    admin.close();
    await delay(50);
  });
}

runTests()
  .then(() => {
    stopServer();
    const total = passed + failed;
    console.log(`\n${'─'.repeat(48)}`);
    console.log(`protocol tests: ${passed}/${total} passed${failed ? ` (${failed} FAILED)` : ''}`);
    if (failed) process.exit(1);
  })
  .catch(e => {
    stopServer();
    console.error('\nFATAL:', e.message);
    process.exit(1);
  });
