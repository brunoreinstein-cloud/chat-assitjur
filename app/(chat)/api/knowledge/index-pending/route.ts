/**
 * POST: processa documentos com indexingStatus = 'pending' (vetorização + indexação).
 * Útil para ingestão "só guardar": criar documento como pending e chamar este endpoint
 * ou um job (ex.: Trigger.dev) depois.
 *
 * Melhorias:
 * - Retry com backoff exponencial por documento (até MAX_RETRIES tentativas).
 * - Processamento concorrente em lotes (CONCURRENCY_LIMIT docs em paralelo).
 * - Resposta parcial: informa quais documentos falharam mesmo após retentativas.
 */

import { auth } from "@/app/(auth)/auth";
import {
  getKnowledgeDocumentsPendingIndexing,
  updateKnowledgeDocumentIndexingStatus,
} from "@/lib/db/queries";
import { ChatbotError } from "@/lib/errors";
import { vectorizeAndIndex } from "@/lib/rag";

const MAX_PROCESS_PER_REQUEST = 20;
/** Máximo de tentativas por documento antes de marcar como 'failed'. */
const MAX_RETRIES = 3;
/** Base do backoff exponencial em ms (1ª retry: 500ms, 2ª: 1000ms, 3ª: 2000ms). */
const RETRY_BASE_MS = 500;
/** Documentos processados em paralelo por lote. */
const CONCURRENCY_LIMIT = 3;

/** Aguarda ms milissegundos. */
const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Resultado do processamento de um documento. */
interface DocResult {
  id: string;
  status: "indexed" | "failed";
  indexed?: number;
  attempts: number;
  error?: string;
}

/**
 * Tenta vetorizar e indexar um documento com retry exponencial.
 * Retorna o resultado final (indexed ou failed) e o número de tentativas.
 */
async function processDocWithRetry(doc: {
  id: string;
  content: string;
  userId: string;
  title: string;
}): Promise<DocResult> {
  let lastError: string | undefined;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const { indexed } = await vectorizeAndIndex(doc.id, doc.content, {
        meta: { userId: doc.userId, title: doc.title },
      });

      if (indexed > 0) {
        return { id: doc.id, status: "indexed", indexed, attempts: attempt };
      }

      // Vetorização retornou 0 chunks — tentar novamente
      lastError = "vectorizeAndIndex returned 0 chunks";
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }

    // Não dorme após a última tentativa
    if (attempt < MAX_RETRIES) {
      await sleep(RETRY_BASE_MS * 2 ** (attempt - 1));
    }
  }

  return {
    id: doc.id,
    status: "failed",
    attempts: MAX_RETRIES,
    error: lastError,
  };
}

/**
 * Processa um array de documentos em lotes concorrentes de tamanho CONCURRENCY_LIMIT.
 */
async function processBatch<T>(
  items: T[],
  fn: (item: T) => Promise<DocResult>
): Promise<DocResult[]> {
  const results: DocResult[] = [];

  for (let i = 0; i < items.length; i += CONCURRENCY_LIMIT) {
    const batch = items.slice(i, i + CONCURRENCY_LIMIT);
    const batchResults = await Promise.allSettled(batch.map(fn));

    for (const result of batchResults) {
      if (result.status === "fulfilled") {
        results.push(result.value);
      } else {
        // Falha inesperada fora do retry — não deve ocorrer, mas por segurança
        results.push({
          id: "unknown",
          status: "failed",
          attempts: MAX_RETRIES,
          error:
            result.reason instanceof Error
              ? result.reason.message
              : String(result.reason),
        });
      }
    }
  }

  return results;
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return new ChatbotError("unauthorized:chat").toResponse();
  }

  const url = new URL(request.url);
  const limitParam = url.searchParams.get("limit");
  const limit = Math.min(
    Number.parseInt(limitParam ?? String(MAX_PROCESS_PER_REQUEST), 10) ||
      MAX_PROCESS_PER_REQUEST,
    MAX_PROCESS_PER_REQUEST
  );
  const onlyMine = url.searchParams.get("onlyMine") !== "false";

  const pending = await getKnowledgeDocumentsPendingIndexing({
    limit,
    userId: onlyMine ? session.user.id : undefined,
  });

  if (pending.length === 0) {
    return Response.json({ processed: 0, results: [] });
  }

  // Processa em lotes concorrentes com retry por documento
  const results = await processBatch(pending, processDocWithRetry);

  // Persiste o status final de cada documento no banco
  await Promise.allSettled(
    results.map((result) =>
      updateKnowledgeDocumentIndexingStatus({
        id: result.id,
        userId:
          pending.find((d) => d.id === result.id)?.userId ?? session.user.id,
        indexingStatus: result.status,
      })
    )
  );

  const indexed = results.filter((r) => r.status === "indexed").length;
  const failed = results.filter((r) => r.status === "failed").length;

  return Response.json({
    processed: results.length,
    indexed,
    failed,
    results: results.map(({ error: _e, ...r }) => r), // omite detalhes de erro interno
  });
}
