# Zenny Braid Major Checkpoint - 2026-05-04

This checkpoint records the first stable separation of the platform's two
fundamental objects: structural levels and liquidity pools.

## Principle

Levels and liquidity pools are separate systems with separate rules.

- A level is a structural support/resistance reference.
- A liquidity pool is remaining executable/triggerable wick-side liquidity.
- Pivots help find levels.
- Pivots are not required for finding pools.
- A wick can consume liquidity without invalidating a structural level.
- A structural level needs close-through evidence, and a polarity flip needs
  close-through plus later retest/hold evidence.

## Level Rules

Levels are created from closed-candle evidence only.

Two sources create levels:

- Swing pivots: wick extremes identify the swing; the level line is anchored
  to the body extreme.
- Body clusters: repeated body highs/lows inside a timeframe-aware tolerance
  create horizontal structural reference prices.

Level behavior:

- Wick-through alone does not break the level.
- Close-through marks structural break.
- Polarity flip is not based on current-price geometry alone.
- A flip requires a confirmed close through the level and a later retest from
  the new side that closes on that side.
- Level rendering uses the effective side from the polarity pass, so the line
  and tag agree visually.

## Liquidity Pool Rules

Pools are created by `findLiquidityPools`.

Pool creation is candle-first:

- The latest potentially open candle may consume older liquidity but does not
  create a confirmed pool.
- Closed candles with meaningful wick probes near local range edges can create
  pool candidates.
- Resistance pools use the remaining upper-wick zone.
- Support pools use the remaining lower-wick zone.

Pool depletion is price-first:

- Later highs deplete resistance pools.
- Later lows deplete support pools.
- Full trade-through removes the pool.
- Partial trade-through leaves only the remaining unconsumed zone.
- Lower-timeframe candles can deplete higher-timeframe pools because execution
  happens through actual traded price, not through the source timeframe label.

## Data Flow

The orchestrator fetches the timeframe stack, then builds:

- levels from pivots and body clusters,
- pools from the dedicated liquidity engine,
- pass output for level scoring/flip behavior,
- pull scores for active pools,
- braid arms from the strongest active pool above and below current price.

Candles are cache-protected against stale analysis: cached live candles expire
quickly, and refresh includes a nonce so chart switches and manual refreshes
force a fresh analysis request.

## Rendering Rules

Rendering preserves the same separation:

- Levels are SVG/DOM overlays so their labels and metadata are inspectable.
- Pools are canvas rectangles behind candles.
- Active pools extend to the current chart edge.
- Swept/dead pools are optional diagnostic overlays and hidden by default.
- Pool visibility is not controlled by level strength because pools are now
  standalone liquidity objects.
- Current price is shown on the right-hand axis.

## Institutional Sanity Check

This matches the researched principles:

- Support/resistance are zones around prior highs/lows and repeated reaction
  prices, not exact one-tick promises.
- Close-through evidence matters more for structural support/resistance than
  wick excursions.
- Support can become resistance, and resistance can become support, but the
  flip should require evidence.
- Stop/liquidity consumption happens when price trades at or through the area,
  so wicks can consume pools.

Primary references used during the checkpoint:

- CME Group: Support and Resistance
  https://www.cmegroup.com/education/courses/technical-analysis/support-and-resistance
- CME Group: Futures Order Types
  https://www.cmegroup.com/education/courses/things-to-know-before-trading-cme-futures/futures-order-types.html

## Verification At Checkpoint

The checkpoint was verified with:

- `npm run test:run -- server/modules/zenny/analysis/passes/passes.test.ts server/modules/zenny/analysis/level/findBodyClusters.test.ts server/modules/zenny/analysis/orchestrator.test.ts`
- `npm run typecheck`
- `npm run build`

All passed.

## Known Follow-Ups

These are future refinements, not blockers for this checkpoint:

- Rename legacy pool kind `"pivot_probe"` to a clearer wick-liquidity name once
  the client/server type contract can move together.
- Add true cross-timeframe confluence scoring for levels.
- Replace fixed cluster tolerances with ATR-normalized tolerance if the chart
  later shows noisy behavior on unusually volatile regimes.
- Revisit pool pull scoring once the full seven-component pool score is ready.
