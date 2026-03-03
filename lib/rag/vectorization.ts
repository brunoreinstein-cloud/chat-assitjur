/**
 * Etapa de vetorização do pipeline RAG: chunking + embeddings.
 * Ver docs/RAG-PIPELINE-SEPARATION.md.
 */

import { chunkText, embedChunks } from "@/lib/ai/rag";
import type { ChunkWithEmbedding } from "./types";

/**
 * Gera chunks com embeddings a partir do conteúdo de um documento.
 * Usado pela etapa de indexação ou por jobs de vetorização assíncrona.
 */
export async function vectorizeContent(
  content: string
): Promise<ChunkWithEmbedding[]> {
  const chunks = chunkText(content);
  if (chunks.length === 0) {
    return [];
  }
  const embedded = await embedChunks(chunks);
  if (embedded === null || embedded.length !== chunks.length) {
    return [];
  }
  return chunks.map((text, i) => ({
    text,
    embedding: embedded[i]?.embedding ?? [],
  }));
}
