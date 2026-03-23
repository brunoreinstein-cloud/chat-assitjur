import { ZodError } from "zod";
import type { UserType } from "@/app/(auth)/auth";
import type { AgentConfig } from "@/lib/ai/agents-registry";
import { DEFAULT_AGENT_ID_WHEN_EMPTY } from "@/lib/ai/agents-registry";
import { MIN_CREDITS_TO_START_CHAT } from "@/lib/ai/credits";
import { entitlementsByUserType } from "@/lib/ai/entitlements";
import { getCachedBuiltInAgentOverrides } from "@/lib/cache/agent-overrides-cache";
import { creditsCache } from "@/lib/cache/credits-cache";
import {
  addCreditsToUser,
  ensureStatementTimeout,
  getChatById,
  getCustomAgentById,
  getKnowledgeDocumentsByIds,
  getMessageCountByUserId,
  getMessagesByChatId,
  getOrCreateCreditBalance,
  saveChat,
  updateChatAgentId,
} from "@/lib/db/queries";
import { ChatbotError } from "@/lib/errors";
import type { ChatMessage } from "@/lib/types";
import { generateTitleFromUserMessage } from "../../../../actions";
import {
  type PostRequestBody,
  postRequestBodySchema,
} from "../../schema";
import {
  CHAT_MESSAGES_LIMIT,
  CREDITS_CACHE_USAGE_LIMIT,
  CREDITS_IN_BATCH_TIMEOUT_MS,
  DB_BATCH_TIMEOUT_MS,
  isDev,
  normalizeMessageParts,
  PER_QUERY_TIMEOUT_MS,
  withFallbackTimeout,
  withTimingLog,
} from "./utils";
import type { DocumentPartLike } from "./utils";

export { DEFAULT_AGENT_ID_WHEN_EMPTY };

/** Resultado do batch de queries da BD para o chat. */
export interface ChatDbBatchResult {
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

/** Parseia e valida o body do POST; devolve Response em caso de erro. */
export async function parsePostBody(
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
export async function ensureDbReady(): Promise<Response | null> {
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
export function validateUserMessageContent(
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

  const creditsPromise = (() => {
    if (process.env.DISABLE_CREDITS === "true") {
      return Promise.resolve(initialCredits);
    }
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

/** Valida partes de documento do Revisor (PI + Contestação); devolve Response se inválido. */
export function validateRevisorDocumentParts(
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
export async function checkRateLimitAndCredits(
  messageCount: number,
  userType: UserType,
  balanceFromDb: number,
  session: { user: { id: string } },
  initialCredits: number
): Promise<{ balance: number } | Response> {
  if (process.env.DISABLE_CREDITS === "true") {
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
