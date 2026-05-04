import WebSocket from "ws";
let n = 0;
const ws = new WebSocket("wss://stream.bybit.com/v5/public/linear");
ws.on("open", () => {
  ws.send(JSON.stringify({ op: "subscribe", args: [
    "allLiquidation.BTCUSDT", "allLiquidation.ETHUSDT", "allLiquidation.SOLUSDT",
  ]}));
});
ws.on("message", (d) => {
  n++;
  if (n <= 5) console.log(`[${n}]`, d.toString().slice(0, 280));
});
ws.on("error", (e) => console.log("ERR:", e.message));
ws.on("close", (c) => console.log("CLOSE", c));
setTimeout(() => { console.log(`\n${n} msgs in 60s`); process.exit(0); }, 60_000);
