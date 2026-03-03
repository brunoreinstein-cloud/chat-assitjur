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
  applyContextEditing,
  CONTEXT_WINDOW_INPUT_TARGET_TOKENS,
  estimateInputTokens,
} from "@/lib/ai/context-window";
import { MIN_CREDITS_TO_START_CHAT, tokensToCredits } from "@/lib/ai/credits";
import { entitlementsByUserType } from "@/lib/ai/entitlements";
import {
  createChatDebugTracker,
  isChatDebugEnabled,
  logChatDebug,
} from "@/lib/ai/chat-debug";
import { getPromptCachingCacheControl } from "@/lib/ai/prompt-caching-config";
import { type RequestHints, systemPrompt } from "@/lib/ai/prompts";
import { getLanguageModel } from "@/lib/ai/providers";
import {
  REDATOR_BANCO_KNOWLEDGE_DOCUMENT_ID,
  REDATOR_BANCO_SYSTEM_USER_ID,
} from "@/lib/ai/redator-banco-rag";
import { createDocument } from "@/lib/ai/tools/create-document";
import { createRedatorContestacaoDocument } from "@/lib/ai/tools/create-redator-contestacao-document";
import { createRevisorDefesaDocuments } from "@/lib/ai/tools/create-revisor-defesa-documents";
import { getWeather } from "@/lib/ai/tools/get-weather";
import { improvePromptTool } from "@/lib/ai/tools/improve-prompt";
import { requestSuggestions } from "@/lib/ai/tools/request-suggestions";
import { updateDocument } from "@/lib/ai/tools/update-document";
import { validationToolsForValidate } from "@/lib/ai/tools/validation-tools";
import { creditsCache } from "@/lib/cache/credits-cache";
import { isProductionEnvironment } from "@/lib/constants";
import { getCachedBuiltInAgentOverrides } from "@/lib/cache/agent-overrides-cache";
import {
  addCreditsToUser,
  createStreamId,
  deductCreditsAndRecordUsage,
  deleteChatById,
  ensureStatementTimeout,
  getChatById,
  getCustomAgentById,
  getKnowledgeDocumentsByIds,
  getMessageCountByUserId,
  getMessagesByChatId,
  getOrCreateCreditBalance,
  getUserFilesByIds,
  saveChat,
  saveMessages,
  updateChatActiveStreamId,
  updateChatAgentId,
  updateChatTitleById,
  updateMessage,
} from "@/lib/db/queries";
import { ChatbotError } from "@/lib/errors";
import { retrieveKnowledgeContext } from "@/lib/rag";
import type { ChatMessage } from "@/lib/types";
import { convertToUIMessages, generateUUID } from "@/lib/utils";
import { generateTitleFromUserMessage } from "../../actions";
import { type PostRequestBody, postRequestBodySchema } from "./schema";

/** Limite de execução da rota (segundos). A duração total do pedido é dominada pelo streaming do modelo; aumentar em vercel.json se precisar de respostas muito longas. */
export const maxDuration = 120;

const isDev = process.env.NODE_ENV === "development";

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
  const augmented: T = {
    ...last,
    providerOptions: {
      ...(typeof last.providerOptions === "object" &&
      last.providerOptions !== null
        ? (last.providerOptions as object)
        : {}),
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
const MAX_CHARS_PER_DOCUMENT = 35_000;
/** Máximo total de caracteres de documentos numa única mensagem. */
const MAX_TOTAL_DOC_CHARS = 100_000;

/** Últimas N mensagens a carregar para contexto (reduz BD e tamanho do prompt; a qualidade mantém-se com contexto recente). */
const CHAT_MESSAGES_LIMIT = 80;

/** Máximo de caracteres da base de conhecimento no system prompt (reduz custo de tokens). */
const MAX_KNOWLEDGE_CONTEXT_CHARS = 50_000;

function getDocumentPartLabel(documentType: string | undefined): string {
  if (documentType === "pi") {
    return "Petição Inicial";
  }
  if (documentType === "contestacao") {
    return "Contestação";
  }
  return "Documento";
}

function fillKnowledgeFromFullDocsWhenEmpty(
  parts: string[],
  docs: Array<{ id: string; title: string; content: string }>
): void {
  const shouldFillFromFullDocs = parts.length === 0;
  if (shouldFillFromFullDocs) {
    for (const doc of docs) {
      parts.push(wrapKnowledgeDocument(doc.id, doc.title, doc.content));
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

/** Converte partes do tipo "document" (PDF/DOCX) em partes "text" para o modelo. Ordena PI antes de Contestação. Trunca texto para não exceder o limite do modelo. Remove partes inválidas para o AI SDK (ex.: tool sem toolCallId vindas da BD). */
function normalizeMessageParts(messages: ChatMessage[]): ChatMessage[] {
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
      const maxForThis = Math.min(MAX_CHARS_PER_DOCUMENT, remaining);
      const truncated =
        p.text.length > maxForThis
          ? `${p.text.slice(0, maxForThis)}\n\n[... texto truncado para caber no limite do modelo ...]`
          : p.text;
      totalDocChars += truncated.length;
      const label = getDocumentPartLabel(p.documentType);
      return [
        {
          type: "text" as const,
          text: `[${label}: ${p.name}]\n\n${truncated}`,
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

    const normalizedParts = [...docTextParts, ...normalizedOther].filter(
      isPartValidForModel
    );
    return { ...msg, parts: normalizedParts } as ChatMessage;
  }) as ChatMessage[];
}

function getStreamContext() {
  try {
    return createResumableStreamContext({ waitUntil: after });
  } catch {
    return null;
  }
}

function resolveEffectiveKnowledgeIds(
  knowledgeDocumentIds: string[] | undefined,
  userId: string | undefined,
  agentId: string
): string[] {
  if (knowledgeDocumentIds?.length && userId) {
    return knowledgeDocumentIds;
  }
  if (agentId === AGENT_ID_REDATOR_CONTESTACAO) {
    return [REDATOR_BANCO_KNOWLEDGE_DOCUMENT_ID];
  }
  return [];
}

const REDATOR_BANCO_UNAVAILABLE_MESSAGE =
  "[Banco de Teses Padrão não disponível. Para satisfazer (B), o utilizador deve selecionar documentos na Base de conhecimento (sidebar) ou anexar modelo/banco de teses.]";

function buildKnowledgeContext(
  rawKnowledgeContext: string,
  agentId: string,
  effectiveKnowledgeIds: string[]
): string | undefined {
  if (rawKnowledgeContext.length > MAX_KNOWLEDGE_CONTEXT_CHARS) {
    return `${rawKnowledgeContext.slice(0, MAX_KNOWLEDGE_CONTEXT_CHARS)}\n\n[... base de conhecimento truncada para caber no limite ...]`;
  }
  const redatorBancoIntendedButEmpty =
    agentId === AGENT_ID_REDATOR_CONTESTACAO &&
    effectiveKnowledgeIds.includes(REDATOR_BANCO_KNOWLEDGE_DOCUMENT_ID) &&
    rawKnowledgeContext.length === 0;
  if (redatorBancoIntendedButEmpty) {
    return REDATOR_BANCO_UNAVAILABLE_MESSAGE;
  }
  return rawKnowledgeContext || undefined;
}

export async function POST(request: Request) {
  let requestBody: PostRequestBody;

  try {
    const json = await request.json();
    requestBody = postRequestBodySchema.parse(json);
  } catch (error: unknown) {
    const isDev = process.env.NODE_ENV === "development";
    let cause: string | undefined;
    if (isDev && error instanceof Error) {
      if (error instanceof ZodError && error.issues.length > 0) {
        const first = error.issues[0];
        const path = first.path.join(".");
        cause = path ? `${path}: ${first.message}` : first.message;
        console.error(
          "[POST /api/chat] Validação falhou:",
          cause,
          error.issues
        );
      } else {
        cause = error.message;
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

  const requestStart = Date.now();
  const debugTracker = createChatDebugTracker();

  try {
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
    } = requestBody;

    const agentId =
      agentIdFromBody && typeof agentIdFromBody === "string"
        ? agentIdFromBody.trim() || DEFAULT_AGENT_ID_WHEN_EMPTY
        : DEFAULT_AGENT_ID_WHEN_EMPTY;

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

    if (!session?.user) {
      return new ChatbotError("unauthorized:chat").toResponse();
    }

    await ensureStatementTimeout();

    if (message?.role === "user" && message.parts) {
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
    }

    const userType: UserType = session.user.type;
    const isToolApprovalFlow = Boolean(messages);
    const initialCredits = entitlementsByUserType[userType].initialCredits;

    const effectiveKnowledgeIds = resolveEffectiveKnowledgeIds(
      knowledgeDocumentIds,
      session.user.id,
      agentId
    );
    const redatorBancoAllowedUserIds =
      agentId === AGENT_ID_REDATOR_CONTESTACAO &&
      effectiveKnowledgeIds.includes(REDATOR_BANCO_KNOWLEDGE_DOCUMENT_ID)
        ? [REDATOR_BANCO_SYSTEM_USER_ID]
        : undefined;

    const isBuiltInAgent = AGENT_IDS.includes(
      agentId as (typeof AGENT_IDS)[number]
    );
    const t1 = Date.now();
    const [
      messageCount,
      chat,
      messagesFromDb,
      knowledgeDocsResult,
      builtInOverridesFromBatch,
      balanceFromDb,
      customAgentFromBatch,
    ] = await Promise.all([
      getMessageCountByUserId({
        id: session.user.id,
        differenceInHours: 24,
      }),
      getChatById({ id }),
      getMessagesByChatId({ id, limit: CHAT_MESSAGES_LIMIT }),
      effectiveKnowledgeIds.length > 0
        ? getKnowledgeDocumentsByIds({
            ids: effectiveKnowledgeIds,
            userId: session.user.id,
            allowedUserIds: redatorBancoAllowedUserIds,
          })
        : Promise.resolve(
            [] as Awaited<ReturnType<typeof getKnowledgeDocumentsByIds>>
          ),
      getCachedBuiltInAgentOverrides(),
      getOrCreateCreditBalance(session.user.id, initialCredits).catch(() => {
        if (process.env.NODE_ENV === "development") {
          console.warn(
            "[chat] Credit balance unavailable (tabela de créditos?), a usar saldo inicial."
          );
        }
        return initialCredits;
      }),
      isBuiltInAgent
        ? Promise.resolve(
            null as Awaited<ReturnType<typeof getCustomAgentById>>
          )
        : getCustomAgentById({
            id: agentId,
            userId: session.user.id,
          }),
    ]);
    const builtInOverrides = builtInOverridesFromBatch as Record<
      string,
      { instructions: string | null; label: string | null }
    >;

    let agentConfig: AgentConfig;
    if (isBuiltInAgent) {
      agentConfig = getAgentConfigWithOverrides(agentId, builtInOverrides);
    } else {
      const customAgent = customAgentFromBatch;
      agentConfig = customAgent
        ? getAgentConfigForCustomAgent(customAgent)
        : getAgentConfigWithOverrides(
            DEFAULT_AGENT_ID_WHEN_EMPTY,
            builtInOverrides
          );
    }

    const effectiveModel = isModelAllowedForAgent(agentId, selectedChatModel)
      ? selectedChatModel
      : getDefaultModelForAgent(agentId);

    if (message?.role === "user" && message.parts) {
      const isRevisorAgent = agentConfig.useRevisorDefesaTools;
      if (isRevisorAgent) {
        const documentParts = message.parts.filter(
          (p) => (p as { type?: string }).type === "document"
        ) as DocumentPartLike[];
        const hasDocParts = documentParts.length > 0;
        if (hasDocParts) {
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
        }
      }
    }

    debugTracker.phase("dbBatch", t1);
    logTiming(
      "getMessageCount + getChat + getMessages + knowledge + overrides + credits (paralelo)",
      Date.now() - t1
    );

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
      }
      if (balance < MIN_CREDITS_TO_START_CHAT) {
        return new ChatbotError(
          "rate_limit:chat",
          `Sem créditos suficientes para enviar mensagens. Saldo atual: ${balance} créditos. Contacte o administrador para recarregar.`
        ).toResponse();
      }
    }

    let titlePromise: Promise<string> | null = null;

    if (chat) {
      if (chat.userId !== session.user.id) {
        return new ChatbotError("forbidden:chat").toResponse();
      }
      // Persistir alteração de agente quando o utilizador envia mensagem com outro agente selecionado
      if (
        message?.role === "user" &&
        (chat.agentId ?? DEFAULT_AGENT_ID_WHEN_EMPTY) !== agentId
      ) {
        await updateChatAgentId({ chatId: id, agentId });
      }
      // messagesFromDb já vem do Promise.all (últimas CHAT_MESSAGES_LIMIT mensagens quando chat existe)
      if (isToolApprovalFlow) {
        // No tool-approval flow o cliente envia as mensagens; não usamos as da BD
      }
    } else if (message?.role === "user") {
      await saveChat({
        id,
        userId: session.user.id,
        title: "New chat",
        visibility: selectedVisibilityType,
        agentId,
      });
      titlePromise = generateTitleFromUserMessage({
        message: normalizeMessageParts([message as ChatMessage])[0],
      });
    }

    const effectiveMessagesFromDb =
      chat && !isToolApprovalFlow ? messagesFromDb : [];

    let uiMessages: ChatMessage[] = isToolApprovalFlow
      ? (messages as ChatMessage[])
      : [
          ...convertToUIMessages(effectiveMessagesFromDb),
          message as ChatMessage,
        ];

    // Normalizar antes da validação: partes "document" (PI/Contestação) passam a "text",
    // para a validação do AI SDK aceitar e para preservar histórico na conversa (memória).
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
    const [validationResult, ragChunks, userFilesFromArchivos] =
      await Promise.all([
        !isToolApprovalFlow && normalizedForValidation.length > 0
          ? safeValidateUIMessages({
              messages: normalizedForValidation,
              tools: validationToolsForValidate,
            })
          : Promise.resolve({
              success: false as const,
              data: normalizedForValidation,
              error: undefined,
            }),
        knowledgeDocsResult.length > 0 && lastUserText.length > 0
          ? retrieveKnowledgeContext({
              userId: session.user.id,
              documentIds: effectiveKnowledgeIds,
              queryText: lastUserText,
              limit: agentId === AGENT_ID_REDATOR_CONTESTACAO ? 24 : 12,
              allowedUserIds: redatorBancoAllowedUserIds,
            })
          : Promise.resolve<
              Awaited<ReturnType<typeof retrieveKnowledgeContext>>
            >([]),
        archivoIds != null && archivoIds.length > 0 && session.user.id != null
          ? getUserFilesByIds({
              ids: archivoIds,
              userId: session.user.id,
            })
          : Promise.resolve<Awaited<ReturnType<typeof getUserFilesByIds>>>([]),
      ]);
    debugTracker.phase("validationRag", t2);
    logTiming("validação + RAG + getUserFiles (paralelo)", Date.now() - t2);

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

    const { longitude, latitude, city, country } = geolocation(request);

    const requestHints: RequestHints = {
      longitude,
      latitude,
      city,
      country,
    };

    const knowledgeDocParts: string[] = [];
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
      fillKnowledgeFromFullDocsWhenEmpty(
        knowledgeDocParts,
        knowledgeDocsResult
      );
    }
    for (const uf of userFilesFromArchivos) {
      if (
        typeof uf.extractedTextCache === "string" &&
        uf.extractedTextCache.trim().length > 0
      ) {
        knowledgeDocParts.push(
          wrapKnowledgeDocument(
            uf.id,
            uf.filename,
            uf.extractedTextCache.trim()
          )
        );
      }
    }
    const rawKnowledgeContext =
      knowledgeDocParts.length > 0
        ? `<knowledge_base>\n${knowledgeDocParts.join("\n\n")}\n</knowledge_base>`
        : "";
    const knowledgeContext = buildKnowledgeContext(
      rawKnowledgeContext,
      agentId,
      effectiveKnowledgeIds
    );

    if (message?.role === "user") {
      const t4 = Date.now();
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
        return new ChatbotError(
          "bad_request:database",
          "Não foi possível guardar a mensagem. Tenta novamente."
        ).toResponse();
      }
      debugTracker.phase("saveMessages", t4);
      logTiming("saveMessages(user)", Date.now() - t4);
    }

    const isReasoningModel =
      effectiveModel.includes("reasoning") ||
      effectiveModel.includes("thinking");

    const t5 = Date.now();
    const normalizedMessages = normalizeMessageParts(uiMessages);
    const effectiveAgentInstructionsForContext =
      agentInstructions?.trim() || agentConfig.instructions;
    const systemStrForEstimate = systemPrompt({
      selectedChatModel: effectiveModel,
      requestHints,
      agentInstructions: effectiveAgentInstructionsForContext,
      knowledgeContext,
    });
    const messagesToSend = applyContextEditing(normalizedMessages);
    const estimatedInputTokens = estimateInputTokens(
      systemStrForEstimate.length,
      messagesToSend
    );
    if (estimatedInputTokens > CONTEXT_WINDOW_INPUT_TARGET_TOKENS) {
      return Response.json(
        {
          code: "context_limit",
          message:
            "O contexto desta conversa excede o limite do modelo. Por favor, inicia um novo chat ou encurta a conversa.",
          estimatedTokens: estimatedInputTokens,
          limit: CONTEXT_WINDOW_INPUT_TARGET_TOKENS,
        },
        { status: 413 }
      );
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
          ? normalizeMessageParts([message as ChatMessage])
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

    type StreamTextResult = Awaited<ReturnType<typeof streamText>>;
    let streamTextResult: StreamTextResult | null = null;

    const stream = createUIMessageStream({
      originalMessages: isToolApprovalFlow ? uiMessages : undefined,
      execute: async ({ writer: dataStream }) => {
        const executeStartedAt = Date.now();
        if (isChatDebugEnabled()) {
          dataStream.write({
            type: "data-chat-debug",
            data: {
              preStreamMs: preStreamEnd - requestStart,
              executeStartedMs: executeStartedAt - requestStart,
            },
          });
        }
        logTiming(
          "execute started (modelo + tools a correr)",
          executeStartedAt - requestStart
        );
        const effectiveAgentInstructions =
          agentInstructions?.trim() || agentConfig.instructions;

        const baseToolNames = [
          "getWeather",
          "createDocument",
          "updateDocument",
          "requestSuggestions",
          "improvePrompt",
        ] as const;
        type ActiveToolName =
          | (typeof baseToolNames)[number]
          | "createRevisorDefesaDocuments"
          | "createRedatorContestacaoDocument";
        const activeToolNames: ActiveToolName[] = isReasoningModel
          ? []
          : [
              ...baseToolNames,
              ...(agentConfig.useRevisorDefesaTools
                ? (["createRevisorDefesaDocuments"] as const)
                : []),
              ...(agentConfig.useRedatorContestacaoTool
                ? (["createRedatorContestacaoDocument"] as const)
                : []),
            ];

        const tools = {
          getWeather,
          createDocument: createDocument({ session, dataStream }),
          updateDocument: updateDocument({ session, dataStream }),
          requestSuggestions: requestSuggestions({ session, dataStream }),
          improvePrompt: improvePromptTool,
        } as {
          getWeather: typeof getWeather;
          createDocument: ReturnType<typeof createDocument>;
          updateDocument: ReturnType<typeof updateDocument>;
          requestSuggestions: ReturnType<typeof requestSuggestions>;
          improvePrompt: typeof improvePromptTool;
          createRevisorDefesaDocuments?: ReturnType<
            typeof createRevisorDefesaDocuments
          >;
          createRedatorContestacaoDocument?: ReturnType<
            typeof createRedatorContestacaoDocument
          >;
        };
        if (agentConfig.useRevisorDefesaTools) {
          tools.createRevisorDefesaDocuments = createRevisorDefesaDocuments({
            session,
            dataStream,
          });
        }
        if (agentConfig.useRedatorContestacaoTool) {
          tools.createRedatorContestacaoDocument =
            createRedatorContestacaoDocument({
              session,
              dataStream,
            });
        }

        const result = streamText({
          model: getLanguageModel(effectiveModel),
          temperature: 0.2,
          maxOutputTokens: 8192,
          system: systemPrompt({
            selectedChatModel: effectiveModel,
            requestHints,
            agentInstructions: effectiveAgentInstructions,
            knowledgeContext,
          }),
          messages: messagesForModel,
          stopWhen: stepCountIs(5),
          experimental_activeTools: activeToolNames,
          providerOptions: isReasoningModel
            ? {
                anthropic: {
                  thinking: {
                    type: "enabled",
                    budgetTokens: 4_000,
                  },
                },
              }
            : undefined,
          tools,
          experimental_telemetry: {
            isEnabled: isProductionEnvironment,
            functionId: "stream-text",
          },
        });
        streamTextResult = result as unknown as StreamTextResult;

        dataStream.merge(result.toUIMessageStream({ sendReasoning: true }));

        if (titlePromise) {
          const title = await titlePromise;
          dataStream.write({ type: "data-chat-title", data: title });
          updateChatTitleById({ chatId: id, title });
        }
      },
      generateId: generateUUID,
      onFinish: async ({ messages: finishedMessages }) => {
        const onFinishStart = Date.now();
        logTiming(
          "onFinish (stream terminou) total request",
          onFinishStart - requestStart
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
          if (isToolApprovalFlow) {
            saveMessagesPromise = (async () => {
              for (const finishedMsg of finishedMessages) {
                const existingMsg = uiMessages.find(
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
                        chatId: id,
                      },
                    ],
                  });
                }
              }
            })().catch((err: unknown) => {
              logOnFinishDbError("saveMessages (tool-approval) em onFinish falhou", err);
            });
          } else if (finishedMessages.length > 0) {
            saveMessagesPromise = saveMessages({
              messages: finishedMessages.map((currentMessage) => ({
                id: currentMessage.id,
                role: currentMessage.role,
                parts: currentMessage.parts,
                createdAt: new Date(),
                attachments: [],
                chatId: id,
              })),
            })
              .then(() => undefined)
              .catch((err: unknown) => {
                logOnFinishDbError("saveMessages em onFinish falhou", err);
              });
          } else {
            saveMessagesPromise = Promise.resolve();
          }

          const creditsPromise = streamTextResult
            ? (async () => {
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
                    userId: session.user.id,
                    chatId: id,
                    promptTokens,
                    completionTokens,
                    model: effectiveModel,
                    creditsConsumed,
                  });
                  creditsCache.delete(session.user.id);
                } catch (error_) {
                  logOnFinishDbError(
                    "Falha ao registar uso/créditos em onFinish",
                    error_
                  );
                }
              })()
            : Promise.resolve();

          await Promise.all([saveMessagesPromise, creditsPromise]);

          after(() => {
            void updateChatActiveStreamId({
              chatId: id,
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
      },
      onError: (error: unknown) => {
        const fallback =
          "Ocorreu um erro ao processar o pedido. Tente novamente.";
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
      },
    });

    return createUIMessageStreamResponse({
      stream,
      async consumeSseStream({ stream: sseStream }) {
        if (!process.env.REDIS_URL) {
          return;
        }
        try {
          const streamContext = getStreamContext();
          if (streamContext) {
            await updateChatActiveStreamId({
              chatId: id,
              activeStreamId: null,
            });
            const streamId = generateId();
            await createStreamId({ streamId, chatId: id });
            await streamContext.createNewResumableStream(
              streamId,
              () => sseStream
            );
            await updateChatActiveStreamId({
              chatId: id,
              activeStreamId: streamId,
            });
          }
        } catch {
          // Redis/stream context opcional: ignorar erros para não falhar o request
        }
      },
    });
  } catch (error) {
    const vercelId = request.headers.get("x-vercel-id");

    if (error instanceof ChatbotError) {
      return error.toResponse();
    }

    if (
      error instanceof Error &&
      error.message?.includes(
        "AI Gateway requires a valid credit card on file to service requests"
      )
    ) {
      return new ChatbotError("bad_request:activate_gateway").toResponse();
    }

    // API overload (ex.: Anthropic 529)
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

    console.error("Unhandled error in chat API:", error, { vercelId });
    return new ChatbotError("offline:chat").toResponse();
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

  if (chat?.userId !== session.user.id) {
    return new ChatbotError("forbidden:chat").toResponse();
  }

  const deletedChat = await deleteChatById({ id });

  return Response.json(deletedChat, { status: 200 });
}
