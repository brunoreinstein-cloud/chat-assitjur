/**
 * Validação cruzada T001/F001/C001/A001/E001 do pipeline multi-chamadas.
 */

import { generateText } from "ai";

import { getLanguageModel } from "@/lib/ai/providers";
import { extractJsonObject } from "./json-utils";
import { type PhaseType } from "./split-processo-sections";
import { getValidationPrompt } from "./validation-prompts";
import { makeAbortSignal } from "./concurrency";
import { type ValidationScore } from "./types";

// ---------------------------------------------------------------------------
// Chamada de validação cruzada T001/F001/C001 (LLM)
// Prompt dinâmico por módulo — importado de validation-prompts.ts
// ---------------------------------------------------------------------------

export async function runCrossValidation(
  /** Contexto compacto dos blocos: campos extraídos + rawAnalysis (Padrão C — pré-síntese). */
  context: string,
  modelId: string,
  timeoutMs: number,
  blockMeta?: Array<{ label: string; primaryPhase?: PhaseType }>,
  moduleId?: string,
  signal?: AbortSignal
): Promise<{
  score: ValidationScore;
  errors: string[];
  tokensUsed: number;
}> {
  try {
    // Montar metadata de blocos para ajudar a validação a saber quais fases existem
    const metaSection = blockMeta?.length
      ? `\n\nBLOCOS PROCESSADOS:\n${blockMeta.map((b) => `- ${b.label} (fase: ${b.primaryPhase ?? "indefinida"})`).join("\n")}\n\nUse esta informação para determinar se o processo contém seções de audiência (fase instrucao) e/ou execução (fase execucao). Só conte campos de audiência/execução se os blocos correspondentes existirem.`
      : "";

    const { text, usage } = await generateText({
      model: getLanguageModel(modelId),
      temperature: 0.05,
      maxOutputTokens: 2048,
      abortSignal: makeAbortSignal(timeoutMs, signal),
      system: getValidationPrompt(moduleId ?? "DEFAULT"),
      prompt: `Campos extraídos dos blocos (dados brutos, pré-síntese):\n\n${context.slice(0, 80_000)}${metaSection}`,
      providerOptions: {
        gateway: {
          caching: "auto",
          order: ["anthropic", "bedrock", "vertex"],
        },
      },
    });

    // Parse JSON (parser robusto)
    const jsonResult = extractJsonObject(text);
    if (jsonResult) {
      const parsed = jsonResult as {
        temporal_errors?: string[];
        financial_errors?: string[];
        classification_errors?: string[];
        audiencia_errors?: string[];
        execucao_errors?: string[];
        filled_count?: number;
        total_count?: number;
        completude_score?: number;
      };

      const score: ValidationScore = {
        completude: parsed.completude_score ?? 0,
        totalFields: parsed.total_count ?? 19,
        filledFields: parsed.filled_count ?? 0,
        temporalErrors: parsed.temporal_errors ?? [],
        financialErrors: parsed.financial_errors ?? [],
        classificationErrors: parsed.classification_errors ?? [],
        audienciaErrors: parsed.audiencia_errors ?? [],
        execucaoErrors: parsed.execucao_errors ?? [],
      };

      const errors: string[] = [
        ...score.temporalErrors.map((e) => `[T001] ${e}`),
        ...score.financialErrors.map((e) => `[F001] ${e}`),
        ...score.classificationErrors.map((e) => `[C001] ${e}`),
        ...score.audienciaErrors.map((e) => `[A001] ${e}`),
        ...score.execucaoErrors.map((e) => `[E001] ${e}`),
      ];

      return { score, errors, tokensUsed: usage?.totalTokens ?? 0 };
    }

    // Fallback se não conseguiu parsear
    return {
      score: {
        completude: 0,
        totalFields: 19,
        filledFields: 0,
        temporalErrors: [],
        financialErrors: [],
        classificationErrors: [],
        audienciaErrors: [],
        execucaoErrors: [],
      },
      errors: ["Validação cruzada: resposta não parseável"],
      tokensUsed: usage?.totalTokens ?? 0,
    };
  } catch {
    // Timeout ou erro — não bloquear pipeline
    return {
      score: {
        completude: 0,
        totalFields: 19,
        filledFields: 0,
        temporalErrors: [],
        financialErrors: [],
        classificationErrors: [],
        audienciaErrors: [],
        execucaoErrors: [],
      },
      errors: ["Validação cruzada: timeout ou erro na chamada"],
      tokensUsed: 0,
    };
  }
}

// ---------------------------------------------------------------------------
// Validação de referências de página (local, sem LLM)
// ---------------------------------------------------------------------------

/**
 * Verifica se campos com valores no relatório possuem referência de folha (fl. XXX).
 * Retorna lista de campos sem referência.
 */
export function validatePageReferences(report: string): string[] {
  const errors: string[] = [];
  // Padrão: **Campo:** Valor — esperamos (fl. X) em algum lugar do valor
  const fieldPattern =
    /\*\*([^*]+)\*\*:\s*(?!Não localizado|---|-{2,}|NÃO LOCALIZADO|N\/A)(.+)/g;
  let match: RegExpExecArray | null = fieldPattern.exec(report);
  while (match !== null) {
    const fieldName = match[1].trim();
    const value = match[2].trim();
    // Ignorar campos sem valor real
    if (value.length < 3) {
      continue;
    }
    // Verificar se contém referência de folha
    if (!(/\(?\s*fl\.\s*\d+/i.test(value) || /\[Pag\.\s*\d+\]/i.test(value))) {
      errors.push(
        `Campo "${fieldName}" sem referência de página: "${value.slice(0, 60)}..."`
      );
    }
    match = fieldPattern.exec(report);
  }
  return errors;
}
