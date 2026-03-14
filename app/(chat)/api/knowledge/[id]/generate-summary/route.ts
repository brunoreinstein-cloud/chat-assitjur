/**
 * POST /api/knowledge/[id]/generate-summary
 * Gera (ou regenera) o resumo estruturado de uma PI ou Contestação.
 * Usado para backfill de documentos existentes e para regenerar manualmente.
 */

import { auth } from "@/app/(auth)/auth";
import { extractLegalSummary } from "@/lib/ai/extract-legal-summary";
import {
  getKnowledgeDocumentsByIds,
  updateKnowledgeDocumentStructuredSummary,
} from "@/lib/db/queries";
import { ChatbotError } from "@/lib/errors";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const session = await auth();
  if (!session?.user) {
    return new ChatbotError("unauthorized:chat").toResponse();
  }

  const { id } = await params;

  const docs = await getKnowledgeDocumentsByIds({
    ids: [id],
    userId: session.user.id,
  });
  const doc = docs[0];
  if (!doc) {
    return new ChatbotError("not_found:document").toResponse();
  }

  if (!doc.content || doc.content.trim().length < 500) {
    return Response.json(
      {
        generated: false,
        reason: "Conteúdo insuficiente para extrair resumo.",
      },
      { status: 200 }
    );
  }

  const summary = await extractLegalSummary(doc.content);

  if (!summary) {
    return Response.json(
      {
        generated: false,
        reason: "Documento não identificado como PI ou Contestação.",
      },
      { status: 200 }
    );
  }

  await updateKnowledgeDocumentStructuredSummary({
    id,
    structuredSummary: summary,
  });

  return Response.json({ generated: true }, { status: 200 });
}
