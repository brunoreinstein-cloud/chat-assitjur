/**
 * Gera variáveis de ambiente para .env.local a partir do projeto Supabase ligado.
 * Uso: pnpm exec tsx scripts/supabase-env.ts
 * Copia o output para .env.local ou: pnpm exec tsx scripts/supabase-env.ts >> .env.local
 */
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { join } from "node:path";

const projectRefPath = join(process.cwd(), "supabase", ".temp", "project-ref");
let projectRef: string;
try {
  projectRef = readFileSync(projectRefPath, "utf8").trim();
} catch {
  console.error("Projeto não vinculado. Execute: pnpm run supabase:link");
  process.exit(1);
}

const url = `https://${projectRef}.supabase.co`;
console.log(`NEXT_PUBLIC_SUPABASE_URL=${url}`);

try {
  const out = execSync("pnpm exec supabase projects api-keys -o env", {
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  });
  const lines = out.trim().split("\n");
  for (const line of lines) {
    if (line.startsWith("SUPABASE_ANON_KEY=")) {
      const value = line.slice("SUPABASE_ANON_KEY=".length).replace(/^"|"$/g, "");
      console.log(`NEXT_PUBLIC_SUPABASE_ANON_KEY=${value}`);
    } else if (line.startsWith("SUPABASE_SERVICE_ROLE_KEY=")) {
      const value = line
        .slice("SUPABASE_SERVICE_ROLE_KEY=".length)
        .replace(/^"|"$/g, "");
      console.log(`SUPABASE_SERVICE_ROLE_KEY=${value}`);
    }
  }
} catch (err) {
  console.error("Erro ao obter API keys. Execute antes: pnpm exec supabase login");
  process.exit(1);
}
