import { db } from "../server/db";
import { autoresearchSessions } from "../shared/schema";
import { desc } from "drizzle-orm";

async function main() {
  const [s] = await db
    .select()
    .from(autoresearchSessions)
    .orderBy(desc(autoresearchSessions.startedAt))
    .limit(1);
  console.log("Session:", s.id);
  console.log("Mode:", s.mode);
  console.log("\n--- STORED SYSTEM PROMPT ---");
  console.log(s.systemPrompt);
  console.log("--- END ---\n");
  const hasNewRange = s.systemPrompt.includes("0.5..3.0");
  console.log("Contains new '0.5..3.0' range:", hasNewRange);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
