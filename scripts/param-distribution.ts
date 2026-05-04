import { db } from "../server/db";
import { autoresearchSessions, autoresearchIterations } from "../shared/schema";
import { desc, eq } from "drizzle-orm";

async function main() {
  const [session] = await db
    .select()
    .from(autoresearchSessions)
    .orderBy(desc(autoresearchSessions.startedAt))
    .limit(1);
  if (!session) return;
  console.log("Session:", session.id, "regime:", session.regime);

  const its = await db
    .select()
    .from(autoresearchIterations)
    .where(eq(autoresearchIterations.sessionId, session.id));

  console.log(`\n${its.length} iterations · param distribution:`);
  console.log("idx | targetDist | minRR  | swing | minTouch | minProt | levelRnk | trades | netPnl");
  console.log("----|------------|--------|-------|----------|---------|----------|--------|---------");
  for (const it of its) {
    const p = it.params as Record<string, number>;
    console.log(
      `${String(it.idx).padStart(3)} | ` +
      `${(p.targetDistanceMultiplier ?? 0).toFixed(2).padStart(10)} | ` +
      `${(p.minRiskRewardRatio ?? 0).toFixed(2).padStart(6)} | ` +
      `${String(p.swingLookback ?? 0).padStart(5)} | ` +
      `${String(p.minTouches ?? 0).padStart(8)} | ` +
      `${(p.minWickProtrusionPct ?? 0).toFixed(3).padStart(7)} | ` +
      `${String(p.minLevelRank ?? 0).padStart(8)} | ` +
      `${String(it.trades).padStart(6)} | ` +
      `${Number(it.netPnl).toFixed(2).padStart(8)}`
    );
  }

  const targets = its.map((i) => (i.params as Record<string, number>).targetDistanceMultiplier ?? 0);
  const rrs = its.map((i) => (i.params as Record<string, number>).minRiskRewardRatio ?? 0);
  console.log(`\ntargetDistanceMultiplier: min=${Math.min(...targets).toFixed(2)}, max=${Math.max(...targets).toFixed(2)}`);
  console.log(`minRiskRewardRatio: min=${Math.min(...rrs).toFixed(2)}, max=${Math.max(...rrs).toFixed(2)}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
