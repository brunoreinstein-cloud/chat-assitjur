/**
 * RAG (Retrieval-Augmented Generation) para a base de conhecimento.
 * Chunking, embeddings e integração com o chat (ver lib/ai/knowledge-base.md).
 */

import { embed, embedMany } from "ai";

/** Tamanho alvo de cada chunk em caracteres (aprox. 500–800 tokens). */
const CHUNK_SIZE = 800;
/** Overlap entre chunks para preservar contexto. */
const CHUNK_OVERLAP = 150;

/** Modelo de embedding (OpenAI via gateway). Dimensão 1536. */
const EMBEDDING_MODEL_ID = "openai/text-embedding-3-small";

/**
 * Divide o texto em chunks com overlap.
 */
export function chunkText(
  content: string,
  chunkSize: number = CHUNK_SIZE,
  overlap: number = CHUNK_OVERLAP
): string[] {
  const trimmed = content.trim();
  if (trimmed.length === 0) {
    return [];
  }
  if (trimmed.length <= chunkSize) {
    return [trimmed];
  }
  const chunks: string[] = [];
  let start = 0;
  while (start < trimmed.length) {
    let end = start + chunkSize;
    if (end < trimmed.length) {
      const nextSpace = trimmed.lastIndexOf(" ", end);
      const nextNewline = trimmed.lastIndexOf("\n", end);
      const breakAt = Math.max(nextSpace, nextNewline, start);
      if (breakAt > start) {
        end = breakAt + 1;
      }
    } else {
      end = trimmed.length;
    }
    chunks.push(trimmed.slice(start, end).trim());
    if (end >= trimmed.length) {
      break;
    }
    start = end - overlap;
    if (start < 0) {
      start = 0;
    }
  }
  return chunks.filter((c) => c.length > 0);
}

/**
 * Gera embedding para uma única string (ex.: pergunta do utilizador).
 */
export async function embedQuery(value: string): Promise<number[] | null> {
  try {
    const { embedding } = await embed({
      model: EMBEDDING_MODEL_ID,
      value: value.replaceAll(/\s+/g, " ").trim().slice(0, 8000),
    });
    return embedding;
  } catch {
    return null;
  }
}

/**
 * Gera embeddings para uma lista de textos (ex.: chunks de um documento).
 */
export async function embedChunks(
  values: string[]
): Promise<{ embedding: number[] }[] | null> {
  if (values.length === 0) {
    return [];
  }
  try {
    const { embeddings } = await embedMany({
      model: EMBEDDING_MODEL_ID,
      values: values.map((v) =>
        v.replaceAll(/\s+/g, " ").trim().slice(0, 8000)
      ),
    });
    return embeddings.map((embedding) => ({ embedding }));
  } catch {
    return null;
  }
}
