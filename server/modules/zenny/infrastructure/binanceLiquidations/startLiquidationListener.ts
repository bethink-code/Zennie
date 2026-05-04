// Long-lived WebSocket listener on Binance Futures forceOrder stream.
// Connects to wss://fstream.binance.com/ws/!forceOrder@arr (all symbols),
// filters to the 14 tracked coins, persists each event. Auto-reconnects
// with exponential backoff on close/error. Uses Node's built-in WebSocket
// (Node 22+).

import { parseForceOrderEvent } from "./parseForceOrderEvent";
import { persistLiquidationEvent } from "./persistLiquidationEvent";

const STREAM_URL = "wss://fstream.binance.com/ws/!forceOrder@arr";

const TRACKED_SYMBOLS = new Set([
  "BTCUSDT", "ETHUSDT", "SOLUSDT", "XRPUSDT", "BNBUSDT", "SUIUSDT",
  "CRVUSDT", "HBARUSDT", "PENDLEUSDT", "ONDOUSDT", "VETUSDT", "FETUSDT",
  "RSRUSDT", "RENDERUSDT",
]);

const MIN_BACKOFF_MS = 1_000;
const MAX_BACKOFF_MS = 60_000;

export function startLiquidationListener(): void {
  let backoff = MIN_BACKOFF_MS;
  let openedAt = 0;
  let eventCount = 0;
  let lastLogAt = 0;

  const connect = () => {
    const ws = new WebSocket(STREAM_URL);

    ws.addEventListener("open", () => {
      openedAt = Date.now();
      backoff = MIN_BACKOFF_MS;
      console.log("[binance-liquidations] connected");
    });

    ws.addEventListener("message", async (evt) => {
      let payload: unknown;
      try {
        payload = JSON.parse(typeof evt.data === "string" ? evt.data : String(evt.data));
      } catch {
        return;
      }
      const parsed = parseForceOrderEvent(payload, TRACKED_SYMBOLS);
      if (!parsed) return;
      try {
        await persistLiquidationEvent(parsed);
        eventCount++;
        const now = Date.now();
        if (now - lastLogAt > 60_000) {
          lastLogAt = now;
          console.log(`[binance-liquidations] persisted ${eventCount} events since open`);
        }
      } catch (e: any) {
        console.error("[binance-liquidations] persist failed:", e.message);
      }
    });

    ws.addEventListener("close", () => {
      const lifetime = Date.now() - openedAt;
      console.warn(`[binance-liquidations] closed after ${lifetime}ms; reconnecting in ${backoff}ms`);
      setTimeout(connect, backoff);
      backoff = Math.min(backoff * 2, MAX_BACKOFF_MS);
    });

    ws.addEventListener("error", (e: any) => {
      console.error("[binance-liquidations] ws error:", e?.message ?? "unknown");
      // close handler will fire next and trigger reconnect
    });
  };

  connect();
}
