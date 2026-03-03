/**
 * Testa a conexão ao modelo (AI Gateway / fornecedor) com uma chamada mínima.
 * Uso: pnpm run health:ai   ou   tsx scripts/check-ai-connection.ts
 *
 * Requer AI_GATEWAY_API_KEY (ou config do Vercel AI Gateway) no .env.local.
 */

import { generateText } from "ai";
import { config } from "dotenv";
import { getTitleModel } from "../lib/ai/providers";

config({ path: ".env" });
config({ path: ".env.local" });

const HEALTH_PROMPT = "Reply with exactly: OK";
const HEALTH_MAX_TOKENS = 5;

async function run() {
  if (!(process.env.AI_GATEWAY_API_KEY || process.env.VERCEL)) {
    console.warn(
      "⚠️  AI_GATEWAY_API_KEY não definida (em local é necessária para o AI Gateway)."
    );
  }

  const start = Date.now();
  try {
    const model = getTitleModel();
    const { text } = await generateText({
      model,
      prompt: HEALTH_PROMPT,
      maxTokens: HEALTH_MAX_TOKENS,
    });
    const ms = Date.now() - start;
    const trimmed = text?.trim().toUpperCase();
    if (trimmed !== "OK") {
      console.error("❌ Resposta inesperada do modelo:", trimmed ?? "(vazia)");
      process.exit(1);
    }
    console.log(`✅ Conexão ao modelo OK (${ms} ms)`);
    process.exit(0);
  } catch (err) {
    const ms = Date.now() - start;
    console.error("❌ Erro ao contactar o modelo:");
    console.error(err instanceof Error ? err.message : err);
    console.error(`   (falhou após ${ms} ms)`);
    process.exit(1);
  }
}

run();
