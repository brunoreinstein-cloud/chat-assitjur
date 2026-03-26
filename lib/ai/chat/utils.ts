/**
 * Helpers utilitários para o chat: timing, XML, stream, truncagem.
 * Extraído de app/(chat)/api/chat/route.ts.
 */

import { after } from "next/server";
import { createResumableStreamContext } from "resumable-stream";
import { isChatDebugEnabled, logChatDebug } from "@/lib/ai/chat-debug";
import { buildSmartDocumentContext } from "@/lib/ai/document-context";

export const isDev = process.env.NODE_ENV === "development";
/** Quando true, não consulta nem deduz créditos (para diagnóstico de latência). */
export const creditsDisabled = process.env.DISABLE_CREDITS === "true";

/** Na PI, ao truncar, preservar este número de caracteres do final (OAB/assinaturas). */
export const PI_TAIL_CHARS = 8000;

/** Últimas N mensagens a carregar para contexto. */
export const CHAT_MESSAGES_LIMIT = 80;

/** Timeouts e limites do batch de BD (runChatDbBatch). */
export const DB_BATCH_TIMEOUT_MS = 120_000;
/** Fallback por query: 12s para falhar mais cedo em serverless. */
export const PER_QUERY_TIMEOUT_MS = 12_000;
export const CREDITS_IN_BATCH_TIMEOUT_MS = 12_000;
/** Limite usado na chave do cache de créditos. */
export const CREDITS_CACHE_USAGE_LIMIT = 10;

/** Timeout para o SET statement_timeout na sessão. */
export const ENSURE_DB_READY_TIMEOUT_MS = 10_000;

export const TRUNCATE_SUFFIX =
  "\n\n[Truncado: o documento excedeu o limite de caracteres.]";

/** Regra obrigatória de referência de página para todos os documentos. */
export const PAGE_REF_RULE =
  "REGRA: Para cada valor extraído, citar a folha (fl. XXX) baseada nos marcadores [Pag. N] do texto. Sem referência = 'Não localizado nos autos'.";

export const DOC_TYPE_ORDER: Record<string, number> = {
  pi: 0,
  contestacao: 1,
  "": 2,
};

export function logTiming(label: string, ms: number): void {
  if (isDev) {
    console.info(`[chat-timing] ${label}: ${Math.round(ms)}ms`);
  }
  if (isChatDebugEnabled()) {
    logChatDebug(`timing: ${label}`, ms);
  }
}

/** Em dev, envolve uma promise e regista quando resolve. */
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

/** Evita que uma query lenta bloqueie o batch: após ms resolve com fallback. */
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
  return lastMarkerStart > maxPos * 0.8 ? lastMarkerStart : maxPos;
}

/**
 * Trunca texto de documento para o contexto do LLM.
 * Para documentos paginados (com marcadores [Pag. N]) com mais de 200K chars,
 * usa extração inteligente de secções. Para outros, truncagem simples.
 */
export function truncateDocumentText(
  text: string,
  maxChars: number,
  documentType: string | undefined
): string {
  if (text.length <= maxChars) {
    return text;
  }

  const isPaginatedLargeDoc = text.length > 200_000 && text.includes("[Pag.");
  if (isPaginatedLargeDoc) {
    return buildSmartDocumentContext(text, maxChars, documentType);
  }

  const notice = "\n\n[... texto truncado para caber no limite do modelo ...]";
  const needPiTail =
    documentType === "pi" && maxChars > PI_TAIL_CHARS * 2 + notice.length;
  if (needPiTail) {
    const startLen = maxChars - PI_TAIL_CHARS - notice.length - 2;
    const cutPoint = findLastPageMarker(text, startLen);
    return `${text.slice(0, cutPoint)}${notice}\n\n${text.slice(-PI_TAIL_CHARS)}`;
  }
  const cutPoint = findLastPageMarker(text, maxChars);
  return text.slice(0, cutPoint) + notice;
}

export function getDocumentPartLabel(documentType: string | undefined): string {
  if (documentType === "pi") {
    return "Petição Inicial";
  }
  if (documentType === "contestacao") {
    return "Contestação";
  }
  return "Documento";
}

/** Dica curta para o modelo localizar dados rapidamente. */
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

export function getStreamContext() {
  try {
    return createResumableStreamContext({ waitUntil: after });
  } catch {
    return null;
  }
}
