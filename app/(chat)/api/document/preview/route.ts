import { auth } from "@/app/(auth)/auth";
import { getDocumentById } from "@/lib/db/queries";
import { createDocxBuffer } from "@/lib/document-to-docx";
import { ChatbotError } from "@/lib/errors";

/**
 * GET /api/document/preview?id=xxx
 * Devolve o documento como página HTML (conversão DOCX→HTML via mammoth)
 * para pré-visualização no browser (iframe ou nova aba).
 * Apenas documentos do tipo "text" são suportados.
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
      "Apenas documentos de texto podem ser pré-visualizados como DOCX."
    ).toResponse();
  }

  const buffer = await createDocxBuffer(doc.title, doc.content ?? "");
  const mammoth = await import("mammoth");
  const result = await mammoth.convertToHtml({ buffer: Buffer.from(buffer) });
  const bodyHtml = result.value;

  const title = doc.title.trim() || "Documento";
  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)} — Pré-visualização</title>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: Arial, Helvetica, sans-serif;
      font-size: 12pt;
      line-height: 1.4;
      color: #1a1a1a;
      max-width: 210mm;
      margin: 0 auto;
      padding: 1.5rem 2rem 2rem;
      background: #fff;
    }
    h1, h2, h3, h4 { font-size: 14pt; font-weight: 700; margin: 1rem 0 0.5rem; }
    table { border-collapse: collapse; width: 100%; margin: 0.5rem 0; }
    th, td { border: 1px solid #333; padding: 0.35rem 0.6rem; text-align: left; }
    th { background: #f0f0f0; font-weight: 600; }
    p { margin: 0.4rem 0; }
  </style>
</head>
<body>
  ${bodyHtml}
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "private, no-store",
    },
  });
}

function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
