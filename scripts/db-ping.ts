/**
 * Testa a ligação à base de dados (POSTGRES_URL).
 * Uso: pnpm db:ping
 */
import { config } from "dotenv";
import { drizzle } from "drizzle-orm/postgres-js";
import { sql } from "drizzle-orm";
import postgres from "postgres";

config({ path: ".env" });
config({ path: ".env.local" });

async function ping() {
  const url = process.env.POSTGRES_URL;
  if (!url) {
    console.error("❌ POSTGRES_URL não está definida no .env ou .env.local");
    process.exit(1);
  }

  const client = postgres(url, { max: 1 });
  const db = drizzle(client);

  try {
    const start = Date.now();
    await db.execute(sql`SELECT 1`);
    const ms = Date.now() - start;
    console.log(`✅ Ligação à base de dados OK (${ms} ms)`);
    process.exit(0);
  } catch (err) {
    console.error("❌ Erro ao ligar à base de dados:");
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

ping();
