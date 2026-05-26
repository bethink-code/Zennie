// Zenny route module.
// Registers /api/zenny/* endpoints alongside the main routes.ts entry point.
// Per CLAUDE.md, routes are split by domain — this is the Zenny domain.

import type { Express, Request, Response } from "express";
import { isAuthenticated } from "../auth";
import { BinanceProvider } from "../modules/zenny/infrastructure/providers/binanceProvider";
import { DEFAULT_INFRASTRUCTURE_CONFIG } from "../modules/zenny/infrastructure/types";
import { runAnalysis } from "../modules/zenny/analysis/orchestrator";
import { fetchRecentLiquidations } from "../modules/zenny/analysis/data/fetchRecentLiquidations";
import type { PassConfig } from "../modules/zenny/analysis/passes/types";
import type { Timeframe } from "../../shared/zennyTypes";
import { getDefaultBraidCountForTimeframe } from "../../shared/zennyBraidDefaults";
import { runPaperTradeWatchlistTick } from "../modules/zenny/runner/watchlist";
import {
  listAllPositions,
  listPositions,
  loadAccount,
  loadOpenPositions,
  type PaperAccountRow,
} from "../modules/zenny/persistence/paperTradeStore";
import type { PositionRecord } from "../modules/zenny/execution/types";

// Single shared provider per process (Observer pattern — multi-tenant friendly).
// In Phase 6 this becomes per-symbol via createMarketDataService.
let sharedProvider: BinanceProvider | null = null;
function getProvider(): BinanceProvider {
  if (!sharedProvider) {
    sharedProvider = new BinanceProvider(DEFAULT_INFRASTRUCTURE_CONFIG);
  }
  return sharedProvider;
}

// Shared PnL summary so the per-symbol and global endpoints agree. Realised
// PnL comes from closed positions; equity delta comes from the account.
function summarisePnl(positions: PositionRecord[], account: PaperAccountRow) {
  const closed = positions.filter((p) => p.status === "CLOSED");
  const winners = closed.filter((p) => (p.realisedPnl ?? 0) > 0).length;
  const losers = closed.filter((p) => (p.realisedPnl ?? 0) < 0).length;
  const abs = account.currentEquity - account.startingEquity;
  return {
    abs,
    pct: account.startingEquity > 0 ? (abs / account.startingEquity) * 100 : 0,
    closedTrades: closed.length,
    winners,
    losers,
    winRate: closed.length > 0 ? winners / closed.length : null,
  };
}

const VALID_TIMEFRAMES: ReadonlySet<Timeframe> = new Set([
  "15m",
  "1H",
  "4H",
  "12H",
  "D",
  "W",
  "M",
]);

export function registerZennyRoutes(app: Express) {
  // GET /api/zenny/braid-view-model?symbol=BTCUSDT&timeframe=1H&count=300
  // Runs the analysis pipeline and returns the AnalysisState as JSON.
  // Phase 1: Daily-only, no multi-TF confluence, no death detection.
  app.get(
    "/api/zenny/braid-view-model",
    isAuthenticated,
    async (req: Request, res: Response) => {
      try {
        const symbol = String(req.query.symbol || "BTCUSDT").toUpperCase();
        const timeframe = String(req.query.timeframe || "1H") as Timeframe;
        const defaultCount = VALID_TIMEFRAMES.has(timeframe)
          ? getDefaultBraidCountForTimeframe(timeframe)
          : getDefaultBraidCountForTimeframe("1H");
        const count = Math.min(
          1500,
          Math.max(
            50,
            parseInt(String(req.query.count || defaultCount), 10) ||
              defaultCount,
          ),
        );

        if (!VALID_TIMEFRAMES.has(timeframe)) {
          return res.status(400).json({
            error: "invalid_timeframe",
            allowed: Array.from(VALID_TIMEFRAMES),
          });
        }

        // passConfig is optional, JSON-encoded in the query string. Frontend
        // builds the config object and stringifies it. Absent or invalid
        // → orchestrator falls back to DEFAULT_PASS_CONFIG.
        let passConfig: PassConfig | undefined;
        if (typeof req.query.passConfig === "string") {
          try {
            passConfig = JSON.parse(req.query.passConfig) as PassConfig;
          } catch {
            // Silently fall back to default; bad config shouldn't 500.
          }
        }

        const provider = getProvider();
        // Fetch recent liquidations alongside analysis so the regime
        // layer's liquidationProximity input can light up. Failure here
        // shouldn't fail the whole analysis — the regime input will just
        // mark itself unavailable if events don't show up.
        let liquidations: Array<{ price: number; usdValue: number }> = [];
        try {
          liquidations = await fetchRecentLiquidations({ symbol });
        } catch (err) {
          console.error("[zenny] fetchRecentLiquidations failed", err);
        }
        const state = await runAnalysis({
          provider,
          symbol,
          primaryTimeframe: timeframe,
          candleCountPerTf: count,
          passConfig,
          liquidations,
        });

        // Attach paper-trading state for the chart overlay. Failure here is
        // non-fatal — the chart still renders, just without trade markers.
        let paperPositions: Awaited<ReturnType<typeof listPositions>> = [];
        let paperOpenPositions: Awaited<
          ReturnType<typeof loadOpenPositions>
        > = [];
        try {
          [paperPositions, paperOpenPositions] = await Promise.all([
            listPositions(symbol, timeframe, 200),
            loadOpenPositions(symbol, timeframe),
          ]);
        } catch (err) {
          console.error("[zenny] paper positions fetch failed", err);
        }

        res.json({
          ...state,
          paperPositions,
          paperOpenPositions,
        });
      } catch (err) {
        console.error("[zenny] braid-view-model failed", err);
        res.status(500).json({
          error: "analysis_failed",
          message: err instanceof Error ? err.message : String(err),
        });
      }
    },
  );

  // GET /api/zenny/health — quick connectivity check for the infrastructure layer
  app.get(
    "/api/zenny/health",
    isAuthenticated,
    async (_req: Request, res: Response) => {
      const provider = getProvider();
      res.json({
        ok: true,
        provider: provider.name,
        rateLimiter: provider.getRateLimiterState(),
        breaker: provider.getBreakerState(),
        recentApiCalls: provider.getApiCallLog().slice(-20),
      });
    },
  );

  // POST /api/zenny/dev/paper-trade-tick — local/dev helper to advance the
  // runner from the authenticated UI. This keeps localhost testing honest
  // without exposing a manual trigger in production.
  app.post(
    "/api/zenny/dev/paper-trade-tick",
    isAuthenticated,
    async (_req: Request, res: Response) => {
      if (process.env.NODE_ENV === "production") {
        return res.status(404).json({ error: "not_found" });
      }
      try {
        const provider = getProvider();
        const results = await runPaperTradeWatchlistTick(provider);
        res.json({ ok: true, tickedAt: Date.now(), results });
      } catch (err) {
        console.error("[zenny] dev paper-trade-tick failed", err);
        res.status(500).json({
          error: "tick_failed",
          message: err instanceof Error ? err.message : String(err),
        });
      }
    },
  );

  // POST /api/zenny/paper-trade-tick — Vercel Cron entrypoint.
  //
  // Auth: Bearer ${process.env.CRON_SECRET}. On Vercel Pro native crons, the
  // platform auto-injects this header using the same env var the handler reads,
  // so they always match by construction (no sync drift like the GitHub Actions
  // workaround had).
  //
  // Idempotent: hitting it twice in the same 15m bar is safe (lookahead guard
  // in reduceStep skips already-evaluated bars).
  app.post(
    "/api/zenny/paper-trade-tick",
    async (req: Request, res: Response) => {
      const auth = req.headers.authorization ?? "";
      const expected = process.env.CRON_SECRET;
      if (!expected) {
        return res.status(503).json({
          error: "cron_secret_not_configured",
          hint: "Set CRON_SECRET in Vercel env vars.",
        });
      }
      if (auth !== `Bearer ${expected}`) {
        return res.status(401).json({ error: "unauthorized" });
      }
      try {
        const provider = getProvider();
        const results = await runPaperTradeWatchlistTick(provider);
        res.json({ ok: true, tickedAt: Date.now(), results });
      } catch (err) {
        console.error("[zenny] paper-trade-tick failed", err);
        res.status(500).json({
          error: "tick_failed",
          message: err instanceof Error ? err.message : String(err),
        });
      }
    },
  );

  // GET /api/zenny/paper-trades — list paper-trading positions for review.
  // No auth in v0 — read-only, no PII; tighten when adding multi-tenant.
  app.get(
    "/api/zenny/paper-trades",
    async (req: Request, res: Response) => {
      try {
        const symbol = String(req.query.symbol || "BTCUSDT").toUpperCase();
        const timeframe = String(req.query.timeframe || "1H") as Timeframe;
        const limit = Math.min(
          500,
          Math.max(1, parseInt(String(req.query.limit || "100"), 10) || 100),
        );
        const [positions, account] = await Promise.all([
          listPositions(symbol, timeframe, limit),
          loadAccount(),
        ]);
        res.json({
          symbol,
          timeframe,
          account,
          pnl: summarisePnl(positions, account),
          positions,
        });
      } catch (err) {
        res.status(500).json({
          error: "fetch_failed",
          message: err instanceof Error ? err.message : String(err),
        });
      }
    },
  );

  // GET /api/zenny/paper-trades/all — global view across every symbol/timeframe.
  // Powers the P&L summary page. No auth in v0 — read-only, no PII.
  app.get(
    "/api/zenny/paper-trades/all",
    async (_req: Request, res: Response) => {
      try {
        const [positions, account] = await Promise.all([
          listAllPositions(1000),
          loadAccount(),
        ]);
        const open = positions
          .filter((p) => ["PLANNED", "LIVE", "FILLED"].includes(p.status))
          .sort((a, b) => a.symbol.localeCompare(b.symbol));
        const closed = positions
          .filter((p) => p.status === "CLOSED")
          .sort((a, b) => (b.closedAtBarTs ?? 0) - (a.closedAtBarTs ?? 0));
        res.json({
          account,
          pnl: summarisePnl(positions, account),
          open,
          closed,
          computedAtMs: Date.now(),
        });
      } catch (err) {
        res.status(500).json({
          error: "fetch_failed",
          message: err instanceof Error ? err.message : String(err),
        });
      }
    },
  );
}
