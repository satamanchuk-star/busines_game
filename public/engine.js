// ═══════════════════════════════════════════════════════════════════════════
//  ДВИЖОК РАСЧЁТА — единственный авторитетный источник логики тура.
//  UMD: в Node — module.exports (require в server.js и тестах),
//       в браузере — глобальный GAME_ENGINE (<script> в sim.html).
//  Данные/константы берёт из gameconfig.js — НЕ дублировать здесь.
//
//  Раньше эта логика существовала в 3 копиях (server.js, sim.html, engine.test.js)
//  и синхронизировалась руками — отсюда риск расхождений. Теперь копия одна.
// ═══════════════════════════════════════════════════════════════════════════
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory(require('./gameconfig.js'));
  } else {
    root.GAME_ENGINE = factory(root.GAME_CONFIG);
  }
})(typeof self !== 'undefined' ? self : this, function (P) {
  'use strict';
  const RETS = P.retIds, SUPS = P.supIds;

  const clamp01 = v => Math.max(0, Math.min(1, v));
  // Клэмп входов: отрицательные/запредельные значения ломают расчёт всего тура
  const cln = (v, lo, hi) => { v = +v; if (!Number.isFinite(v)) v = 0; return Math.max(lo, Math.min(hi, v)); };

  function sanitizeDec(r, d) {
    const caps = P.maxProd.map((m, si) => (r === 2 && si === 3) ? P.s4Shock : m); // Тур 3: квота П4
    return {
      tariff:  cln(d.tariff, 0, P.maxTariff),
      distCap: cln(d.distCap, 50, P.distCap[r]),  // Тур 3: cap=200 (шок логистики)
      sups:    SUPS.map((_, si) => cln(d.sups?.[si], 0, caps[si])),
      rets:    RETS.map((_, ri) => SUPS.map((_, ci) => {
        const x = d.rets?.[ri]?.[ci] || {};
        return { asm: x.asm ? 1 : 0, ord: cln(x.ord, 0, P.maxOrd),
                 prc: [0, 1, 2, 3].includes(+x.prc) ? +x.prc : 1,
                 prm: x.prm ? 1 : 0, dsc: cln(x.dsc, 0, P.maxDsc) };
      })),
      caps,
    };
  }

  // opts.sanitize === false — режим «песочницы» (лаборатория sim.html): вход берётся как есть,
  // без игровых капов (свой шок/спрос/мощность), caps = maxProd. Сервер вызывает БЕЗ опции →
  // по умолчанию sanitize:true (полные клэмпы distCap[r]/s4Shock — авторитетная игра).
  function calcRound(r, dRaw, opts) {
    const d = (opts && opts.sanitize === false)
      ? { tariff: dRaw.tariff, distCap: dRaw.distCap, sups: dRaw.sups, rets: dRaw.rets, caps: P.maxProd }
      : sanitizeDec(r, dRaw);
    const { tariff, distCap, sups, rets, caps } = d;
    const prod  = SUPS.map((_, si) => Math.min(sups[si] || 0, caps[si]));
    const oFS   = SUPS.map((_, si) => RETS.reduce((s, _, ri) => s + (rets[ri]?.[si]?.ord || 0), 0));
    const avail = prod.slice();
    const sC    = SUPS.map((_, si) => oFS[si] > 0 ? Math.min(1, avail[si] / oFS[si]) : 1);
    const aS    = RETS.map((_, ri) => SUPS.map((_, ci) => (rets[ri]?.[ci]?.ord || 0) * sC[ci]));
    const totAS = aS.reduce((s, row) => s + row.reduce((a, v) => a + v, 0), 0);
    const dC    = totAS > 0 ? Math.min(1, distCap / totAS) : 1;
    const del   = aS.map(row => row.map(v => v * dC));
    const aD    = RETS.map((_, ri) => SUPS.map((_, ci) => {
      const x = rets[ri]?.[ci]; if (!x?.asm) return 0;
      let v = P.demand[r][ci] * P.fShare[ci][ri] * P.price[x.prc ?? 1].dm;
      if (x.prm && (x.dsc || 0) >= P.pThr) v *= P.pBoost; return v;
    }));
    // Перенос запасов (только ритейлеры, только нескоропорт): стартовый запас с прошлого тура.
    // opts.inv[ri][ci] — остаток, перенесённый из прошлого тура; по умолчанию нули (Тур 1 / песочница).
    const inv = (opts && opts.inv) || RETS.map(() => SUPS.map(() => 0));
    const sold = [], def = [], over = [], woff = [], osa = [], newInv = [];
    RETS.forEach((_, ri) => { sold.push([]); def.push([]); over.push([]); woff.push([]); osa.push([]); newInv.push([]);
      SUPS.forEach((_, ci) => {
        const startInv = P.fresh[ci] ? 0 : (inv[ri]?.[ci] || 0);   // скоропорт не переносится
        const avail = startInv + del[ri][ci];                       // доступно к продаже = запас + поставка
        const s = Math.min(avail, aD[ri][ci]);
        const leftover = Math.max(0, avail - aD[ri][ci]);
        sold[ri].push(s); def[ri].push(Math.max(0, aD[ri][ci] - avail));
        over[ri].push(leftover); woff[ri].push(P.fresh[ci] ? leftover : 0);
        newInv[ri].push(P.fresh[ci] ? 0 : leftover);                // нескоропорт переносится в след. тур
        osa[ri].push(aD[ri][ci] > 0 ? s / aD[ri][ci] : 1);
      });
    });
    // Ритейлер платит за НОВЫЕ поставки (закупка + тариф); выручка — с проданного (м.б. из запаса).
    // Нескоропорт-остаток физически переносится (хранение −hCost/ед), его ценность реализуется
    // при продаже в следующем туре. Скоропорт-остаток списывается (woff). Salvage-кредит убран.
    const retProfit = RETS.map((_, ri) => { let p = 0;
      SUPS.forEach((_, ci) => { const x = rets[ri][ci]; if (!x.asm) return;
        const opt = P.opt[ci] * (1 - x.dsc), rosn = P.rosn[ci] * P.price[x.prc].pm;
        const hold = P.fresh[ci] ? 0 : over[ri][ci] * P.hCost;
        p += rosn * sold[ri][ci] - (opt + tariff) * del[ri][ci] - hold; }); return p; });
    const tD = SUPS.map((_, si) => RETS.reduce((s, _, ri) => s + del[ri][si], 0));
    const supProfit = SUPS.map((_, si) => { let rev = 0;
      RETS.forEach((_, ri) => { const opt = P.opt[si] * (1 - ((rets[ri]?.[si]?.dsc) || 0)); rev += opt * del[ri][si]; });
      return rev - prod[si] * P.cost[si]; });
    const totDel = del.reduce((s, row) => s + row.reduce((a, v) => a + v, 0), 0);
    const retOSA = RETS.map((_, ri) => { const td = aD[ri].reduce((s, v) => s + v, 0);
      return td > 0 ? aD[ri].reduce((a, v, ci) => a + sold[ri][ci], 0) / td : 1; });
    return { r, tariff, distCap, dCoeff: dC, totDelivered: totDel, totAS, d, prod, avail, ordFromSup: oFS, supC: sC,
             del, actDem: aD, sold, def, over, woff, osa, newInv, retProfit, supProfit, dProfit: (tariff - P.tCost) * totDel,
             retOSA, totDel: tD, unsold: SUPS.map((_, si) => Math.max(0, avail[si] - tD[si])) };
  }

  function chainHealth(res) {
    const OSA      = res.retOSA.reduce((s, v) => s + v, 0) / RETS.length;
    const totalDef = res.def.flat().reduce((s, v) => s + v, 0);
    const totalWoff = res.woff.flat().reduce((s, v) => s + v, 0);
    const totalOrd = RETS.reduce((s, _, ri) => s + SUPS.reduce((a, _, ci) => a + (res.d.rets[ri]?.[ci]?.ord || 0), 0), 0);
    // Хлыст сравниваем с ФАКТИЧЕСКИМ спросом (цена/промо меняют его легально)
    const totalDem = res.actDem.flat().reduce((s, v) => s + v, 0);
    const amp      = totalOrd / Math.max(totalDem, 1);
    const Deficit  = 1 - clamp01(totalDef / 150);
    const Bullwhip = 1 - clamp01((amp - 1) / 1.5);
    const Waste    = 1 - clamp01(totalWoff / 30);
    const H = clamp01(0.35 * OSA + 0.25 * Deficit + 0.25 * Bullwhip + 0.15 * Waste);
    return { H, OSA, Deficit, Bullwhip, Waste, totalDef, totalWoff };
  }

  // Личный вклад команды в здоровье [0..1] — масштабирует бонус.
  // Бездействие (пустой ассортимент / нет заказов / нечего везти) = 0, без бонуса за пассивность.
  function contribOf(res, tid) {
    const ri = RETS.indexOf(tid), si = SUPS.indexOf(tid);
    if (ri >= 0) { const td = (res.actDem[ri] || []).reduce((s, v) => s + v, 0); return td > 0 ? clamp01(res.retOSA[ri]) : 0; }
    if (si >= 0) return (res.ordFromSup[si] || 0) > 0 ? clamp01(res.supC[si]) : 0;
    return (res.totAS || 0) > 0 ? clamp01(res.dCoeff) : 0;
  }

  function roundProfit(res, tid) {
    const ri = RETS.indexOf(tid), si = SUPS.indexOf(tid);
    if (ri >= 0) return res.retProfit[ri];
    if (si >= 0) return res.supProfit[si];
    return res.dProfit;
  }

  // Каноничное «своё прохождение» команды за тур — основа награды «Антихлыст»
  // (минимальная вариативность объёма по турам). Считается на сервере, чтобы
  // награда не зависела от клиентской эвристики (см. contribOf — тот же принцип).
  //   Ритейлер     — спрос, фактически пришедший на полку (продано + дефицит)
  //   Поставщик    — отгружено (totDel)
  //   Дистрибьютор — перевезено (totDelivered)
  function volOf(res, tid) {
    const ri = RETS.indexOf(tid), si = SUPS.indexOf(tid);
    if (ri >= 0) {
      const sold = (res.sold[ri] || []).reduce((s, v) => s + v, 0);
      const def  = (res.def[ri]  || []).reduce((s, v) => s + v, 0);
      return sold + def;
    }
    if (si >= 0) return res.totDel[si] || 0;
    return res.totDelivered || 0;
  }

  return { RETS, SUPS, clamp01, cln, sanitizeDec, calcRound, chainHealth, contribOf, roundProfit, volOf };
});
