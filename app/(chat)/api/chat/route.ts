/**
 * POST /api/chat — orquestrador fino.
 *
 * Toda a lógica de negócio foi extraída para lib/ai/chat/:
 *   - parse-request.ts  → validação e parsing do body
 *   - db-batch.ts       → operações de BD em paralelo
 *   - context-builder.ts → RAG + knowledge context
 *   - stream-handler.ts → stream LLM, execute, onFinish
 *   - tool-registry.ts  → registro de tools por agente
 *   - utils.ts          → helpers (timing, XML, truncagem)
 *   - types.ts          → interfaces partilhadas
 */

import { geolocation } from "@vercel/functions";
import type { Session } from "next-auth";
import { auth, type UserType } from "@/app/(auth)/auth";
import { AGENT_IDS } from "@/lib/ai/agents-registry";
import {
  buildKnowledgeContextFromParts,
  runValidationRagUserFiles,
} from "@/lib/ai/chat/context-builder";
import {
  getAgentConfigAndEffectiveModel,
  getEarlyValidationResponse,
  resolveAgentId,
  runChatDbBatch,
  runCreditsAndPersist,
  saveUserMessageToDb,
} from "@/lib/ai/chat/db-batch";
import {
  handleChatPostError,
  normalizeMessageParts,
  parsePostBody,
  truncateDocumentPartsInBody,
} from "@/lib/ai/chat/parse-request";
import { buildChatStreamResponse } from "@/lib/ai/chat/stream-handler";
import { isDev, logTiming } from "@/lib/ai/chat/utils";
import {
  createChatDebugTracker,
  isChatDebugEnabled,
  logChatDebug,
} from "@/lib/ai/chat-debug";
import { extractDocumentTextsFromAllMessages } from "@/lib/ai/document-context";
import { entitlementsByUserType } from "@/lib/ai/entitlements";
import { getAllMcpTools } from "@/lib/ai/mcp-config";
import type { RequestHints } from "@/lib/ai/prompts";
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
import type { PostRequestBody } from "./schema";

/** Limite de execução da rota (segundos). Vercel Pro suporta até 800s para rotas com streaming. */
export const maxDuration = 800;

/** Lógica principal do POST /api/chat após parse do body. */
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
  if (isDev) {
    console.info(
      "[chat-timing] POST /api/chat request started",
      "(agentId:",
      agentId,
      ")"
    );
  }
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

  // 1. Auth
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

  // 2. Pre-fetch processo (se processoId veio no request)
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

  // 3. DB batch
  const isBuiltInAgent = AGENT_IDS.includes(
    agentId as (typeof AGENT_IDS)[number]
  );
  const t1 = Date.now();
  if (isDev) {
    console.info("[chat-timing] dbBatch: starting…");
  }

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

  // 4. Agent config + model
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
  logTiming(
    "getMessageCount + getChat + getMessages + knowledge + overrides + credits (paralelo)",
    Date.now() - t1
  );

  // 5. Credits + persist chat
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

  // 6. Messages + validation + RAG
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

  // 7. Request hints + knowledge context
  const { longitude, latitude, city, country } = geolocation(request);
  const requestHints: RequestHints = { longitude, latitude, city, country };

  const knowledgeContext = buildKnowledgeContextFromParts(
    ragChunks,
    batchResult.knowledgeDocsResult,
    userFilesFromArchivos,
    effectiveKnowledgeIds
  );

  // 8. Processo context + save user message
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

  // 9. Document texts + cached processo document
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

  // 10. MCP tools + stream
  const mcpTools = await getAllMcpTools();

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
    documentTexts,
    mcpTools,
    cachedProcessoDocument,
    processoId: effectiveProcessoId,
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
