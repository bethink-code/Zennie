# Regime → Liquidity-Pool Strategy: Deep Research Findings (2026-05-30)

Source: deep-research harness — 108 agents, 6 search angles, 25 sources fetched,
101 claims extracted, 25 adversarially verified (3-vote refute). 14 confirmed,
11 killed. Run id `wf_29d9dd35-3ee`.

Purpose: confirm — with citable sources, not assertion — that (1) trading
strategy should be determined by market regime, and (2) how to tell a liquidity
pool that is a TURNING POINT (fade) from one price will RUN THROUGH (continuation).

---

## VERDICT

Both core claims **confirmed**. The strategy layer should be regime-gated:
**fade in mean-reverting regimes, follow in trending/breakout regimes.** The
turning-point-vs-run-through distinction has a concrete, cross-school-agreed
confirmation sequence.

---

## Q1 — Regime determines strategy (HIGH confidence)

- Markets exhibit **horizon/regime-dependent behaviour** — short-term momentum
  (continuation) coexists with medium-term mean reversion (reversal). Strategy
  should be **state-conditional, not fixed.**
  — Giner & Zakamulin, *Economic Modelling* v122 (2023), peer-reviewed
  regime-switching paper. Traceable to Jegadeesh & Titman 1993; DeBondt & Thaler
  1985; Fama & French 1988.
- **Hurst exponent** as an explicit fade/follow selector: H<0.5 mean-reverting
  (fade), H=0.5 random walk, H>0.5 trending (follow); near 0 strongly
  mean-reverting, near 1 strongly trending.
  — macrosynergy.com; arXiv 2205.11122; Ernie Chan.
- **Wilder's ADX** numeric cutoffs: >25 trending (follow), <20 non-trending
  (fade tops/bottoms), 20-25 gray zone.
  — StockCharts ChartSchool; Wilder 1978; corroborated TradersPost, Schwab,
  Fidelity, LuxAlgo. "Rising ADX → trend tools/breakouts/momentum; falling ADX
  → oscillators/mean-reversion." (Murphy)

## Q2 — Turning point vs run-through (MEDIUM confidence — practitioner consensus)

**REVERSAL (fade) confirmation sequence** — all four:
1. **Sweep** of liquidity at the extreme (wick beyond the pool)
2. **Fail to hold** — close back inside (reclaim)
3. **MSS / CHoCH** — market-structure shift on the lower TF, opposite direction
4. **Return into the opposite PD array** (FVG / order block) with a rejection
   candle showing displacement — this is the entry trigger.
   — innercircletrader.net (sweep-vs-run, MSS); zeiierman.com (sweep+FVG).

**RUN-THROUGH (continuation — do NOT fade) signature:**
- Displacement **away** from the swept level, **no** reclaim, **no** PD-array
  return, **BOS** in the prevailing trend direction, and **follow-through**
  (new resting bids/offers defend the new level; sustained momentum/volume).
  — bookmap.com (follow-through / absorption); innercircletrader.net.

**Discriminators (probabilistic, supportive):**
- **Volume / range on the break:** low-volume + narrow-range + shallow
  penetration = exhaustion → reversal (Wyckoff Spring #3, can buy without test).
  High expansive volume = real supply → continuation, requires a successful
  low-volume test first. — tradingwyckoff.com (qualitative canon only; numbers
  are the author's, NOT Wyckoff canon — see refuted).
- **Liquidation-heatmap clusters are MAGNETS / TARGETS, not turning points.**
  Price gravitates toward them. Whether an approached cluster reverses or is
  passed depends on surrounding depth: thin depth → sharp reversal; deep depth
  → smooth continuation. Probabilistic (leverage-model estimates, exchange bias,
  lag, fake clusters). Do NOT treat a cluster as a fade signal on its own.
  — coinglass.com; glassnode.

**No inter-school contradiction** surfaced on load-bearing points: ICT
(MSS/CHoCH/BOS), Wyckoff (Spring volume/test), order-flow (follow-through/
absorption), and quant (Hurst/ADX) all agree: reversal = sweep-and-fail +
structure shift + no follow-through; continuation = displacement + follow-through
+ defended new level.

## Regime → pool-trading map (SYNTHESIS — directional doctrine HIGH, gates MEDIUM)

| Regime | Play | Gate before entry |
|---|---|---|
| DEAD / NO_TRADE | stand aside | — |
| ACCUMULATION / coiling | **fade** (canonical reversal regime — Wyckoff spring) | sweep + fail-to-hold + low-volume/narrow-range; else stand aside |
| RANGING / oscillating | **fade** turning point (H<0.5 / ADX<20) | sweep + reclaim + MSS/CHoCH + return to opposite PD array; target = opposite edge |
| TRENDING / directional | **follow** (H>0.5 / ADX>25), no fading | BOS in trend dir / pullback to PD array; direction = trend, not dominant pool. Counter-trend fade only on full reversal confirmation |
| BREAKOUT / expansion | **follow** the break | follow-through present (displacement, defended level, expansive volume). Fade only if follow-through absent AND price reclaims |

---

## REFUTED — do NOT build on these (verification killed them)

- ❌ **Aging trend → more likely to reverse.** No duration rule (0-3).
- ❌ **HTF directional agreement determines reversal vs continuation** (1-2).
  Not a reliable standalone discriminator.
- ❌ **FX breakouts fail >75%** / **Gold consolidates >66%** — likely
  fabricated SSRN paper (0-3).
- ❌ **"Breakout logic converts retail into liquidity" edge claim** (0-3).
- ❌ **All precise Wyckoff numbers** — reclaim within 1-5 bars, test on 40-60%
  volume, 40-70% smaller test candle, 0.3-1% hold, Phase C 15-30 bars,
  60-70% failure rate (all 0-3). Qualitative mechanism survives; the numbers
  are embellishment.

## OPEN QUESTIONS (these become OUR work, not borrowed answers)

1. **Real base rates for sweep-reversal vs run-through on BTC/ETH 15m are
   unknown.** Borrowed figures were refuted. Our backtest engine must MEASURE
   per-regime fade hit-rates before we size fade trades.
2. **Our angle thresholds (Gann brackets 14/26.25/45/63.75°, RegimeGuard 26.25°)
   are unvalidated.** No source links price-angle to ADX/Hurst. Compute ADX
   (and maybe Hurst) alongside the wire angle and calibrate the brackets to the
   validated >25/<20 cutoffs.
3. In TRENDING, what objective rule gates the rare counter-trend fade vs
   standing aside (how much confirmation overrides the sacred regime gate).
4. How to combine liquidation-cluster depth/intensity with the structural
   sweep+MSS confirmation — sources give both qualitatively, no weighting rule.

## KEY SOURCES

- Giner & Zakamulin 2023, *Economic Modelling* (peer-reviewed regime-switching)
- macrosynergy.com Hurst exponent; arXiv 2205.11122; Ernie Chan
- StockCharts ChartSchool ADX; Wilder 1978
- innercircletrader.net (liquidity sweep vs run; market structure shift)
- zeiierman.com (liquidity sweeps + fair value gaps)
- bookmap.com (stop hunt vs breakout; follow-through; absorption)
- tradingwyckoff.com (spring/shakeout — qualitative only)
- coinglass.com / glassnode (liquidation heatmaps as magnets)
