async function main() {
  console.log("Testing live Binance API...");

  const r1 = await fetch("https://fapi.binance.com/fapi/v1/openInterest?symbol=BTCUSDT");
  const oi = await r1.json();
  console.log("OI:", JSON.stringify(oi));

  const r2 = await fetch("https://fapi.binance.com/fapi/v1/premiumIndex?symbol=BTCUSDT");
  const pi = await r2.json();
  console.log("Mark price:", (pi as any).markPrice);

  const r3 = await fetch("https://fapi.binance.com/fapi/v1/fundingRate?symbol=BTCUSDT&limit=1");
  const fr = await r3.json();
  console.log("Funding rate:", (fr as any[])[0]?.fundingRate);

  const r4 = await fetch("https://fapi.binance.com/futures/data/globalLongShortAccountRatio?symbol=BTCUSDT&period=1d&limit=1");
  const ls = await r4.json();
  console.log("LS ratio:", JSON.stringify((ls as any[])[0]));

  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
