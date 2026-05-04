// Hyblock route module.
// Registers /api/hyblock/* endpoints for ingesting data harvested from
// Hyblock Capital's Redux store via the Tampermonkey userscript.
// No auth required — local dev only. These routes accept localhost POSTs
// from the userscript's GM_xmlhttpRequest.

import type { Express, Request, Response } from "express";
import { db } from "../db";
import { hyblockCaptures, hyblockOhlc, hyblockLiqLevels } from "../../shared/schema";
import { eq, and, gte, lte } from "drizzle-orm";

interface HarvestEntry {
  originalArgs: {
    exchange: string;
    coin: string;
    lookback: string;
    startDate: number;
    endDate: number;
  };
  inner: {
    open: number[];
    high: number[];
    low: number[];
    close: number[];
    buyVolume: number[];
    sellVolume: number[];
    x: string[];
    exchange: string;
    ll: number[][];
    sl: number[][];
  };
  bucketList: number[];
  ohlcExchange: string;
}

export function registerHyblockRoutes(app: Express) {
  app.post("/api/hyblock/ingest", async (req: Request, res: Response) => {
    try {
      const entries: HarvestEntry[] = req.body.entries;
      if (!Array.isArray(entries) || entries.length === 0) {
        return res.status(400).json({ error: "No entries provided" });
      }

      let capturesInserted = 0;
      let ohlcInserted = 0;
      let liqInserted = 0;
      const inserted: string[] = [];
      const skipped: string[] = [];

      for (const entry of entries) {
        const { originalArgs, inner, bucketList } = entry;
        if (!originalArgs || !inner || !inner.x || inner.x.length === 0) continue;

        const barCount = inner.x.length;
        const label = `${originalArgs.coin.toUpperCase()} / ${originalArgs.lookback} (${barCount} bars)`;

        // Check if we already have this exact capture (dedup by coin + lookback + startDate)
        const existing = await db
          .select({ id: hyblockCaptures.id })
          .from(hyblockCaptures)
          .where(
            and(
              eq(hyblockCaptures.coin, originalArgs.coin),
              eq(hyblockCaptures.lookback, originalArgs.lookback),
              eq(hyblockCaptures.startDate, new Date(originalArgs.startDate * 1000)),
            ),
          )
          .limit(1);

        if (existing.length > 0) { skipped.push(label); continue; }

        // Insert capture record with raw payload
        const [capture] = await db
          .insert(hyblockCaptures)
          .values({
            exchange: originalArgs.exchange,
            coin: originalArgs.coin,
            lookback: originalArgs.lookback,
            startDate: new Date(originalArgs.startDate * 1000),
            endDate: new Date(originalArgs.endDate * 1000),
            barCount,
            payload: { originalArgs, bucketList, barCount },
          })
          .returning({ id: hyblockCaptures.id });

        capturesInserted++;
        inserted.push(label);

        // Normalize OHLC bars
        const ohlcRows = inner.x.map((ts, i) => ({
          captureId: capture.id,
          exchange: originalArgs.exchange,
          coin: originalArgs.coin,
          barTime: new Date(ts),
          open: String(inner.open[i]),
          high: String(inner.high[i]),
          low: String(inner.low[i]),
          close: String(inner.close[i]),
          buyVolume: String(inner.buyVolume[i]),
          sellVolume: String(inner.sellVolume[i]),
        }));

        // Batch insert in chunks of 200
        for (let i = 0; i < ohlcRows.length; i += 200) {
          const chunk = ohlcRows.slice(i, i + 200);
          await db.insert(hyblockOhlc).values(chunk);
          ohlcInserted += chunk.length;
        }

        // Normalize liq levels (ll = long, sl = short, 5 tiers each)
        const liqRows: Array<{
          captureId: string;
          exchange: string;
          coin: string;
          barTime: Date;
          side: "long" | "short";
          tier: number;
          price: string;
        }> = [];

        for (let i = 0; i < inner.x.length; i++) {
          const barTime = new Date(inner.x[i]);
          if (inner.ll[i]) {
            for (let t = 0; t < inner.ll[i].length; t++) {
              liqRows.push({
                captureId: capture.id,
                exchange: originalArgs.exchange,
                coin: originalArgs.coin,
                barTime,
                side: "long",
                tier: t,
                price: String(inner.ll[i][t]),
              });
            }
          }
          if (inner.sl[i]) {
            for (let t = 0; t < inner.sl[i].length; t++) {
              liqRows.push({
                captureId: capture.id,
                exchange: originalArgs.exchange,
                coin: originalArgs.coin,
                barTime,
                side: "short",
                tier: t,
                price: String(inner.sl[i][t]),
              });
            }
          }
        }

        for (let i = 0; i < liqRows.length; i += 200) {
          const chunk = liqRows.slice(i, i + 200);
          await db.insert(hyblockLiqLevels).values(chunk);
          liqInserted += chunk.length;
        }
      }

      return res.json({
        success: true,
        capturesInserted,
        ohlcInserted,
        liqInserted,
        inserted,
        skipped,
      });
    } catch (error: any) {
      console.error("[hyblock/ingest] error:", error);
      return res.status(500).json({ error: error.message });
    }
  });

  // Historical liq levels for a symbol within a time range — used by the
  // expand overlay on the Order Flow column.
  app.get("/api/hyblock/liq-levels", async (req: Request, res: Response) => {
    try {
      const coin = (req.query.coin as string || "").toLowerCase();
      const startTime = Number(req.query.startTime) || 0;
      const endTime = Number(req.query.endTime) || Date.now();

      if (!coin) return res.status(400).json({ error: "coin required" });

      const rows = await db
        .select({
          barTime: hyblockLiqLevels.barTime,
          side: hyblockLiqLevels.side,
          tier: hyblockLiqLevels.tier,
          price: hyblockLiqLevels.price,
        })
        .from(hyblockLiqLevels)
        .where(
          and(
            eq(hyblockLiqLevels.coin, coin),
            gte(hyblockLiqLevels.barTime, new Date(startTime)),
            lte(hyblockLiqLevels.barTime, new Date(endTime)),
          ),
        )
        .orderBy(hyblockLiqLevels.barTime);

      const levels = rows.map((r) => ({
        barTime: r.barTime.getTime(),
        side: r.side,
        tier: r.tier,
        price: Number(r.price),
      }));

      return res.json({ success: true, levels, count: levels.length });
    } catch (error: any) {
      return res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/hyblock/status", async (_req: Request, res: Response) => {
    try {
      const captures = await db.select().from(hyblockCaptures);
      const summary = captures.map((c) => ({
        coin: c.coin,
        exchange: c.exchange,
        lookback: c.lookback,
        barCount: c.barCount,
        capturedAt: c.capturedAt,
      }));
      return res.json({ success: true, captures: summary, total: summary.length });
    } catch (error: any) {
      return res.status(500).json({ error: error.message });
    }
  });
}
