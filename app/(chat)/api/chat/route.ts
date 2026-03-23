import { geolocation } from "@vercel/functions";
import type { Session } from "next-auth";
import { auth, type UserType } from "@/app/(auth)/auth";
import {
  getDefaultModelForAgent,
  isModelAllowedForAgent,
} from "@/lib/ai/agent-models";
import {
  AGENT_IDS,
  type AgentConfig,
  DEFAULT_AGENT_ID_WHEN_EMPTY,
  getAgentConfigForCustomAgent,
  getAgentConfigWithOverrides,
} from "@/lib/ai/agents-registry";
import {
  createChatDebugTracker,
  isChatDebugEnabled,
  logChatDebug,
} from "@/lib/ai/chat-debug";
import { extractDocumentTextsFromAllMessages } from "@/lib/ai/document-context";
import { entitlementsByUserType } from "@/lib/ai/entitlements";
import { getAllMcpTools } from "@/lib/ai/mcp-config";
import { DEFAULT_CHAT_MODEL } from "@/lib/ai/models";
import {
  REDATOR_BANCO_KNOWLEDGE_DOCUMENT_ID,
  REDATOR_BANCO_SYSTEM_USER_ID,
} from "@/lib/ai/redator-banco-rag";
import { resolveEffectiveKnowledgeIds } from "@/lib/ai/resolve-knowledge-ids";
import { FASE_LABEL, RISCO_LABEL } from "@/lib/constants/processo";
import {
  deleteChatById,
  ensureUserExistsInDb,
  getChatById,
  getProcessoById,
} from "@/lib/db/queries";
import { ChatbotError } from "@/lib/errors";
import type { ChatMessage } from "@/lib/types";
import { convertToUIMessages } from "@/lib/utils";
import {
  buildChatStreamResponse,
  type ChatStreamParams,
} from "./lib/chat-pipeline/execute";
import {
  buildKnowledgeContextFromParts,
  handleChatPostError,
  runValidationRagUserFiles,
  saveUserMessageToDb,
} from "./lib/chat-pipeline/prepare";
import {
  isDev,
  logTiming,
  normalizeMessageParts,
  truncateDocumentPartsInBody,
} from "./lib/chat-pipeline/utils";
import {
  type ChatDbBatchResult,
  checkRateLimitAndCredits,
  ensureDbReady,
  parsePostBody,
  persistChatAndGetTitlePromise,
  runChatDbBatch,
  validateAvaliadorDocumentParts,
  validateRevisorDocumentParts,
  validateUserMessageContent,
} from "./lib/chat-pipeline/validate";
import type { PostRequestBody } from "./schema";

/** Limite de execução da rota (segundos).
 * Vercel Pro suporta até 800s para rotas com streaming.
 * O pipeline multi-chamadas (analyzeProcessoPipeline) pode levar 8-12 min em PDFs grandes;
 * 800s (~13 min) dá margem suficiente sem atingir o hard limit da plataforma.
 * O AbortSignal no streamText garante que o stream fecha antes do corte da plataforma. */
export const maxDuration = 800;

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
  // Se o utilizador não escolheu explicitamente um modelo (usa o global default)
  // e o agente tem um defaultModelId configurado (admin override), aplicar esse.
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
  const avaliadorError = validateAvaliadorDocumentParts(message, agentConfig);
  if (avaliadorError) {
    return avaliadorError;
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
  const requestHints = { longitude, latitude, city, country };

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

  // Extrai textos completos dos documentos de TODAS as mensagens da conversa.
  // Necessário para que buscarNoProcesso continue disponível em follow-ups: na 2ª+ mensagem
  // o utilizador não re-anexa o documento, então message.parts não tem document parts.
  // Processa oldest-first → latest attachment com o mesmo nome vence (more recent wins).
  const documentTexts = extractDocumentTextsFromAllMessages(
    uiMessages as Array<{
      parts?: Array<{ type?: string; name?: string; text?: string }>;
    }>
  );

  let cachedProcessoDocument:
    | { name: string; text: string; documentType?: "pi" | "contestacao" }
    | undefined;
  if (
    proc?.parsedText &&
    proc.intakeStatus === "ready" &&
    documentTexts.size === 0
  ) {
    const docName = proc.titulo ?? `Processo ${proc.numeroAutos}`;
    const docType =
      proc.tipo === "contestacao"
        ? "contestacao"
        : proc.tipo === "pi"
          ? "pi"
          : undefined;
    cachedProcessoDocument = {
      name: docName,
      text: proc.parsedText,
      documentType: docType,
    };
    documentTexts.set(docName, proc.parsedText);
  }

  const mcpTools = await getAllMcpTools();

  const streamParams: ChatStreamParams = {
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
    documentTexts,
    mcpTools,
    cachedProcessoDocument,
  };

  return buildChatStreamResponse(streamParams);
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
