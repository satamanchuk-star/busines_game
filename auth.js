'use strict';
// ─────────────────────────────────────────────────────────────────────────
//  АВТОРИЗАЦИЯ ПО ЗАЯВКЕ + ОДОБРЕНИЕ ВЛАДЕЛЬЦЕМ
//
//  Логика:
//  - Грант = email (одобрен один раз → доступ навсегда, пока не отзовут)
//  - Первый вход: заявка → письмо владельцу → одобрить → cookie
//  - Повторный вход: email → если в grants → cookie мгновенно, без участия владельца
//  - Заявка висит 48ч, потом expires (не виснет вечно)
//  - Дубль по email: возвращает существующую заявку, не создаёт новую
//
//  Секреты — ТОЛЬКО через .env на сервере:
//    RESEND_API_KEY, OWNER_EMAIL, BASE_URL, AUTH_ENABLED, COOKIE_SECURE
// ─────────────────────────────────────────────────────────────────────────
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const STORE       = process.env.AUTH_STORE || path.join(__dirname, 'auth-store.json');
const OWNER_EMAIL = process.env.OWNER_EMAIL     || 'satamanchuk@gmail.com';
// Режим воркшопа: общий код доступа на сессию. Ведущий задаёт WORKSHOP_CODE и
// раздаёт его участникам → мгновенный вход без персональных заявок (нет затора на 30 чел).
// Пусто = режим выключен, работает только заявка+одобрение.
const WORKSHOP_CODE = String(process.env.WORKSHOP_CODE || '').trim();
const RESEND_KEY  = process.env.RESEND_API_KEY  || '';
const BASE_URL    = (process.env.BASE_URL || 'https://ibsgame.ru').replace(/\/+$/, '');
const COOKIE_DAYS = +(process.env.AUTH_COOKIE_DAYS || 30);
const COOKIE_NAME = 'fmcg_access';
const AUTH_ENABLED = (process.env.AUTH_ENABLED ?? '1') !== '0';
const REQUEST_TTL  = 48 * 3600 * 1000;           // заявка живёт 48ч
const SESSION_TTL  = COOKIE_DAYS * 86400 * 1000;

// store.grants:   { email   → { name, approvedAt } }
// store.sessions: { token   → { email, issuedAt  } }
// store.requests: [ { id, ownerToken, name, email, org, purpose, status, createdAt } ]
let store = { requests: [], grants: {}, sessions: {} };

function load() {
  try {
    const s = JSON.parse(fs.readFileSync(STORE, 'utf8'));
    store.requests = s.requests || [];
    store.sessions = s.sessions || {};
    // Миграция старого формата grants: { token → {email,name} } → { email → {name, approvedAt} }
    const raw = s.grants || {};
    if (Object.values(raw).some(v => v && typeof v.email === 'string')) {
      // старый формат — конвертируем
      store.grants = {};
      for (const v of Object.values(raw)) {
        if (v && v.email && !store.grants[v.email])
          store.grants[v.email] = { name: v.name || '', approvedAt: v.issuedAt || Date.now() };
      }
      console.log('[auth] мигрировано grants →', Object.keys(store.grants).length, 'email(s)');
    } else {
      store.grants = raw;
    }
  } catch (e) { /* первый запуск */ }
}

let saveT = null;
function save() {
  clearTimeout(saveT);
  saveT = setTimeout(() => {
    // Чистим просроченные сессии перед сохранением
    const now = Date.now();
    for (const [tok, s] of Object.entries(store.sessions))
      if (now - s.issuedAt > SESSION_TTL) delete store.sessions[tok];
    try { fs.writeFileSync(STORE, JSON.stringify(store, null, 2)); }
    catch (e) { console.error('[auth] save:', e.message); }
  }, 200);
}
load();

const id      = () => crypto.randomBytes(16).toString('hex');
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const norm     = s => String(s || '').trim().toLowerCase();
const esc      = s => String(s == null ? '' : s)
  .replace(/[<>&"]/g, c => ({ '<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;' }[c]));

function parseCookies(h) {
  const o = {};
  (h || '').split(';').forEach(p => { const i = p.indexOf('='); if (i > 0)
    o[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim()); });
  return o;
}

function hasGrant(req) {
  const t = parseCookies(req.headers.cookie)[COOKIE_NAME];
  if (!t) return false;
  const sess = store.sessions[t];
  if (!sess) return false;
  if (Date.now() - sess.issuedAt > SESSION_TTL) { delete store.sessions[t]; return false; }
  return true;
}

function issueSession(email, res) {
  const tok = id();
  store.sessions[tok] = { email, issuedAt: Date.now() };
  const secure = process.env.COOKIE_SECURE === '1';
  res.setHeader('Set-Cookie',
    `${COOKIE_NAME}=${tok}; HttpOnly; Path=/; Max-Age=${COOKIE_DAYS*86400}; SameSite=Lax${secure?'; Secure':''}`);
  return tok;
}

// ─── Resend HTTP API ───
async function sendOwnerMail(r) {
  const link = `${BASE_URL}/auth/review?token=${r.ownerToken}`;
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;color:#0d1526">
      <div style="background:#2563eb;color:#fff;padding:16px 20px;border-radius:10px 10px 0 0;font-size:17px;font-weight:700">
        🔐 Новая заявка на доступ — FMCG-игра</div>
      <div style="border:1px solid #e6eaf1;border-top:none;border-radius:0 0 10px 10px;padding:20px">
        <table style="width:100%;border-collapse:collapse;font-size:14px">
          <tr><td style="padding:6px 0;color:#56627a;width:120px">Имя</td><td style="padding:6px 0;font-weight:600">${esc(r.name)}</td></tr>
          <tr><td style="padding:6px 0;color:#56627a">Email</td><td style="padding:6px 0;font-weight:600">${esc(r.email)}</td></tr>
          <tr><td style="padding:6px 0;color:#56627a">Организация</td><td style="padding:6px 0">${esc(r.org)||'—'}</td></tr>
          <tr><td style="padding:6px 0;color:#56627a;vertical-align:top">Цель</td><td style="padding:6px 0">${esc(r.purpose)||'—'}</td></tr>
        </table>
        <div style="margin-top:20px;text-align:center">
          <a href="${link}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;
             padding:12px 28px;border-radius:8px;font-weight:700;font-size:15px">Рассмотреть заявку →</a>
        </div>
        <p style="margin-top:18px;font-size:12px;color:#9aa6b8;text-align:center">
          GET-ссылка только показывает страницу. Доступ выдаётся кнопкой «Одобрить».</p>
      </div>
    </div>`;
  if (!RESEND_KEY) {
    console.log(`[auth] почта не настроена. Заявка от ${r.email}. Рассмотреть: ${link}`);
    return;
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'FMCG-игра <onboarding@resend.dev>',
        to: [OWNER_EMAIL], reply_to: r.email,
        subject: `Заявка на доступ: ${r.name} <${r.email}>`, html,
      }),
    });
    if (res.ok) console.log(`[auth] письмо отправлено (${r.email})`);
    else { const b = await res.text(); console.error(`[auth] Resend ${res.status}: ${b}. Ссылка: ${link}`); }
  } catch (e) { console.error(`[auth] ошибка: ${e.message}. Ссылка: ${link}`); }
}

// ─── HTML для владельца ───
const page = (title, body) => `<!doctype html><html lang="ru"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>${title}</title><style>
*{box-sizing:border-box}body{font-family:Arial,sans-serif;background:#f3f5f9;color:#0d1526;margin:0;
padding:40px 16px;display:flex;justify-content:center}.card{background:#fff;border:1px solid #e6eaf1;
border-radius:14px;max-width:520px;width:100%;padding:28px;box-shadow:0 4px 24px rgba(13,21,38,.08)}
h1{font-size:20px;margin:0 0 16px}table{width:100%;border-collapse:collapse;font-size:14px;margin-bottom:8px}
td{padding:7px 0;border-bottom:1px solid #eef1f6}.k{color:#56627a;width:130px}.v{font-weight:600}
.row{display:flex;gap:12px;margin-top:22px}button{flex:1;border:none;border-radius:9px;padding:13px;
font-size:15px;font-weight:700;cursor:pointer;font-family:inherit}.ok{background:#15a34a;color:#fff}
.no{background:#fff;color:#dc2626;border:1.5px solid #dc2626}.msg{padding:14px;border-radius:9px;font-size:15px;
font-weight:600;text-align:center}.m-ok{background:#dcfce7;color:#15803d}.m-no{background:#fee2e2;color:#b91c1c}
.muted{color:#9aa6b8;font-size:13px;margin-top:16px;text-align:center}
</style></head><body><div class="card">${body}</div></body></html>`;

function reviewPage(r) {
  if (!r) return page('Заявка не найдена',
    `<h1>Ссылка недействительна</h1><div class="msg m-no">Заявка не найдена или устарела.</div>`);
  if (r.status === 'expired') return page('Заявка истекла',
    `<h1>Заявка истекла</h1><div class="msg m-no">Заявка от ${esc(r.name)} (${esc(r.email)}) истекла (>48ч). Попросите подать новую.</div>`);
  if (r.status !== 'pending') return page('Заявка обработана',
    `<h1>Уже обработано</h1><div class="msg ${r.status==='approved'?'m-ok':'m-no'}">
     ${r.status==='approved'?'✅ Доступ выдан':'⛔ Отклонено'} — ${esc(r.name)} (${esc(r.email)})</div>`);
  return page('Рассмотрение заявки', `<h1>Заявка на доступ</h1>
    <table>
      <tr><td class="k">Имя</td><td class="v">${esc(r.name)}</td></tr>
      <tr><td class="k">Email</td><td class="v">${esc(r.email)}</td></tr>
      <tr><td class="k">Организация</td><td class="v">${esc(r.org)||'—'}</td></tr>
      <tr><td class="k">Цель</td><td class="v">${esc(r.purpose)||'—'}</td></tr>
    </table>
    <div class="row">
      <button class="ok" onclick="decide('approve')">✅ Одобрить</button>
      <button class="no" onclick="decide('deny')">⛔ Отклонить</button>
    </div>
    <div id="out" class="muted">Одобрение даёт постоянный доступ по этому email — повторные входы мгновенные.</div>
    <script>
      var T=${JSON.stringify(r.ownerToken)};
      function decide(d){
        document.querySelectorAll('button').forEach(b=>b.disabled=true);
        fetch('/auth/decide',{method:'POST',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({token:T,decision:d})}).then(r=>r.json()).then(j=>{
            var o=document.getElementById('out');
            o.className='msg '+(j.status==='approved'?'m-ok':'m-no');
            o.textContent=j.status==='approved'?'✅ Доступ выдан — повторные входы мгновенные':'⛔ Заявка отклонена';
          }).catch(()=>{document.getElementById('out').textContent='Ошибка сети';
            document.querySelectorAll('button').forEach(b=>b.disabled=false);});
      }
    </script>`);
}

// ─── Express-маршруты ───
function mount(app) {

  // Заявка / мгновенный вход (если email уже одобрен)
  app.post('/auth/request', (req, res) => {
    const b   = req.body || {};
    const name = String(b.name||'').trim().slice(0, 100);
    const email = norm(b.email).slice(0, 120);
    const org   = String(b.org||'').trim().slice(0, 120);
    const purpose = String(b.purpose||'').trim().slice(0, 500);
    if (name.length < 2 || !EMAIL_RE.test(email))
      return res.status(400).json({ error: 'Укажите имя и корректный email' });

    // Email уже одобрен → мгновенный доступ
    if (store.grants[email]) {
      issueSession(email, res);
      save();
      console.log(`[auth] мгновенный вход: ${email}`);
      return res.json({ status: 'instant', redirect: '/' });
    }

    // Уже есть живая заявка → не дублируем
    const existing = store.requests.find(r =>
      r.email === email && r.status === 'pending' && Date.now() - r.createdAt < REQUEST_TTL);
    if (existing) return res.json({ reqId: existing.id });

    // Новая заявка
    const r = { id:id(), ownerToken:id(), name, email, org, purpose,
                status:'pending', createdAt:Date.now() };
    store.requests.push(r);
    if (store.requests.length > 500) store.requests = store.requests.slice(-500);
    save();
    sendOwnerMail(r);
    res.json({ reqId: r.id });
  });

  // Повторный вход по email (для тех у кого был доступ)
  app.post('/auth/reclaim', (req, res) => {
    const email = norm((req.body||{}).email).slice(0, 120);
    if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Укажите корректный email' });
    if (store.grants[email]) {
      issueSession(email, res);
      save();
      console.log(`[auth] повторный вход: ${email}`);
      return res.json({ ok: true, redirect: '/' });
    }
    res.json({ ok: false });
  });

  // Конфиг для login.html: показывать ли вкладку «Код игры»
  app.get('/auth/config', (req, res) => {
    res.json({ workshop: !!WORKSHOP_CODE });
  });

  // Вход по общему коду воркшопа (мгновенно, без заявки/одобрения)
  app.post('/auth/workshop', (req, res) => {
    if (!WORKSHOP_CODE) return res.status(403).json({ ok:false, error:'Режим воркшопа выключен' });
    const code = String((req.body||{}).code||'').trim();
    if (code !== WORKSHOP_CODE) return res.json({ ok:false, error:'Неверный код игры' });
    issueSession('workshop', res);   // анонимная сессия (грант не создаётся)
    save();
    console.log('[auth] вход по коду воркшопа');
    return res.json({ ok:true, redirect:'/' });
  });

  // Статус заявки
  app.get('/auth/status', (req, res) => {
    const r = store.requests.find(x => x.id === req.query.reqId);
    if (!r) return res.json({ status: 'unknown' });
    if (r.status === 'pending' && Date.now() - r.createdAt > REQUEST_TTL) {
      r.status = 'expired'; save();
    }
    res.json({ status: r.status });
  });

  // Выдача cookie после одобрения
  app.post('/auth/claim', (req, res) => {
    const r = store.requests.find(x => x.id === (req.body||{}).reqId);
    if (!r || r.status !== 'approved') return res.json({ ok:false, status: r?r.status:'unknown' });
    issueSession(r.email, res);
    save();
    res.json({ ok:true, redirect:'/' });
  });

  // Владелец: страница рассмотрения (GET — только показ)
  app.get('/auth/review', (req, res) => {
    const r = store.requests.find(x => x.ownerToken === req.query.token);
    res.set('Content-Type','text/html; charset=utf-8').send(reviewPage(r));
  });

  // Владелец: решение (POST)
  app.post('/auth/decide', (req, res) => {
    const b = req.body || {};
    const r = store.requests.find(x => x.ownerToken === b.token);
    if (!r) return res.status(404).json({ error:'not found' });
    if (r.status === 'pending') {
      if (b.decision === 'approve') {
        r.status = 'approved';
        store.grants[r.email] = { name:r.name, approvedAt:Date.now() };
        console.log(`[auth] одобрено: ${r.email} — теперь постоянный доступ`);
      } else {
        r.status = 'denied';
        console.log(`[auth] отклонено: ${r.email}`);
      }
      save();
    }
    res.json({ status: r.status });
  });
}

// ─── Гейт ───
const OPEN = new Set(['/login.html','/favicon.ico','/robots.txt']);
// Префиксы, открытые без авторизации: шрифты нужны самой странице входа
// (self-hosted Onest), они не секретны.
const OPEN_PREFIX = ['/fonts/'];
function gate(req, res, next) {
  if (!AUTH_ENABLED) return next();
  if (OPEN.has(req.path) || OPEN_PREFIX.some(p => req.path.startsWith(p))) return next();
  if (hasGrant(req)) return next();
  if ((req.headers.accept || '').includes('text/html')) return res.redirect('/login.html');
  return res.status(401).json({ error:'unauthorized' });
}

function wsAllowed(req) { return !AUTH_ENABLED || hasGrant(req); }

function status() {
  const pending = store.requests.filter(r => r.status==='pending' && Date.now()-r.createdAt < REQUEST_TTL).length;
  return { enabled:AUTH_ENABLED, smtp:!!RESEND_KEY, owner:OWNER_EMAIL, workshop:!!WORKSHOP_CODE,
           grants:Object.keys(store.grants).length,
           sessions:Object.keys(store.sessions).length, pending };
}

module.exports = { mount, gate, wsAllowed, status };
