import { auth } from "@/app/(auth)/auth";
import { previewCache } from "@/lib/cache/document-cache";
import { getDocumentById } from "@/lib/db/queries";
import { createDocxBuffer, type DocxLayout } from "@/lib/document-to-docx";
import { ChatbotError } from "@/lib/errors";

const LAYOUT_VALUES = new Set<DocxLayout>(["default", "assistjur-master"]);

/**
 * GET /api/document/preview?id=xxx&layout=assistjur-master
 * Devolve o documento como página HTML (conversão DOCX→HTML via mammoth)
 * para pré-visualização inline (iframe no modal).
 * layout=assistjur-master aplica estilo cinza/dourado ao HTML.
 * Resposta em cache 60s por documento+layout.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  const layoutParam = searchParams.get("layout");
  const layout: DocxLayout =
    layoutParam && LAYOUT_VALUES.has(layoutParam as DocxLayout)
      ? (layoutParam as DocxLayout)
      : "default";

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
  const cacheKey = `${id}:${layout}`;

  const cached = previewCache.get(userId, cacheKey);
  if (cached !== undefined) {
    return new Response(cached, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "private, max-age=30",
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
      "Apenas documentos de texto podem ser pré-visualizados como DOCX."
    ).toResponse();
  }

  const buffer = await createDocxBuffer(doc.title, doc.content ?? "", layout);
  const mammoth = await import("mammoth");
  const result = await mammoth.convertToHtml({ buffer: Buffer.from(buffer) });
  const bodyHtml = result.value;

  const title = doc.title.trim() || "Documento";
  const isMaster = layout === "assistjur-master";

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
      color: ${isMaster ? "#333333" : "#1a1a1a"};
      max-width: 210mm;
      margin: 0 auto;
      padding: 1.5rem 2rem 2rem;
      background: #fff;
    }
    ${
      isMaster
        ? `
    h1, h2, h3, h4 {
      font-size: 14pt;
      font-weight: 700;
      color: #B8860B;
      margin: 1rem 0 0.5rem;
      border-bottom: 1px solid #B8860B;
      padding-bottom: 0.2rem;
    }
    `
        : `
    h1, h2, h3, h4 { font-size: 14pt; font-weight: 700; margin: 1rem 0 0.5rem; }
    `
    }
    table { border-collapse: collapse; width: 100%; margin: 0.5rem 0; }
    th, td { border: 1px solid ${isMaster ? "#B8860B" : "#333"}; padding: 0.35rem 0.6rem; text-align: left; }
    th { background: ${isMaster ? "#f5f0e8" : "#f0f0f0"}; font-weight: 600; color: ${isMaster ? "#333333" : "inherit"}; }
    p { margin: 0.4rem 0; }
    /* Botão de impressão */
    #print-btn {
      position: fixed;
      top: 12px;
      right: 12px;
      z-index: 999;
      background: ${isMaster ? "#B8860B" : "#333"};
      color: #fff;
      border: none;
      border-radius: 6px;
      padding: 6px 14px;
      font-size: 11pt;
      cursor: pointer;
      opacity: 0.85;
      transition: opacity 0.15s;
    }
    #print-btn:hover { opacity: 1; }
    @media print {
      #print-btn { display: none; }
      body { padding: 0; max-width: 100%; }
    }
  </style>
</head>
<body>
  <button id="print-btn" onclick="window.print()">🖨 Imprimir / PDF</button>
  ${bodyHtml}
</body>
</html>`;

  previewCache.set(userId, cacheKey, html);

  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "private, max-age=30",
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
