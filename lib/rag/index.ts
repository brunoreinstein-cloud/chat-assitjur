/**
 * Pipeline RAG: ingestão, vetorização, indexação, recuperação.
 * Ver docs/RAG-PIPELINE-SEPARATION.md.
 */
export type { IndexChunksMeta, VectorIndexBackend } from "./indexing";
// biome-ignore lint/performance/noBarrelFile: barrel intentional for RAG pipeline API
export {
  getDefaultIndexBackend,
  pgVectorIndex,
  pgVectorIndexAsDefault,
} from "./indexing";
export type { IngestedDocument, IngestedMetadata } from "./ingestion";
export {
  ingestFromBuffer,
  ingestFromContent,
} from "./ingestion";
export { reindexDocument, vectorizeAndIndex } from "./pipeline";
export type { RetrievalParams, VectorRetrievalBackend } from "./retrieval";
export {
  getDefaultRetrievalBackend,
  pgVectorRetrieval,
  retrieveKnowledgeContext,
} from "./retrieval";
export type { ChunkWithEmbedding, RetrievalChunk } from "./types";
export { vectorizeContent } from "./vectorization";
