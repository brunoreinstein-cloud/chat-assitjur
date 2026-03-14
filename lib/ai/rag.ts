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
 * Tamanho máximo de cada batch enviado ao modelo de embeddings.
 * A API OpenAI suporta até 2048 inputs por chamada; usamos 100 por margem de segurança
 * e para limitar o payload por pedido.
 */
const EMBED_BATCH_SIZE = 100;

/**
 * Delay entre batches consecutivos (ms) para evitar erros de rate limit.
 * Ajustar conforme o tier da API OpenAI (TPM/RPM limit).
 */
const EMBED_BATCH_DELAY_MS = 300;

/** Número máximo de tentativas por batch em caso de erro transitório. */
const EMBED_BATCH_MAX_RETRIES = 3;

/** Aguarda ms milissegundos. */
const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Normaliza um valor de texto para embedding (limpa espaços, trunca). */
function normalizeForEmbedding(v: string): string {
  return v.replaceAll(/\s+/g, " ").trim().slice(0, 8000);
}

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
      value: normalizeForEmbedding(value),
    });
    return embedding;
  } catch (err) {
    console.error(
      "[embedQuery] Falha ao gerar embedding:",
      err instanceof Error ? err.message : err
    );
    return null;
  }
}

/**
 * Gera embeddings para uma lista de textos (ex.: chunks de um documento).
 * Para listas pequenas (≤ EMBED_BATCH_SIZE) usa uma única chamada.
 * Para listas grandes usa embedChunksInBatches automaticamente.
 */
export async function embedChunks(
  values: string[]
): Promise<{ embedding: number[] }[] | null> {
  if (values.length === 0) {
    return [];
  }
  if (values.length > EMBED_BATCH_SIZE) {
    return embedChunksInBatches(values);
  }
  try {
    const { embeddings } = await embedMany({
      model: EMBEDDING_MODEL_ID,
      values: values.map(normalizeForEmbedding),
    });
    return embeddings.map((embedding) => ({ embedding }));
  } catch (err) {
    console.error(
      "[embedChunks] Falha ao gerar embeddings:",
      err instanceof Error ? err.message : err
    );
    return null;
  }
}

/**
 * Gera embeddings em batches para listas grandes de textos.
 * Ideal para indexação em massa de documentos (Cookbook: Embed Text in Batch).
 *
 * Processa EMBED_BATCH_SIZE textos por chamada com delay entre batches
 * para respeitar os rate limits da API de embeddings.
 *
 * @param values    Lista de textos a vectorizar.
 * @param batchSize Tamanho do batch (default: 100). Ajustar conforme o tier da API.
 * @param delayMs   Delay entre batches em ms (default: 300). 0 para desactivar.
 * @returns         Array de embeddings na mesma ordem dos inputs, ou null em caso de erro.
 */
export async function embedChunksInBatches(
  values: string[],
  batchSize = EMBED_BATCH_SIZE,
  delayMs = EMBED_BATCH_DELAY_MS
): Promise<{ embedding: number[] }[] | null> {
  if (values.length === 0) {
    return [];
  }

  const results: { embedding: number[] }[] = [];

  for (let i = 0; i < values.length; i += batchSize) {
    // Aguarda entre batches para não exceder o rate limit
    if (i > 0 && delayMs > 0) {
      await sleep(delayMs);
    }

    const batch = values.slice(i, i + batchSize).map(normalizeForEmbedding);

    let lastErr: unknown;
    let succeeded = false;
    for (let attempt = 0; attempt < EMBED_BATCH_MAX_RETRIES; attempt++) {
      if (attempt > 0) {
        // Backoff exponencial: 1s, 2s, 4s…
        await sleep(1000 * 2 ** (attempt - 1));
      }
      try {
        const { embeddings } = await embedMany({
          model: EMBEDDING_MODEL_ID,
          values: batch,
        });
        results.push(...embeddings.map((embedding) => ({ embedding })));
        succeeded = true;
        break;
      } catch (err) {
        lastErr = err;
        console.warn(
          `[embedChunksInBatches] Tentativa ${attempt + 1}/${EMBED_BATCH_MAX_RETRIES} falhou no batch ${i}–${i + batchSize}:`,
          err instanceof Error ? err.message : err
        );
      }
    }
    if (!succeeded) {
      console.error(
        `[embedChunksInBatches] Batch ${i}–${i + batchSize} falhou após ${EMBED_BATCH_MAX_RETRIES} tentativas:`,
        lastErr instanceof Error ? lastErr.message : lastErr
      );
      return null;
    }
  }

  return results;
}
