import { auth } from "@/app/(auth)/auth";
import { docxCache } from "@/lib/cache/document-cache";
import { getDocumentById } from "@/lib/db/queries";
import {
  createDocxBuffer,
  type DocxLayout,
  sanitizeDocxFilename,
  toByteStringSafe,
} from "@/lib/document-to-docx";
import { ChatbotError } from "@/lib/errors";

const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

const LAYOUT_VALUES = new Set<DocxLayout>(["default", "assistjur-master"]);

/**
 * GET /api/document/export?id=xxx&layout=assistjur-master
 * Devolve o documento (versão mais recente) como ficheiro DOCX para download.
 * Apenas documentos do tipo "text" são exportados como DOCX.
 * layout=assistjur-master aplica paleta cinza/dourado, cabeçalho e rodapé BR Consultoria.
 * Resposta em cache 30s para repetidos downloads do mesmo documento.
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
  const cached = docxCache.get(userId, cacheKey);
  if (cached !== undefined) {
    const safeFilename = toByteStringSafe(cached.filename);
    return new Response(new Uint8Array(cached.buffer), {
      status: 200,
      headers: {
        "Content-Type": DOCX_MIME,
        "Content-Disposition": `attachment; filename="${safeFilename}"`,
        "Cache-Control": "private, max-age=15",
      },
    });
  }

  const doc = await getDocumentById({ id, userId: userId ?? "" });

  if (!doc) {
    return new ChatbotError("not_found:document").toResponse();
  }

  if (doc.kind !== "text") {
    return new ChatbotError(
      "bad_request:api",
      "Apenas documentos de texto podem ser exportados como DOCX."
    ).toResponse();
  }

  const content = doc.content ?? "";
  const buffer = await createDocxBuffer(doc.title, content, layout);
  const filename = sanitizeDocxFilename(doc.title);
  docxCache.set(userId, cacheKey, buffer, filename);

  const safeFilename = toByteStringSafe(filename);
  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": DOCX_MIME,
      "Content-Disposition": `attachment; filename="${safeFilename}"`,
      "Cache-Control": "private, max-age=15",
    },
  });
}

/**
 * POST /api/document/export
 * Gera DOCX a partir de conteúdo no body (sem aceder à BD).
 * Body: { title: string, content: string, layout?: DocxLayout }
 */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return new ChatbotError("unauthorized:document").toResponse();
  }

  let body: { title?: unknown; content?: unknown; layout?: unknown };
  try {
    body = await request.json();
  } catch {
    return new ChatbotError(
      "bad_request:api",
      "Body JSON inválido."
    ).toResponse();
  }

  if (typeof body.title !== "string" || typeof body.content !== "string") {
    return new ChatbotError(
      "bad_request:api",
      "Campos title e content são obrigatórios."
    ).toResponse();
  }

  const layout: DocxLayout =
    typeof body.layout === "string" &&
    LAYOUT_VALUES.has(body.layout as DocxLayout)
      ? (body.layout as DocxLayout)
      : "default";

  const buffer = await createDocxBuffer(body.title, body.content, layout);
  const filename = sanitizeDocxFilename(body.title);
  const safeFilename = toByteStringSafe(filename);

  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": DOCX_MIME,
      "Content-Disposition": `attachment; filename="${safeFilename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
