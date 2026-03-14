import { auth } from "@/app/(auth)/auth";
import { contentTypeFromFilename } from "@/app/(chat)/api/files/upload/route";
import { extractLegalSummary } from "@/lib/ai/extract-legal-summary";
import {
  createKnowledgeDocument,
  updateKnowledgeDocumentStructuredSummary,
} from "@/lib/db/queries";
import { ChatbotError } from "@/lib/errors";
import { vectorizeAndIndex } from "@/lib/rag";
import { ingestFromBuffer } from "@/lib/rag/ingestion";

/** Tempo para processar vários ficheiros (extração + OCR eventual). */
export const maxDuration = 300;

const OCTET_STREAM = "application/octet-stream";
const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100 MB
const ACCEPTED_EXTENSIONS = /\.(docx?|pdf|jpe?g|png|xlsx?|csv|txt|odt)$/i;
const MAX_FILES_PER_REQUEST = 50;

const ACCEPTED_MIME_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "text/csv",
  "text/plain",
  "application/vnd.oasis.opendocument.text",
  "image/jpeg",
  "image/png",
] as const;

function isAcceptedFile(file: File): boolean {
  if (file.size > MAX_FILE_SIZE) {
    return false;
  }
  const type = file.type;
  if (
    ACCEPTED_MIME_TYPES.includes(type as (typeof ACCEPTED_MIME_TYPES)[number])
  ) {
    return true;
  }
  if (
    (type === "" || type === OCTET_STREAM) &&
    ACCEPTED_EXTENSIONS.test(file.name)
  ) {
    return true;
  }
  return false;
}

/** Metadados opcionais extraídos pela IA (autor, tipo, informações-chave). */
export interface FromFilesMetadata {
  author: string;
  documentType: string;
  keyInfo: string;
}

export interface FromFilesResult {
  created: Array<{
    id: string;
    title: string;
    /** Comprimento do texto extraído (chars). Usado pelo cliente para feedback de cobertura. */
    contentLength: number;
    /** Metadados extraídos pela IA quando disponíveis. */
    metadata?: FromFilesMetadata;
  }>;
  failed?: Array<{ filename: string; error: string }>;
}

function parseFolderId(value: string | null): string | null {
  if (value === null || value === "" || value === "root") {
    return null;
  }
  return value;
}

function parseSkipVectorize(value: FormDataEntryValue | null): boolean {
  if (value === null) {
    return false;
  }
  const s = String(value).toLowerCase().trim();
  return s === "true" || s === "1" || s === "yes";
}

async function processOneFile(
  file: File,
  userId: string,
  folderId: string | null,
  skipVectorize: boolean
): Promise<
  | {
      ok: true;
      id: string;
      title: string;
      contentLength: number;
      metadata?: FromFilesMetadata;
    }
  | { ok: false; filename: string; error: string }
> {
  if (!isAcceptedFile(file)) {
    return {
      ok: false,
      filename: file.name,
      error:
        "Tipo ou tamanho não aceite. Use PDF, DOC, DOCX, XLS, XLSX, CSV, TXT, ODT, JPEG ou PNG (até 100 MB).",
    };
  }

  const filename = file.name;
  const contentType =
    file.type === "" || file.type === OCTET_STREAM
      ? contentTypeFromFilename(filename)
      : file.type;

  let buffer: ArrayBuffer;
  try {
    buffer = await file.arrayBuffer();
  } catch (err) {
    return {
      ok: false,
      filename,
      error: err instanceof Error ? err.message : "Falha ao ler o ficheiro.",
    };
  }

  const ingested = await ingestFromBuffer(buffer, contentType, filename);
  const { title, content, metadata } = ingested;

  try {
    const doc = await createKnowledgeDocument({
      userId,
      folderId,
      title,
      content,
      indexingStatus: skipVectorize ? "pending" : "indexed",
    });
    if (!skipVectorize) {
      await vectorizeAndIndex(doc.id, content, {
        meta: { userId: doc.userId, title: doc.title },
      });
      // Fire-and-forget: extrai resumo estruturado para PI/Contestação
      extractLegalSummary(content)
        .then((summary) => {
          if (summary) {
            return updateKnowledgeDocumentStructuredSummary({
              id: doc.id,
              structuredSummary: summary,
            });
          }
        })
        .catch(() => {
          /* fire-and-forget; ignore */
        });
    }
    return {
      ok: true,
      id: doc.id,
      title: doc.title,
      contentLength: content.length,
      ...(metadata ? { metadata } : {}),
    };
  } catch (err) {
    return {
      ok: false,
      filename,
      error: err instanceof Error ? err.message : "Erro ao criar documento.",
    };
  }
}

/**
 * POST: cria documentos na base de conhecimento a partir de ficheiros.
 * Nome = nome do ficheiro (sem extensão); conteúdo = texto extraído (PDF/DOC/DOCX) ou mensagem de fallback.
 * Multipart form-data com campo "files" (múltiplos ficheiros). Máx. 50 ficheiros por pedido.
 */
export async function POST(request: Request): Promise<Response> {
  const session = await auth();
  if (!session?.user) {
    return new ChatbotError("unauthorized:chat").toResponse();
  }

  if (request.body === null) {
    return new ChatbotError(
      "bad_request:api",
      "Corpo da requisição vazio"
    ).toResponse();
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return new ChatbotError(
      "bad_request:api",
      "FormData inválido"
    ).toResponse();
  }

  const rawFiles = formData.getAll("files");
  const folderIdRaw = formData.get("folderId");
  const folderId =
    typeof folderIdRaw === "string" ? parseFolderId(folderIdRaw) : null;
  const skipVectorize = parseSkipVectorize(formData.get("skipVectorize"));

  const files: File[] = rawFiles.filter((f): f is File => f instanceof File);
  if (files.length === 0) {
    return new ChatbotError(
      "bad_request:api",
      "Envie pelo menos um ficheiro no campo 'files'."
    ).toResponse();
  }
  if (files.length > MAX_FILES_PER_REQUEST) {
    return new ChatbotError(
      "bad_request:api",
      `Máximo ${MAX_FILES_PER_REQUEST} ficheiros por pedido.`
    ).toResponse();
  }

  const created: FromFilesResult["created"] = [];
  const failed: FromFilesResult["failed"] = [];

  for (const file of files) {
    const result = await processOneFile(
      file,
      session.user.id,
      folderId,
      skipVectorize
    );
    if (result.ok) {
      created.push({
        id: result.id,
        title: result.title,
        contentLength: result.contentLength,
        ...(result.metadata ? { metadata: result.metadata } : {}),
      });
    } else {
      failed.push({ filename: result.filename, error: result.error });
    }
  }

  const body: FromFilesResult = { created };
  if (failed.length > 0) {
    body.failed = failed;
  }
  return Response.json(body, { status: 201 });
}
