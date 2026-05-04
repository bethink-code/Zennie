# Zenny Braid Session Notes - 2026-05-01

## Goal

Harden the Zenny Braid liquidity-pool analysis and clean up the Braid UI so reset/default behavior is useful after experimentation.

## Technical Analysis Changes

- Changed pivot detection from body-extreme identification to wick-extreme identification with body-anchored level prices.
  - Swing highs/lows are now identified by candle `high`/`low`.
  - The rendered/support-resistance level price remains body anchored:
    - resistance: `max(open, close)`
    - support: `min(open, close)`
  - The wick extreme is still carried for pool/probe logic.
- Updated last-leg ZigZag logic to use wick highs/lows for structural swing detection.
- Updated pool formation so `formPool` can receive the pivot wick extreme, and `orchestrator` passes `pivot.wickPrice`.
- Adjusted touch counting so immediate post-pivot consolidation is not counted as a fresh retest.
- Hardened `findBodyClusters.ts`.
  - It is no longer a simple non-overlapping sorted-window clusterer.
  - It now uses bounded-density window selection plus non-overlap pruning.
  - This is still a heuristic, not full institutional density clustering, but it is materially stronger.
- Split liquidity-pool state from structural level breakage.
  - `active`: later price has not taken the wick-side pool extreme.
  - `swept`: a later wick has taken the pool extreme, but no candle has closed past the body line.
  - `dead`: a later candle has closed past the body line, so the structural level is broken.
  - This preserves the distinction between stop/liquidity consumption and confirmed support/resistance failure.
- Added a dedicated institutional liquidity discovery layer:
  - `server/modules/zenny/analysis/liquidity/findLiquidityPools.ts`
  - detects equal highs/lows from swing wick extremes
  - detects round-number magnets near existing structure
  - detects recent completed daily/session highs and lows
  - emits additive pool candidates without polluting structural level detection
- Corrected institutional pool lifecycle semantics:
  - the visible rectangle can have thickness
  - the liquidity is consumed once price trades through the target line
  - consumed historical pools must stop at the sweep candle instead of projecting forward behind later price action

## Defaults

- Added a single shared defaults source: `shared/zennyBraidDefaults.ts`.
- Client and server now import/reset from that shared source instead of each keeping separate defaults.
- Defaults are timeframe-aware for:
  - candle count
  - pass config
  - aggregate filter behavior
- Reset defaults are intentionally more visually useful:
  - aggregate `strengthThreshold` defaults to `0`
  - this prevents reset from hiding most levels and making the chart feel broken
- Added migration handling for older localStorage values that matched the previous legacy defaults.

## UI Changes

- Reworked the Braid header so it stays focused on primary navigation:
  - app name
  - trading pair
  - timeframe
  - status
  - Settings
  - Refresh
- Moved secondary controls into a right-side Settings drawer:
  - candle count
  - chart style
  - line-chart points
  - current timeframe levels toggle
  - higher timeframe levels toggle
  - pools toggle
  - liquidity levels toggle
  - liquidity decay
  - pass controls
- Kept trading pair and timeframe out of the drawer, per final preference.
- Renamed the old pass drawer behavior into a broader Settings drawer.
- Changed pass reset button label to `Reset passes`.
- Removed the hidden duplicate header controls left over during the refactor.
- Updated pool rendering:
  - live pools extend from birth candle to the chart edge
  - swept pools stop at the sweep candle and render with a hatched treatment
  - dead pools still render through the structural break candle
  - institutional pool candidates remain visible independently from the aggregate level-strength slider

## Key Files Changed

- `shared/zennyBraidDefaults.ts`
- `client/src/pages/Braid.tsx`
- `client/src/components/braid/PassPlayground.tsx`
- `client/src/components/braid/types.ts`
- `client/src/components/braid/LeftFrameCanvas.tsx`
- `server/modules/zenny/analysis/orchestrator.ts`
- `server/modules/zenny/analysis/level/findBodyPivots.ts`
- `server/modules/zenny/analysis/level/findBodyClusters.ts`
- `server/modules/zenny/analysis/level/findBodyClusters.test.ts`
- `server/modules/zenny/analysis/passes/types.ts`
- `server/modules/zenny/analysis/passes/lastLegPass.ts`
- `server/modules/zenny/analysis/passes/touchCountPass.ts`
- `server/modules/zenny/analysis/pool/formPool.ts`
- `server/modules/zenny/analysis/pool/checkPoolAliveness.ts`
- `server/modules/zenny/analysis/pool/poolLogic.test.ts`
- `server/modules/zenny/analysis/liquidity/findLiquidityPools.ts`
- `server/modules/zenny/analysis/liquidity/findLiquidityPools.test.ts`
- `server/routes/zennyRoutes.ts`

## Verification

- `npm run typecheck` passed.
- `npm run test:run -- server/modules/zenny/analysis` passed after the institutional liquidity discovery layer and target-line sweep fix.
  - 5 test files
  - 18 tests

## Current Product Decisions

- Liquidity-pool trading levels should privilege visible market structure.
- A candle can be the top/bottom of a leg because of its wick, even if the level itself is body anchored.
- A wick can sweep liquidity without structurally breaking the level.
- A close past the body line is the structural break condition.
- Reset should restore a meaningful, information-rich chart, not an aggressively filtered chart.
- Defaults vary by timeframe.
- Pair and timeframe are primary controls and should remain visible in the header.
- Drawer settings are for secondary/tuning controls.
- Structural level detection and liquidity-pool discovery are separate concerns.
- Institutional pool discovery should be additive and reason-coded instead of changing the swing pivot detector.
- Historical price action that already traded through a liquidity target means that pool is consumed; only unconsumed pools project forward.

## Future Hardening

- The next logical analysis hardening target is institutional zone discovery:
  - replace or supplement `findBodyClusters.ts` with fuller density clustering
  - consider DBSCAN-style price clustering or ATR-normalized zone clustering
  - preserve body anchoring and wick-based sweep semantics
- A future UI pass could add a single `Reset all view settings` action separate from `Reset passes`.
