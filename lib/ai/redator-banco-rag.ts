/**
 * Banco de teses padrão do Redator em RAG (Opção 2).
 * Documento "sistema" guardado na base de conhecimento com chunks + embeddings;
 * injetado via RAG quando o utilizador não seleciona documentos.
 */

/** UUID do utilizador sistema (donos do documento Banco de Teses Padrão). */
export const REDATOR_BANCO_SYSTEM_USER_ID =
  "00000000-0000-4000-8000-000000000001";

/** UUID fixo do KnowledgeDocument "Banco de Teses Padrão (Redator)". */
export const REDATOR_BANCO_KNOWLEDGE_DOCUMENT_ID =
  "00000000-0000-4000-8000-000000000002";
