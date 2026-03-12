/**
 * Etapa de recuperação do pipeline RAG: busca por similaridade (pgvector, qdrant, etc.).
 * Ver docs/RAG-PIPELINE-SEPARATION.md.
 */

import { embedQuery } from "@/lib/ai/rag";
import { getRelevantChunks } from "@/lib/db/queries";
import { withSpan } from "@/lib/telemetry";
import type { RerankOptions } from "./reranking";
import { rerankByDiversity } from "./reranking";
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
    /**
     * Quando true, busca em todos os documentos do userId (ignora documentIds como filtro).
     * Útil para busca global na base de conhecimento do utilizador.
     */
    allUserDocs?: boolean;
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
    allUserDocs,
  }) {
    return getRelevantChunks({
      userId,
      documentIds,
      queryEmbedding,
      limit,
      allowedUserIds,
      minSimilarity,
      allUserDocs,
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

/**
 * Recupera o contexto de base de conhecimento para o prompt: gera embedding da query
 * e devolve os chunks mais relevantes formatados (ou lista vazia se falhar).
 *
 * @param params.documentIds    IDs dos documentos a filtrar. Se vazio e allUserDocs=false, retorna [].
 * @param params.allUserDocs    Quando true, ignora documentIds e busca em toda a KB do utilizador.
 * @param params.overFetch      Quando true, busca 2× o limite e aplica reranking de diversidade.
 * @param params.rerankOptions  Opções de reranking por diversidade (maxChunksPerDoc, textOverlapThreshold).
 */
export async function retrieveKnowledgeContext(params: {
  userId: string;
  documentIds: string[];
  queryText: string;
  limit?: number;
  allowedUserIds?: string[];
  backend?: VectorRetrievalBackend;
  /** Override do env RAG_MIN_SIMILARITY (0–1). */
  minSimilarity?: number;
  /**
   * Quando true, busca em todos os documentos do utilizador sem filtrar por documentIds.
   * Ideal para agentes que devem buscar em toda a KB sem seleção manual.
   */
  allUserDocs?: boolean;
  /**
   * Quando true, busca 2× o limite e aplica reranking de diversidade (rerankByDiversity)
   * para reduzir redundância e aumentar cobertura temática. Default: true.
   */
  overFetch?: boolean;
  /** Opções do reranking por diversidade. Ignorado se overFetch=false. */
  rerankOptions?: RerankOptions;
}): Promise<RetrievalChunk[]> {
  const backend = params.backend ?? (await getDefaultRetrievalBackend());
  const { queryText, allUserDocs = false, overFetch = true } = params;
  const limit = params.limit ?? 12;

  const trimmed = queryText.replaceAll(/\s+/g, " ").trim();
  // Retorna vazio só se não há query OU (sem docs E sem modo allUserDocs)
  if (trimmed.length === 0) {
    return [];
  }
  if (!allUserDocs && params.documentIds.length === 0) {
    return [];
  }

  const queryEmbedding = await embedQuery(trimmed);
  if (queryEmbedding === null) {
    return [];
  }

  const minSimilarity = params.minSimilarity ?? getMinSimilarityFromEnv();

  // Over-fetch: busca 2× o limite para ter candidatos suficientes para reranking
  const fetchLimit = overFetch ? limit * 2 : limit;

  const rawChunks = await withSpan("rag.retrieve", async (span) => {
    span.setAttribute("rag.limit", fetchLimit);
    span.setAttribute("rag.document_count", params.documentIds.length);
    span.setAttribute("rag.all_user_docs", allUserDocs);
    span.setAttribute("rag.over_fetch", overFetch);
    if (minSimilarity !== undefined) {
      span.setAttribute("rag.min_similarity", minSimilarity);
    }
    const chunks = await backend.getRelevantChunks({
      userId: params.userId,
      documentIds: params.documentIds,
      queryEmbedding,
      limit: fetchLimit,
      allowedUserIds: params.allowedUserIds,
      minSimilarity,
      allUserDocs,
    });
    span.setAttribute("rag.raw_chunks_returned", chunks.length);
    return chunks;
  });

  if (!overFetch || rawChunks.length <= limit) {
    return rawChunks;
  }

  // Aplica reranking de diversidade e trunca para o limite final
  const reranked = rerankByDiversity(rawChunks, params.rerankOptions);
  return reranked.slice(0, limit);
}
