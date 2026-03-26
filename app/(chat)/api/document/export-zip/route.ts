import JSZip from "jszip";
import { auth } from "@/app/(auth)/auth";
import { getDocumentById } from "@/lib/db/queries";
import {
  createDocxBuffer,
  type DocxLayout,
  sanitizeDocxFilename,
} from "@/lib/document-to-docx";
import { ChatbotError } from "@/lib/errors";

const LAYOUT_VALUES = new Set<DocxLayout>(["default", "assistjur-master"]);

/**
 * GET /api/document/export-zip?ids=id1,id2,id3&layout=assistjur-master
 * Gera um ficheiro ZIP com os DOCX dos documentos pedidos.
 * Máximo de 10 IDs por pedido.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const idsParam = searchParams.get("ids");
  const layoutParam = searchParams.get("layout");
  const layout: DocxLayout =
    layoutParam && LAYOUT_VALUES.has(layoutParam as DocxLayout)
      ? (layoutParam as DocxLayout)
      : "default";

  if (!idsParam) {
    return new ChatbotError(
      "bad_request:api",
      "Parâmetro ids é obrigatório (ex: ids=a,b,c)."
    ).toResponse();
  }

  const ids = idsParam
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 10);

  if (ids.length === 0) {
    return new ChatbotError(
      "bad_request:api",
      "Nenhum ID válido fornecido."
    ).toResponse();
  }

  const session = await auth();
  if (!session?.user) {
    return new ChatbotError("unauthorized:document").toResponse();
  }

  const userId = session.user.id;
  const zip = new JSZip();

  for (const id of ids) {
    const doc = await getDocumentById({ id, userId: userId ?? "" });

    if (!doc || doc.kind !== "text") {
      continue;
    }

    const buffer = await createDocxBuffer(doc.title, doc.content ?? "", layout);
    const filename = sanitizeDocxFilename(doc.title);
    zip.file(filename, buffer);
  }

  if (Object.keys(zip.files).length === 0) {
    return new ChatbotError(
      "not_found:document",
      "Nenhum documento válido encontrado para os IDs fornecidos."
    ).toResponse();
  }

  const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });
  const layoutSuffix = layout === "assistjur-master" ? "-master" : "";
  const zipFilename = `documentos${layoutSuffix}.zip`;

  return new Response(new Uint8Array(zipBuffer), {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${zipFilename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}

/**
 * POST /api/document/export-zip
 * Gera ZIP com DOCX a partir de conteúdo no body (sem aceder à BD).
 * Body: { docs: [{ title: string, content: string }][], layout?: DocxLayout }
 */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return new ChatbotError("unauthorized:document").toResponse();
  }

  let body: { docs?: unknown; layout?: unknown };
  try {
    body = await request.json();
  } catch {
    return new ChatbotError(
      "bad_request:api",
      "Body JSON inválido."
    ).toResponse();
  }

  const layout: DocxLayout =
    typeof body.layout === "string" &&
    LAYOUT_VALUES.has(body.layout as DocxLayout)
      ? (body.layout as DocxLayout)
      : "default";

  const docs = Array.isArray(body.docs)
    ? (body.docs as Array<{ title?: unknown; content?: unknown }>)
        .filter(
          (d) => typeof d?.title === "string" && typeof d?.content === "string"
        )
        .slice(0, 10)
    : [];

  if (docs.length === 0) {
    return new ChatbotError(
      "bad_request:api",
      "Nenhum documento válido no body."
    ).toResponse();
  }

  const zip = new JSZip();
  for (const doc of docs) {
    const buffer = await createDocxBuffer(
      doc.title as string,
      doc.content as string,
      layout
    );
    zip.file(sanitizeDocxFilename(doc.title as string), buffer);
  }

  const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });
  const layoutSuffix = layout === "assistjur-master" ? "-master" : "";

  return new Response(new Uint8Array(zipBuffer), {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="documentos${layoutSuffix}.zip"`,
      "Cache-Control": "private, no-store",
    },
  });
}
