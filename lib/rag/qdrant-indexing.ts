/**
 * Indexação RAG com Qdrant. Requer RAG_INDEX_BACKEND=qdrant e QDRANT_URL (e opcionalmente QDRANT_API_KEY).
 */

import { randomUUID } from "node:crypto";
import { QdrantClient } from "@qdrant/js-client-rest";
import type { VectorIndexBackend } from "./indexing";

const COLLECTION_NAME = "knowledge_chunks";
const VECTOR_SIZE = 1536;

function getClient(): QdrantClient {
  const url = process.env.QDRANT_URL?.trim();
  if (!url) {
    throw new Error("QDRANT_URL is required when RAG_INDEX_BACKEND=qdrant");
  }
  const apiKey = process.env.QDRANT_API_KEY?.trim();
  return new QdrantClient({
    url,
    ...(apiKey ? { apiKey } : {}),
  });
}

async function ensureCollection(client: QdrantClient): Promise<void> {
  const collections = await client.getCollections();
  const exists = collections.collections.some(
    (c) => c.name === COLLECTION_NAME
  );
  if (!exists) {
    await client.createCollection(COLLECTION_NAME, {
      vectors: {
        size: VECTOR_SIZE,
        distance: "Cosine",
      },
    });
  }
}

export const qdrantIndex: VectorIndexBackend = {
  async indexChunks(documentId, chunks, meta) {
    if (chunks.length === 0) {
      return;
    }
    if (!meta) {
      throw new Error(
        "Qdrant indexação requer meta (userId, title); use vectorizeAndIndex(..., { meta })"
      );
    }
    const client = getClient();
    await ensureCollection(client);
    const points = chunks.map((c, i) => ({
      id: randomUUID(),
      vector: c.embedding,
      payload: {
        knowledgeDocumentId: documentId,
        userId: meta.userId,
        title: meta.title,
        text: c.text,
        chunkIndex: i,
      },
    }));
    await client.upsert(COLLECTION_NAME, {
      wait: true,
      points,
    });
  },
  async deleteByDocumentId(documentId) {
    const client = getClient();
    await client.delete(COLLECTION_NAME, {
      filter: {
        must: [
          {
            key: "knowledgeDocumentId",
            match: { value: documentId },
          },
        ],
      },
    });
  },
};
