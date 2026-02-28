/**
 * Lista tabelas no schema public da BD (POSTGRES_URL).
 * Uso: pnpm db:tables
 */
import { config } from "dotenv";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

config({ path: ".env" });
config({ path: ".env.local" });

function maskUrl(url: string): string {
  try {
    const u = new URL(url.replace(/^postgres(ql)?/, "https"));
    return `${u.hostname}:${u.port || "5432"}`;
  } catch {
    return "(url inválida)";
  }
}

async function listTables() {
  const url = process.env.POSTGRES_URL;
  if (!url) {
    console.error("❌ POSTGRES_URL não está definida no .env ou .env.local");
    process.exit(1);
  }

  console.log("🔗 BD:", maskUrl(url));
  console.log("");

  const client = postgres(url, { max: 1 });
  const db = drizzle(client);

  try {
    const rows = await db.execute(sql`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);

    const tables = (rows as unknown as { table_name: string }[]).map(
      (r) => r.table_name
    );
    if (tables.length === 0) {
      console.log("⚠️  Nenhuma tabela no schema public.");
      console.log("   Corra: pnpm db:migrate   ou   pnpm db:push");
      process.exit(1);
    }

    console.log("Tabelas no schema public:");
    for (const t of tables) {
      const ok = t === "Chat" ? "  ← necessária para o chat" : "";
      console.log("  -", t, ok);
    }
    if (!tables.includes("Chat")) {
      console.log("");
      console.log("❌ A tabela 'Chat' não existe. Corra: pnpm db:push");
      process.exit(1);
    }
    console.log("");
    console.log("✅ Schema OK.");
    process.exit(0);
  } catch (err) {
    console.error("❌ Erro:", err instanceof Error ? err.message : err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

listTables();
