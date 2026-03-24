import { readFileSync } from "node:fs";
import { config } from "dotenv";
import postgres from "postgres";

config({ path: ".env" });
config({ path: ".env.local" });

const run = async () => {
  if (!process.env.POSTGRES_URL) {
    console.error("POSTGRES_URL not set");
    process.exit(1);
  }

  const sql = postgres(process.env.POSTGRES_URL, { max: 1 });

  const files = [
    "./lib/db/migrations/0029_processo_intake.sql",
    "./lib/db/migrations/0030_pecas.sql",
    "./lib/db/migrations/0031_user_role.sql",
  ];

  for (const file of files) {
    const content = readFileSync(file, "utf-8");
    console.log(`⏳ Applying ${file}…`);
    try {
      await sql.unsafe(content);
      console.log(`✅ ${file} done`);
    } catch (err) {
      console.error(`❌ ${file} failed:`, err);
    }
  }

  await sql.end();
  console.log("Done.");
};

run().catch(console.error);
