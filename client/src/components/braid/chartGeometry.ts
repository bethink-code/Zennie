// Single source of truth for chart Y-axis geometry.
// Both LeftFrameCanvas and all NOW columns MUST use these values.
// If you change padding here, everything stays aligned.

export const CHART_PAD = { l: 60, r: 100, t: 20, b: 32 } as const;
export const PRICE_PAD_FRACTION = 0.02; // additive, as fraction of price range

/** Compute the Y-axis price range from candles. Every surface that renders
 *  price-aligned content MUST call this and use the returned min/max. */
export function computePriceRange(candles: Array<{ high: number; low: number }>) {
  if (candles.length === 0) return { priceMin: 0, priceMax: 0, priceRange: 0 };
  let rawMin = Infinity;
  let rawMax = -Infinity;
  for (const c of candles) {
    if (c.low < rawMin) rawMin = c.low;
    if (c.high > rawMax) rawMax = c.high;
  }
  const pad = (rawMax - rawMin) * PRICE_PAD_FRACTION;
  const priceMin = rawMin - pad;
  const priceMax = rawMax + pad;
  return { priceMin, priceMax, priceRange: priceMax - priceMin };
}

/** Map a price to a Y pixel coordinate within the plot area. */
export function priceToY(
  price: number,
  priceMin: number,
  priceRange: number,
  plotHeight: number,
  padTop: number = CHART_PAD.t,
): number {
  return padTop + plotHeight * (1 - (price - priceMin) / priceRange);
}
