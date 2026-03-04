/**
 * Benchmark de modelos LLM: mesma pergunta a vários modelos, mede latência, tokens e custo (créditos).
 * Uso: pnpm run benchmark:llm   ou   pnpm run benchmark:llm -- anthropic/claude-sonnet-4.5 google/gemini-2.5-flash-lite
 *
 * Requer AI_GATEWAY_API_KEY (ou config Vercel) em .env.local.
 * Opcional: BENCHMARK_PROMPT para customizar a pergunta (default: pergunta jurídica curta).
 */

import { generateText } from "ai";
import { config } from "dotenv";
import { tokensToCredits } from "../lib/ai/credits";
import { chatModels, nonReasoningChatModelIds } from "../lib/ai/models";
import { getLanguageModel } from "../lib/ai/providers";

config({ path: ".env" });
config({ path: ".env.local" });

const DEFAULT_PROMPT =
  "Em uma frase, qual o prazo prescricional bienal na CLT para ações que versem sobre verbas rescisórias? Responde só a pergunta, sem introdução.";

const MAX_OUTPUT_TOKENS = 256;

interface Usage {
  promptTokens: number;
  completionTokens: number;
}

function getUsage(usage: {
  inputTokens?: number;
  outputTokens?: number;
  promptTokens?: number;
  completionTokens?: number;
}): Usage {
  const promptTokens = usage.promptTokens ?? usage.inputTokens ?? 0;
  const completionTokens = usage.completionTokens ?? usage.outputTokens ?? 0;
  return { promptTokens, completionTokens };
}

interface BenchmarkResult {
  modelId: string;
  modelName: string;
  provider: string;
  latencyMs: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  credits: number;
  success: boolean;
  error?: string;
  responsePreview?: string;
}

async function runModel(
  modelId: string,
  prompt: string
): Promise<BenchmarkResult> {
  const meta = chatModels.find((m) => m.id === modelId);
  const modelName = meta?.name ?? modelId;
  const provider = meta?.provider ?? "?";

  const start = Date.now();
  try {
    const model = getLanguageModel(modelId);
    const result = await generateText({
      model,
      prompt,
      maxOutputTokens: MAX_OUTPUT_TOKENS,
    });

    const latencyMs = Date.now() - start;
    const usage = getUsage(result.usage ?? {});
    const totalTokens = usage.promptTokens + usage.completionTokens;
    const credits = tokensToCredits(usage.promptTokens, usage.completionTokens);
    const raw = result.text?.trim().slice(0, 80) ?? "";
    const oneLine = raw.replaceAll("\n", " ");
    const suffix = (result.text?.length ?? 0) > 80 ? "…" : "";
    const responsePreview = oneLine.length > 0 ? `${oneLine}${suffix}` : "";

    return {
      modelId,
      modelName,
      provider,
      latencyMs,
      promptTokens: usage.promptTokens,
      completionTokens: usage.completionTokens,
      totalTokens,
      credits,
      success: true,
      responsePreview: responsePreview.length > 0 ? responsePreview : undefined,
    };
  } catch (err) {
    const latencyMs = Date.now() - start;
    const errorMessage = err instanceof Error ? err.message : String(err);
    return {
      modelId,
      modelName,
      provider,
      latencyMs,
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      credits: 0,
      success: false,
      error: errorMessage,
    };
  }
}

function formatTable(results: BenchmarkResult[]): string {
  const header =
    "Modelo                          | Latência  | Input | Output | Total  | Créditos | OK   ";
  const sep = "-".repeat(header.length);
  const lines = results.map((r) => {
    const name = r.modelName.slice(0, 30).padEnd(30);
    const lat = `${r.latencyMs} ms`.padStart(9);
    const inp = String(r.promptTokens).padStart(5);
    const out = String(r.completionTokens).padStart(6);
    const tot = String(r.totalTokens).padStart(5);
    const cred = String(r.credits).padStart(7);
    const ok = r.success ? "✓" : "✗";
    return `${name} | ${lat} | ${inp} | ${out} | ${tot} | ${cred} | ${ok}   `;
  });
  return [header, sep, ...lines].join("\n");
}

async function main() {
  const args = process.argv.slice(2);
  const customPrompt = process.env.BENCHMARK_PROMPT;

  const prompt = customPrompt ?? DEFAULT_PROMPT;

  const modelIds =
    args.length > 0
      ? args
      : nonReasoningChatModelIds.filter(
          (id) => !(id.includes("gpt-5.2") || id.includes("gemini-3"))
        );

  if (!(process.env.AI_GATEWAY_API_KEY || process.env.VERCEL)) {
    console.warn(
      "⚠️  AI_GATEWAY_API_KEY não definida. Defina em .env.local para o benchmark funcionar."
    );
  }

  console.log("Benchmark LLM — mesma pergunta, vários modelos\n");
  console.log("Prompt:", prompt.slice(0, 80) + (prompt.length > 80 ? "…" : ""));
  console.log("\nModelos:", modelIds.join(", "));
  console.log("\nA executar…\n");

  const results: BenchmarkResult[] = [];

  for (const modelId of modelIds) {
    process.stdout.write(`  ${modelId} … `);
    const result = await runModel(modelId, prompt);
    results.push(result);
    if (result.success) {
      console.log(`${result.latencyMs} ms, ${result.totalTokens} tokens`);
    } else {
      console.log(`ERRO: ${result.error?.slice(0, 50)}`);
    }
  }

  console.log(`\n${formatTable(results)}`);

  const withPreview = results.filter((r) => r.responsePreview);
  if (withPreview.length > 0) {
    console.log(
      "\n--- Pré-visualização das respostas (primeiros ~80 chars) ---"
    );
    for (const r of withPreview) {
      console.log(`\n${r.modelName}:`);
      console.log(`  ${r.responsePreview}`);
    }
  }

  const failed = results.filter((r) => !r.success);
  if (failed.length > 0) {
    console.log("\n--- Erros ---");
    for (const r of failed) {
      console.log(`${r.modelId}: ${r.error}`);
    }
  }

  console.log(
    "\nNota: Créditos = ceil(totalTokens/1000) (fórmula do projeto). Custo real depende do preço por modelo no AI Gateway / fornecedor."
  );
}

main().then(
  () => process.exit(0),
  (err: unknown) => {
    console.error(err);
    process.exit(1);
  }
);
