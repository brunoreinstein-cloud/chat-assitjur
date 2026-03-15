import { geolocation } from "@vercel/functions";
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  generateId,
  safeValidateUIMessages,
  stepCountIs,
  streamText,
} from "ai";
import { after } from "next/server";
import type { Session } from "next-auth";
import { createResumableStreamContext } from "resumable-stream";
import { ZodError } from "zod";
import { auth, type UserType } from "@/app/(auth)/auth";
import {
  getDefaultModelForAgent,
  isModelAllowedForAgent,
} from "@/lib/ai/agent-models";
import type { AgentConfig } from "@/lib/ai/agents-registry";
import {
  AGENT_ID_REDATOR_CONTESTACAO,
  AGENT_IDS,
  DEFAULT_AGENT_ID_WHEN_EMPTY,
  getAgentConfigForCustomAgent,
  getAgentConfigWithOverrides,
} from "@/lib/ai/agents-registry";
import {
  createChatDebugTracker,
  isChatDebugEnabled,
  logChatDebug,
} from "@/lib/ai/chat-debug";
import {
  applyContextEditing,
  CONTEXT_WINDOW_INPUT_TARGET_TOKENS,
  estimateInputTokens,
} from "@/lib/ai/context-window";
import { MIN_CREDITS_TO_START_CHAT, tokensToCredits } from "@/lib/ai/credits";
import { entitlementsByUserType } from "@/lib/ai/entitlements";
import {
  extractStructuredFields,
  formatStructuredFieldsAsHeader,
} from "@/lib/ai/extract-structured-fields";
import { modelSupportsVision } from "@/lib/ai/models";
import { stripImageParts } from "@/lib/ai/multimodal";
import { getPromptCachingCacheControl } from "@/lib/ai/prompt-caching-config";
import { type RequestHints, systemPrompt } from "@/lib/ai/prompts";
import { getLanguageModel } from "@/lib/ai/providers";
import {
  REDATOR_BANCO_KNOWLEDGE_DOCUMENT_ID,
  REDATOR_BANCO_SYSTEM_USER_ID,
} from "@/lib/ai/redator-banco-rag";
import {
  buildKnowledgeContext,
  resolveEffectiveKnowledgeIds,
} from "@/lib/ai/resolve-knowledge-ids";
import { analyzeProcessoPipeline } from "@/lib/ai/tools/analyze-processo-pipeline";
import { createDocument } from "@/lib/ai/tools/create-document";
import { createRedatorContestacaoDocument } from "@/lib/ai/tools/create-redator-contestacao-document";
import { createRevisorDefesaDocuments } from "@/lib/ai/tools/create-revisor-defesa-documents";
import { getWeather } from "@/lib/ai/tools/get-weather";
import { requestApproval } from "@/lib/ai/tools/human-in-the-loop";
import { improvePromptTool } from "@/lib/ai/tools/improve-prompt";
import { createMemoryTools } from "@/lib/ai/tools/memory";
import { requestSuggestions } from "@/lib/ai/tools/request-suggestions";
import { updateDocument } from "@/lib/ai/tools/update-document";
import { validationToolsForValidate } from "@/lib/ai/tools/validation-tools";
import { getCachedBuiltInAgentOverrides } from "@/lib/cache/agent-overrides-cache";
import { creditsCache } from "@/lib/cache/credits-cache";
import { isProductionEnvironment } from "@/lib/constants";
import { FASE_LABEL, RISCO_LABEL } from "@/lib/constants/processo";
import {
  addCreditsToUser,
  createStreamId,
  deductCreditsAndRecordUsage,
  deleteChatById,
  ensureStatementTimeout,
  ensureUserExistsInDb,
  getChatById,
  getCustomAgentById,
  getKnowledgeDocumentsByIds,
  getMessageCountByUserId,
  getMessagesByChatId,
  getOrCreateCreditBalance,
  getProcessoById,
  getUserFilesByIds,
  saveChat,
  saveMessages,
  updateChatActiveStreamId,
  updateChatAgentId,
  updateChatTitleById,
  updateMessage,
} from "@/lib/db/queries";
import {
  ChatbotError,
  databaseUnavailableResponse,
  isDatabaseConnectionError,
  isLikelyDatabaseError,
  isStatementTimeoutError,
} from "@/lib/errors";
import { retrieveKnowledgeContext } from "@/lib/rag";
import { buildAiSdkTelemetry } from "@/lib/telemetry";
import type { ChatMessage } from "@/lib/types";
import { convertToUIMessages, generateUUID } from "@/lib/utils";
import { generateTitleFromUserMessage } from "../../actions";
import {
  MAX_DOCUMENT_PART_TEXT_LENGTH,
  type PostRequestBody,
  postRequestBodySchema,
} from "./schema";

/** Limite de execução da rota (segundos).
 * No Vercel, respostas em streaming podem durar até ao máximo da plataforma (300s Pro)
 * independentemente deste valor; o valor aqui controla a fase de computação inicial.
 * O AbortSignal no streamText garante que o stream fecha antes do corte da plataforma. */
export const maxDuration = 300;

const isDev = process.env.NODE_ENV === "development";
/** Quando true, não consulta nem deduz créditos (para diagnóstico de latência). */
const creditsDisabled = process.env.DISABLE_CREDITS === "true";

/** Indica se o modelo é Anthropic (Claude), para aplicar prompt caching quando suportado. */
function isAnthropicModel(modelId: string): boolean {
  return modelId.includes("anthropic") || modelId.includes("claude");
}

/**
 * Adiciona cache_control à última mensagem para modelos Anthropic (prompt caching).
 * Reduz custo e latência em conversas multi-turn ao reutilizar o prefixo em cache.
 * Respeita PROMPT_CACHING_ENABLED e PROMPT_CACHING_TTL.
 * Ver: https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching
 */
function withPromptCachingForAnthropic<T extends { providerOptions?: unknown }>(
  modelId: string,
  messages: T[]
): T[] {
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
function logTiming(label: string, ms: number): void {
  if (isDev) {
    console.info(`[chat-timing] ${label}: ${Math.round(ms)}ms`);
  }
  if (isChatDebugEnabled()) {
    logChatDebug(`timing: ${label}`, ms);
  }
}

/** Em dev, envolve uma promise e regista quando resolve (para localizar travagens no batch). */
function withTimingLog<T>(label: string, p: Promise<T>): Promise<T> {
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
function withFallbackTimeout<T>(
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

interface DocumentPartLike {
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
function escapeXmlAttr(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

/** Envolve conteúdo em tag <document> dentro de <knowledge_base> para o modelo referenciar por id/título. */
function wrapKnowledgeDocument(
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

/** Máximo de caracteres por documento no prompt (evita "prompt is too long" ~200k tokens). */
const MAX_CHARS_PER_DOCUMENT = 80_000;
/** Máximo total de caracteres de documentos numa única mensagem. */
const MAX_TOTAL_DOC_CHARS = 180_000;
/** Na PI, ao truncar, preservar este número de caracteres do final (OAB/assinaturas). */
const PI_TAIL_CHARS = 8000;

/** Últimas N mensagens a carregar para contexto (reduz BD e tamanho do prompt; a qualidade mantém-se com contexto recente). */
const CHAT_MESSAGES_LIMIT = 80;

/** Timeouts e limites do batch de BD (runChatDbBatch). */
const DB_BATCH_TIMEOUT_MS = 120_000;
/** Fallback por query: 12s para falhar mais cedo em serverless (Vercel 60s); deixa margem ao stream. */
const PER_QUERY_TIMEOUT_MS = 12_000;
const CREDITS_IN_BATCH_TIMEOUT_MS = 12_000;
/** Limite usado na chave do cache de créditos (igual ao default de GET /api/credits). */
const CREDITS_CACHE_USAGE_LIMIT = 10;

function getDocumentPartLabel(documentType: string | undefined): string {
  if (documentType === "pi") {
    return "Petição Inicial";
  }
  if (documentType === "contestacao") {
    return "Contestação";
  }
  return "Documento";
}

/**
 * Trunca texto de documento: para PI preserva início + fim (OAB); caso contrário só início.
 * Tenta cortar na fronteira do último marcador [Pag. N] que cabe no limite,
 * para não enviar páginas parciais ao modelo.
 */
function truncateDocumentText(
  text: string,
  maxChars: number,
  documentType: string | undefined
): string {
  if (text.length <= maxChars) {
    return text;
  }
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
function findLastPageMarker(text: string, maxPos: number): number {
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
function getDocumentPartExtractionHint(
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

function fillKnowledgeFromFullDocsWhenEmpty(
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
function isPartValidForModel(part: unknown): boolean {
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
function normalizeMessageParts(
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

function getStreamContext() {
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
function truncateDocumentParts(parts: UserMessagePart[]): UserMessagePart[] {
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

/** Aplica truncagem de partes "document" ao body já parseado (imutável). */
function truncateDocumentPartsInBody(body: PostRequestBody): PostRequestBody {
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

/** Parseia e valida o body do POST; devolve Response em caso de erro. */
async function parsePostBody(
  request: Request
): Promise<PostRequestBody | Response> {
  try {
    const json = (await request.json()) as Record<string, unknown>;
    return postRequestBodySchema.parse(json);
  } catch (error: unknown) {
    let cause: string | undefined;
    if (error instanceof ZodError && error.issues.length > 0) {
      const first = error.issues[0];
      const path = first.path.join(".");
      cause = path ? `${path}: ${first.message}` : first.message;
      if (isDev) {
        console.error(
          "[POST /api/chat] Validação falhou:",
          cause,
          error.issues
        );
      }
    } else if (error instanceof Error) {
      cause = error.message;
      if (isDev) {
        console.error("[POST /api/chat] Erro ao processar corpo:", cause);
      }
    }
    return Response.json(
      {
        code: "bad_request:api",
        message:
          "Corpo do pedido inválido. Verifique id, message/messages, selectedChatModel e selectedVisibilityType.",
        cause,
      },
      { status: 400 }
    );
  }
}

/** Timeout para o SET statement_timeout na sessão (ligação lenta = falhar cedo e pedir retry). */
const ENSURE_DB_READY_TIMEOUT_MS = 10_000;

/** Garante que a ligação à BD está pronta; devolve Response em caso de erro. Com um retry para cold start. */
async function ensureDbReady(): Promise<Response | null> {
  const attempt = async (): Promise<void> => {
    await Promise.race([
      ensureStatementTimeout(),
      new Promise<never>((_, reject) =>
        setTimeout(
          () =>
            reject(
              new Error(
                `ensureStatementTimeout did not complete within ${ENSURE_DB_READY_TIMEOUT_MS}ms`
              )
            ),
          ENSURE_DB_READY_TIMEOUT_MS
        )
      ),
    ]);
  };
  try {
    await attempt();
  } catch (dbInitErr) {
    if (isDev) {
      console.warn(
        "[chat] DB init/timeout (1.ª tentativa), a repetir:",
        dbInitErr
      );
    }
    try {
      await attempt();
    } catch (retryErr) {
      if (isDev) {
        console.error("[chat] DB init/timeout após retry:", retryErr);
      }
      const dbMsg =
        process.env.NODE_ENV === "production"
          ? "A ligação à base de dados está a demorar demasiado. Em produção (Vercel) verifica POSTGRES_URL em Settings → Environment Variables (usa pooler, porta 6543 no Supabase) e que a base de dados está acessível. Tenta novamente."
          : "A ligação à base de dados está a demorar demasiado. Verifica POSTGRES_URL em .env.local e que a base de dados está acessível. Tenta novamente.";
      return new ChatbotError("bad_request:database", dbMsg).toResponse();
    }
  }
  if (isDev) {
    console.info("[chat-timing] ensureStatementTimeout: done");
  }
  return null;
}

/** Valida que a mensagem do utilizador tem conteúdo; devolve Response se inválida. */
function validateUserMessageContent(
  message: PostRequestBody["message"]
): Response | null {
  if (message?.role !== "user" || !message.parts) {
    return null;
  }
  const hasContent = message.parts.some((p) => {
    const part = p as { type?: string; text?: string };
    if (part.type === "text") {
      return (part.text?.trim().length ?? 0) > 0;
    }
    return part.type === "file" || part.type === "document";
  });
  if (!hasContent) {
    return Response.json(
      {
        code: "bad_request:api",
        message: "Corpo do pedido inválido.",
        cause:
          "A mensagem não pode estar vazia. Escreve texto ou anexa um ficheiro.",
      },
      { status: 400 }
    );
  }
  return null;
}

/** Resultado do batch de queries da BD para o chat. */
interface ChatDbBatchResult {
  messageCount: Awaited<ReturnType<typeof getMessageCountByUserId>>;
  chat: Awaited<ReturnType<typeof getChatById>>;
  messagesFromDb: Awaited<ReturnType<typeof getMessagesByChatId>>;
  knowledgeDocsResult: Awaited<ReturnType<typeof getKnowledgeDocumentsByIds>>;
  builtInOverrides: Record<
    string,
    { instructions: string | null; label: string | null }
  >;
  balanceFromDb: number;
  customAgentFromBatch: Awaited<ReturnType<typeof getCustomAgentById>>;
  /** true se alguma query do batch usou fallback (timeout/erro); o cliente pode mostrar aviso. */
  usedFallback?: boolean;
}

/** Executa o batch de queries da BD com timeouts; devolve resultado ou Response. */
async function runChatDbBatch(
  session: { user: { id: string } },
  id: string,
  agentId: string,
  isBuiltInAgent: boolean,
  effectiveKnowledgeIds: string[],
  redatorBancoAllowedUserIds: string[] | undefined,
  initialCredits: number
): Promise<ChatDbBatchResult | Response> {
  const usedFallback = { current: false };
  const onFallback = () => {
    usedFallback.current = true;
  };

  const creditsPromise = creditsDisabled
    ? Promise.resolve(initialCredits)
    : (() => {
        const cachedCredits = creditsCache.get(
          session.user.id,
          CREDITS_CACHE_USAGE_LIMIT
        );
        return cachedCredits
          ? Promise.resolve(cachedCredits.balance)
          : Promise.race([
              getOrCreateCreditBalance(session.user.id, initialCredits),
              new Promise<number>((resolve) =>
                setTimeout(
                  () => resolve(initialCredits),
                  CREDITS_IN_BATCH_TIMEOUT_MS
                )
              ),
            ]).catch(() => {
              if (process.env.NODE_ENV === "development") {
                console.warn(
                  "[chat] Credit balance unavailable (tabela de créditos?), a usar saldo inicial."
                );
              }
              return initialCredits;
            });
      })();

  const dbBatchPromise = Promise.all([
    withTimingLog(
      "getMessageCount",
      withFallbackTimeout(
        "getMessageCount",
        getMessageCountByUserId({
          id: session.user.id,
          differenceInHours: 24,
        }),
        PER_QUERY_TIMEOUT_MS,
        0,
        onFallback
      )
    ),
    withTimingLog(
      "getChatById",
      withFallbackTimeout(
        "getChatById",
        getChatById({ id }),
        PER_QUERY_TIMEOUT_MS,
        null,
        onFallback
      )
    ),
    withTimingLog(
      "getMessagesByChatId",
      withFallbackTimeout(
        "getMessagesByChatId",
        getMessagesByChatId({ id, limit: CHAT_MESSAGES_LIMIT }),
        PER_QUERY_TIMEOUT_MS,
        [] as Awaited<ReturnType<typeof getMessagesByChatId>>,
        onFallback
      )
    ),
    effectiveKnowledgeIds.length > 0
      ? withTimingLog(
          "getKnowledgeDocumentsByIds",
          withFallbackTimeout(
            "getKnowledgeDocumentsByIds",
            getKnowledgeDocumentsByIds({
              ids: effectiveKnowledgeIds,
              userId: session.user.id,
              allowedUserIds: redatorBancoAllowedUserIds,
            }),
            PER_QUERY_TIMEOUT_MS,
            [] as Awaited<ReturnType<typeof getKnowledgeDocumentsByIds>>,
            onFallback
          )
        )
      : Promise.resolve(
          [] as Awaited<ReturnType<typeof getKnowledgeDocumentsByIds>>
        ),
    withTimingLog(
      "getCachedBuiltInAgentOverrides",
      withFallbackTimeout(
        "getCachedBuiltInAgentOverrides",
        getCachedBuiltInAgentOverrides(),
        PER_QUERY_TIMEOUT_MS,
        {} as Awaited<ReturnType<typeof getCachedBuiltInAgentOverrides>>,
        onFallback
      )
    ),
    withTimingLog("getOrCreateCreditBalance", creditsPromise),
    isBuiltInAgent
      ? Promise.resolve(
          null as unknown as Awaited<ReturnType<typeof getCustomAgentById>>
        )
      : withTimingLog(
          "getCustomAgentById",
          withFallbackTimeout(
            "getCustomAgentById",
            getCustomAgentById({
              id: agentId,
              userId: session.user.id,
            }),
            PER_QUERY_TIMEOUT_MS,
            null as unknown as Awaited<ReturnType<typeof getCustomAgentById>>,
            onFallback
          )
        ),
  ]);

  try {
    const [
      messageCount,
      chat,
      messagesFromDb,
      knowledgeDocsResult,
      builtInOverridesFromBatch,
      balanceFromDb,
      customAgentFromBatch,
    ] = await Promise.race([
      dbBatchPromise,
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error("DB_BATCH_TIMEOUT")),
          DB_BATCH_TIMEOUT_MS
        )
      ),
    ]);
    const result: ChatDbBatchResult = {
      messageCount,
      chat,
      messagesFromDb,
      knowledgeDocsResult,
      builtInOverrides:
        builtInOverridesFromBatch as ChatDbBatchResult["builtInOverrides"],
      balanceFromDb,
      customAgentFromBatch,
    };
    result.usedFallback = usedFallback.current;
    return result;
  } catch (error_) {
    const isTimeout =
      error_ instanceof Error && error_.message === "DB_BATCH_TIMEOUT";
    if (isDev) {
      console.error("[chat] dbBatch timeout or error:", error_);
    }
    const timeoutSec = Math.round(DB_BATCH_TIMEOUT_MS / 1000);
    return new ChatbotError(
      "bad_request:database",
      isTimeout
        ? `A base de dados não respondeu a tempo (cancelado após ${timeoutSec}s). Pode ser cold start do Supabase/Neon — tenta enviar a mensagem novamente. Se continuar, verifica POSTGRES_URL e rede.`
        : "Erro ao aceder à base de dados. Tenta novamente."
    ).toResponse();
  }
}

/** Valida partes de documento do Revisor (PI + Contestação); devolve Response se inválido. */
function validateRevisorDocumentParts(
  message: PostRequestBody["message"],
  agentConfig: AgentConfig
): Response | null {
  if (
    message?.role !== "user" ||
    !message.parts ||
    !agentConfig.useRevisorDefesaTools
  ) {
    return null;
  }
  const documentParts = message.parts.filter(
    (p) => (p as { type?: string }).type === "document"
  ) as DocumentPartLike[];
  if (documentParts.length === 0) {
    return null;
  }
  const hasPi = documentParts.some((p) => p.documentType === "pi");
  const hasContestacao = documentParts.some(
    (p) => p.documentType === "contestacao"
  );
  if (!(hasPi && hasContestacao)) {
    return Response.json(
      {
        code: "bad_request:api",
        message:
          "Para auditar a contestação, anexe a Petição Inicial e a Contestação (arraste para os slots ou use o anexo). O tipo é identificado automaticamente quando possível; pode ajustar no menu de cada documento.",
      },
      { status: 400 }
    );
  }
  return null;
}

/** Verifica rate limit e créditos; devolve Response se bloquear, ou null e atualiza balance. */
async function checkRateLimitAndCredits(
  messageCount: number,
  userType: UserType,
  balanceFromDb: number,
  session: { user: { id: string } },
  initialCredits: number
): Promise<{ balance: number } | Response> {
  if (creditsDisabled) {
    return { balance: initialCredits };
  }
  if (
    process.env.NODE_ENV !== "development" &&
    messageCount > entitlementsByUserType[userType].maxMessagesPerDay
  ) {
    return new ChatbotError("rate_limit:chat").toResponse();
  }
  let balance = balanceFromDb;
  if (balance < MIN_CREDITS_TO_START_CHAT) {
    if (process.env.NODE_ENV === "development") {
      try {
        await addCreditsToUser({
          userId: session.user.id,
          delta: initialCredits,
        });
        creditsCache.delete(session.user.id);
        balance += initialCredits;
      } catch {
        balance = initialCredits;
      }
      if (balance < MIN_CREDITS_TO_START_CHAT) {
        balance = initialCredits;
      }
    }
    if (balance < MIN_CREDITS_TO_START_CHAT) {
      return new ChatbotError(
        "rate_limit:chat",
        `Sem créditos suficientes para enviar mensagens. Saldo atual: ${balance} créditos. Contacte o administrador para recarregar.`
      ).toResponse();
    }
  }
  return { balance };
}

/** Persiste chat (ownership, agentId, novo chat) e devolve titlePromise ou Response. */
async function persistChatAndGetTitlePromise(
  chat: Awaited<ReturnType<typeof getChatById>>,
  session: { user: { id: string } },
  id: string,
  message: PostRequestBody["message"],
  agentId: string,
  selectedVisibilityType: PostRequestBody["selectedVisibilityType"],
  _isToolApprovalFlow: boolean,
  processoId?: string | null
): Promise<{ titlePromise: Promise<string> | null } | Response> {
  if (chat) {
    if (chat.userId !== session.user.id) {
      return new ChatbotError("forbidden:chat").toResponse();
    }
    if (
      message?.role === "user" &&
      (chat.agentId ?? DEFAULT_AGENT_ID_WHEN_EMPTY) !== agentId
    ) {
      await updateChatAgentId({ chatId: id, agentId });
    }
    return { titlePromise: null };
  }
  if (message?.role !== "user") {
    return { titlePromise: null };
  }
  try {
    await saveChat({
      id,
      userId: session.user.id,
      title: "New chat",
      visibility: selectedVisibilityType,
      agentId,
      processoId: processoId ?? null,
    });
  } catch (saveChatErr) {
    if (
      saveChatErr instanceof ChatbotError &&
      saveChatErr.type === "unauthorized" &&
      saveChatErr.surface === "auth"
    ) {
      return saveChatErr.toResponse();
    }
    if (isDev) {
      console.warn(
        "[chat] saveChat (novo chat) falhou, a continuar para o modelo:",
        saveChatErr instanceof Error ? saveChatErr.message : saveChatErr
      );
    }
  }
  const titlePromise = generateTitleFromUserMessage({
    message: normalizeMessageParts([message as ChatMessage])[0],
  });
  return { titlePromise };
}

/** Resultado de validação + RAG + getUserFiles. */
interface ValidationRagResult {
  uiMessages: ChatMessage[];
  ragChunks: Awaited<ReturnType<typeof retrieveKnowledgeContext>>;
  userFilesFromArchivos: Awaited<ReturnType<typeof getUserFilesByIds>>;
}

/** Opções para runValidationRagUserFiles. */
interface ValidationRagOptions {
  normalizedForValidation: ChatMessage[];
  isToolApprovalFlow: boolean;
  knowledgeDocsResult: Awaited<ReturnType<typeof getKnowledgeDocumentsByIds>>;
  lastUserText: string;
  session: Session;
  effectiveKnowledgeIds: string[];
  agentId: string;
  redatorBancoAllowedUserIds: string[] | undefined;
  archivoIds: PostRequestBody["archivoIds"];
}

/** Executa validação de mensagens, RAG e getUserFiles em paralelo; devolve uiMessages atualizadas. */
async function runValidationRagUserFiles(
  opts: ValidationRagOptions
): Promise<ValidationRagResult> {
  const {
    normalizedForValidation,
    isToolApprovalFlow,
    knowledgeDocsResult,
    lastUserText,
    session,
    effectiveKnowledgeIds,
    agentId,
    redatorBancoAllowedUserIds,
    archivoIds,
  } = opts;
  const t2 = Date.now();
  if (isDev) {
    console.info("[chat-timing] validationRag: starting…");
  }
  const [validationResult, ragChunks, userFilesFromArchivos] =
    await Promise.all([
      !isToolApprovalFlow && normalizedForValidation.length > 0
        ? withTimingLog(
            "safeValidateUIMessages",
            safeValidateUIMessages({
              messages: normalizedForValidation,
              tools: validationToolsForValidate,
            })
          )
        : Promise.resolve({
            success: false as const,
            data: normalizedForValidation,
            error: undefined,
          }),
      knowledgeDocsResult.length > 0 && lastUserText.length > 0
        ? withTimingLog(
            "retrieveKnowledgeContext",
            retrieveKnowledgeContext({
              userId: session.user.id,
              documentIds: effectiveKnowledgeIds,
              queryText: lastUserText,
              limit: agentId === AGENT_ID_REDATOR_CONTESTACAO ? 24 : 12,
              allowedUserIds: redatorBancoAllowedUserIds,
            })
          )
        : Promise.resolve<Awaited<ReturnType<typeof retrieveKnowledgeContext>>>(
            []
          ),
      archivoIds != null && archivoIds.length > 0 && session.user.id != null
        ? withTimingLog(
            "getUserFilesByIds",
            getUserFilesByIds({
              ids: archivoIds,
              userId: session.user.id,
            })
          )
        : Promise.resolve<Awaited<ReturnType<typeof getUserFilesByIds>>>([]),
    ]);
  logTiming("validação + RAG + getUserFiles (paralelo)", Date.now() - t2);

  let uiMessages: ChatMessage[] = normalizedForValidation;
  if (validationResult.success) {
    uiMessages = validationResult.data as ChatMessage[];
  } else if (!isToolApprovalFlow && normalizedForValidation.length > 0) {
    if (isDev) {
      console.warn(
        "[chat] Validação de mensagens da BD falhou, a manter histórico normalizado:",
        validationResult.error?.message ?? validationResult.error
      );
    }
    uiMessages = normalizedForValidation;
  }
  return { uiMessages, ragChunks, userFilesFromArchivos };
}

/** Constrói knowledgeContext a partir de RAG chunks, docs e ficheiros do utilizador. */
function buildKnowledgeContextFromParts(
  ragChunks: Awaited<ReturnType<typeof retrieveKnowledgeContext>>,
  knowledgeDocsResult: Awaited<ReturnType<typeof getKnowledgeDocumentsByIds>>,
  userFilesFromArchivos: Awaited<ReturnType<typeof getUserFilesByIds>>,
  effectiveKnowledgeIds: string[]
): string | undefined {
  const knowledgeDocParts: string[] = [];

  // Injetar resumos estruturados (PI/Contestação) sempre que disponíveis — visão completa sem truncamento
  for (const doc of knowledgeDocsResult) {
    if (doc.structuredSummary) {
      knowledgeDocParts.push(
        wrapKnowledgeDocument(
          doc.id,
          `${doc.title} [Resumo Estruturado]`,
          doc.structuredSummary
        )
      );
    }
  }

  if (ragChunks.length > 0) {
    const byDoc = new Map<string, { title: string; texts: string[] }>();
    for (const c of ragChunks) {
      const cur = byDoc.get(c.knowledgeDocumentId);
      if (cur) {
        cur.texts.push(c.text);
      } else {
        byDoc.set(c.knowledgeDocumentId, {
          title: c.title,
          texts: [c.text],
        });
      }
    }
    for (const [docId, { title, texts }] of byDoc.entries()) {
      knowledgeDocParts.push(
        wrapKnowledgeDocument(docId, title, texts.join("\n\n"))
      );
    }
  }
  if (knowledgeDocsResult.length > 0) {
    fillKnowledgeFromFullDocsWhenEmpty(knowledgeDocParts, knowledgeDocsResult);
  }
  for (const uf of userFilesFromArchivos) {
    // Injetar resumo estruturado se disponível (mesmo padrão dos KnowledgeDocuments)
    if (uf.structuredSummary) {
      knowledgeDocParts.push(
        wrapKnowledgeDocument(
          uf.id,
          `${uf.filename} [Resumo Estruturado]`,
          uf.structuredSummary
        )
      );
    }
    if (
      typeof uf.extractedTextCache === "string" &&
      uf.extractedTextCache.trim().length > 0
    ) {
      knowledgeDocParts.push(
        wrapKnowledgeDocument(uf.id, uf.filename, uf.extractedTextCache.trim())
      );
    }
  }
  const rawKnowledgeContext =
    knowledgeDocParts.length > 0
      ? `<knowledge_base>\n${knowledgeDocParts.join("\n\n")}\n</knowledge_base>`
      : "";
  return buildKnowledgeContext(rawKnowledgeContext, effectiveKnowledgeIds);
}

/** Guarda a mensagem do utilizador na BD; devolve Response em caso de erro. */
async function saveUserMessageToDb(
  message: PostRequestBody["message"],
  id: string
): Promise<Response | null> {
  if (message?.role !== "user") {
    return null;
  }
  try {
    await saveMessages({
      messages: [
        {
          chatId: id,
          id: message.id,
          role: "user",
          parts: message.parts,
          attachments: [],
          createdAt: new Date(),
        },
      ],
    });
  } catch (err) {
    if (isDev) {
      console.error("[chat] saveMessages(user) falhou:", err);
    }
    if (
      (err instanceof ChatbotError && err.surface === "database") ||
      isDatabaseConnectionError(err) ||
      isStatementTimeoutError(err) ||
      isLikelyDatabaseError(err)
    ) {
      return databaseUnavailableResponse();
    }
    return new ChatbotError(
      "bad_request:database",
      "Não foi possível guardar a mensagem. Tenta novamente."
    ).toResponse();
  }
  return null;
}

/** Trata erros do POST /api/chat e devolve Response apropriada. */
function handleChatPostError(error: unknown, request: Request): Response {
  if (error instanceof ChatbotError) {
    return error.toResponse();
  }
  if (isDatabaseConnectionError(error) || isStatementTimeoutError(error)) {
    return databaseUnavailableResponse();
  }
  if (
    error instanceof Error &&
    error.message?.includes(
      "AI Gateway requires a valid credit card on file to service requests"
    )
  ) {
    return new ChatbotError("bad_request:activate_gateway").toResponse();
  }
  const status =
    error instanceof Error && "status" in error
      ? (error as { status?: number }).status
      : undefined;
  if (status === 529) {
    return new ChatbotError(
      "offline:chat",
      "Serviço de IA temporariamente sobrecarregado. Tente novamente em instantes."
    ).toResponse();
  }
  const vercelId = request.headers.get("x-vercel-id");
  console.error("Unhandled error in chat API:", error, { vercelId });
  return new ChatbotError("offline:chat").toResponse();
}

/** Parâmetros para buildChatStreamResponse. */
interface ChatStreamParams {
  requestStart: number;
  debugTracker: ReturnType<typeof createChatDebugTracker>;
  id: string;
  message: PostRequestBody["message"];
  session: Session;
  agentInstructions: PostRequestBody["agentInstructions"];
  agentConfig: AgentConfig;
  effectiveModel: string;
  titlePromise: Promise<string> | null;
  isToolApprovalFlow: boolean;
  uiMessages: ChatMessage[];
  requestHints: RequestHints;
  knowledgeContext: string | undefined;
  processoContext: string | undefined;
  /** true se o dbBatch usou fallback (timeout); o stream envia chunk para o cliente mostrar aviso. */
  dbUsedFallback?: boolean;
}

/** Resultado da preparação de mensagens para o modelo. */
type PrepareModelMessagesResult =
  | {
      messagesForModel: Awaited<
        ReturnType<typeof withPromptCachingForAnthropic>
      >;
      preStreamEnd: number;
    }
  | { response: Response };

/** Prepara mensagens para o modelo; devolve mensagens + preStreamEnd ou Response 413. */
async function prepareModelMessagesForStream(
  params: ChatStreamParams,
  debugTracker: ReturnType<typeof createChatDebugTracker>
): Promise<PrepareModelMessagesResult> {
  const {
    requestStart,
    message,
    agentInstructions,
    agentConfig,
    effectiveModel,
    uiMessages,
    requestHints,
    knowledgeContext,
    processoContext,
  } = params;
  const t5 = Date.now();
  const visionEnabled = modelSupportsVision(effectiveModel);
  const normalizedMessages = normalizeMessageParts(uiMessages, visionEnabled);
  const effectiveAgentInstructionsForContext =
    agentInstructions?.trim() || agentConfig.instructions;
  const systemStrForEstimate = systemPrompt({
    selectedChatModel: effectiveModel,
    requestHints,
    agentInstructions: effectiveAgentInstructionsForContext,
    knowledgeContext,
    processoContext,
  });
  const messagesToSend = applyContextEditing(normalizedMessages);
  const estimatedInputTokens = estimateInputTokens(
    systemStrForEstimate.length,
    messagesToSend
  );
  if (estimatedInputTokens > CONTEXT_WINDOW_INPUT_TARGET_TOKENS) {
    return {
      response: Response.json(
        {
          code: "context_limit",
          message:
            "O contexto desta conversa excede o limite do modelo. Por favor, inicia um novo chat ou encurta a conversa.",
          estimatedTokens: estimatedInputTokens,
          limit: CONTEXT_WINDOW_INPUT_TARGET_TOKENS,
        },
        { status: 413 }
      ),
    };
  }
  let modelMessages: Awaited<ReturnType<typeof convertToModelMessages>>;
  try {
    modelMessages = await convertToModelMessages(messagesToSend);
  } catch (convertError) {
    if (isDev) {
      console.warn(
        "[chat] convertToModelMessages falhou (partes inválidas?), a usar apenas a última mensagem:",
        convertError
      );
    }
    const fallbackMessages =
      message?.role === "user"
        ? normalizeMessageParts([message as ChatMessage], visionEnabled)
        : normalizedMessages.slice(-1);
    modelMessages = await convertToModelMessages(fallbackMessages);
  }
  debugTracker.phase("contextConvert", t5);
  logTiming(
    "contextEditing + estimateTokens + normalizeMessageParts + convertToModelMessages",
    Date.now() - t5
  );
  const messagesForModel = withPromptCachingForAnthropic(
    effectiveModel,
    modelMessages
  );
  const preStreamEnd = Date.now();
  debugTracker.flush("preStreamPhases");
  logTiming("preStream (total antes do stream)", preStreamEnd - requestStart);
  return { messagesForModel, preStreamEnd };
}

type StreamTextResult = Awaited<ReturnType<typeof streamText>>;

/** Contexto para o handler execute do stream. */
interface StreamExecuteContext {
  session: ChatStreamParams["session"];
  agentInstructions: ChatStreamParams["agentInstructions"];
  agentConfig: AgentConfig;
  agentId: string;
  effectiveModel: string;
  requestHints: RequestHints;
  knowledgeContext: string | undefined;
  processoContext: string | undefined;
  messagesForModel: Awaited<ReturnType<typeof withPromptCachingForAnthropic>>;
  isReasoningModel: boolean;
  titlePromise: Promise<string> | null;
  id: string;
  requestStart: number;
  preStreamEnd: number;
  dbUsedFallback?: boolean;
}

/** Cria o callback execute para createUIMessageStream; escreve streamTextResult em ref. */
function createStreamExecuteHandler(
  ctx: StreamExecuteContext,
  streamTextResultRef: { current: StreamTextResult | null }
) {
  return async ({
    writer: dataStream,
  }: {
    writer: Parameters<
      Parameters<typeof createUIMessageStream>[0]["execute"]
    >[0]["writer"];
  }) => {
    if (ctx.dbUsedFallback) {
      dataStream.write({ type: "data-db-fallback", data: true });
    }
    const executeStartedAt = Date.now();
    if (isChatDebugEnabled()) {
      dataStream.write({
        type: "data-chat-debug",
        data: {
          preStreamMs: ctx.preStreamEnd - ctx.requestStart,
          executeStartedMs: executeStartedAt - ctx.requestStart,
        },
      });
    }
    logTiming(
      "execute started (modelo + tools a correr)",
      executeStartedAt - ctx.requestStart
    );
    const effectiveAgentInstructions =
      ctx.agentInstructions?.trim() || ctx.agentConfig.instructions;

    const baseToolNames = [
      "getWeather",
      "createDocument",
      "updateDocument",
      "requestSuggestions",
      "improvePrompt",
      "saveMemory",
      "recallMemories",
      "forgetMemory",
      "requestApproval",
    ] as const;
    type ActiveToolName =
      | (typeof baseToolNames)[number]
      | "createRevisorDefesaDocuments"
      | "createRedatorContestacaoDocument"
      | "analyzeProcessoPipeline";
    const activeToolNames: ActiveToolName[] = ctx.isReasoningModel
      ? []
      : [
          ...baseToolNames,
          ...(ctx.agentConfig.useRevisorDefesaTools
            ? (["createRevisorDefesaDocuments"] as const)
            : []),
          ...(ctx.agentConfig.useRedatorContestacaoTool
            ? (["createRedatorContestacaoDocument"] as const)
            : []),
          ...(ctx.agentConfig.usePipelineTool
            ? (["analyzeProcessoPipeline"] as const)
            : []),
        ];

    const memoryTools = createMemoryTools({ userId: ctx.session.user.id });
    const tools = {
      getWeather,
      createDocument: createDocument({ session: ctx.session, dataStream }),
      updateDocument: updateDocument({ session: ctx.session, dataStream }),
      requestSuggestions: requestSuggestions({
        session: ctx.session,
        dataStream,
      }),
      improvePrompt: improvePromptTool,
      saveMemory: memoryTools.saveMemory,
      recallMemories: memoryTools.recallMemories,
      forgetMemory: memoryTools.forgetMemory,
      requestApproval,
    } as {
      getWeather: typeof getWeather;
      createDocument: ReturnType<typeof createDocument>;
      updateDocument: ReturnType<typeof updateDocument>;
      requestSuggestions: ReturnType<typeof requestSuggestions>;
      improvePrompt: typeof improvePromptTool;
      saveMemory: ReturnType<typeof createMemoryTools>["saveMemory"];
      recallMemories: ReturnType<typeof createMemoryTools>["recallMemories"];
      forgetMemory: ReturnType<typeof createMemoryTools>["forgetMemory"];
      requestApproval: typeof requestApproval;
      createRevisorDefesaDocuments?: ReturnType<
        typeof createRevisorDefesaDocuments
      >;
      createRedatorContestacaoDocument?: ReturnType<
        typeof createRedatorContestacaoDocument
      >;
      analyzeProcessoPipeline?: ReturnType<typeof analyzeProcessoPipeline>;
    };
    if (ctx.agentConfig.useRevisorDefesaTools) {
      tools.createRevisorDefesaDocuments = createRevisorDefesaDocuments({
        session: ctx.session,
        dataStream,
      });
    }
    if (ctx.agentConfig.usePipelineTool) {
      tools.analyzeProcessoPipeline = analyzeProcessoPipeline({
        session: ctx.session,
        dataStream,
      });
    }
    if (ctx.agentConfig.useRedatorContestacaoTool) {
      tools.createRedatorContestacaoDocument = createRedatorContestacaoDocument(
        {
          session: ctx.session,
          dataStream,
        }
      );
    }

    const result = streamText({
      model: getLanguageModel(ctx.effectiveModel),
      temperature: 0.2,
      maxOutputTokens: 8192,
      system: systemPrompt({
        selectedChatModel: ctx.effectiveModel,
        requestHints: ctx.requestHints,
        agentInstructions: effectiveAgentInstructions,
        knowledgeContext: ctx.knowledgeContext,
        processoContext: ctx.processoContext,
      }),
      messages: ctx.messagesForModel as Awaited<
        ReturnType<typeof convertToModelMessages>
      >,
      // Permite múltiplos steps: step 1 = model chama tool; step 2 = model gera texto após tool result (entrega).
      // Sem isto (default stepCountIs(1)) o stream encerra após a tool e o utilizador não vê mensagem.
      // Master com pipeline pode precisar: pipeline → createDocument → resposta (7 steps).
      stopWhen: stepCountIs(ctx.agentConfig.usePipelineTool ? 7 : 5),
      experimental_activeTools: activeToolNames,
      providerOptions: ctx.isReasoningModel
        ? {
            anthropic: {
              thinking: {
                type: "enabled",
                budgetTokens: 4000,
              },
            },
          }
        : undefined,
      tools,
      experimental_telemetry: buildAiSdkTelemetry({
        isEnabled: isProductionEnvironment,
        functionId: "stream-text",
        agentId: ctx.agentId,
        model: ctx.effectiveModel,
        userId: ctx.session.user.id,
        chatId: ctx.id,
      }),
      // Aborta o stream ao fim de 270s para fechar graciosamente antes do
      // corte do Vercel (300s). Evita o "Task timed out after 300 seconds".
      abortSignal: AbortSignal.timeout(270_000),
    });
    streamTextResultRef.current = result as unknown as StreamTextResult;

    dataStream.merge(result.toUIMessageStream({ sendReasoning: true }));

    if (ctx.titlePromise) {
      const title = await ctx.titlePromise;
      dataStream.write({ type: "data-chat-title", data: title });
      updateChatTitleById({ chatId: ctx.id, title });
    }
  };
}

/** Contexto para o handler onFinish do stream. */
interface StreamOnFinishContext {
  requestStart: number;
  session: ChatStreamParams["session"];
  id: string;
  effectiveModel: string;
  isToolApprovalFlow: boolean;
  uiMessages: ChatMessage[];
}

/** Cria o callback onFinish para createUIMessageStream. */
function createStreamOnFinishHandler(
  ctx: StreamOnFinishContext,
  streamTextResultRef: { current: StreamTextResult | null }
) {
  return async ({
    messages: finishedMessages,
  }: {
    messages: Array<{ id: string; role: string; parts: unknown[] }>;
  }) => {
    const streamTextResult = streamTextResultRef.current;
    const onFinishStart = Date.now();
    logTiming(
      "onFinish (stream terminou) total request",
      onFinishStart - ctx.requestStart
    );

    try {
      const logOnFinishDbError = (label: string, err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        const isTimeout =
          typeof (err as { code?: string })?.code === "string" &&
          (err as { code: string }).code === "57014";
        if (isDev || isTimeout) {
          console.warn(`[chat] ${label}:`, msg);
        }
      };
      let saveMessagesPromise: Promise<void>;
      if (ctx.isToolApprovalFlow) {
        saveMessagesPromise = (async () => {
          for (const finishedMsg of finishedMessages) {
            const existingMsg = ctx.uiMessages.find(
              (m) => m.id === finishedMsg.id
            );
            if (existingMsg) {
              await updateMessage({
                id: finishedMsg.id,
                parts: finishedMsg.parts,
              });
            } else {
              await saveMessages({
                messages: [
                  {
                    id: finishedMsg.id,
                    role: finishedMsg.role,
                    parts: finishedMsg.parts,
                    createdAt: new Date(),
                    attachments: [],
                    chatId: ctx.id,
                  },
                ],
              });
            }
          }
        })().catch((err: unknown) => {
          logOnFinishDbError(
            "saveMessages (tool-approval) em onFinish falhou",
            err
          );
        });
      } else if (finishedMessages.length > 0) {
        saveMessagesPromise = saveMessages({
          messages: finishedMessages.map((currentMessage) => ({
            id: currentMessage.id,
            role: currentMessage.role,
            parts: currentMessage.parts,
            createdAt: new Date(),
            attachments: [],
            chatId: ctx.id,
          })),
        })
          .then(() => undefined)
          .catch((err: unknown) => {
            logOnFinishDbError("saveMessages em onFinish falhou", err);
          });
      } else {
        saveMessagesPromise = Promise.resolve();
      }

      const creditsPromise =
        creditsDisabled || !streamTextResult
          ? Promise.resolve()
          : (async () => {
              try {
                const usage = await streamTextResult.totalUsage;
                const promptTokens =
                  "promptTokens" in usage
                    ? (usage as { promptTokens: number }).promptTokens
                    : ((usage as { inputTokens?: number }).inputTokens ?? 0);
                const completionTokens =
                  "completionTokens" in usage
                    ? (usage as { completionTokens: number }).completionTokens
                    : ((usage as { outputTokens?: number }).outputTokens ?? 0);
                const creditsConsumed = tokensToCredits(
                  promptTokens,
                  completionTokens
                );
                await deductCreditsAndRecordUsage({
                  userId: ctx.session.user.id,
                  chatId: ctx.id,
                  promptTokens,
                  completionTokens,
                  model: ctx.effectiveModel,
                  creditsConsumed,
                });
                creditsCache.delete(ctx.session.user.id);
              } catch (error_) {
                logOnFinishDbError(
                  "Falha ao registar uso/créditos em onFinish",
                  error_
                );
              }
            })();

      await Promise.all([saveMessagesPromise, creditsPromise]);

      after(() => {
        updateChatActiveStreamId({
          chatId: ctx.id,
          activeStreamId: null,
        }).catch((err: unknown) => {
          const isTimeout =
            typeof (err as { code?: string })?.code === "string" &&
            (err as { code: string }).code === "57014";
          if (isDev || isTimeout) {
            console.warn(
              "[chat] updateChatActiveStreamId em after falhou:",
              err instanceof Error ? err.message : err
            );
          }
        });
      });
    } catch (err) {
      if (isDev) {
        console.warn("[chat] onFinish falhou:", err);
      }
    }
    logTiming("onFinish completo", Date.now() - onFinishStart);
  };
}

/** Callback onError para createUIMessageStream. */
function streamOnErrorHandler(error: unknown): string {
  const fallback = "Ocorreu um erro ao processar o pedido. Tente novamente.";
  const err = error instanceof Error ? error : new Error(String(error));
  const isInsufficientFunds = /insufficient\s+funds/i.test(err.message);
  if (isInsufficientFunds) {
    const hint =
      "A conta Vercel não tem créditos para o AI Gateway. Adicione créditos em Vercel Dashboard → AI (top-up) ou use uma chave de API direta do fornecedor (ex.: ANTHROPIC_API_KEY) em desenvolvimento. Ver docs/vercel-setup.md.";
    return process.env.NODE_ENV === "development"
      ? `${hint} (dev: ${err.message})`
      : hint;
  }
  if (process.env.NODE_ENV === "development") {
    return `${fallback} (dev: ${err.message})`;
  }
  if (process.env.NODE_ENV === "production") {
    console.error("[chat] onError (produção):", err.message, err.stack);
  }
  return fallback;
}

/** Cria o handler consumeSseStream para createUIMessageStreamResponse. */
function createConsumeSseStreamHandler(chatId: string) {
  return async function consumeSseStream({
    stream: sseStream,
  }: {
    stream: ReadableStream<string>;
  }) {
    if (!process.env.REDIS_URL) {
      return;
    }
    try {
      const streamContext = getStreamContext();
      if (streamContext) {
        await updateChatActiveStreamId({
          chatId,
          activeStreamId: null,
        });
        const streamId = generateId();
        await createStreamId({ streamId, chatId });
        await streamContext.createNewResumableStream(streamId, () => sseStream);
        await updateChatActiveStreamId({
          chatId,
          activeStreamId: streamId,
        });
      }
    } catch {
      // Redis/stream context opcional: ignorar erros para não falhar o request
    }
  };
}

/** Cria o stream e a Response após as mensagens estarem preparadas. */
function buildStreamAndResponse(
  params: ChatStreamParams,
  prepared: {
    messagesForModel: Awaited<ReturnType<typeof withPromptCachingForAnthropic>>;
    preStreamEnd: number;
  }
): Response {
  const {
    requestStart,
    id,
    session,
    agentInstructions,
    agentConfig,
    effectiveModel,
    titlePromise,
    isToolApprovalFlow,
    uiMessages,
    requestHints,
    knowledgeContext,
    processoContext,
  } = params;
  const { messagesForModel, preStreamEnd } = prepared;

  const isReasoningModel =
    effectiveModel.includes("reasoning") || effectiveModel.includes("thinking");

  // Ref partilhada entre execute e onFinish: o SDK invoca execute antes de onFinish,
  // pelo que onFinish pode ler streamTextResultRef.current com segurança.
  const streamTextResultRef: { current: StreamTextResult | null } = {
    current: null,
  };

  const executeContext: StreamExecuteContext = {
    session,
    agentInstructions,
    agentConfig,
    agentId: agentConfig.id,
    effectiveModel,
    requestHints,
    knowledgeContext,
    processoContext,
    messagesForModel,
    isReasoningModel,
    titlePromise,
    id,
    requestStart,
    preStreamEnd,
    dbUsedFallback: params.dbUsedFallback,
  };

  const onFinishContext: StreamOnFinishContext = {
    requestStart,
    session,
    id,
    effectiveModel,
    isToolApprovalFlow,
    uiMessages,
  };

  const stream = createUIMessageStream({
    originalMessages: isToolApprovalFlow ? uiMessages : undefined,
    execute: createStreamExecuteHandler(executeContext, streamTextResultRef),
    generateId: generateUUID,
    onFinish: createStreamOnFinishHandler(onFinishContext, streamTextResultRef),
    onError: streamOnErrorHandler,
  });

  return createUIMessageStreamResponse({
    stream,
    consumeSseStream: createConsumeSseStreamHandler(id),
  });
}

/** Prepara mensagens para o modelo, cria o stream e devolve a Response. */
async function buildChatStreamResponse(
  params: ChatStreamParams
): Promise<Response> {
  const prepared = await prepareModelMessagesForStream(
    params,
    params.debugTracker
  );
  if ("response" in prepared) {
    return prepared.response;
  }
  return buildStreamAndResponse(params, prepared);
}

/** Devolve Response de erro se sessão/BD/conteúdo inválidos; caso contrário null. */
async function getEarlyValidationResponse(
  session: Session | null,
  message: PostRequestBody["message"]
): Promise<Response | null> {
  if (!session?.user) {
    return new ChatbotError("unauthorized:chat").toResponse();
  }
  const dbError = await ensureDbReady();
  if (dbError) {
    return dbError;
  }
  const contentError = validateUserMessageContent(message);
  return contentError ?? null;
}

/** Normaliza o agentId do body para string válida. */
function resolveAgentId(agentIdFromBody: PostRequestBody["agentId"]): string {
  const trimmed =
    agentIdFromBody && typeof agentIdFromBody === "string"
      ? agentIdFromBody.trim()
      : "";
  return trimmed || DEFAULT_AGENT_ID_WHEN_EMPTY;
}

/** Resolve AgentConfig a partir do resultado do batch (built-in vs custom). */
function resolveAgentConfigFromBatch(
  isBuiltInAgent: boolean,
  agentId: string,
  builtInOverrides: ChatDbBatchResult["builtInOverrides"],
  customAgentFromBatch: ChatDbBatchResult["customAgentFromBatch"]
): AgentConfig {
  if (isBuiltInAgent) {
    return getAgentConfigWithOverrides(agentId, builtInOverrides);
  }
  const customAgent = customAgentFromBatch;
  return customAgent
    ? getAgentConfigForCustomAgent(customAgent)
    : getAgentConfigWithOverrides(
        DEFAULT_AGENT_ID_WHEN_EMPTY,
        builtInOverrides
      );
}

/**
 * Resolve agentConfig + effectiveModel e valida Revisor; devolve Response (erro) ou dados.
 * Refatoração futura: lançar ChatbotError e deixar o try/catch do POST converter com toResponse().
 */
function getAgentConfigAndEffectiveModel(
  agentId: string,
  selectedChatModel: string,
  batchResult: ChatDbBatchResult,
  message: PostRequestBody["message"]
): Response | { agentConfig: AgentConfig; effectiveModel: string } {
  const agentConfig = resolveAgentConfigFromBatch(
    AGENT_IDS.includes(agentId as (typeof AGENT_IDS)[number]),
    agentId,
    batchResult.builtInOverrides,
    batchResult.customAgentFromBatch
  );
  const effectiveModel = isModelAllowedForAgent(agentId, selectedChatModel)
    ? selectedChatModel
    : getDefaultModelForAgent(agentId);
  const revisorError = validateRevisorDocumentParts(message, agentConfig);
  if (revisorError) {
    return revisorError;
  }
  return { agentConfig, effectiveModel };
}

/** Parâmetros para runCreditsAndPersist. */
interface CreditsAndPersistParams {
  messageCount: number;
  userType: UserType;
  balanceFromDb: number;
  session: { user: { id: string } };
  initialCredits: number;
  chat: Awaited<ReturnType<typeof getChatById>>;
  id: string;
  message: PostRequestBody["message"];
  agentId: string;
  selectedVisibilityType: PostRequestBody["selectedVisibilityType"];
  isToolApprovalFlow: boolean;
  processoId?: string | null;
}

/** Executa verificação de créditos e persistência do chat; devolve Response ou titlePromise. */
async function runCreditsAndPersist(
  params: CreditsAndPersistParams
): Promise<Response | { titlePromise: Promise<string> | null }> {
  const creditsResult = await checkRateLimitAndCredits(
    params.messageCount,
    params.userType,
    params.balanceFromDb,
    params.session,
    params.initialCredits
  );
  if (creditsResult instanceof Response) {
    return creditsResult;
  }
  const persistResult = await persistChatAndGetTitlePromise(
    params.chat,
    params.session,
    params.id,
    params.message,
    params.agentId,
    params.selectedVisibilityType,
    params.isToolApprovalFlow,
    params.processoId
  );
  if (persistResult instanceof Response) {
    return persistResult;
  }
  return { titlePromise: persistResult.titlePromise };
}

function logChatRequestStart(agentId: string): void {
  if (isDev) {
    console.info(
      "[chat-timing] POST /api/chat request started",
      "(agentId:",
      agentId,
      ")"
    );
  }
}

function logDbBatchStart(): void {
  if (isDev) {
    console.info("[chat-timing] dbBatch: starting…");
  }
}

function logDbBatchComplete(t1: number): void {
  if (isDev) {
    console.info(
      `[chat-timing] dbBatch: all done in ${Math.round(Date.now() - t1)}ms`
    );
  }
}

/** Lógica principal do POST /api/chat após parse do body (session e sucesso). */
async function handleChatPostAuthenticated(
  request: Request,
  requestBody: PostRequestBody,
  requestStart: number,
  debugTracker: ReturnType<typeof createChatDebugTracker>
): Promise<Response> {
  const {
    id,
    message,
    messages,
    selectedChatModel,
    selectedVisibilityType,
    agentInstructions,
    knowledgeDocumentIds,
    archivoIds,
    agentId: agentIdFromBody,
    processoId,
  } = requestBody;

  const agentId = resolveAgentId(agentIdFromBody);
  logChatRequestStart(agentId);
  if (isChatDebugEnabled()) {
    logChatDebug("request", {
      chatId: id,
      agentId,
      model: selectedChatModel,
      knowledgeIds: knowledgeDocumentIds?.length ?? 0,
      archivoIds: archivoIds?.length ?? 0,
      hasMessage: Boolean(message),
      messageParts: message?.parts?.length ?? 0,
    });
  }

  const t0 = Date.now();
  const session = await auth();
  debugTracker.phase("auth", t0);
  logTiming("auth", Date.now() - t0);

  const earlyError = await getEarlyValidationResponse(session, message);
  if (earlyError) {
    return earlyError;
  }
  const authenticatedSession = session as Session;

  const userType: UserType = authenticatedSession.user.type;
  const isToolApprovalFlow = Boolean(messages);
  const initialCredits = entitlementsByUserType[userType].initialCredits;

  const messageText =
    message?.parts?.map((p) => ("text" in p ? p.text : "")).join(" ") ?? "";

  // Pre-fetch processo (se processoId veio no request) para incluir os seus docs KB no RAG.
  const earlyProc = processoId
    ? await getProcessoById({
        id: processoId,
        userId: authenticatedSession.user.id,
      })
    : null;

  const effectiveKnowledgeIds = resolveEffectiveKnowledgeIds(
    [
      ...(knowledgeDocumentIds ?? []),
      ...((earlyProc?.knowledgeDocumentIds as string[] | null) ?? []),
    ],
    agentId,
    messageText,
    agentInstructions
  );
  const redatorBancoAllowedUserIds = effectiveKnowledgeIds.includes(
    REDATOR_BANCO_KNOWLEDGE_DOCUMENT_ID
  )
    ? [REDATOR_BANCO_SYSTEM_USER_ID]
    : undefined;

  await ensureUserExistsInDb(
    authenticatedSession.user.id,
    authenticatedSession.user.email ?? null
  );

  const isBuiltInAgent = AGENT_IDS.includes(
    agentId as (typeof AGENT_IDS)[number]
  );
  const t1 = Date.now();
  logDbBatchStart();
  const batchResult = await runChatDbBatch(
    authenticatedSession,
    id,
    agentId,
    isBuiltInAgent,
    effectiveKnowledgeIds,
    redatorBancoAllowedUserIds,
    initialCredits
  );
  if (batchResult instanceof Response) {
    return batchResult;
  }

  const agentResult = getAgentConfigAndEffectiveModel(
    agentId,
    selectedChatModel,
    batchResult,
    message
  );
  if (agentResult instanceof Response) {
    return agentResult;
  }
  const { agentConfig, effectiveModel } = agentResult;

  debugTracker.phase("dbBatch", t1);
  logDbBatchComplete(t1);
  logTiming(
    "getMessageCount + getChat + getMessages + knowledge + overrides + credits (paralelo)",
    Date.now() - t1
  );

  const creditsPersistResult = await runCreditsAndPersist({
    messageCount: batchResult.messageCount,
    userType,
    balanceFromDb: batchResult.balanceFromDb,
    session: authenticatedSession,
    initialCredits,
    chat: batchResult.chat,
    id,
    message,
    agentId,
    selectedVisibilityType,
    isToolApprovalFlow,
    processoId: processoId ?? null,
  });
  if (creditsPersistResult instanceof Response) {
    return creditsPersistResult;
  }
  const titlePromise = creditsPersistResult.titlePromise;

  const effectiveMessagesFromDb =
    batchResult.chat && !isToolApprovalFlow ? batchResult.messagesFromDb : [];

  let uiMessages: ChatMessage[] = isToolApprovalFlow
    ? (messages as ChatMessage[])
    : [...convertToUIMessages(effectiveMessagesFromDb), message as ChatMessage];

  const normalizedForValidation =
    !isToolApprovalFlow && uiMessages.length > 0
      ? normalizeMessageParts(uiMessages)
      : uiMessages;

  const lastUserText =
    message?.parts
      ?.filter((p) => (p as { type?: string }).type === "text")
      .map((p) => (p as { text?: string }).text ?? "")
      .join(" ")
      .trim() ?? "";

  const t2 = Date.now();
  const {
    uiMessages: validatedUiMessages,
    ragChunks,
    userFilesFromArchivos,
  } = await runValidationRagUserFiles({
    normalizedForValidation,
    isToolApprovalFlow,
    knowledgeDocsResult: batchResult.knowledgeDocsResult,
    lastUserText,
    session: authenticatedSession,
    effectiveKnowledgeIds,
    agentId,
    redatorBancoAllowedUserIds,
    archivoIds,
  });
  debugTracker.phase("validationRag", t2);
  uiMessages = validatedUiMessages;

  const { longitude, latitude, city, country } = geolocation(request);
  const requestHints: RequestHints = {
    longitude,
    latitude,
    city,
    country,
  };

  const knowledgeContext = buildKnowledgeContextFromParts(
    ragChunks,
    batchResult.knowledgeDocsResult,
    userFilesFromArchivos,
    effectiveKnowledgeIds
  );

  // Injetar contexto do processo trabalhista no system prompt quando o chat está vinculado a um processo.
  // earlyProc já foi fetched acima (quando processoId veio no request).
  // Se processoId veio do chat existente (batchResult.chat.processoId), faz fetch aqui em paralelo.
  const effectiveProcessoId =
    processoId ?? batchResult.chat?.processoId ?? null;
  const needsLateFetch =
    effectiveProcessoId && !earlyProc && effectiveProcessoId !== processoId;
  const t4 = Date.now();
  const [lateProc, saveUserErr] = await Promise.all([
    needsLateFetch
      ? getProcessoById({
          id: effectiveProcessoId,
          userId: authenticatedSession.user.id,
        })
      : Promise.resolve(null),
    saveUserMessageToDb(message, id),
  ]);
  const proc = earlyProc ?? lateProc;
  if (message?.role === "user") {
    debugTracker.phase("saveMessages", t4);
    logTiming("saveMessages(user)", Date.now() - t4);
  }
  if (saveUserErr) {
    return saveUserErr;
  }

  let processoContext: string | undefined;
  if (proc) {
    processoContext = [
      `Número: ${proc.numeroAutos}`,
      `Reclamante: ${proc.reclamante}`,
      `Reclamada: ${proc.reclamada}`,
      proc.vara ? `Vara: ${proc.vara}` : null,
      proc.comarca ? `Comarca: ${proc.comarca}` : null,
      proc.tribunal ? `Tribunal: ${proc.tribunal}` : null,
      proc.rito
        ? `Rito: ${proc.rito === "sumarissimo" ? "Sumaríssimo" : "Ordinário"}`
        : null,
      proc.fase ? `Fase atual: ${FASE_LABEL[proc.fase] ?? proc.fase}` : null,
      proc.riscoGlobal
        ? `Risco global: ${RISCO_LABEL[proc.riscoGlobal] ?? proc.riscoGlobal}`
        : null,
    ]
      .filter(Boolean)
      .join("\n");
  }

  return buildChatStreamResponse({
    requestStart,
    debugTracker,
    id,
    message,
    session: authenticatedSession,
    agentInstructions,
    agentConfig,
    effectiveModel,
    titlePromise,
    isToolApprovalFlow,
    uiMessages,
    requestHints,
    knowledgeContext,
    processoContext,
    dbUsedFallback: batchResult.usedFallback ?? false,
  });
}

export async function POST(request: Request) {
  const parsed = await parsePostBody(request);
  if (parsed instanceof Response) {
    return parsed;
  }
  const requestBody = truncateDocumentPartsInBody(parsed);

  const requestStart = Date.now();
  const debugTracker = createChatDebugTracker();

  try {
    return await handleChatPostAuthenticated(
      request,
      requestBody,
      requestStart,
      debugTracker
    );
  } catch (error) {
    return handleChatPostError(error, request);
  }
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return new ChatbotError("bad_request:api").toResponse();
  }

  const session = await auth();

  if (!session?.user) {
    return new ChatbotError("unauthorized:chat").toResponse();
  }

  const chat = await getChatById({ id });

  if (chat == null) {
    return new ChatbotError("not_found:chat").toResponse();
  }
  if (chat.userId !== session.user.id) {
    return new ChatbotError("forbidden:chat").toResponse();
  }

  const deletedChat = await deleteChatById({ id });

  return Response.json(deletedChat, { status: 200 });
}
