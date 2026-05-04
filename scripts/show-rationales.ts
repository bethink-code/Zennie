import { db } from "../server/db";
import { autoresearchSessions, autoresearchIterations } from "../shared/schema";
import { desc, eq } from "drizzle-orm";

async function main() {
  const [s] = await db
    .select()
    .from(autoresearchSessions)
    .orderBy(desc(autoresearchSessions.startedAt))
    .limit(1);
  console.log("Session:", s.id, "model:", s.model);
  const its = await db
    .select()
    .from(autoresearchIterations)
    .where(eq(autoresearchIterations.sessionId, s.id));
  for (const it of its.slice(0, 10)) {
    console.log(`\n--- idx ${it.idx} ---`);
    console.log("params:", JSON.stringify(it.params));
    console.log("rationale:", it.rationale);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
