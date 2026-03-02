import { auth } from "@/app/(auth)/auth";
import {
  contentTypeFromFilename,
  runExtractionAndClassification,
} from "@/app/(chat)/api/files/upload/route";
import { extractDocumentMetadata } from "@/lib/ai/extract-metadata";
import { chunkText, embedChunks } from "@/lib/ai/rag";
import {
  createKnowledgeDocument,
  deleteChunksByKnowledgeDocumentId,
  insertKnowledgeChunks,
} from "@/lib/db/queries";
import { ChatbotError } from "@/lib/errors";

/** Tempo para processar vários ficheiros (extração + OCR eventual). */
export const maxDuration = 300;

const OCTET_STREAM = "application/octet-stream";
const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100 MB
const ACCEPTED_EXTENSIONS = /\.(docx?|pdf|jpe?g|png)$/i;
const MAX_FILES_PER_REQUEST = 50;
const TITLE_MAX_LENGTH = 512;
const FALLBACK_CONTENT =
  "(Texto não extraído. Pode colar o conteúdo manualmente ao editar o documento.)";

function sanitizeTitleFromFilename(filename: string): string {
  const base = filename.replace(/\.[^.]+$/i, "").trim() || filename;
  const sanitized = base
    .replaceAll(/[^\p{L}\p{N}\s._-]/gu, " ")
    .replaceAll(/\s+/g, " ")
    .trim();
  return (
    sanitized.slice(0, TITLE_MAX_LENGTH) || filename.slice(0, TITLE_MAX_LENGTH)
  );
}

function isAcceptedFile(file: File): boolean {
  if (file.size > MAX_FILE_SIZE) {
    return false;
  }
  const type = file.type;
  if (
    type === "application/pdf" ||
    type === "application/msword" ||
    type ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    type === "image/jpeg" ||
    type === "image/png"
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

async function processOneFile(
  file: File,
  userId: string,
  folderId: string | null
): Promise<
  | { ok: true; id: string; title: string; metadata?: FromFilesMetadata }
  | { ok: false; filename: string; error: string }
> {
  if (!isAcceptedFile(file)) {
    return {
      ok: false,
      filename: file.name,
      error:
        "Tipo ou tamanho não aceite. Use PDF, DOC, DOCX, JPEG ou PNG (até 100 MB).",
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

  const { extractedText } = await runExtractionAndClassification(
    buffer,
    contentType
  );
  const hasText =
    typeof extractedText === "string" && extractedText.trim().length > 0;
  const content = hasText ? extractedText.trim() : FALLBACK_CONTENT;

  // Extração inteligente de metadados pela IA (título, autor, tipo, informações-chave)
  let title = sanitizeTitleFromFilename(filename);
  let metadata: FromFilesMetadata | undefined;
  if (hasText && typeof extractedText === "string") {
    const extracted = await extractDocumentMetadata(extractedText, filename);
    if (extracted?.title?.trim()) {
      title = extracted.title.slice(0, TITLE_MAX_LENGTH).trim();
    }
    if (extracted) {
      metadata = {
        author: extracted.author,
        documentType: extracted.documentType,
        keyInfo: extracted.keyInfo,
      };
    }
  }

  try {
    const doc = await createKnowledgeDocument({
      userId,
      folderId,
      title,
      content,
    });
    const chunks = chunkText(content);
    if (chunks.length > 0) {
      const embedded = await embedChunks(chunks);
      if (embedded !== null && embedded.length === chunks.length) {
        try {
          await insertKnowledgeChunks({
            knowledgeDocumentId: doc.id,
            chunksWithEmbeddings: chunks.map((text, i) => ({
              text,
              embedding: embedded[i]?.embedding ?? [],
            })),
          });
        } catch {
          await deleteChunksByKnowledgeDocumentId(doc.id);
        }
      }
    }
    return {
      ok: true,
      id: doc.id,
      title: doc.title,
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
    const result = await processOneFile(file, session.user.id, folderId);
    if (result.ok) {
      created.push({
        id: result.id,
        title: result.title,
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
