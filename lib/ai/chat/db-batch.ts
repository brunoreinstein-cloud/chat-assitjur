/**
 * Operações de BD em paralelo para o chat.
 * Extraído de app/(chat)/api/chat/route.ts.
 */

import type { Session } from "next-auth";
import { generateTitleFromUserMessage } from "@/app/(chat)/actions";
import type { PostRequestBody } from "@/app/(chat)/api/chat/schema";
import {
  getDefaultModelForAgent,
  isModelAllowedForAgent,
} from "@/lib/ai/agent-models";
import type { AgentConfig } from "@/lib/ai/agents-registry";
import {
  AGENT_IDS,
  DEFAULT_AGENT_ID_WHEN_EMPTY,
  getAgentConfigForCustomAgent,
  getAgentConfigWithOverrides,
} from "@/lib/ai/agents-registry";
import { DEFAULT_CHAT_MODEL } from "@/lib/ai/models";
import { getCachedBuiltInAgentOverrides } from "@/lib/cache/agent-overrides-cache";
import { creditsCache } from "@/lib/cache/credits-cache";
import {
  createTaskExecution,
  getChatById,
  getCustomAgentById,
  getKnowledgeDocumentsByIds,
  getMessageCountByUserId,
  getMessagesByChatId,
  getOrCreateCreditBalance,
  saveChat,
  saveMessages,
  updateChatAgentId,
} from "@/lib/db/queries";
import {
  ChatbotError,
  databaseUnavailableResponse,
  isDatabaseConnectionError,
  isLikelyDatabaseError,
  isStatementTimeoutError,
} from "@/lib/errors";
import type { ChatMessage } from "@/lib/types";
import {
  checkRateLimitAndCredits,
  normalizeMessageParts,
  truncateDocumentPartsForDb,
  validateRevisorDocumentParts,
} from "./parse-request";
import type { ChatDbBatchResult, CreditsAndPersistParams } from "./types";
import {
  CHAT_MESSAGES_LIMIT,
  CREDITS_CACHE_USAGE_LIMIT,
  CREDITS_IN_BATCH_TIMEOUT_MS,
  creditsDisabled,
  DB_BATCH_TIMEOUT_MS,
  isDev,
  PER_QUERY_TIMEOUT_MS,
  withFallbackTimeout,
  withTimingLog,
} from "./utils";

type UserMessagePart = NonNullable<PostRequestBody["message"]>["parts"][number];

/** Executa o batch de queries da BD com timeouts; devolve resultado ou Response. */
export async function runChatDbBatch(
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
              if (isDev) {
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

/** Guarda a mensagem do utilizador na BD; devolve Response em caso de erro. */
export async function saveUserMessageToDb(
  message: PostRequestBody["message"],
  id: string
): Promise<Response | null> {
  if (message?.role !== "user") {
    return null;
  }
  try {
    const partsForDb = truncateDocumentPartsForDb(
      message.parts as UserMessagePart[]
    );
    await saveMessages({
      messages: [
        {
          chatId: id,
          id: message.id,
          role: "user",
          parts: partsForDb,
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
      (err instanceof ChatbotError &&
        (err as ChatbotError & { surface?: string }).surface === "database") ||
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

/** Resolve AgentConfig a partir do resultado do batch (built-in vs custom). */
export function resolveAgentConfigFromBatch(
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

/** Resolve agentConfig + effectiveModel e valida Revisor; devolve Response (erro) ou dados. */
export function getAgentConfigAndEffectiveModel(
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
  const candidateModel =
    selectedChatModel === DEFAULT_CHAT_MODEL && agentConfig.defaultModelId
      ? agentConfig.defaultModelId
      : selectedChatModel;
  const effectiveModel = isModelAllowedForAgent(agentId, candidateModel)
    ? candidateModel
    : getDefaultModelForAgent(agentId);
  const revisorError = validateRevisorDocumentParts(message, agentConfig);
  if (revisorError) {
    return revisorError;
  }
  return { agentConfig, effectiveModel };
}

/** Normaliza o agentId do body para string válida. */
export function resolveAgentId(
  agentIdFromBody: PostRequestBody["agentId"]
): string {
  const trimmed =
    agentIdFromBody && typeof agentIdFromBody === "string"
      ? agentIdFromBody.trim()
      : "";
  return trimmed || DEFAULT_AGENT_ID_WHEN_EMPTY;
}

/** Persiste chat (ownership, agentId, novo chat) e devolve titlePromise ou Response. */
export async function persistChatAndGetTitlePromise(
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
    if (processoId) {
      createTaskExecution({ processoId, taskId: agentId, chatId: id }).catch(
        () => {
          /* silencioso — auditoria não crítica */
        }
      );
    }
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

/** Executa verificação de créditos e persistência do chat; devolve Response ou titlePromise. */
export async function runCreditsAndPersist(
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

/** Devolve Response de erro se sessão/BD/conteúdo inválidos; caso contrário null. */
export async function getEarlyValidationResponse(
  session: Session | null,
  message: PostRequestBody["message"]
): Promise<Response | null> {
  if (!session?.user) {
    return new ChatbotError("unauthorized:chat").toResponse();
  }
  const { ensureDbReady, validateUserMessageContent } = await import(
    "./parse-request"
  );
  const dbError = await ensureDbReady();
  if (dbError) {
    return dbError;
  }
  const contentError = validateUserMessageContent(message);
  return contentError ?? null;
}
