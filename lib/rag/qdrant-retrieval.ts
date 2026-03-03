/**
 * Recuperação RAG com Qdrant. Requer RAG_RETRIEVAL_BACKEND=qdrant e QDRANT_URL (e opcionalmente QDRANT_API_KEY).
 */

import { QdrantClient } from "@qdrant/js-client-rest";
import type { VectorRetrievalBackend } from "./retrieval";
import type { RetrievalChunk } from "./types";

const COLLECTION_NAME = "knowledge_chunks";

function getClient(): QdrantClient {
  const url = process.env.QDRANT_URL?.trim();
  if (!url) {
    throw new Error("QDRANT_URL is required when RAG_RETRIEVAL_BACKEND=qdrant");
  }
  const apiKey = process.env.QDRANT_API_KEY?.trim();
  return new QdrantClient({
    url,
    ...(apiKey ? { apiKey } : {}),
  });
}

function payloadToChunk(
  id: string,
  payload: Record<string, unknown>
): RetrievalChunk {
  return {
    id,
    text: (payload.text as string) ?? "",
    knowledgeDocumentId: (payload.knowledgeDocumentId as string) ?? "",
    title: (payload.title as string) ?? "",
  };
}

export const qdrantRetrieval: VectorRetrievalBackend = {
  async getRelevantChunks({
    userId,
    documentIds,
    queryEmbedding,
    limit = 12,
    allowedUserIds,
  }) {
    if (documentIds.length === 0 || queryEmbedding.length === 0) {
      return [];
    }
    const client = getClient();
    const must: Array<
      | { key: string; match: { value: string } }
      | { should: Array<{ key: string; match: { value: string } }> }
    > = [
      {
        should: documentIds.map((id) => ({
          key: "knowledgeDocumentId",
          match: { value: id },
        })),
      },
      ...(allowedUserIds?.length
        ? [
            {
              should: [userId, ...allowedUserIds].map((uid) => ({
                key: "userId",
                match: { value: uid },
              })),
            },
          ]
        : [{ key: "userId", match: { value: userId } }]),
    ];
    const result = await client.search(COLLECTION_NAME, {
      vector: queryEmbedding,
      filter: { must },
      limit,
      with_payload: true,
      with_vector: false,
    });
    return result.map((p) =>
      payloadToChunk(String(p.id), (p.payload ?? {}) as Record<string, unknown>)
    );
  },
};
