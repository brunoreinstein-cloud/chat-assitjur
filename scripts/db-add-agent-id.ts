/**
 * Adiciona a coluna agentId à tabela Chat se não existir.
 * Use quando a migração 0017 não tiver sido aplicada (ex.: erro "column agentId does not exist").
 *
 * Uso: pnpm db:add-agent-id
 */
import { config } from "dotenv";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

config({ path: ".env" });
config({ path: ".env.local" });

async function main() {
  const url = process.env.POSTGRES_URL;
  if (!url) {
    console.error("❌ POSTGRES_URL não está definida no .env ou .env.local");
    process.exit(1);
  }

  const client = postgres(url, { max: 1 });
  const db = drizzle(client);

  try {
    await db.execute(sql`
      ALTER TABLE "Chat" ADD COLUMN IF NOT EXISTS "agentId" varchar(64) DEFAULT 'revisor-defesas'
    `);
    console.log("✅ Coluna agentId adicionada (ou já existia) na tabela Chat.");
    process.exit(0);
  } catch (err) {
    console.error("❌ Erro ao adicionar coluna agentId:");
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
