import { after } from "next/server";
import { createResumableStreamContext } from "resumable-stream";
import { isChatDebugEnabled, logChatDebug } from "@/lib/ai/chat-debug";
import {
  MAX_CHARS_PER_DOCUMENT,
  MAX_TOTAL_DOC_CHARS,
} from "@/lib/ai/context-window";
import { buildSmartDocumentContext } from "@/lib/ai/document-context";
import {
  extractStructuredFields,
  formatStructuredFieldsAsHeader,
} from "@/lib/ai/extract-structured-fields";
import { stripImageParts } from "@/lib/ai/multimodal";
import { getPromptCachingCacheControl } from "@/lib/ai/prompt-caching-config";
import type { ChatMessage } from "@/lib/types";
import {
  MAX_DOCUMENT_PART_TEXT_DB_LENGTH,
  MAX_DOCUMENT_PART_TEXT_LENGTH,
  type PostRequestBody,
} from "../../schema";

export const isDev = process.env.NODE_ENV === "development";
/** Quando true, não consulta nem deduz créditos (para diagnóstico de latência). */
export const creditsDisabled = process.env.DISABLE_CREDITS === "true";

/** Indica se o modelo é Anthropic (Claude), para aplicar prompt caching quando suportado. */
export function isAnthropicModel(modelId: string): boolean {
  return modelId.includes("anthropic") || modelId.includes("claude");
}

/**
 * Adiciona cache_control à última mensagem para modelos Anthropic (prompt caching).
 * Reduz custo e latência em conversas multi-turn ao reutilizar o prefixo em cache.
 * Respeita PROMPT_CACHING_ENABLED e PROMPT_CACHING_TTL.
 * Ver: https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching
 */
export function withPromptCachingForAnthropic<
  T extends { providerOptions?: unknown },
>(modelId: string, messages: T[]): T[] {
  const cacheControl = getPromptCachingCacheControl();
  if (
    messages.length === 0 ||
    !isAnthropicModel(modelId) ||
    cacheControl === null
  ) {
    return messages;
  }
  const lastIndex = messages.length - 1;
  const last = messages[lastIndex];
  const baseOptions =
    typeof last.providerOptions === "object" && last.providerOptions !== null
      ? last.providerOptions
      : {};
  const augmented: T = {
    ...last,
    providerOptions: {
      ...baseOptions,
      anthropic: { cacheControl },
    },
  };
  return [...messages.slice(0, lastIndex), augmented];
}

export function logTiming(label: string, ms: number): void {
  if (isDev) {
    console.info(`[chat-timing] ${label}: ${Math.round(ms)}ms`);
  }
  if (isChatDebugEnabled()) {
    logChatDebug(`timing: ${label}`, ms);
  }
}

/** Em dev, envolve uma promise e regista quando resolve (para localizar travagens no batch). */
export function withTimingLog<T>(label: string, p: Promise<T>): Promise<T> {
  if (!isDev) {
    return p;
  }
  const start = Date.now();
  return p.finally(() => {
    console.info(
      `[chat-timing] dbBatch: ${label} done in ${Math.round(Date.now() - start)}ms`
    );
  });
}

/** Evita que uma query lenta bloqueie o batch: após ms resolve com fallback. Cold start pode deixar várias queries à espera. */
export function withFallbackTimeout<T>(
  label: string,
  p: Promise<T>,
  ms: number,
  fallback: T,
  onFallback?: () => void
): Promise<T> {
  return Promise.race([
    p.then((v) => ({ type: "query" as const, value: v })),
    new Promise<{ type: "timeout" }>((resolve) =>
      setTimeout(() => resolve({ type: "timeout" }), ms)
    ),
  ])
    .then((result) => {
      if (result.type === "timeout") {
        onFallback?.();
        if (isDev) {
          console.warn(
            `[chat-timing] dbBatch: ${label} timeout após ${ms}ms, a usar fallback`
          );
        }
        return fallback;
      }
      return result.value;
    })
    .catch((err: unknown) => {
      onFallback?.();
      if (isDev) {
        console.error(
          `[chat-timing] dbBatch: ${label} falhou com erro real:`,
          err instanceof Error ? err.message : err
        );
      }
      return fallback;
    });
}

export interface DocumentPartLike {
  type: "document";
  name?: string;
  text?: string;
  documentType?: "pi" | "contestacao";
}

const DOC_TYPE_ORDER: Record<string, number> = {
  pi: 0,
  contestacao: 1,
  "": 2,
};

/** Escapa valor para uso em atributo XML (title, etc.). */
export function escapeXmlAttr(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

/** Envolve conteúdo em tag <document> dentro de <knowledge_base> para o modelo referenciar por id/título. */
export function wrapKnowledgeDocument(
  id: string,
  title: string,
  content: string
): string {
  const safeTitle = escapeXmlAttr(title);
  const safeContent = content.includes("]]>")
    ? content.replaceAll("]]>", "]]>]]><![CDATA[>")
    : content;
  const cdataBody = safeContent.length > 0 ? `<![CDATA[${safeContent}]]>` : "";
  return `<document id="${id}" title="${safeTitle}">${cdataBody}</document>`;
}

/** Na PI, ao truncar, preservar este número de caracteres do final (OAB/assinaturas). */
export const PI_TAIL_CHARS = 8000;

/** Últimas N mensagens a carregar para contexto (reduz BD e tamanho do prompt; a qualidade mantém-se com contexto recente). */
export const CHAT_MESSAGES_LIMIT = 80;

/** Timeouts e limites do batch de BD (runChatDbBatch). */
export const DB_BATCH_TIMEOUT_MS = 120_000;
/** Fallback por query: 12s para falhar mais cedo em serverless (Vercel 60s); deixa margem ao stream. */
export const PER_QUERY_TIMEOUT_MS = 12_000;
export const CREDITS_IN_BATCH_TIMEOUT_MS = 12_000;
/** Limite usado na chave do cache de créditos (igual ao default de GET /api/credits). */
export const CREDITS_CACHE_USAGE_LIMIT = 10;

export function getDocumentPartLabel(documentType: string | undefined): string {
  if (documentType === "pi") {
    return "Petição Inicial";
  }
  if (documentType === "contestacao") {
    return "Contestação";
  }
  return "Documento";
}

/**
 * Trunca texto de documento para o contexto do LLM.
 *
 * Para documentos paginados (com marcadores [Pag. N]) com mais de 200K chars
 * (tipicamente exports PJe com 500+ páginas), usa extração inteligente de secções:
 * filtra páginas de assinatura, inclui sempre o início, as secções juridicamente
 * relevantes (Sentença, Contestação, Laudo, etc.) e o índice final do PJe.
 *
 * Para documentos mais curtos ou sem paginação, usa truncagem simples (comportamento
 * anterior: início + cauda OAB para PI).
 */
export function truncateDocumentText(
  text: string,
  maxChars: number,
  documentType: string | undefined
): string {
  if (text.length <= maxChars) {
    return text;
  }

  // Documentos grandes paginados (exports PJe, processos completos) → extração inteligente.
  // Threshold: 200K chars ≈ 120 páginas → processo completo, não apenas PI/contestação isolada.
  const isPaginatedLargeDoc = text.length > 200_000 && text.includes("[Pag.");
  if (isPaginatedLargeDoc) {
    return buildSmartDocumentContext(text, maxChars, documentType);
  }

  // Documentos pequenos/médios → comportamento original (início + cauda OAB para PI)
  const notice = "\n\n[... texto truncado para caber no limite do modelo ...]";
  const needPiTail =
    documentType === "pi" && maxChars > PI_TAIL_CHARS * 2 + notice.length;
  if (needPiTail) {
    const startLen = maxChars - PI_TAIL_CHARS - notice.length - 2; // 2 = "\n\n"
    const cutPoint = findLastPageMarker(text, startLen);
    return `${text.slice(0, cutPoint)}${notice}\n\n${text.slice(-PI_TAIL_CHARS)}`;
  }
  const cutPoint = findLastPageMarker(text, maxChars);
  return text.slice(0, cutPoint) + notice;
}

/** Encontra a posição do último marcador [Pag. N] antes de maxPos. Fallback: maxPos. */
export function findLastPageMarker(text: string, maxPos: number): number {
  const PAGE_MARKER_RE = /\[Pag\.\s*\d+\]/g;
  let lastMarkerStart = maxPos;
  for (const match of text.matchAll(PAGE_MARKER_RE)) {
    if (match.index > maxPos) {
      break;
    }
    lastMarkerStart = match.index;
  }
  // Se encontrou marcador e está razoavelmente perto do limite (>80%), usar
  return lastMarkerStart > maxPos * 0.8 ? lastMarkerStart : maxPos;
}

/** Regra obrigatória de referência de página para todos os documentos. */
const PAGE_REF_RULE =
  "REGRA: Para cada valor extraído, citar a folha (fl. XXX) baseada nos marcadores [Pag. N] do texto. Sem referência = 'Não localizado nos autos'.";

/** Dica curta para o modelo localizar dados rapidamente (reduz releituras). */
export function getDocumentPartExtractionHint(
  documentType: string | undefined
): string {
  if (documentType === "pi") {
    return `${PAGE_REF_RULE} Extrair prioritariamente: número do processo, vara, partes, DAJ, Admissão/Término/Rescisão (início); OAB e audiência (Notificação Judicial PJe; assinaturas ao final).`;
  }
  if (documentType === "contestacao") {
    return `${PAGE_REF_RULE} Extrair prioritariamente: dados do contrato, DTC, teses e impugnações por pedido; usar mapeamento pedido×prova.`;
  }
  return PAGE_REF_RULE;
}

export function fillKnowledgeFromFullDocsWhenEmpty(
  parts: string[],
  docs: Array<{
    id: string;
    title: string;
    content: string;
    structuredSummary?: string | null;
  }>
): void {
  const shouldFillFromFullDocs = parts.length === 0;
  if (shouldFillFromFullDocs) {
    for (const doc of docs) {
      // Documentos com resumo estruturado já foram injetados antes; usar conteúdo bruto só sem resumo
      if (!doc.structuredSummary) {
        parts.push(wrapKnowledgeDocument(doc.id, doc.title, doc.content));
      }
    }
  }
}

/**
 * Indica se uma parte de mensagem é válida para o AI SDK (convertToModelMessages).
 * Partes "document" são sempre inválidas (devem ser convertidas em "text" antes).
 * Partes "file" precisam de url e mediaType. Partes tool-* precisam de toolCallId.
 */
export function isPartValidForModel(part: unknown): boolean {
  const p = part as {
    type?: string;
    url?: string;
    mediaType?: string;
    toolCallId?: string;
  };
  const type = p?.type;
  if (typeof type !== "string") {
    return false;
  }
  if (type === "document") {
    return false;
  }
  if (type === "file") {
    return (
      typeof p.url === "string" &&
      p.url.length > 0 &&
      typeof p.mediaType === "string" &&
      p.mediaType.length > 0
    );
  }
  if (type.startsWith("tool-")) {
    return typeof p.toolCallId === "string" && p.toolCallId.length > 0;
  }
  return true;
}

/**
 * Converte partes do tipo "document" (PDF/DOCX) em partes "text" para o modelo.
 * Ordena PI antes de Contestação. Trunca texto para não exceder o limite do modelo.
 * Remove partes inválidas para o AI SDK (ex.: tool sem toolCallId vindas da BD).
 *
 * Multi-Modal Agent: se supportsVision=false, substitui partes de imagem por
 * placeholders textuais (evita erros de API em modelos sem visão).
 */
export function normalizeMessageParts(
  messages: ChatMessage[],
  supportsVision = true
): ChatMessage[] {
  return messages.map((msg) => {
    if (!msg.parts?.length) {
      return msg;
    }
    const isDocumentPart = (part: unknown): part is DocumentPartLike =>
      typeof part === "object" &&
      part !== null &&
      "type" in part &&
      (part as Record<string, unknown>).type === "document";
    const documentParts = msg.parts.filter(
      isDocumentPart
    ) as unknown as DocumentPartLike[];
    const otherParts = msg.parts.filter((part) => !isDocumentPart(part));

    const sortedDocs = [...documentParts].sort((a, b) => {
      const orderA = DOC_TYPE_ORDER[a.documentType ?? ""] ?? 2;
      const orderB = DOC_TYPE_ORDER[b.documentType ?? ""] ?? 2;
      return orderA - orderB;
    });

    let totalDocChars = 0;
    const docTextParts = sortedDocs.flatMap((p) => {
      if (typeof p.text !== "string" || !p.name) {
        return [];
      }
      const remaining = Math.max(0, MAX_TOTAL_DOC_CHARS - totalDocChars);
      if (remaining <= 0) {
        return [];
      }

      // Extração regex no texto COMPLETO (antes da truncagem)
      const regexFields = extractStructuredFields(p.text);
      const regexHeader = formatStructuredFieldsAsHeader(regexFields);

      const maxForThis = Math.min(MAX_CHARS_PER_DOCUMENT, remaining);
      const truncated = truncateDocumentText(
        p.text,
        maxForThis,
        p.documentType
      );
      totalDocChars += truncated.length + regexHeader.length;
      const label = getDocumentPartLabel(p.documentType);
      const hint = getDocumentPartExtractionHint(p.documentType);
      const headerParts = [`[${label}: ${p.name}]`];
      if (hint) {
        headerParts.push(hint);
      }
      if (regexHeader) {
        headerParts.push(regexHeader);
      }
      const header = `${headerParts.join("\n")}\n\n`;
      return [
        {
          type: "text" as const,
          text: `${header}${truncated}`,
        },
      ];
    });

    const normalizedOther = otherParts.flatMap((part) => {
      const p = part as { type?: string; text?: string };
      if (p.type === "text" && (p.text?.trim().length ?? 0) === 0) {
        return [];
      }
      if (!isPartValidForModel(part)) {
        return [];
      }
      return [part];
    });

    const combinedParts = [...docTextParts, ...normalizedOther].filter(
      isPartValidForModel
    );
    // Multi-Modal Agent: remove imagens para modelos sem visão
    const normalizedParts = supportsVision
      ? combinedParts
      : (stripImageParts(combinedParts) as typeof combinedParts);
    return { ...msg, parts: normalizedParts };
  });
}

export function getStreamContext() {
  try {
    return createResumableStreamContext({ waitUntil: after });
  } catch {
    return null;
  }
}

const TRUNCATE_SUFFIX =
  "\n\n[Truncado: o documento excedeu o limite de caracteres.]";

type UserMessagePart = NonNullable<PostRequestBody["message"]>["parts"][number];

/** Trunca o texto de partes "document" que excedam MAX_DOCUMENT_PART_TEXT_LENGTH. Devolve novo array (imutável). */
export function truncateDocumentParts(
  parts: UserMessagePart[]
): UserMessagePart[] {
  const maxLen = MAX_DOCUMENT_PART_TEXT_LENGTH - TRUNCATE_SUFFIX.length;
  return parts.map((part) => {
    if (
      part &&
      typeof part === "object" &&
      part.type === "document" &&
      typeof part.text === "string" &&
      part.text.length > MAX_DOCUMENT_PART_TEXT_LENGTH
    ) {
      return { ...part, text: part.text.slice(0, maxLen) + TRUNCATE_SUFFIX };
    }
    return part;
  });
}

/**
 * Trunca partes "document" para armazenamento na BD (limite muito menor que o do LLM).
 * O LLM recebe o texto completo (até MAX_DOCUMENT_PART_TEXT_LENGTH); a BD guarda apenas
 * o excerto inicial (MAX_DOCUMENT_PART_TEXT_DB_LENGTH) para histórico/UI.
 * Reduz INSERT de ~2M chars para ~100K → ~20× mais rápido.
 */
export function truncateDocumentPartsForDb(
  parts: UserMessagePart[]
): UserMessagePart[] {
  const dbSuffix = "\n\n[Texto completo disponível apenas durante a sessão.]";
  const maxLen = MAX_DOCUMENT_PART_TEXT_DB_LENGTH - dbSuffix.length;
  return parts.map((part) => {
    if (
      part &&
      typeof part === "object" &&
      part.type === "document" &&
      typeof part.text === "string" &&
      part.text.length > MAX_DOCUMENT_PART_TEXT_DB_LENGTH
    ) {
      return { ...part, text: part.text.slice(0, maxLen) + dbSuffix };
    }
    return part;
  });
}

/** Aplica truncagem de partes "document" ao body já parseado (imutável). */
export function truncateDocumentPartsInBody(
  body: PostRequestBody
): PostRequestBody {
  const message = body.message
    ? { ...body.message, parts: truncateDocumentParts(body.message.parts) }
    : undefined;
  const messages = body.messages
    ? body.messages.map((msg) => ({
        ...msg,
        parts: truncateDocumentParts((msg.parts ?? []) as UserMessagePart[]),
      }))
    : undefined;
  return { ...body, message, messages };
}
