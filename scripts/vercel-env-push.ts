/**
 * Envia variáveis de .env.local para a Vercel (Production) via CLI.
 * Usar após atualizar .env.local (ex.: migração para novo Supabase Pro).
 *
 * Variáveis enviadas: POSTGRES_URL, NEXT_PUBLIC_SUPABASE_URL,
 * NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY.
 *
 * Pré-requisitos: `vercel link` já executado; Vercel CLI instalada (npx vercel).
 *
 * Uso: pnpm run vercel:env:push
 * Ou:  pnpm exec tsx scripts/vercel-env-push.ts
 */
import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

const ENV_FILE = path.resolve(process.cwd(), ".env.local");
const VAR_KEYS = [
  "POSTGRES_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
] as const;
/** Apenas production; preview na CLI atual pede branch mesmo com --yes — definir no dashboard ou manualmente. */
const ENVIRONMENTS = ["production"] as const;

function getValueFromEnvFile(key: string): string | null {
  if (!fs.existsSync(ENV_FILE)) {
    return null;
  }
  const content = fs.readFileSync(ENV_FILE, "utf-8");
  const line = content
    .split(/\r?\n/)
    .find((l) => l.startsWith(`${key}=`) && !l.startsWith("#"));
  if (!line) {
    return null;
  }
  const raw = line.slice(key.length + 1).trim();
  if (raw.startsWith('"') && raw.endsWith('"')) {
    return raw.slice(1, -1).replaceAll(String.raw`\"`, '"');
  }
  if (raw.startsWith("'") && raw.endsWith("'")) {
    return raw.slice(1, -1).replaceAll(String.raw`\'`, "'");
  }
  return raw;
}

function main(): void {
  if (!fs.existsSync(ENV_FILE)) {
    console.error("Ficheiro .env.local não encontrado.");
    process.exit(1);
  }

  console.log(
    "A enviar variáveis de .env.local para a Vercel (Production)...\n"
  );

  for (const key of VAR_KEYS) {
    const value = getValueFromEnvFile(key);
    if (!value) {
      console.warn(`⚠️  ${key}: não encontrado em .env.local, ignorado.`);
      continue;
    }

    for (const env of ENVIRONMENTS) {
      try {
        execSync(`npx vercel env rm ${key} ${env} --yes`, {
          stdio: "pipe",
          shell: true,
        });
      } catch {
        // Variável pode não existir
      }
      execSync(`npx vercel env add ${key} ${env}`, {
        input: value,
        stdio: ["pipe", "inherit", "inherit"],
        shell: true,
      });
      console.log(`✅ ${key} → ${env}`);
    }
  }

  console.log(
    "\nConcluído (variáveis definidas para Production). Faz redeploy (ex.: pnpm run vercel:deploy:prod) para aplicar."
  );
  console.log(
    "Para Preview: no dashboard Vercel → Settings → Environment Variables podes copiar de Production para Preview, ou definir manualmente."
  );
}

main();
