/**
 * Construção de contexto RAG + knowledge docs + user files.
 * Extraído de app/(chat)/api/chat/route.ts.
 */

import { safeValidateUIMessages } from "ai";
import { AGENT_ID_REDATOR_CONTESTACAO } from "@/lib/ai/agents-registry";
import { buildKnowledgeContext } from "@/lib/ai/resolve-knowledge-ids";
import { validationToolsForValidate } from "@/lib/ai/tools/validation-tools";
import {
  type getKnowledgeDocumentsByIds,
  getUserFilesByIds,
} from "@/lib/db/queries";
import { retrieveKnowledgeContext } from "@/lib/rag";
import type { ChatMessage } from "@/lib/types";
import type { ValidationRagOptions, ValidationRagResult } from "./types";
import {
  isDev,
  logTiming,
  withTimingLog,
  wrapKnowledgeDocument,
} from "./utils";

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
      if (!doc.structuredSummary) {
        parts.push(wrapKnowledgeDocument(doc.id, doc.title, doc.content));
      }
    }
  }
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

  // Injetar resumos estruturados (PI/Contestação) sempre que disponíveis
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
