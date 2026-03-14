/**
 * Revisa variáveis de ambiente (após puxar da Vercel com vercel:env:prod).
 * Valida POSTGRES_URL (porta 6543 no Supabase), formato da URL e variáveis obrigatórias.
 * Não faz ping à BD (para usar mesmo quando a BD de produção não é acessível a partir de local).
 *
 * Uso: pnpm run vercel:env:prod && pnpm run vercel:review
 * Ou:  pnpm exec tsx scripts/vercel-review-env.ts  (com .env.local já preenchido)
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { config } from "dotenv";

const ENV_FILE = path.resolve(process.cwd(), ".env.local");

/** AssistJur: inclui ANTHROPIC_API_KEY; se usares só Vercel AI Gateway (OIDC), remove desta lista. */
const REQUIRED = ["AUTH_SECRET", "POSTGRES_URL", "ANTHROPIC_API_KEY"] as const;

function validatePostgresUrl(url: string): void {
  try {
    new URL(url);
  } catch {
    console.error("❌ POSTGRES_URL não é uma URL válida. Verifica o formato.");
    process.exit(1);
  }

  if (!url.includes("supabase")) {
    return;
  }
  console.log("   (Supabase detectado — a validar pooler…)");

  if (url.includes(":5432")) {
    console.error("\n❌ POSTGRES_URL usa a porta 5432 (conexão direta).");
    console.error(
      "   Em produção (Vercel) é obrigatório usar o pooler: porta 6543."
    );
    console.error("\n   Como corrigir:");
    console.error("   1. Supabase → Dashboard → Settings → Database");
    console.error("   2. Connection string → Transaction (URI com :6543)");
    console.error("   3. Copia a URI e substitui [YOUR-PASSWORD]");
    console.error("   4. POSTGRES_URL=<essa URI> em .env.local");
    console.error("   5. pnpm run vercel:env:push");
    console.error("   6. pnpm run vercel:deploy:prod");
    process.exit(1);
  }

  const usesPooler =
    url.includes(":6543") ||
    url.includes("pooler.supabase.com") ||
    url.includes("-pooler.supabase.co");

  if (usesPooler) {
    console.log("✅ POSTGRES_URL usa o pooler Supabase (produção OK).");
  } else {
    console.warn(
      "⚠️  POSTGRES_URL Supabase sem pooler identificado — confirma manualmente."
    );
  }
}

function main(): void {
  if (!fs.existsSync(ENV_FILE)) {
    console.error("❌ Ficheiro .env.local não encontrado.");
    console.error("   Executa primeiro: pnpm run vercel:env:prod");
    process.exit(1);
  }

  // .env.local com override:true tem precedência sobre .env
  config({ path: ".env.local", override: true });
  config({ path: ".env" });

  console.log("Revisão das variáveis (Vercel Production)\n");

  let failed = false;
  for (const name of REQUIRED) {
    const value = process.env[name];
    if (!value || value.trim() === "") {
      console.error(`❌ Variável em falta ou vazia: ${name}`);
      failed = true;
    } else {
      console.log(`✅ ${name} definida.`);
    }
  }

  if (failed) {
    console.error(
      "\n   Define-as em Vercel → Settings → Environment Variables (Production)"
    );
    console.error("   e corre: pnpm run vercel:env:prod");
    process.exit(1);
  }

  validatePostgresUrl(process.env.POSTGRES_URL ?? "");

  console.log("\n✅ Revisão concluída. Variáveis adequadas para produção.");
  console.log("   Para testar a ligação à BD: pnpm run db:ping");
  console.log("   Para fazer deploy:           pnpm run vercel:deploy:prod");
}

main();
