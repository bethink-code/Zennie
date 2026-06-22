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
import {
  listAllPositions,
  listPositions,
  loadAccount,
  loadOpenPositions,
  upsertPosition,
  type PaperAccountRow,
} from "../modules/zenny/persistence/paperTradeStore";
import type { PositionRecord } from "../modules/zenny/execution/types";
import {
  createPosition,
  submitPosition,
} from "../modules/zenny/execution/createPosition";
import { DEFAULT_RISK_CONFIG } from "../modules/zenny/execution/riskConfig";
import { buildManualTradePlan } from "../modules/zenny/decision/wick/buildManualTradePlan";
import type { TradeSide } from "../modules/zenny/decision/types";

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

  // POST /api/zenny/wick-trade — place a MANUAL wick trade. The human chose the
  // wick and the entry/stop/target; we validate the geometry, size it to the
  // account-risk budget, and hand it to the managed execution engine (paper).
  // anchorPoolId records which wick was chosen, so we can later measure whether
  // the picked wicks beat the trade-everything baseline.
  //
  // Auth required (mutates the paper account). v0 is a single global paper
  // account — multi-tenant scoping comes with the wider tenant work.
  app.post(
    "/api/zenny/wick-trade",
    isAuthenticated,
    async (req: Request, res: Response) => {
      try {
        const body = req.body ?? {};
        const symbol = String(body.symbol || "").toUpperCase();
        const timeframe = String(body.timeframe || "") as Timeframe;
        const side = body.side as TradeSide;

        if (!symbol || !timeframe) {
          return res.status(400).json({ error: "missing_symbol_or_timeframe" });
        }
        if (side !== "long" && side !== "short") {
          return res.status(400).json({ error: "invalid_side" });
        }

        const plan = buildManualTradePlan({
          timeframe,
          side,
          entry: Number(body.entry),
          stop: Number(body.stop),
          target: Number(body.target),
          anchorPoolId: body.anchorPoolId ?? null,
          sizeMultiplier:
            body.sizeMultiplier != null
              ? Number(body.sizeMultiplier)
              : undefined,
        });
        if (!plan) {
          return res.status(400).json({ error: "invalid_geometry" });
        }

        const account = await loadAccount();
        if (account.killStatus !== "OK") {
          return res
            .status(409)
            .json({ error: "account_halted", killStatus: account.killStatus });
        }

        const now = Date.now();
        const accountRiskPct =
          body.accountRiskPct != null
            ? Number(body.accountRiskPct)
            : DEFAULT_RISK_CONFIG.accountRiskPct;

        const drafted = createPosition({
          id: `${symbol}-${timeframe}-manual-${now}`,
          symbol,
          plan,
          emittedAtBarTs: now,
          accountRiskPct,
        });
        const live = submitPosition(drafted, account.currentEquity, now);
        if (live.status === "REJECTED") {
          return res
            .status(400)
            .json({ error: "sizing_rejected", reason: live.rejectionReason });
        }

        await upsertPosition(live);
        res.json({ ok: true, position: live });
      } catch (err) {
        res.status(500).json({
          error: "place_failed",
          message: err instanceof Error ? err.message : String(err),
        });
      }
    },
  );
}
