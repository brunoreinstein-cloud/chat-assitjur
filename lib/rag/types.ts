/**
 * Tipos partilhados do pipeline RAG (ingestão, vetorização, indexação, recuperação).
 * Ver docs/RAG-PIPELINE-SEPARATION.md.
 */

/** Chunk de texto com embedding para indexação. */
export interface ChunkWithEmbedding {
  text: string;
  embedding: number[];
}

/** Chunk devolvido pela recuperação (RAG) para montar o contexto do prompt. */
export interface RetrievalChunk {
  id: string;
  text: string;
  knowledgeDocumentId: string;
  title: string;
  /** Similaridade cossenoidal com a query (0–1). Presente quando o backend a calcula. */
  similarity?: number;
}
