// ==UserScript==
// @name         Zenny Hyblock Harvest
// @namespace    http://localhost
// @version      0.2
// @description  Harvest decoded liquidation data from Hyblock's Redux store and POST to Phoenix
// @match        https://hyblockcapital.com/*
// @match        https://*.hyblockcapital.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_registerMenuCommand
// @grant        unsafeWindow
// @connect      localhost
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  const INGEST_URL = 'http://localhost:5000/api/hyblock/ingest';

  function findReduxStore() {
    // Walk from any React-managed element up the fiber tree to find the Provider with store
    const el = document.querySelector('[class*="react-grid-layout"]') || document.querySelector('#__next');
    if (!el) return null;
    const fiberKey = Object.keys(el).find(k => k.startsWith('__reactFiber'));
    if (!fiberKey) return null;
    let fiber = el[fiberKey];
    let steps = 0;
    while (fiber && steps < 200) {
      if (fiber.memoizedProps?.store?.getState) return fiber.memoizedProps.store;
      if (fiber.stateNode?.store?.getState) return fiber.stateNode.store;
      fiber = fiber.return;
      steps++;
    }
    return null;
  }

  function extractEntries(store) {
    const state = store.getState();
    const queries = state.liquidationHeatmapApi?.queries;
    if (!queries) return [];

    const entries = [];
    for (const qk of Object.keys(queries)) {
      const e = queries[qk];
      if (e.status !== 'fulfilled') continue;

      const originalArgs = e.originalArgs;
      // Navigate the nested data envelope: e.data.data.data.data[0]
      const outer = e.data?.data?.data;
      if (!outer) continue;

      const arr = outer.data;
      // arr could be Array(1) or a plain object depending on cache state
      const inner = Array.isArray(arr) ? arr[0] : arr;
      if (!inner || !inner.x || inner.x.length === 0) continue;

      entries.push({
        originalArgs,
        inner: {
          open: inner.open,
          high: inner.high,
          low: inner.low,
          close: inner.close,
          buyVolume: inner.buyVolume,
          sellVolume: inner.sellVolume,
          x: inner.x,
          exchange: inner.exchange,
          ll: inner.ll,
          sl: inner.sl,
        },
        bucketList: outer.bucketList,
        ohlcExchange: outer.ohlcExchange,
      });
    }
    return entries;
  }

  function harvest() {
    console.log('%c[Zenny Harvest] starting...', 'color:#7f77dd;font-weight:bold');

    const store = findReduxStore();
    if (!store) {
      console.error('[Zenny Harvest] Redux store not found. Make sure a chart is loaded.');
      alert('Zenny Harvest: Redux store not found. Load a heatmap first.');
      return;
    }

    const entries = extractEntries(store);
    if (entries.length === 0) {
      console.warn('[Zenny Harvest] No cached query entries found in Redux.');
      alert('Zenny Harvest: No data in cache. Browse some coins first.');
      return;
    }

    console.log(`%c[Zenny Harvest] found ${entries.length} cached queries, sending to Phoenix...`, 'color:#7f77dd');
    entries.forEach((e, i) => {
      console.log(`  [${i}] ${e.originalArgs.coin} / ${e.originalArgs.lookback} — ${e.inner.x.length} bars`);
    });

    GM_xmlhttpRequest({
      method: 'POST',
      url: INGEST_URL,
      headers: { 'Content-Type': 'application/json' },
      data: JSON.stringify({ entries }),
      onload: function (response) {
        try {
          const result = JSON.parse(response.responseText);
          console.log('%c[Zenny Harvest] response:', 'color:#0f6e56;font-weight:bold', result);
          if (result.success) {
            const lines = ['Zenny Harvest complete!\n'];
            if (result.inserted && result.inserted.length > 0) {
              lines.push('NEW:');
              result.inserted.forEach(c => lines.push('  + ' + c));
            }
            if (result.skipped && result.skipped.length > 0) {
              lines.push('\nALREADY CAPTURED:');
              result.skipped.forEach(c => lines.push('  - ' + c));
            }
            lines.push(`\nTotals: ${result.ohlcInserted} OHLC bars, ${result.liqInserted} liq levels`);
            alert(lines.join('\n'));
          } else {
            alert('Zenny Harvest: server error — ' + (result.error || 'unknown'));
          }
        } catch (e) {
          console.error('[Zenny Harvest] parse error:', e, response.responseText);
          alert('Zenny Harvest: failed to parse response');
        }
      },
      onerror: function (err) {
        console.error('[Zenny Harvest] network error:', err);
        alert('Zenny Harvest: network error. Is Phoenix running on localhost:5000?');
      },
    });
  }

  // Register Tampermonkey menu command — appears when you click the TM icon
  GM_registerMenuCommand('Harvest Hyblock Data', harvest);

  // Also expose on window for console access
  unsafeWindow.__zennyHarvest = harvest;

  console.log('%c[Zenny Harvest] ready — click Tampermonkey icon → "Harvest Hyblock Data", or run __zennyHarvest() in console', 'color:#0f6e56;font-weight:bold');
})();
