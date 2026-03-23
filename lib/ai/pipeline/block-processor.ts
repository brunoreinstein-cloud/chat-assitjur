/**
 * Processamento de blocos individuais do pipeline multi-chamadas.
 */

import { generateText } from "ai";

import { getLanguageModel } from "@/lib/ai/providers";
import { makeAbortSignal } from "./concurrency";
import {
  BLOCK_MAX_OUTPUT_TOKENS_CRITICAL,
  BLOCK_MAX_OUTPUT_TOKENS_DEFAULT,
  CRITICAL_BLOCK_LABELS,
  MAX_BLOCK_CHARS,
} from "./constants";
import {
  getBlockExtractionPrompt,
  humanizeBlockLabel,
} from "./extraction-prompts";
import { extractJsonObject } from "./json-utils";
import type { ProcessoBlock } from "./split-processo-sections";
import type { BlockResult } from "./types";

// ---------------------------------------------------------------------------
// Processamento de bloco individual
// ---------------------------------------------------------------------------

export async function processBlock(
  block: ProcessoBlock,
  modelId: string,
  timeoutMs: number,
  maxOutputTokens?: number,
  signal?: AbortSignal
): Promise<BlockResult> {
  // Sub-blocos já garantem que o texto está dentro do limite.
  // Segurança extra: truncar com aviso se ainda exceder (não deveria acontecer).
  const blockText =
    block.text.length > MAX_BLOCK_CHARS
      ? `${block.text.slice(0, MAX_BLOCK_CHARS)}\n\n[... bloco truncado por segurança ...]`
      : block.text;

  // Budget adaptativo: blocos críticos (Sentença, Acórdão, Cálculos…) ficam com
  // 4096 tokens; restantes usam 2048 — reduz o tempo de geração por bloco ~30%.
  const effectiveMaxTokens =
    maxOutputTokens ??
    (CRITICAL_BLOCK_LABELS.test(block.label)
      ? BLOCK_MAX_OUTPUT_TOKENS_CRITICAL
      : BLOCK_MAX_OUTPUT_TOKENS_DEFAULT);

  const { text, usage } = await generateText({
    model: getLanguageModel(modelId),
    temperature: 0.1,
    maxOutputTokens: effectiveMaxTokens,
    abortSignal: makeAbortSignal(timeoutMs, signal),
    system: getBlockExtractionPrompt(block.label, block.primaryPhase),
    prompt: `Analise o seguinte trecho do processo (páginas ${block.pageRange[0]} a ${block.pageRange[1]}):\n\n${blockText}`,
    providerOptions: {
      gateway: {
        // Prompt caching automático: Anthropic cacheia o system-prompt estático
        // (mesmo prompt por tipo de bloco) → desconto ~90% nos input tokens.
        caching: "auto",
        // Provider routing: se Anthropic direct atingir rate limit (429),
        // o Gateway faz fallback automático para Bedrock → Vertex.
        // Requer BYOK configurado no dashboard Vercel para cada provider.
        order: ["anthropic", "bedrock", "vertex"],
      },
    },
  });

  // Parse JSON da resposta (parser robusto com fallback em camadas)
  let extractedFields: Record<string, string> = {};
  let rawAnalysis = text;

  const parsed = extractJsonObject(text) as {
    fields?: Record<string, string>;
    analysis?: string;
  } | null;

  if (parsed?.fields) {
    extractedFields = parsed.fields;
    rawAnalysis = parsed.analysis ?? text;
  }

  return {
    blockLabel: block.label,
    pageRange: block.pageRange,
    extractedFields,
    rawAnalysis,
    tokensUsed: usage?.totalTokens ?? 0,
  };
}

// ---------------------------------------------------------------------------
// Retry para blocos críticos
// ---------------------------------------------------------------------------

export async function processBlockWithRetry(
  block: ProcessoBlock,
  modelId: string,
  timeoutMs: number,
  maxRetries: number,
  onProgress?: (message: string) => void,
  signal?: AbortSignal
): Promise<BlockResult> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const effectiveTimeout =
        attempt === 0 ? timeoutMs : Math.round(timeoutMs * 1.5);
      return await processBlock(
        block,
        modelId,
        effectiveTimeout,
        undefined,
        signal
      );
    } catch (error) {
      lastError = error;
      // Se o sinal externo foi abortado (utilizador cancelou / maxDuration atingido),
      // não tentar novamente — propagar o cancelamento imediatamente.
      if (signal?.aborted) {
        break;
      }
      if (attempt < maxRetries) {
        const waitMs = 2000 * (attempt + 1);
        // Retry transparente — o advogado não precisa saber dos detalhes internos
        onProgress?.(
          `🔄 Relendo ${humanizeBlockLabel(block.label)} (aguardando ${waitMs / 1000}s)...`
        );
        await new Promise((resolve) => setTimeout(resolve, waitMs));
      }
    }
  }

  // Todas as tentativas falharam (ou operação cancelada)
  throw lastError;
}

// ---------------------------------------------------------------------------
// Divisão de blocos grandes em sub-blocos
// ---------------------------------------------------------------------------

export function splitBlockIntoSubBlocks(
  block: ProcessoBlock,
  maxChars: number
): ProcessoBlock[] {
  const text = block.text;
  const subBlocks: ProcessoBlock[] = [];

  // Encontrar todos os marcadores [Pag. N] com suas posições
  const pageMarkers: Array<{ offset: number; page: number }> = [];
  const PAGE_RE = /\[Pag\.\s*(\d+)\]/g;
  for (const match of text.matchAll(PAGE_RE)) {
    pageMarkers.push({
      offset: match.index,
      page: Number.parseInt(match[1], 10),
    });
  }

  // Se poucos marcadores, dividir pela metade do texto
  if (pageMarkers.length < 2) {
    const mid = Math.floor(text.length / 2);
    subBlocks.push({
      label: block.label,
      sections: block.sections,
      text: text.slice(0, mid),
      pageRange: [block.pageRange[0], block.pageRange[0]],
      primaryPhase: block.primaryPhase,
    });
    subBlocks.push({
      label: block.label,
      sections: block.sections,
      text: text.slice(mid),
      pageRange: [block.pageRange[0], block.pageRange[1]],
      primaryPhase: block.primaryPhase,
    });
    return subBlocks;
  }

  // Dividir nos marcadores mais próximos dos limites de maxChars
  let startOffset = 0;
  let startPage = block.pageRange[0];

  while (startOffset < text.length) {
    const endTarget = startOffset + maxChars;

    if (endTarget >= text.length) {
      // Último sub-bloco
      subBlocks.push({
        label: block.label,
        sections: block.sections,
        text: text.slice(startOffset),
        pageRange: [startPage, block.pageRange[1]],
        primaryPhase: block.primaryPhase,
      });
      break;
    }

    // Encontrar o marcador [Pag. N] mais próximo (antes) do endTarget
    let bestMarker = pageMarkers.find((m) => m.offset >= endTarget);
    if (!bestMarker) {
      // Sem marcador após endTarget, usar o último disponível antes
      bestMarker = [...pageMarkers]
        .reverse()
        .find((m) => m.offset > startOffset && m.offset <= endTarget);
    }

    const splitAt = bestMarker?.offset ?? endTarget;
    const endPage = bestMarker?.page ?? startPage;

    subBlocks.push({
      label: block.label,
      sections: block.sections,
      text: text.slice(startOffset, splitAt),
      pageRange: [startPage, endPage],
      primaryPhase: block.primaryPhase,
    });

    startOffset = splitAt;
    startPage = endPage;
  }

  return subBlocks;
}
