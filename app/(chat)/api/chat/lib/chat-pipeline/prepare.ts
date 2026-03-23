import { safeValidateUIMessages } from "ai";
import type { Session } from "next-auth";
import { AGENT_ID_REDATOR_CONTESTACAO } from "@/lib/ai/agents-registry";
import { buildKnowledgeContext } from "@/lib/ai/resolve-knowledge-ids";
import { validationToolsForValidate } from "@/lib/ai/tools/validation-tools";
import {
  ChatbotError,
  databaseUnavailableResponse,
  isDatabaseConnectionError,
  isLikelyDatabaseError,
  isStatementTimeoutError,
} from "@/lib/errors";
import { retrieveKnowledgeContext } from "@/lib/rag";
import type { ChatMessage } from "@/lib/types";
import {
  getUserFilesByIds,
  getKnowledgeDocumentsByIds,
  saveMessages,
  updateMessage,
} from "@/lib/db/queries";
import type { PostRequestBody } from "../../schema";
import {
  isDev,
  logTiming,
  truncateDocumentPartsForDb,
  withTimingLog,
  wrapKnowledgeDocument,
  fillKnowledgeFromFullDocsWhenEmpty,
} from "./utils";
import type { ChatDbBatchResult } from "./validate";

/** Resultado de validação + RAG + getUserFiles. */
export interface ValidationRagResult {
  uiMessages: ChatMessage[];
  ragChunks: Awaited<ReturnType<typeof retrieveKnowledgeContext>>;
  userFilesFromArchivos: Awaited<ReturnType<typeof getUserFilesByIds>>;
}

/** Opções para runValidationRagUserFiles. */
export interface ValidationRagOptions {
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
export async function runValidationRagUserFiles(
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
export function buildKnowledgeContextFromParts(
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
export async function saveUserMessageToDb(
  message: PostRequestBody["message"],
  id: string
): Promise<Response | null> {
  if (message?.role !== "user") {
    return null;
  }
  type UserMessagePart = NonNullable<PostRequestBody["message"]>["parts"][number];
  try {
    // Trunca partes "document" para o limite da BD (100K) antes do INSERT.
    // O LLM já recebeu o texto completo (até 2M); aqui guardamos apenas o excerto inicial
    // para histórico/UI. Reduz INSERT de ~2M chars para ~100K → INSERT ~20× mais rápido.
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
export function handleChatPostError(
  error: unknown,
  request: Request
): Response {
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

// Re-export ChatDbBatchResult so consumers only need to import from prepare if they use ValidationRag* types
export type { ChatDbBatchResult };
