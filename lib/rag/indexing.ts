/**
 * Etapa de indexação do pipeline RAG: persistir vetores (pgvector, qdrant, etc.).
 * Ver docs/RAG-PIPELINE-SEPARATION.md.
 */

import {
  deleteChunksByKnowledgeDocumentId,
  insertKnowledgeChunks,
} from "@/lib/db/queries";
import type { ChunkWithEmbedding } from "./types";

/** Metadados opcionais para indexação (ex.: Qdrant precisa de userId/title no payload). */
export interface IndexChunksMeta {
  userId: string;
  title: string;
}

/** Backend de indexação de vetores (pgvector, qdrant, etc.). */
export interface VectorIndexBackend {
  indexChunks(
    documentId: string,
    chunks: ChunkWithEmbedding[],
    meta?: IndexChunksMeta
  ): Promise<void>;
  deleteByDocumentId(documentId: string): Promise<void>;
}

/** Implementação com pgvector (tabela KnowledgeChunk). */
export const pgVectorIndex: VectorIndexBackend = {
  async indexChunks(documentId, chunks, _meta) {
    if (chunks.length === 0) {
      return;
    }
    await insertKnowledgeChunks({
      knowledgeDocumentId: documentId,
      chunksWithEmbeddings: chunks,
    });
  },
  async deleteByDocumentId(documentId) {
    await deleteChunksByKnowledgeDocumentId(documentId);
  },
};

let cachedIndexBackend: VectorIndexBackend | null = null;

/** Backend de indexação ativo (RAG_INDEX_BACKEND=pgvector | qdrant). Resolve uma vez e faz cache. */
export async function getDefaultIndexBackend(): Promise<VectorIndexBackend> {
  if (cachedIndexBackend !== null) {
    return cachedIndexBackend;
  }
  const backend = process.env.RAG_INDEX_BACKEND?.toLowerCase().trim();
  if (backend === "qdrant") {
    try {
      const { qdrantIndex } = await import("./qdrant-indexing");
      cachedIndexBackend = qdrantIndex;
      return qdrantIndex;
    } catch {
      cachedIndexBackend = pgVectorIndex;
      return pgVectorIndex;
    }
  }
  cachedIndexBackend = pgVectorIndex;
  return pgVectorIndex;
}

/** Para uso quando o backend é passado explicitamente; senão use getDefaultIndexBackend(). */
export const pgVectorIndexAsDefault: VectorIndexBackend = pgVectorIndex;
