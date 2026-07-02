const G = Object.assign({}, GAME_CONFIG, {
  events:[
    null,
    {t:'📢 Промо-инициатива',d:'Спрос на снеки вырос до 110 ед. Промо-буст ×1.5 — только при скидке ≥10% и включённом промо.'},
    {t:'🚨 ДВОЙНОЙ ШОК',d:'Мощность перевозчика: 320→200. Квота Импорта: 70→30. Спрос: молочка→130, деликатесы→25. Приоритизируйте поставки!'},
    {t:'📊 Стабилизация',d:'Рынок восстанавливается: молочка=115, снеки=90, деликатесы=35. Восстановите сервис и маржу.'},
  ],
  phaseName:{lobby:'Лобби',roles:'Распределение ролей',briefing:'Брифинг',negotiation:'Переговоры',decisions:'Решения',results:'Расчёт',final:'Финал'},
  phaseIco:{lobby:'🏠',roles:'🎲',briefing:'📢',negotiation:'🤝',decisions:'✏️',results:'📊',final:'🏆'},
  CHARS:GAME_CONFIG.CHARS_PALETTE,  // единая палитра (gameconfig.js); раньше Хитрый/Упрямый совпадали по цвету
  type:t=>GAME_CONFIG.retIds.includes(t)?'ret':GAME_CONFIG.supIds.includes(t)?'sup':'dist',
});


function hexA(hex,a){const h=hex.replace('#','');return `rgba(${parseInt(h.slice(0,2),16)},${parseInt(h.slice(2,4),16)},${parseInt(h.slice(4,6),16)},${a})`;}

let gs=null,ws=null,timerInt=null;

;(function connect(){
  const proto=location.protocol==='https:'?'wss:':'ws:';
  ws=new WebSocket(`${proto}//${location.host}`);
  ws.onopen=()=>{
    document.getElementById('l-dot').classList.add('ok');
    document.getElementById('l-status').textContent='Подключено';
    ws.send(JSON.stringify({type:'join',role:'player',teamId:'live',name:'Проектор',password:''}));
  };
  ws.onmessage=e=>{try{onMsg(JSON.parse(e.data));}catch(ex){console.error(ex);}};
  ws.onclose=()=>{
    document.getElementById('l-dot').classList.remove('ok');
    document.getElementById('l-status').textContent='Нет связи · переподключение…';
    setTimeout(connect,3000);
  };
})();

function onMsg(msg){
  switch(msg.type){
    case 'joined':
    case 'upd':
      if(msg.state) gs=msg.state;
      else if(gs) Object.keys(msg).forEach(k=>{if(k!=='type') gs[k]=msg[k];});
      render(); break;
    case 'result': case 'adminResult':
      if(!gs) break;
      if(!gs.results) gs.results=[];
      while(gs.results.length<=msg.round) gs.results.push(null);
      gs.results[msg.round]=msg.result;
      gs.phase=msg.phase;
      if(msg.cumScores) gs.scores=msg.cumScores;
      render(); break;
    case 'announcement':
      if(gs) gs.announce=msg.text; render(); break;
    case 'teamSub':
      if(!gs) break;
      if(!gs.submitted) gs.submitted=[];
      if(!gs.submitted.includes(msg.teamId)) gs.submitted.push(msg.teamId);
      renderFooter(); renderSubmitGrid(); break;
    case 'userEvent':
      if(!gs) break;
      if(!gs.connected) gs.connected=[];
      if(msg.user?.teamId&&!gs.connected.includes(msg.user.teamId)) gs.connected.push(msg.user.teamId);
      renderSubmitGrid(); break;
    case 'reset':
      gs=null; render(); break;
  }
}

function render(){
  if(!gs){
    document.getElementById('l-main').innerHTML=`<div class="phase-screen">
      <div class="ps-ico">🏪</div>
      <div class="ps-ph">FMCG-цепочка</div>
      <div class="ps-rd">Ожидание сервера…</div></div>`;
    return;
  }
  const r=gs.round,phase=gs.phase;
  document.getElementById('l-phase').textContent=G.phaseName[phase]||phase;
  renderDots(r);
  document.getElementById('l-rname').textContent=G.roundNames[r]||'';
  renderTimerDisp(gs.timer);
  renderFooter();
  const M=document.getElementById('l-main');
  if(phase==='lobby'){M.innerHTML=renderLobby();return;}
  if(phase==='roles'){M.innerHTML=renderRoles();return;}
  if(phase==='briefing'){M.innerHTML=renderBriefing(r);return;}
  if(phase==='negotiation'){M.innerHTML=renderNegotiation(r);return;}
  if(phase==='decisions'){M.innerHTML=renderDecisions(r);return;}
  if(phase==='results'){M.innerHTML=renderResults(r);return;}
  if(phase==='final'){M.innerHTML=renderFinal();return;}
}

function renderDots(r){
  document.getElementById('l-dots').innerHTML=[1,2,3,4].map(n=>{
    const cls=n===r+1?'cur':n<=r?'done':'';
    return `<div class="rdot ${cls}">${n}</div>`;
  }).join('');
}

function renderTimerDisp(timer){
  const el=document.getElementById('l-timer');
  if(timerInt){clearInterval(timerInt);timerInt=null;}
  if(!timer||!timer.on||!timer.end){el.textContent='⏱ ——:——';el.className='timer-wrap';return;}
  function tick(){
    const left=timer.end-Date.now();
    if(left<=0){el.textContent='⏱ 00:00';el.className='timer-wrap exp';clearInterval(timerInt);timerInt=null;return;}
    const m=Math.floor(left/60000),s=Math.floor((left%60000)/1000);
    el.textContent=`⏱ ${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
    el.className='timer-wrap'+(left<60000?' exp':left<180000?' low':'');
  }
  tick(); timerInt=setInterval(tick,500);
}

function renderFooter(){
  const sub=(gs?.submitted||[]).length;
  document.getElementById('l-sub').textContent=`${sub}/${G.allTeams.length} подали решения`;
}

function renderSubCells(){
  if(!gs) return '';
  return G.allTeams.map(t=>{
    const conn=(gs.connected||[]).includes(t);
    const sub=(gs.submitted||[]).includes(t);
    const cls=sub?'sub':conn?'conn':'wait';
    const lbl=sub?'✓ Подано':conn?'● Онлайн':'○ Ожидание';
    return `<div class="sub-cell ${cls}">
      <div class="tn">${gs.names?.[t]||t}</div>
      <div class="ts">${lbl}</div></div>`;
  }).join('');
}

function renderSubmitGrid(){
  const sg=document.getElementById('live-subgrid');
  if(!sg) return;
  sg.innerHTML=renderSubCells();
}

// Лента цепочки поставок — наглядно показывает 3 звена и направление потоков (смысл игры)
function renderChainStrip(){
  const node=(ico,t,sub,clr)=>`<div style="flex:1;min-width:0;text-align:center;background:var(--panel);border:1.5px solid ${clr};border-top:4px solid ${clr};border-radius:14px;padding:16px 12px">
    <div style="font-size:36px;line-height:1">${ico}</div>
    <div style="font-size:18px;font-weight:800;color:${clr};margin-top:5px">${t}</div>
    <div style="font-size:12px;color:var(--ink2);margin-top:1px">${sub}</div></div>`;
  const flow=`<div style="flex:0 0 auto;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;padding:0 4px">
    <div style="font-size:13px;font-weight:700;color:var(--sup)">товар →</div>
    <div style="font-size:12px;color:var(--ink3)">← заказы, ₽</div></div>`;
  return `<div style="width:100%;max-width:840px;margin-bottom:16px">
    <div style="font-size:12px;text-transform:uppercase;letter-spacing:.5px;color:var(--ink3);font-weight:600;margin-bottom:8px;text-align:center">Цепочка поставок · товар идёт вниз, заказы и деньги — вверх</div>
    <div style="display:flex;align-items:stretch;gap:6px">
      ${node('🏭','Поставщики','производят · П1–П4','var(--sup)')}
      ${flow}
      ${node('🚛','Дистрибьютор','возит всем · Д','var(--dist)')}
      ${flow}
      ${node('🛒','Магазины','продают · Р1–Р4','var(--ret)')}
    </div></div>`;
}
function renderLobby(){
  return `<div class="phase-screen">
    <div class="ps-ico">🏠</div>
    <div class="ps-ph">Добро пожаловать!</div>
    <div class="ps-rd">Команды подключаются · ${(gs.connected||[]).length} из ${G.allTeams.length} онлайн</div>
    ${renderChainStrip()}
    <div class="sub-section" style="width:100%;max-width:840px">
      <div class="sub-title">Статус команд</div>
      <div class="sub-grid" id="live-subgrid">${renderSubCells()}</div>
    </div>
  </div>`;
}

function renderRoles(){
  const rosters=gs.rosters||{};
  if(!Object.keys(rosters).length) return `<div class="phase-screen">
    <div class="ps-ico">🎲</div><div class="ps-ph">Распределение ролей</div>
    <div class="ps-rd">Ведущий раздаёт роли командам…</div></div>`;
  return `<div style="font-size:19px;font-weight:800;color:var(--ink);margin-bottom:3px">🎲 Роли и характеры команд</div>
    <div style="font-size:12px;color:var(--ink2);margin-bottom:12px">🎩 Директор ведёт переговоры — его характер задаёт позицию команды</div>
    <div class="roster-grid">
    ${G.allTeams.map(t=>{
      const slots=rosters[t]||[];
      const ico=G.type(t)==='ret'?'🛒':G.type(t)==='sup'?'🏭':'🚛';
      return `<div class="roster ${G.type(t)}">
        <div class="roster-hd"><span class="ri">${ico}</span>
          <div><div class="rid">${G.LBL[t]||t}</div><div class="rnm">${gs.names?.[t]||t}</div></div></div>
        ${slots.map(s=>{const ch=G.CHARS[s.char]||{ico:'',clr:'#888'};
          return `<div class="pslot"><span class="pri">${s.role.ico}</span>
            <div><div class="prole ${s.role.lead?'lead':''}">${s.role.title}</div>
            <span class="pchar" style="background:${hexA(ch.clr,.12)};color:${ch.clr}">${ch.ico} ${s.char}</span></div>
          </div>`;}).join('')}
      </div>`;
    }).join('')}
    </div>`;
}

function genHistData(){
  const periods=G.histPeriods||3,trend=G.histTrend||[.05,.03,.08,.04];
  const noise=G.histNoise||.10,base=G.demand[0];
  return Array.from({length:periods},(_,p)=>
    G.catIds.map((_,ci)=>{
      const back=periods-p,n=((Math.sin((p*7+ci*3)*2.718)+1)/2-.5)*noise;
      return Math.round(base[ci]/Math.pow(1+trend[ci],back)*(1+n));
    })
  );
}

function renderHistLive(){
  const hist=genHistData(),periods=hist.length;
  const clr=['#2563eb','#15a34a','#d97706','#dc2626'];
  let h=`<div style="background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:13px 15px;margin-bottom:12px">
    <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:var(--ink3);margin-bottom:10px">
      📈 История рынка · ${periods} периода до игры</div>
    <table style="width:100%;border-collapse:collapse;font-size:12px">
      <tr><th style="text-align:left;padding:4px 8px;color:var(--ink3);font-weight:600">Категория</th>
      ${Array.from({length:periods},(_,i)=>`<th style="text-align:center;padding:4px 8px;color:var(--ink3);font-weight:600">П−${periods-i}</th>`).join('')}
      <th style="text-align:center;padding:4px 8px;color:var(--ink3);font-weight:600">Тренд</th></tr>`;
  G.catIds.forEach((cat,ci)=>{
    const vals=hist.map(row=>row[ci]);
    const pct=Math.round((vals[vals.length-1]/vals[0]-1)*100);
    const arrow=pct>0?`▲ +${pct}%`:(pct<0?`▼ ${pct}%`:'→ 0%');
    const ac=pct>0?'#15a34a':(pct<0?'#dc2626':'var(--ink3)');
    h+=`<tr style="border-top:1px solid var(--line2)">
      <td style="padding:5px 8px;font-weight:700;color:${clr[ci]}">${cat}</td>
      ${vals.map(v=>`<td style="text-align:center;padding:5px 8px;color:var(--ink);font-weight:500">${v}</td>`).join('')}
      <td style="text-align:center;padding:5px 8px;font-weight:700;color:${ac}">${arrow}</td>
    </tr>`;
  });
  return h+`</table></div>`;
}

// Эконом-инфо на проектор (вместо спроса потребителя): мощность · ценовые уровни · промо-буст
function renderEconLive(r){
  const PN=['Агрессивная','Стандарт','Премиальная','Люкс'];
  const rows=G.price.map((p,i)=>`<tr><td style="padding:3px 10px 3px 0">${PN[i]||('Ур.'+(i+1))}</td><td style="padding:3px 14px 3px 0">×${p.pm.toFixed(2)}</td><td>×${p.dm.toFixed(2)}</td></tr>`).join('');
  return `<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:14px">
    <div style="background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:14px 16px">
      <div style="font-size:12px;color:var(--ink3);text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">🚛 Транспортная мощность</div>
      <div style="font-size:30px;font-weight:800;color:${r===2?'var(--bad)':'var(--good)'}">${G.distCap[r]} <span style="font-size:14px;color:var(--ink2)">ед.${r===2?' ⚠️ шок':''}</span></div>
    </div>
    <div style="background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:14px 16px">
      <div style="font-size:12px;color:var(--ink3);text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">🏷️ Ценовые уровни ритейлера</div>
      <table style="font-size:13px;color:var(--ink);border-collapse:collapse"><thead><tr style="color:var(--ink3);text-align:left;font-size:11px"><th style="padding-right:10px">Уровень</th><th style="padding-right:14px">Цена</th><th>Спрос</th></tr></thead><tbody>${rows}</tbody></table>
    </div>
    <div style="background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:14px 16px">
      <div style="font-size:12px;color:var(--ink3);text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">📈 Промо-буст</div>
      <div style="font-size:14px;color:var(--ink);line-height:1.6">Промо ритейлера <b>+</b> скидка поставщика <b>≥${Math.round(G.pThr*100)}%</b> → спрос категории <b style="color:var(--good)">×${G.pBoost}</b></div>
    </div>
  </div>`;
}

function renderBriefing(r){
  const ev=G.events[r];
  let h='';
  if(ev) h+=`<div class="evt${r===2?'':' promo'}"><div class="ico">${r===2?'🚨':'📢'}</div>
    <div><h3>${ev.t}</h3><p>${ev.d}</p></div></div>`;
  if(r===0) h+=renderHistLive();
  // Точный спрос потребителя скрыт до итогов — показываем рыночные условия
  h+=renderEconLive(r);
  h+=`<div class="sub-section">
    <div class="sub-title">Статус подключений</div>
    <div class="sub-grid" id="live-subgrid">${renderSubCells()}</div>
  </div>`;
  return h;
}

function renderNegotiation(r){
  const stage=gs.negStage||'A', wave=gs.negWave||0;
  const cfg=G.negActive(stage, wave);
  const deals=(gs.agreements||[]).filter(a=>a.round===r);
  const struck=(a,b)=>deals.some(d=>(d.from===a&&d.to===b)||(d.from===b&&d.to===a));
  const between=(a,b)=>deals.filter(d=>(d.from===a&&d.to===b)||(d.from===b&&d.to===a));
  const ico=t=>t==='D'?'🚛':G.type(t)==='sup'?'🏭':'🛒';
  const clr=t=>`var(--${G.type(t)})`;
  const node=(t,sz)=>`<div style="text-align:center">
    <div style="font-size:${sz||32}px;line-height:1">${ico(t)}</div>
    <div style="font-size:15px;font-weight:800;color:${clr(t)}">${G.LBL[t]}</div>
    <div style="font-size:11px;color:var(--ink2)">${gs?.names?.[t]||''}</div></div>`;
  let head, body;
  if(stage==='A'){
    head=`Раунд 1 · Волна ${wave+1} из 4 · магазины ↔ поставщики (за 4 волны каждый с каждым)`;
    body=`<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;width:100%;max-width:900px">
      ${cfg.pairs.map(p=>{const done=struck(p.a,p.b), dl=between(p.a,p.b);
        return `<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;background:var(--panel);border:1.5px solid ${done?'var(--good)':'var(--line)'};border-radius:14px;padding:14px 16px">
          ${node(p.a,30)}
          <div style="text-align:center;flex:1;min-width:0">
            <div style="font-size:22px;color:var(--ibs);line-height:1">⇄</div>
            <div style="font-size:12px;color:var(--ink2)">поставка «${p.cat}»</div>
            <div style="font-size:12px;font-weight:700;color:${done?'var(--good)':'var(--warn)'}">${done?'✅ договор':'⏳ идёт'}</div>
            ${dl.length?`<div style="font-size:11px;color:#166534">${dl.map(a=>a.text).join(' · ')}</div>`:''}
          </div>
          ${node(p.b,30)}
        </div>`;}).join('')}
    </div>`;
  } else {
    const mag=cfg.spotlight;
    head=`Раунд 2 · ${G.LBL[mag]} + дистрибьютор и все поставщики · спотлайт ${wave+1} из 4`;
    body=`<div style="display:flex;align-items:center;gap:22px;width:100%;max-width:960px;justify-content:center;flex-wrap:wrap">
      <div style="flex:0 0 190px;background:var(--panel);border:2px solid var(--ret);border-top:5px solid var(--ret);border-radius:16px;padding:18px">${node(mag,46)}</div>
      <div style="font-size:28px;color:var(--ibs)">⇄</div>
      <div style="flex:1;min-width:280px;display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:10px">
        ${cfg.parties.map(t=>{const done=struck(mag,t);
          return `<div style="background:var(--panel);border:1.5px solid ${done?'var(--good)':clr(t)};border-radius:12px;padding:10px 8px;text-align:center">
            ${node(t,26)}
            <div style="font-size:11px;font-weight:700;color:${done?'var(--good)':'var(--warn)'};margin-top:2px">${done?'✅':'⏳'}</div></div>`;}).join('')}
      </div>
    </div>`;
  }
  return `<div style="text-align:center;font-size:19px;font-weight:800;color:var(--ink);margin-bottom:3px">🤝 Переговоры · ${G.roundNames[r]}</div>
    <div style="text-align:center;font-size:13px;color:var(--ink2);margin-bottom:18px">${head}</div>
    <div style="display:flex;justify-content:center">${body}</div>
    <div style="text-align:center;font-size:12px;color:var(--ink3);margin-top:16px">Сделок заключено в этом туре: <b>${deals.length}</b></div>`;
}

function renderDecisions(r){
  return `<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px">
    <div style="flex:1">
      <div style="font-size:20px;font-weight:800;color:var(--ink);margin-bottom:5px">📝 Ввод решений</div>
      <div style="font-size:13px;color:var(--ink2)">Команды вводят заказы, объём производства и тарифы</div>
    </div>
    <div style="font-size:26px;font-weight:800;color:var(--ibs);font-family:monospace">
      ${(gs.submitted||[]).length} / ${G.allTeams.length}
    </div>
  </div>
  <div class="sub-section">
    <div class="sub-title">Статус подачи решений</div>
    <div class="sub-grid" id="live-subgrid">${renderSubCells()}</div>
  </div>
  <div class="chain-kpi">
    <div class="ck"><div class="cl">Дист. мощность</div>
      <div class="cv ${r===2?'bad':'nt'}">${G.distCap[r]}</div></div>
    <div class="ck"><div class="cl">Промо-буст</div>
      <div class="cv nt">≥${Math.round(G.pThr*100)}% → ×${G.pBoost}</div></div>
  </div>`;
}

function renderResults(r){
  const res=gs.results?.[r];
  if(!res) return `<div class="phase-screen">
    <div class="ps-ico">⏳</div>
    <div class="ps-ph">Расчёт…</div></div>`;

  let cDef=0,cOv=0,cWo=0;
  for(let ri=0;ri<3;ri++) for(let ci=0;ci<4;ci++){
    cDef+=res.def?.[ri]?.[ci]||0;
    cOv+=res.over?.[ri]?.[ci]||0;
    cWo+=res.woff?.[ri]?.[ci]||0;
  }
  const totSold=(res.sold||[]).flat().reduce((s,v)=>s+v,0);
  const H=res.health?.H??null;
  const hCls=H==null?'':H>=.75?'':H>=.5?'warn':'crit';
  const hBanner=H==null?'':
    `<div class="health-banner ${hCls}">
      <div style="font-size:28px">❤️</div>
      <div style="flex:1">
        <div style="font-size:12px;color:var(--ink2)">Здоровье цепочки за тур · фонд ${f0(H*250)} млн руб × личный вклад</div>
        <div class="hv ${H>=.75?'ok':H>=.5?'wn':'bad'}">${f0(H*100)}%</div>
      </div>
      <div style="font-size:11px;color:var(--ink2);max-width:260px">
        OSA ${f0((res.health.OSA||0)*100)}% · дефицит-фактор ${f0((res.health.Deficit||0)*100)}% · антихлыст ${f0((res.health.Bullwhip||0)*100)}%
      </div>
    </div>`;

  return hBanner+`<div class="chain-kpi">
    <div class="ck"><div class="cl">Продано ед.</div><div class="cv ok">${f0(totSold)}</div></div>
    <div class="ck"><div class="cl">Дефицит ед.</div><div class="cv ${cDef>20?'bad':'wn'}">${f0(cDef)}</div></div>
    <div class="ck"><div class="cl">Перезапас ед.</div><div class="cv wn">${f0(cOv)}</div></div>
    <div class="ck"><div class="cl">Списания (Fresh)</div><div class="cv ${cWo>5?'bad':'wn'}">${f0(cWo)}</div></div>
    <div class="ck"><div class="cl">Загрузка перевозчика</div><div class="cv ${res.dCoeff>.9?'ok':res.dCoeff>.6?'wn':'bad'}">${f1(res.dCoeff*100)}%</div></div>
  </div>
  <div class="res-grid">
    ${G.retIds.map((rid,ri)=>{
      const osa=res.retOSA?.[ri]||0,pft=res.retProfit?.[ri]||0;
      return `<div class="res-card"><h4>🛒 ${G.LBL[rid]} · ${gs.names?.[rid]||rid}</h4>
        <div class="kpi-row"><span class="kpi-lbl">OSA</span>
          <span class="kpi-val ${osa>=.9?'ok':osa>=.75?'wn':'bad'}">${f1(osa*100)}%</span></div>
        <div class="kpi-row"><span class="kpi-lbl">Прибыль</span>
          <span class="kpi-val ${pft>=0?'ok':'bad'}">${f1(pft)}</span></div>
        ${G.catIds.map((_,ci)=>{
          const d=res.def?.[ri]?.[ci]||0;
          return `<div class="kpi-row">
            <span class="kpi-lbl">${G.catIds[ci]} деф.</span>
            <span class="kpi-val ${d>5?'bad':d>0?'wn':'ok'}" style="font-size:12px">${f1(d)}</span></div>`;
        }).join('')}
      </div>`;
    }).join('')}
    ${G.supIds.map((sid,si)=>{
      const pft=res.supProfit?.[si]||0,fr=res.totDel?.[si]&&res.ordFromSup?.[si]?res.totDel[si]/res.ordFromSup[si]:1;
      return `<div class="res-card"><h4>🏭 ${G.LBL[sid]} · ${gs.names?.[sid]||sid}</h4>
        <div class="kpi-row"><span class="kpi-lbl">Fill-rate</span>
          <span class="kpi-val ${fr>=.9?'ok':fr>=.7?'wn':'bad'}">${f1(fr*100)}%</span></div>
        <div class="kpi-row"><span class="kpi-lbl">Прибыль</span>
          <span class="kpi-val ${pft>=0?'ok':'bad'}">${f1(pft)}</span></div>
        <div class="kpi-row"><span class="kpi-lbl">Остаток</span>
          <span class="kpi-val wn">${f0(res.unsold?.[si]||0)}</span></div>
      </div>`;
    }).join('')}
    <div class="res-card"><h4>🚛 ${G.LBL['D']} · ${gs.names?.['D']||'Перевозчик'}</h4>
      <div class="kpi-row"><span class="kpi-lbl">Тариф</span>
        <span class="kpi-val nt">${f1(res.tariff||1.5)}</span></div>
      <div class="kpi-row"><span class="kpi-lbl">Загрузка</span>
        <span class="kpi-val ${res.dCoeff>.9?'ok':res.dCoeff>.6?'wn':'bad'}">${f1(res.dCoeff*100)}%</span></div>
      <div class="kpi-row"><span class="kpi-lbl">Прибыль</span>
        <span class="kpi-val ${res.dProfit>=0?'ok':'bad'}">${f1(res.dProfit)}</span></div>
    </div>
  </div>`;
}

function renderFinal(){
  const results=(gs.results||[]).filter(r=>r);
  if(!results.length) return `<div class="phase-screen">
    <div class="ps-ico">🏁</div><div class="ps-ph">Финал · нет данных</div></div>`;

  const profit={},contrib={},cv={};
  G.allTeams.forEach(t=>{profit[t]=0;});
  const RET=G.retIds,SUP=G.supIds;
  results.forEach(res=>{
    RET.forEach((_,ri)=>profit[RET[ri]]+=res.retProfit?.[ri]||0);
    SUP.forEach((_,si)=>profit[SUP[si]]+=res.supProfit?.[si]||0);
    profit['D']+=res.dProfit||0;
  });
  G.allTeams.forEach(t=>{
    const ri=RET.indexOf(t),si=SUP.indexOf(t);
    // Архитектор — АВТОРИТЕТНЫЙ серверный вклад в здоровье (res.contrib), не локальная эвристика
    contrib[t]=results.reduce((s,res)=>s+(res.contrib?.[t]||0),0)/results.length;
    // Антихлыст — вариативность объёма по турам (CV).
    // Объём берём из АВТОРИТЕТНОГО серверного res.vol (как и contrib), а не выводим на клиенте.
    const series=results.map(res=>{
      if(res.vol&&res.vol[t]!=null) return res.vol[t];
      // fallback для старых результатов без vol
      if(ri>=0) return (res.def?.[ri]||[]).reduce((s,v)=>s+v,0)+(res.sold?.[ri]||[]).reduce((s,v)=>s+v,0);
      if(si>=0) return res.totDel?.[si]||0;
      return res.totDelivered||0;
    });
    const m=series.reduce((s,v)=>s+v,0)/series.length;
    const vv=series.reduce((s,x)=>s+(x-m)**2,0)/series.length;
    cv[t]=m>0?Math.sqrt(vv)/m:0;
  });
  const scores=gs.scores&&Object.keys(gs.scores).length?gs.scores
    :Object.fromEntries(G.allTeams.map(t=>[t,profit[t]]));

  const grand=G.allTeams.reduce((a,b)=>scores[a]>=scores[b]?a:b);
  const retWin=RET.reduce((a,b)=>profit[a]>profit[b]?a:b);
  const supWin=SUP.reduce((a,b)=>profit[a]>profit[b]?a:b);
  const architect=G.allTeams.reduce((a,b)=>contrib[a]>=contrib[b]?a:b);
  const antiwhip=G.allTeams.reduce((a,b)=>cv[a]<=cv[b]?a:b);
  // C4: приз дистрибьютору — только если его итоговый счёт выше среднего по всем командам
  const avgScore=G.allTeams.reduce((s,t)=>s+(scores[t]||0),0)/G.allTeams.length;
  const distGood=(scores['D']||0)>avgScore;

  const award=(t,ico,tid,sub,clr)=>`<div class="award" style="border-color:${clr}">
    <div class="at" style="color:${clr}">${ico} ${t}</div>
    <div class="an">${G.LBL[tid]} · ${gs.names?.[tid]||tid}</div>
    <div class="as">${sub}</div></div>`;

  const sorted=[...G.allTeams].sort((a,b)=>scores[b]-scores[a]);
  const maxAbs=Math.max(...G.allTeams.map(t=>Math.abs(scores[t])),1);
  const rows=sorted.map((t,i)=>{
    const sc=scores[t],pct=Math.min(100,Math.abs(sc)/maxAbs*100);
    return `<tr>
      <td style="font-weight:700;color:${i===0?'#d97706':'var(--ink3)'};text-align:center">${i+1}</td>
      <td style="font-weight:700;color:var(--ink)">${G.LBL[t]} · ${gs.names?.[t]||t}</td>
      <td><span class="${profit[t]>=0?'ok':'bad'}">${profit[t].toFixed(0)}</span></td>
      <td><div class="score-bar"><div class="sbar"><div class="sbar-f" style="width:${pct}%;background:${sc>=0?'var(--ibs)':'var(--bad)'}"></div></div>
        <span class="sbar-v">${sc>=0?'+':''}${Math.round(sc)}</span></div></td>
    </tr>`;
  }).join('');

  return `<div style="text-align:center;font-size:26px;font-weight:800;color:var(--ink);margin-bottom:10px">🏆 Итоги игры</div>
  <div class="awards-row">
    ${award('Гран-при','🏆',grand,`Счёт ${Math.round(scores[grand])} млн руб`,'#d97706')}
    ${award('Архитектор цепочки','🤝',architect,`Вклад в здоровье ${f0(contrib[architect]*100)}%`,'#15a34a')}
    ${award('Антихлыст','📉',antiwhip,`Стабильность CV ${f1(cv[antiwhip]*100)}%`,'#2563eb')}
  </div>
  <div class="awards-row" style="margin-bottom:14px">
    <div class="winner-card"><div class="wtype">🛒 Лучший ритейлер</div><div class="wname">${gs.names?.[retWin]||retWin}</div></div>
    <div class="winner-card"><div class="wtype">🏭 Лучший поставщик</div><div class="wname">${gs.names?.[supWin]||supWin}</div></div>
    <div class="winner-card"${distGood?'':' style="opacity:.5"'}><div class="wtype">🚛 Лучший дистрибьютор</div><div class="wname">${distGood?(gs.names?.['D']||'Дистрибьютор'):'не заработал · ниже среднего'}</div></div>
  </div>
  <div style="background:var(--panel);border:1px solid var(--line);border-radius:var(--r);padding:13px 15px">
    <div style="font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:var(--ink3);margin-bottom:8px;font-weight:600">Общий рейтинг · Счёт = прибыль + здоровье цепочки</div>
    <table class="score-table"><thead><tr><th>#</th><th>Команда</th><th>Прибыль ∑</th><th>Итоговый счёт</th></tr></thead>
    <tbody>${rows}</tbody></table>
  </div>`;
}

// announce overlay
let annOverlay=null;
function showAnnounce(text){
  if(!text){if(annOverlay){annOverlay.remove();annOverlay=null;}return;}
  if(!annOverlay){
    annOverlay=document.createElement('div');
    annOverlay.style.cssText='position:fixed;bottom:50px;left:50%;transform:translateX(-50%);z-index:100;width:80%;max-width:800px';
    document.body.appendChild(annOverlay);
  }
  annOverlay.innerHTML=`<div class="announce">📢 ${text}</div>`;
}

const origRender=render;
render=function(){
  origRender();
  if(gs?.announce) showAnnounce(gs.announce);
  else showAnnounce(null);
};

const f1=v=>parseFloat(v||0).toFixed(1);
const f0=v=>parseFloat(v||0).toFixed(0);

setInterval(()=>{if(gs?.timer) renderTimerDisp(gs.timer);},1000);