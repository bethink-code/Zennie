import { db } from "../server/db";
import { autoresearchSessions } from "../shared/schema";
import { desc } from "drizzle-orm";

async function main() {
  const [s] = await db
    .select()
    .from(autoresearchSessions)
    .orderBy(desc(autoresearchSessions.startedAt))
    .limit(1);
  console.log("regime:", s.regime);
  console.log("mode:", s.mode);
  console.log("timeframe:", s.timeframe);
  console.log("lookbackBars:", s.lookbackBars);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
