/**
 * Orquestração do pipeline RAG: vetorização + indexação.
 * Ingestão (upload + parse) fica nas rotas; recuperação em retrieval.ts; geração no chat.
 * Ver docs/RAG-PIPELINE-SEPARATION.md.
 */

import type { IndexChunksMeta, VectorIndexBackend } from "./indexing";
import { getDefaultIndexBackend } from "./indexing";
import { vectorizeContent } from "./vectorization";

export interface VectorizeAndIndexOptions {
  indexBackend?: VectorIndexBackend;
  /** Obrigatório para Qdrant (userId/title no payload); ignorado por pgvector. */
  meta?: IndexChunksMeta;
}

/**
 * Vetoriza o conteúdo e indexa os chunks no backend configurado (ex.: pgvector).
 * Se a vetorização falhar ou devolver vazio, não insere chunks (o documento fica sem RAG; fallback para injeção direta no chat).
 * Se a indexação falhar, remove chunks já inseridos para este documento (rollback).
 */
export async function vectorizeAndIndex(
  documentId: string,
  content: string,
  options?: VectorizeAndIndexOptions
): Promise<{ indexed: number }> {
  const indexBackend =
    options?.indexBackend ?? (await getDefaultIndexBackend());
  const meta = options?.meta;
  const chunks = await vectorizeContent(content);
  if (chunks.length === 0) {
    return { indexed: 0 };
  }
  try {
    await indexBackend.indexChunks(documentId, chunks, meta);
    return { indexed: chunks.length };
  } catch {
    await indexBackend.deleteByDocumentId(documentId);
    return { indexed: 0 };
  }
}

/**
 * Reindexa um documento: apaga chunks existentes e indexa de novo a partir do conteúdo.
 * Útil após alteração do documento ou mudança de estratégia de chunking/embedding.
 */
export async function reindexDocument(
  documentId: string,
  content: string,
  options?: VectorizeAndIndexOptions
): Promise<{ indexed: number }> {
  const indexBackend =
    options?.indexBackend ?? (await getDefaultIndexBackend());
  await indexBackend.deleteByDocumentId(documentId);
  return vectorizeAndIndex(documentId, content, options);
}
