/**
 * Síntese dos resultados do pipeline multi-chamadas (Opus Redactor).
 */

import { generateText } from "ai";

import { getLanguageModel } from "@/lib/ai/providers";
import { getSynthesisPrompt } from "./synthesis-prompts";
import { makeAbortSignal } from "./concurrency";
import { type BlockResult } from "./types";

// ---------------------------------------------------------------------------
// Síntese dos resultados
// ---------------------------------------------------------------------------

/**
 * Sintetiza os resultados dos blocos num relatório unificado (Opus Redactor).
 *
 * Padrão C: aceita `validationAlerts` do Sonnet Validator para que o Opus
 * possa resolver conflitos inline antes de redigir cada secção.
 */
export async function synthesizeResults(
  blockResults: BlockResult[],
  moduleId: string,
  modelId: string,
  timeoutMs: number,
  maxTokens?: number,
  /** Alertas T001/F001/C001/A001/E001 gerados pelo Sonnet Validator (pré-síntese). */
  validationAlerts?: string,
  signal?: AbortSignal
): Promise<{ report: string; tokensUsed: number }> {
  // Montar contexto com todos os resultados parciais
  const blocksContext = blockResults
    .map((br) => {
      const fieldsStr = Object.entries(br.extractedFields)
        .map(([k, v]) => `  - ${k}: ${v}`)
        .join("\n");
      return `### ${br.blockLabel} (pp. ${br.pageRange[0]}–${br.pageRange[1]})\n${fieldsStr}\n\n${br.rawAnalysis}`;
    })
    .join("\n\n---\n\n");

  const { text, usage } = await generateText({
    model: getLanguageModel(modelId),
    temperature: 0.15,
    maxOutputTokens: maxTokens ?? 16_384,
    abortSignal: makeAbortSignal(timeoutMs, signal),
    // getSynthesisPrompt recebe validationAlerts → Opus conhece os problemas antes de redigir
    system: getSynthesisPrompt(moduleId, validationAlerts),
    prompt: `Extrações parciais dos blocos do processo:\n\n${blocksContext}\n\nGere o relatório unificado em Markdown.`,
    providerOptions: {
      gateway: {
        // System-prompt das 20 seções M03 (~3K tokens, estático por módulo):
        // caching 'auto' → desconto ~90% nos input tokens após 1ª chamada.
        caching: "auto",
        // Opus: Bedrock e Vertex também disponibilizam claude-opus.
        // Se Anthropic direct estiver sobrecarregado, fallback transparente.
        order: ["anthropic", "bedrock", "vertex"],
      },
    },
  });

  return {
    report: text,
    tokensUsed: usage?.totalTokens ?? 0,
  };
}
