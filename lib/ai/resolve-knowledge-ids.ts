/**
 * Lógica de resolução de IDs de conhecimento e construção do contexto RAG.
 * Extraída de app/(chat)/api/chat/route.ts para permitir testes unitários.
 */

import { AGENT_ID_REDATOR_CONTESTACAO } from "@/lib/ai/agents-registry";
import { BANCO_TESES_REDATOR_CONTENT } from "@/lib/ai/banco-teses-redator";
import { REDATOR_BANCO_KNOWLEDGE_DOCUMENT_ID } from "@/lib/ai/redator-banco-rag";

export const BANCO_TESES_MENTION_RE = /@bancodetese/i;

export const MAX_KNOWLEDGE_CONTEXT_CHARS = 50_000;

export const REDATOR_BANCO_UNAVAILABLE_MESSAGE =
  "[Banco de Teses Padrão não disponível. Para satisfazer (B), o utilizador deve selecionar documentos na Base de conhecimento (sidebar) ou anexar modelo/banco de teses.]";

/**
 * Resolve os IDs de documentos de conhecimento efetivos para a request.
 * - Se o utilizador selecionou documentos, usa-os.
 * - Se o agente é o Redator OU a mensagem/instruções mencionam @bancodetese,
 *   injeta automaticamente o Banco de Teses Padrão.
 */
export function resolveEffectiveKnowledgeIds(
  knowledgeDocumentIds: string[] | undefined,
  agentId: string,
  messageText: string,
  agentInstructions: string | undefined
): string[] {
  if (knowledgeDocumentIds?.length) {
    return knowledgeDocumentIds;
  }
  const mentionsBanco =
    BANCO_TESES_MENTION_RE.test(messageText) ||
    (agentInstructions
      ? BANCO_TESES_MENTION_RE.test(agentInstructions)
      : false);
  if (agentId === AGENT_ID_REDATOR_CONTESTACAO || mentionsBanco) {
    return [REDATOR_BANCO_KNOWLEDGE_DOCUMENT_ID];
  }
  return [];
}

/**
 * Constrói o string final de contexto de conhecimento para o system prompt.
 * - Trunca se exceder o limite.
 * - Se o banco foi injetado mas o RAG não devolveu nada (seed não executado),
 *   usa o conteúdo estático do ficheiro .md como fallback.
 */
export function buildKnowledgeContext(
  rawKnowledgeContext: string,
  effectiveKnowledgeIds: string[]
): string | undefined {
  if (rawKnowledgeContext.length > MAX_KNOWLEDGE_CONTEXT_CHARS) {
    return `${rawKnowledgeContext.slice(0, MAX_KNOWLEDGE_CONTEXT_CHARS)}\n\n[... base de conhecimento truncada para caber no limite ...]`;
  }
  const bancoIntendedButEmpty =
    effectiveKnowledgeIds.includes(REDATOR_BANCO_KNOWLEDGE_DOCUMENT_ID) &&
    rawKnowledgeContext.length === 0;
  if (bancoIntendedButEmpty) {
    return BANCO_TESES_REDATOR_CONTENT || REDATOR_BANCO_UNAVAILABLE_MESSAGE;
  }
  return rawKnowledgeContext || undefined;
}
