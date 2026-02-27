/**
 * Revisão pré-deploy: valida variáveis obrigatórias, porta da POSTGRES_URL (Supabase),
 * ligação à base de dados e lint. Evita deploy com configuração que cause 500.
 *
 * Uso: pnpm run predeploy
 * Requer .env.local (ou env) com AUTH_SECRET e POSTGRES_URL (ex.: após vercel:env:prod).
 */
import { execSync } from "node:child_process";
import { config } from "dotenv";

config({ path: ".env" });
config({ path: ".env.local" });

const requiredEnvVars = ["AUTH_SECRET", "POSTGRES_URL"] as const;

function checkEnv(): void {
  for (const name of requiredEnvVars) {
    const value = process.env[name];
    if (!value || value.trim() === "") {
      console.error(`❌ Variável obrigatória em falta ou vazia: ${name}`);
      console.error(
        "   Configura em .env.local ou em Vercel → Environment Variables."
      );
      process.exit(1);
    }
  }
  console.log(
    "✅ Variáveis obrigatórias (AUTH_SECRET, POSTGRES_URL) definidas."
  );
}

function checkPostgresPort(): void {
  const url = process.env.POSTGRES_URL ?? "";
  if (!url.includes("supabase.co")) {
    return;
  }

  if (url.includes(":5432")) {
    console.error("❌ POSTGRES_URL usa a porta 5432 (conexão direta).");
    console.error(
      "   Na Vercel com Supabase é obrigatório usar o pooler: porta 6543."
    );
    console.error(
      "   Supabase → Settings → Database → Connection string → Transaction."
    );
    process.exit(1);
  }
  if (url.includes(":6543")) {
    console.log("✅ POSTGRES_URL usa a porta 6543 (pooler Supabase).");
  }
}

function runDbPing(): void {
  console.log("\n⏳ A verificar ligação à base de dados (db:ping)...");
  try {
    execSync("pnpm run db:ping", {
      stdio: "inherit",
      encoding: "utf-8",
    });
  } catch {
    console.error(
      "   Corrige POSTGRES_URL e/ou aplica migrações (pnpm run db:migrate)."
    );
    process.exit(1);
  }
}

function runLint(): void {
  console.log("\n⏳ A correr lint...");
  try {
    execSync("pnpm run lint", {
      stdio: "inherit",
      encoding: "utf-8",
    });
  } catch {
    console.error("   Corrige os erros de lint com: pnpm run format");
    process.exit(1);
  }
}

function main(): void {
  console.log("Revisão pré-deploy (evitar erro 500 na Vercel)\n");

  checkEnv();
  checkPostgresPort();

  runDbPing();
  runLint();

  console.log("\n✅ Revisão pré-deploy concluída. Podes fazer deploy.");
}

main();
