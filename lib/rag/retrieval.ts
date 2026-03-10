/**
 * Etapa de recuperação do pipeline RAG: busca por similaridade (pgvector, qdrant, etc.).
 * Ver docs/RAG-PIPELINE-SEPARATION.md.
 */

import { embedQuery } from "@/lib/ai/rag";
import { getRelevantChunks } from "@/lib/db/queries";
import type { RetrievalChunk } from "./types";

/** Parâmetros da recuperação RAG. */
export interface RetrievalParams {
  userId: string;
  documentIds: string[];
  queryText: string;
  limit?: number;
  /** Incluir chunks de documentos destes userIds (ex.: doc. sistema Redator). */
  allowedUserIds?: string[];
}

/** Backend de recuperação por similaridade. */
export interface VectorRetrievalBackend {
  getRelevantChunks(params: {
    userId: string;
    documentIds: string[];
    queryEmbedding: number[];
    limit?: number;
    allowedUserIds?: string[];
    /** Similaridade mínima 0–1; só devolver chunks acima deste threshold (ex.: 0.25). */
    minSimilarity?: number;
  }): Promise<RetrievalChunk[]>;
}

/** Implementação com pgvector (getRelevantChunks). */
export const pgVectorRetrieval: VectorRetrievalBackend = {
  getRelevantChunks({
    userId,
    documentIds,
    queryEmbedding,
    limit = 12,
    allowedUserIds,
    minSimilarity,
  }) {
    return getRelevantChunks({
      userId,
      documentIds,
      queryEmbedding,
      limit,
      allowedUserIds,
      minSimilarity,
    });
  },
};

let cachedRetrievalBackend: VectorRetrievalBackend | null = null;

/** Backend de recuperação ativo (RAG_RETRIEVAL_BACKEND=pgvector | qdrant). Resolve uma vez e faz cache. */
export async function getDefaultRetrievalBackend(): Promise<VectorRetrievalBackend> {
  if (cachedRetrievalBackend !== null) {
    return cachedRetrievalBackend;
  }
  const backend = process.env.RAG_RETRIEVAL_BACKEND?.toLowerCase().trim();
  if (backend === "qdrant") {
    try {
      const { qdrantRetrieval } = await import("./qdrant-retrieval");
      cachedRetrievalBackend = qdrantRetrieval;
      return qdrantRetrieval;
    } catch {
      cachedRetrievalBackend = pgVectorRetrieval;
      return pgVectorRetrieval;
    }
  }
  cachedRetrievalBackend = pgVectorRetrieval;
  return pgVectorRetrieval;
}

/**
 * Recupera o contexto de base de conhecimento para o prompt: gera embedding da query
 * e devolve os chunks mais relevantes formatados (ou lista vazia se falhar).
 */
/** Lê RAG_MIN_SIMILARITY do env (0–1). Undefined se não definido ou inválido. */
function getMinSimilarityFromEnv(): number | undefined {
  const raw = process.env.RAG_MIN_SIMILARITY?.trim();
  if (!raw) {
    return undefined;
  }
  const value = Number.parseFloat(raw);
  if (!Number.isFinite(value) || value <= 0 || value > 1) {
    return undefined;
  }
  return value;
}

export async function retrieveKnowledgeContext(params: {
  userId: string;
  documentIds: string[];
  queryText: string;
  limit?: number;
  allowedUserIds?: string[];
  backend?: VectorRetrievalBackend;
  /** Override do env RAG_MIN_SIMILARITY (0–1). */
  minSimilarity?: number;
}): Promise<RetrievalChunk[]> {
  const backend = params.backend ?? (await getDefaultRetrievalBackend());
  const { queryText } = params;
  const trimmed = queryText.replaceAll(/\s+/g, " ").trim();
  if (trimmed.length === 0 || params.documentIds.length === 0) {
    return [];
  }
  const queryEmbedding = await embedQuery(trimmed);
  if (queryEmbedding === null) {
    return [];
  }
  const minSimilarity = params.minSimilarity ?? getMinSimilarityFromEnv();
  return backend.getRelevantChunks({
    userId: params.userId,
    documentIds: params.documentIds,
    queryEmbedding,
    limit: params.limit,
    allowedUserIds: params.allowedUserIds,
    minSimilarity,
  });
}
