/**
 * POST: processa documentos com indexingStatus = 'pending' (vetorização + indexação).
 * Útil para ingestão "só guardar": criar documento como pending e chamar este endpoint
 * ou um job (ex.: Trigger.dev) depois.
 */

import { auth } from "@/app/(auth)/auth";
import {
  getKnowledgeDocumentsPendingIndexing,
  updateKnowledgeDocumentIndexingStatus,
} from "@/lib/db/queries";
import { ChatbotError } from "@/lib/errors";
import { vectorizeAndIndex } from "@/lib/rag";

const MAX_PROCESS_PER_REQUEST = 20;

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

  const results: Array<{
    id: string;
    status: "indexed" | "failed";
    indexed?: number;
  }> = [];

  for (const doc of pending) {
    const { indexed } = await vectorizeAndIndex(doc.id, doc.content, {
      meta: { userId: doc.userId, title: doc.title },
    });
    const status = indexed > 0 ? "indexed" : "failed";
    await updateKnowledgeDocumentIndexingStatus({
      id: doc.id,
      userId: doc.userId,
      indexingStatus: status,
    });
    results.push({
      id: doc.id,
      status,
      ...(indexed > 0 ? { indexed } : {}),
    });
  }

  return Response.json({
    processed: results.length,
    results,
  });
}
