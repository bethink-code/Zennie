// Parse a single forceOrder WebSocket message from Binance Futures.
// Stream payload shape (from /ws/!forceOrder@arr):
//   { e: "forceOrder", E: <eventTimeMs>, o: {
//       s: <symbol>, S: "BUY"|"SELL", o: <orderType>, f: <tif>,
//       q: <origQty>, p: <price>, ap: <avgPrice>, X: <status>,
//       l: <lastFilledQty>, z: <cumFilledQty>, T: <tradeTimeMs>
//   }}
//
// Position-side mapping is the canonical convention:
//   o.S === "SELL" → a LONG position was liquidated (forced sell)
//   o.S === "BUY"  → a SHORT position was liquidated (forced buy)
//
// Returns null for messages that aren't valid forceOrder payloads or whose
// symbol isn't in the allowed set (we filter at parse so the rest of the
// pipeline never sees off-list noise).

export interface ForceOrderEvent {
  symbol: string;
  eventTime: Date;
  positionSide: "long" | "short";
  price: string;          // numeric strings preserved verbatim for DB
  averagePrice: string;
  quantity: string;
  usdValue: string;
}

export function parseForceOrderEvent(
  raw: unknown,
  allowedSymbols: ReadonlySet<string>,
): ForceOrderEvent | null {
  if (!raw || typeof raw !== "object") return null;
  const m = raw as { e?: string; E?: number; o?: Record<string, unknown> };
  if (m.e !== "forceOrder" || !m.o || typeof m.E !== "number") return null;

  const o = m.o;
  const symbol = typeof o.s === "string" ? o.s : "";
  if (!symbol || !allowedSymbols.has(symbol)) return null;

  const orderSide = typeof o.S === "string" ? o.S : "";
  if (orderSide !== "BUY" && orderSide !== "SELL") return null;
  const positionSide = orderSide === "SELL" ? "long" : "short";

  const price = typeof o.p === "string" ? o.p : String(o.p ?? "");
  const averagePrice = typeof o.ap === "string" ? o.ap : String(o.ap ?? price);
  const quantity = typeof o.z === "string" ? o.z : String(o.z ?? o.q ?? "0");

  const priceNum = Number(averagePrice || price);
  const qtyNum = Number(quantity);
  if (!Number.isFinite(priceNum) || !Number.isFinite(qtyNum) || priceNum <= 0 || qtyNum <= 0) {
    return null;
  }

  return {
    symbol,
    eventTime: new Date(m.E),
    positionSide,
    price,
    averagePrice,
    quantity,
    usdValue: (priceNum * qtyNum).toFixed(2),
  };
}
