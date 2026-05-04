// Persist a parsed forceOrder event to the binance_liquidations table.
// One insert per call — the stream is low volume (well under 1/sec for our
// 14 tracked symbols) so batching isn't needed.

import { db } from "../../../../db";
import { binanceLiquidations } from "../../../../../shared/schema";
import type { ForceOrderEvent } from "./parseForceOrderEvent";

export async function persistLiquidationEvent(
  event: ForceOrderEvent,
): Promise<void> {
  await db.insert(binanceLiquidations).values({
    symbol: event.symbol,
    eventTime: event.eventTime,
    positionSide: event.positionSide,
    price: event.price,
    averagePrice: event.averagePrice,
    quantity: event.quantity,
    usdValue: event.usdValue,
  });
}
