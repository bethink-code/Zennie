// Schedule the Binance continuity fetch — once on boot (after a short
// delay so the server is fully up) and every 24h thereafter. Errors are
// logged; the next tick will retry naturally.

import { runContinuityFetch } from "./runContinuityFetch";

const BOOT_DELAY_MS = 60_000;
const INTERVAL_MS = 24 * 60 * 60 * 1000;

export function startContinuityScheduler(): void {
  const tick = async () => {
    try {
      const r = await runContinuityFetch();
      console.log(
        `[binance-continuity] inserted oi=${r.inserted.oi} funding=${r.inserted.funding} ls=${r.inserted.ls} errors=${r.errors.length} duration=${r.finishedAt.getTime() - r.startedAt.getTime()}ms`,
      );
      if (r.errors.length > 0) {
        console.warn("[binance-continuity] sample errors:", r.errors.slice(0, 3));
      }
    } catch (e: any) {
      console.error("[binance-continuity] tick failed:", e.message);
    }
  };

  setTimeout(() => {
    tick();
    setInterval(tick, INTERVAL_MS);
  }, BOOT_DELAY_MS);
}
