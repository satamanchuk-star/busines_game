'use strict';
// ─── HTTP-интеграционные тесты auth.js ─────────────────────────────────────
// Покрывает: /auth/request, /auth/reclaim, /auth/status, /auth/claim,
//            /auth/decide, gate middleware, parseCookies unit
// Запуск: node tests/auth.test.js
const assert = require('assert');
const http   = require('http');
const fs     = require('fs');
const path   = require('path');
const { spawn } = require('child_process');

const AUTH_PORT  = 3002;
const AUTH_STORE = path.join(require('os').tmpdir(), `auth-test-${process.pid}.json`);
const ROOT = path.resolve(__dirname, '..');

// ─── Инфраструктура ───
const delay = ms => new Promise(r => setTimeout(r, ms));

function request(method, urlPath, body, cookieStr, acceptHtml = false) {
  return new Promise((resolve, reject) => {
    const opts = {
      host: 'localhost', port: AUTH_PORT, method, path: urlPath,
      headers: {
        'Content-Type': 'application/json',
        'Accept': acceptHtml ? 'text/html,application/xhtml+xml,*/*' : 'application/json',
        ...(cookieStr ? { Cookie: cookieStr } : {}),
      },
    };
    const req = http.request(opts, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        const ct = res.headers['content-type'] || '';
        let parsed;
        try { parsed = ct.includes('json') ? JSON.parse(data) : data; }
        catch (e) { parsed = data; }
        resolve({ status: res.statusCode, headers: res.headers, body: parsed });
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}
const post    = (p, b, c) => request('POST', p, b, c);
const get     = (p, c)    => request('GET',  p, null, c);
const getHtml = (p, c)    => request('GET',  p, null, c, true);

// Дождаться появления данных в файле хранилища
async function waitStore(pred, timeout = 3000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    try {
      const s = JSON.parse(fs.readFileSync(AUTH_STORE, 'utf8'));
      const result = pred(s);
      if (result !== undefined) return result;
    } catch (e) {}
    await delay(60);
  }
  throw new Error('waitStore: timeout');
}

// ─── Управление сервером ───
let serverProc;
async function startServer(keepStore = false, extraEnv = {}) {
  if (!keepStore && fs.existsSync(AUTH_STORE)) fs.unlinkSync(AUTH_STORE);
  // Дождаться, пока предыдущий сервер ОТПУСТИТ порт: иначе новый не забиндится (EADDRINUSE),
  // а probe попадёт в умирающий старый сервер и мы вернёмся преждевременно. Ловит флаку рестартов.
  const freeBy = Date.now() + 5000;
  while (Date.now() < freeBy) {
    try { await get('/auth/status?reqId=probe'); await delay(150); }  // ещё отвечает → старый жив, ждём
    catch (e) { break; }                                              // ECONNREFUSED → порт свободен
  }
  serverProc = spawn('node', ['server.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(AUTH_PORT), AUTH_ENABLED: '1',
           AUTH_STORE, ADMIN_PASS: 'fmcg2024', NODE_ENV: 'test', ...extraEnv },
    stdio: 'pipe',
  });
  serverProc.stderr.on('data', () => {});
  serverProc.stdout.on('data', () => {});
  const end = Date.now() + 20000;   // под нагрузкой test:all старт node + bind может занять >8с
  while (Date.now() < end) {
    try { await get('/auth/status?reqId=probe'); return; }
    catch (e) { await delay(120); }
  }
  throw new Error('Server did not start in time (порт занят или медленный старт)');
}

function stopServer() {
  if (serverProc) { serverProc.kill('SIGTERM'); serverProc = null; }
  try { if (fs.existsSync(AUTH_STORE)) fs.unlinkSync(AUTH_STORE); } catch (e) {}
}

// ─── Тест-бегунок ───
let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failed++; console.error(`  ✗ ${name}\n    ${e.message}`); }
}
async function testAsync(name, fn) {
  try { await fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failed++; console.error(`  ✗ ${name}\n    ${e.message}`); }
}

// ════════════════════════════════════════════════════
// Секция 1: parseCookies — unit-тест чистой функции (копия из auth.js)
function parseCookies(h) {
  const o = {};
  (h || '').split(';').forEach(p => {
    const i = p.indexOf('=');
    if (i > 0) o[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return o;
}

console.log('\n── parseCookies (unit) ──');

test('пустая строка → пустой объект', () => {
  assert.deepStrictEqual(parseCookies(''), {});
});
test('null / undefined → пустой объект', () => {
  assert.deepStrictEqual(parseCookies(null), {});
  assert.deepStrictEqual(parseCookies(undefined), {});
});
test('один куки', () => {
  assert.deepStrictEqual(parseCookies('fmcg_access=abc123'), { fmcg_access: 'abc123' });
});
test('несколько куки через ; ', () => {
  const c = parseCookies('a=1; b=2; c=3');
  assert.strictEqual(c.a, '1');
  assert.strictEqual(c.b, '2');
  assert.strictEqual(c.c, '3');
});
test('URI-encoded значение декодируется', () => {
  const c = parseCookies('q=hello%20world');
  assert.strictEqual(c.q, 'hello world');
});
test('куки без знака = игнорируется', () => {
  const c = parseCookies('novalue; valid=ok');
  assert.strictEqual(c.valid, 'ok');
  assert.strictEqual(c.novalue, undefined);
});

// ════════════════════════════════════════════════════
// Секции 2–10: HTTP integration
async function runHttpTests() {
  console.log('\n── Запуск сервера на порту', AUTH_PORT, '──');
  await startServer();
  console.log('  Сервер готов\n');

  // ── /auth/request ──
  console.log('── /auth/request ──');

  await testAsync('пустое имя → 400', async () => {
    const r = await post('/auth/request', { name: '', email: 'a@b.com' });
    assert.strictEqual(r.status, 400);
    assert.ok(r.body.error, 'должна быть ошибка');
  });

  await testAsync('некорректный email → 400', async () => {
    const r = await post('/auth/request', { name: 'Test User', email: 'not-email' });
    assert.strictEqual(r.status, 400);
  });

  await testAsync('слишком короткое имя (1 символ) → 400', async () => {
    const r = await post('/auth/request', { name: 'X', email: 'x@test.com' });
    assert.strictEqual(r.status, 400);
  });

  let reqId1, ownerToken1;
  await testAsync('корректная заявка → reqId', async () => {
    const r = await post('/auth/request', { name: 'Ivan Petrov', email: 'ivan@test.com' });
    assert.strictEqual(r.status, 200);
    assert.ok(r.body.reqId, 'должен вернуть reqId');
    reqId1 = r.body.reqId;
    ownerToken1 = await waitStore(s => {
      const req = s.requests?.find(x => x.id === reqId1);
      return req ? req.ownerToken : undefined;
    });
    assert.ok(ownerToken1, 'ownerToken должен быть в хранилище');
  });

  await testAsync('дублирующая заявка (тот же email, pending) → тот же reqId', async () => {
    const r = await post('/auth/request', { name: 'Ivan Petrov', email: 'ivan@test.com' });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.body.reqId, reqId1, 'дублирующая заявка возвращает существующий reqId');
  });

  // ── /auth/status ──
  console.log('\n── /auth/status ──');

  await testAsync('неизвестный reqId → {status:"unknown"}', async () => {
    const r = await get('/auth/status?reqId=no-such-id');
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.body.status, 'unknown');
  });

  await testAsync('pending reqId → {status:"pending"}', async () => {
    const r = await get(`/auth/status?reqId=${reqId1}`);
    assert.strictEqual(r.body.status, 'pending');
  });

  // ── /auth/decide ──
  console.log('\n── /auth/decide ──');

  await testAsync('невалидный ownerToken → 404', async () => {
    const r = await post('/auth/decide', { token: 'fake-token', decision: 'approve' });
    assert.strictEqual(r.status, 404);
  });

  await testAsync('approve с валидным ownerToken → status approved', async () => {
    const r = await post('/auth/decide', { token: ownerToken1, decision: 'approve' });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.body.status, 'approved');
  });

  await testAsync('повторный decide (уже resolved) → возвращает текущий статус без изменений', async () => {
    const r = await post('/auth/decide', { token: ownerToken1, decision: 'deny' });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.body.status, 'approved', 'уже одобрено — deny не применяется');
  });

  await waitStore(s => s.grants?.['ivan@test.com'] ? true : undefined);

  await testAsync('после approve: /auth/status → "approved"', async () => {
    const r = await get(`/auth/status?reqId=${reqId1}`);
    assert.strictEqual(r.body.status, 'approved');
  });

  // ── /auth/claim ──
  console.log('\n── /auth/claim ──');

  await testAsync('неизвестный reqId → {ok:false}', async () => {
    const r = await post('/auth/claim', { reqId: 'no-such' });
    assert.strictEqual(r.body.ok, false);
    assert.strictEqual(r.body.status, 'unknown');
  });

  let sessionCookie;
  await testAsync('approved reqId → {ok:true} + Set-Cookie fmcg_access HttpOnly', async () => {
    const r = await post('/auth/claim', { reqId: reqId1 });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.body.ok, true);
    assert.strictEqual(r.body.redirect, '/');
    const setCookie = r.headers['set-cookie']?.[0] || '';
    assert.ok(setCookie.includes('fmcg_access='), 'Set-Cookie должен содержать fmcg_access');
    assert.ok(setCookie.toLowerCase().includes('httponly'), 'Cookie должен быть HttpOnly');
    sessionCookie = setCookie.split(';')[0];
  });

  await testAsync('повторный claim одобренной заявки → тоже ok (идемпотентно)', async () => {
    const r = await post('/auth/claim', { reqId: reqId1 });
    assert.strictEqual(r.body.ok, true, 'повторный claim разрешён');
  });

  // ── /auth/reclaim ──
  console.log('\n── /auth/reclaim ──');

  await testAsync('reclaim по несуществующему email → {ok:false}', async () => {
    const r = await post('/auth/reclaim', { email: 'nobody@test.com' });
    assert.strictEqual(r.body.ok, false);
  });

  await testAsync('reclaim с невалидным email → 400', async () => {
    const r = await post('/auth/reclaim', { email: 'not-valid' });
    assert.strictEqual(r.status, 400);
  });

  await testAsync('reclaim по одобренному email → {ok:true} + Set-Cookie', async () => {
    const r = await post('/auth/reclaim', { email: 'ivan@test.com' });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.body.ok, true);
    const setCookie = r.headers['set-cookie']?.[0] || '';
    assert.ok(setCookie.includes('fmcg_access='), 'reclaim должен выдать cookie');
  });

  // ── instant access ──
  console.log('\n── instant access ──');

  await testAsync('request от уже одобренного email → {status:"instant"} + Set-Cookie', async () => {
    const r = await post('/auth/request', { name: 'Ivan Again', email: 'ivan@test.com' });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.body.status, 'instant');
    const setCookie = r.headers['set-cookie']?.[0] || '';
    assert.ok(setCookie.includes('fmcg_access='), 'instant должен выдать cookie');
  });

  // ── gate middleware ──
  console.log('\n── gate middleware ──');

  await testAsync('GET /play.html без cookie (Accept: text/html) → 302 → /login.html', async () => {
    // gate проверяет Accept: text/html чтобы отличить браузер от API-клиента
    const r = await getHtml('/play.html');
    assert.ok(r.status === 302 || r.status === 301, `ожидался редирект, получили ${r.status}`);
    assert.ok((r.headers.location || '').includes('login'), `редирект должен вести на login`);
  });

  await testAsync('GET /login.html без cookie → 200 (OPEN path)', async () => {
    const r = await get('/login.html');
    assert.strictEqual(r.status, 200);
  });

  await testAsync('GET /fonts/onest.css без cookie → 200 (шрифты открыты для стр. входа)', async () => {
    const r = await get('/fonts/onest.css');
    assert.strictEqual(r.status, 200, 'self-hosted шрифт должен грузиться без авторизации');
  });

  await testAsync('GET /play.html с валидным cookie → 200', async () => {
    assert.ok(sessionCookie, 'нужен sessionCookie из предыдущего шага');
    const r = await get('/play.html', sessionCookie);
    assert.strictEqual(r.status, 200, `с валидным cookie gate должен пропустить`);
  });

  await testAsync('GET /play.html с поддельным cookie → 302 или 401 (gate блокирует)', async () => {
    const r = await getHtml('/play.html', 'fmcg_access=fake-token-xyz');
    assert.ok(r.status === 302 || r.status === 301 || r.status === 401, `поддельный cookie: ожидался 302/401, получили ${r.status}`);
  });

  // ── deny flow ──
  console.log('\n── deny flow ──');

  let reqId2, ownerToken2;
  await testAsync('новая заявка для другого email', async () => {
    const r = await post('/auth/request', { name: 'Bob Smith', email: 'bob@test.com' });
    reqId2 = r.body.reqId;
    ownerToken2 = await waitStore(s => {
      const req = s.requests?.find(x => x.id === reqId2);
      return req ? req.ownerToken : undefined;
    });
    assert.ok(ownerToken2);
  });

  await testAsync('deny → status denied', async () => {
    const r = await post('/auth/decide', { token: ownerToken2, decision: 'deny' });
    assert.strictEqual(r.body.status, 'denied');
  });

  await testAsync('/auth/status → denied', async () => {
    const r = await get(`/auth/status?reqId=${reqId2}`);
    assert.strictEqual(r.body.status, 'denied');
  });

  await testAsync('claim для denied заявки → {ok:false, status:"denied"}', async () => {
    const r = await post('/auth/claim', { reqId: reqId2 });
    assert.strictEqual(r.body.ok, false);
    assert.strictEqual(r.body.status, 'denied');
  });

  await testAsync('reclaim для email с только denied заявкой → {ok:false}', async () => {
    const r = await post('/auth/reclaim', { email: 'bob@test.com' });
    assert.strictEqual(r.body.ok, false, 'denied не даёт grant → reclaim провалится');
  });

  // ── режим воркшопа: общий код доступа ──
  console.log('\n── workshop code ──');

  await testAsync('режим выключен: /auth/config → {workshop:false}', async () => {
    const r = await get('/auth/config');
    assert.strictEqual(r.body.workshop, false);
  });
  await testAsync('режим выключен: /auth/workshop → 403', async () => {
    const r = await post('/auth/workshop', { code: 'что угодно' });
    assert.strictEqual(r.status, 403, `должен быть 403 (body=${JSON.stringify(r.body)})`);
    assert.strictEqual(r.body.ok, false);
  });

  // Перезапуск с включённым кодом воркшопа
  await testAsync('режим включён: /auth/config → {workshop:true}', async () => {
    stopServer();
    await delay(1000);
    await startServer(false, { WORKSHOP_CODE: 'PLAY2026' });
    const r = await get('/auth/config');
    assert.strictEqual(r.body.workshop, true);
  });
  await testAsync('неверный код → {ok:false}, без cookie', async () => {
    const r = await post('/auth/workshop', { code: 'WRONG' });
    assert.strictEqual(r.body.ok, false);
    assert.ok(!r.headers['set-cookie'], 'неверный код не должен ставить cookie');
  });
  await testAsync('верный код → {ok:true} + Set-Cookie fmcg_access HttpOnly', async () => {
    const r = await post('/auth/workshop', { code: 'PLAY2026' });
    assert.strictEqual(r.body.ok, true);
    const sc = (r.headers['set-cookie'] || []).join(';');
    assert.ok(/fmcg_access=/.test(sc) && /HttpOnly/i.test(sc), `ожидали HttpOnly cookie (${sc})`);
  });
  await testAsync('cookie от кода воркшопа проходит гейт (/play.html → 200)', async () => {
    const r = await post('/auth/workshop', { code: 'PLAY2026' });
    const cookie = (r.headers['set-cookie'][0] || '').split(';')[0];
    const g = await getHtml('/play.html', cookie);
    assert.strictEqual(g.status, 200, `с воркшоп-cookie должен быть доступ (${g.status})`);
  });

  // ── legacy grant migration ──
  console.log('\n── legacy grant migration ──');

  await testAsync('хранилище в старом формате корректно мигрируется', async () => {
    // Порядок важен: сначала останавливаем (stopServer удаляет файл),
    // ЗАТЕМ пишем legacy-данные, ЗАТЕМ стартуем с keepStore=true
    stopServer();
    await delay(1000); // ждём освобождения порта 3002
    const legacyStore = {
      requests: [],
      sessions: {},
      grants: {
        // старый формат: { token → {email, name, issuedAt} }
        'old-token-abc': { email: 'migrated@test.com', name: 'Migrated User', issuedAt: Date.now() },
      },
    };
    fs.writeFileSync(AUTH_STORE, JSON.stringify(legacyStore));
    // keepStore=true — startServer не удаляет файл перед запуском
    await startServer(true);
    const r = await post('/auth/reclaim', { email: 'migrated@test.com' });
    assert.strictEqual(r.body.ok, true, `email должен быть в grants после миграции (body=${JSON.stringify(r.body)})`);
  });
}

runHttpTests().then(() => {
  stopServer();
  const total = passed + failed;
  console.log(`\n${'─'.repeat(48)}`);
  console.log(`auth tests: ${passed}/${total} passed${failed ? ` (${failed} FAILED)` : ''}`);
  if (failed) process.exit(1);
}).catch(e => {
  stopServer();
  console.error('\nFATAL:', e.message);
  process.exit(1);
});
