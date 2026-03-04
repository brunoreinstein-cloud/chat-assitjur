/**
 * Testa a ligação à base de dados (POSTGRES_URL).
 * Uso: pnpm db:ping
 *
 * Se demorar mais de 15s, falha com timeout (útil para detectar BD inacessível ou muito lenta).
 * Ver docs/DB-TIMEOUT-TROUBLESHOOTING.md quando o chat der timeout na BD.
 */
import { config } from "dotenv";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

config({ path: ".env" });
config({ path: ".env.local" });

const PING_TIMEOUT_MS = 15_000;

async function ping() {
  const url = process.env.POSTGRES_URL;
  if (!url) {
    console.error("❌ POSTGRES_URL não está definida no .env ou .env.local");
    console.error(
      "   Copia .env.example para .env.local e define POSTGRES_URL (Supabase, Neon, etc.)."
    );
    process.exit(1);
  }

  const client = postgres(url, { max: 1, connect_timeout: 10 });
  const db = drizzle(client);

  try {
    const start = Date.now();
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error(`Timeout após ${PING_TIMEOUT_MS / 1000}s`)),
        PING_TIMEOUT_MS
      )
    );
    // Alguns poolers (Supabase, Neon) têm statement_timeout curto no servidor (ex.: 8s); o SET pode não ter efeito em transaction mode.
    try {
      await db.execute(sql`SET statement_timeout = '15000'`);
    } catch {
      // Ignorar se o pooler não permitir SET (ex.: transaction mode restrito).
    }
    await Promise.race([db.execute(sql`SELECT 1`), timeoutPromise]);
    const ms = Date.now() - start;
    if (ms > 3000) {
      console.log(
        `✅ Ligação OK (${ms} ms) — lento; se o chat der timeout, vê docs/DB-TIMEOUT-TROUBLESHOOTING.md`
      );
    } else {
      console.log(`✅ Ligação à base de dados OK (${ms} ms)`);
    }
    process.exit(0);
  } catch (err) {
    const code =
      err && typeof err === "object" && "code" in err
        ? (err as { code: string }).code
        : undefined;
    if (code === "57014") {
      console.error("❌ O servidor cancelou a query (statement timeout).");
      console.error(
        "   O pooler Supabase/Neon pode ter statement_timeout curto (ex.: 8s); em cold start a ligação demora mais."
      );
      console.error("   Opções:");
      console.error(
        "   1) Correr de novo: pnpm db:ping (a 2.ª vez costuma ser rápida, ligação já quente)."
      );
      console.error(
        "   2) Para este script só: em .env.local usa a connection string em modo Session (porta 5432) em vez do pooler (6543). Supabase: Settings → Database → Connection string → Session."
      );
      console.error("   Ver docs/DB-TIMEOUT-TROUBLESHOOTING.md");
    } else {
      console.error("❌ Erro ao ligar à base de dados:");
      console.error(err instanceof Error ? err.message : err);
      console.error("   Sugestões: docs/DB-TIMEOUT-TROUBLESHOOTING.md");
    }
    process.exit(1);
  } finally {
    await client.end();
  }
}

ping();
