/**
 * Revisa variáveis de ambiente (após puxar da Vercel com vercel:env:prod).
 * Valida POSTGRES_URL (porta 6543 no Supabase) e variáveis obrigatórias.
 * Não faz ping à BD (para usar mesmo quando a BD de produção não é acessível a partir de local).
 *
 * Uso: pnpm run vercel:env:prod  &&  pnpm run vercel:review
 * Ou:  pnpm exec tsx scripts/vercel-review-env.ts  (com .env.local já preenchido)
 */
import { config } from "dotenv";
import * as fs from "node:fs";
import * as path from "node:path";

const ENV_FILE = path.resolve(process.cwd(), ".env.local");
const REQUIRED = ["AUTH_SECRET", "POSTGRES_URL"] as const;

function main(): void {
  if (!fs.existsSync(ENV_FILE)) {
    console.error("❌ Ficheiro .env.local não encontrado.");
    console.error("   Executa primeiro: pnpm run vercel:env:prod");
    process.exit(1);
  }

  config({ path: ".env" });
  config({ path: ".env.local" });

  console.log("Revisão das variáveis (Vercel Production)\n");

  let failed = false;

  for (const name of REQUIRED) {
    const value = process.env[name];
    if (!value || value.trim() === "") {
      console.error(`❌ Variável em falta ou vazia: ${name}`);
      failed = true;
    }
  }
  if (failed) {
    console.error("\n   Define-as em Vercel → Settings → Environment Variables (Production)");
    console.error("   e corre: pnpm run vercel:env:prod");
    process.exit(1);
  }
  console.log("✅ AUTH_SECRET e POSTGRES_URL definidas.");

  const url = process.env.POSTGRES_URL ?? "";
  if (url.includes("supabase.co")) {
    if (url.includes(":5432")) {
      console.error("\n❌ POSTGRES_URL usa a porta 5432 (conexão direta).");
      console.error("   Em produção (Vercel) é obrigatório usar o pooler: porta 6543.");
      console.error("\n   Como corrigir:");
      console.error("   1. Supabase → Dashboard → Settings → Database");
      console.error("   2. Connection string → Transaction (URI com :6543)");
      console.error("   3. Copia a URI, substitui [YOUR-PASSWORD] pela password da BD");
      console.error("   4. Em .env.local: POSTGRES_URL=<essa URI>");
      console.error("   5. Envia para a Vercel: pnpm run vercel:env:push");
      console.error("   6. Redeploy: pnpm run vercel:deploy:prod (ou no dashboard)");
      process.exit(1);
    }
    if (url.includes(":6543") || url.includes("pooler.supabase.com")) {
      console.log("✅ POSTGRES_URL usa o pooler (porta 6543 ou pooler.supabase.com).");
    }
  } else if (url) {
    console.log("✅ POSTGRES_URL definida (não Supabase; porta não validada).");
  }

  console.log("\n✅ Revisão concluída. Variáveis adequadas para produção.");
  console.log("   Para testar a ligação à BD: pnpm run db:ping");
  console.log("   Para fazer deploy: pnpm run vercel:deploy:prod");
}

main();
