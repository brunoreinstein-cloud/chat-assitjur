import { auth } from "@/app/(auth)/auth";
import { docxCache } from "@/lib/cache/document-cache";
import { getDocumentById } from "@/lib/db/queries";
import { createDocxBuffer, sanitizeDocxFilename } from "@/lib/document-to-docx";
import { ChatbotError } from "@/lib/errors";

const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/**
 * GET /api/document/export?id=xxx
 * Devolve o documento (versão mais recente) como ficheiro DOCX para download.
 * Apenas documentos do tipo "text" são exportados como DOCX.
 * Resposta em cache 30s para repetidos downloads do mesmo documento.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return new ChatbotError(
      "bad_request:api",
      "Parâmetro id é obrigatório."
    ).toResponse();
  }

  const session = await auth();

  if (!session?.user) {
    return new ChatbotError("unauthorized:document").toResponse();
  }

  const userId = session.user.id;
  const cached = docxCache.get(userId, id);
  if (cached !== undefined) {
    return new Response(cached.buffer, {
      status: 200,
      headers: {
        "Content-Type": DOCX_MIME,
        "Content-Disposition": `attachment; filename="${cached.filename}"`,
        "Cache-Control": "private, max-age=15",
      },
    });
  }

  const doc = await getDocumentById({ id });

  if (!doc) {
    return new ChatbotError("not_found:document").toResponse();
  }

  if (doc.userId !== userId) {
    return new ChatbotError("forbidden:document").toResponse();
  }

  if (doc.kind !== "text") {
    return new ChatbotError(
      "bad_request:api",
      "Apenas documentos de texto podem ser exportados como DOCX."
    ).toResponse();
  }

  const content = doc.content ?? "";
  const buffer = await createDocxBuffer(doc.title, content);
  const filename = sanitizeDocxFilename(doc.title);
  docxCache.set(userId, id, buffer, filename);

  return new Response(buffer, {
    status: 200,
    headers: {
      "Content-Type": DOCX_MIME,
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, max-age=15",
    },
  });
}
