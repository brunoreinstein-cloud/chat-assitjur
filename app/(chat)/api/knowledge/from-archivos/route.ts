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
  getUserFilesByIds,
  insertKnowledgeChunks,
} from "@/lib/db/queries";
import { ChatbotError } from "@/lib/errors";

export const maxDuration = 300;

const TITLE_MAX_LENGTH = 512;
const FALLBACK_CONTENT =
  "(Texto não extraído. Pode colar o conteúdo manualmente ao editar o documento.)";
const MAX_ARCHIVOS_PER_REQUEST = 50;
const MAX_FETCH_SIZE = 100 * 1024 * 1024; // 100 MB
const FETCH_TIMEOUT_MS = 120_000; // 2 min

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

function parseFolderId(value: string | null): string | null {
  if (value === null || value === "" || value === "root") {
    return null;
  }
  return value;
}

export interface FromArchivosResult {
  created: Array<{ id: string; title: string }>;
  failed?: Array<{ fileId: string; filename: string; error: string }>;
}

/**
 * POST: criar documentos na base de conhecimento a partir de arquivos guardados (biblioteca "Arquivos").
 * Body: { fileIds: string[], folderId?: string }
 * Para cada fileId: usa extractedTextCache se existir; senão faz fetch da url e extrai texto.
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

  let body: { fileIds?: unknown; folderId?: string | null };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return new ChatbotError("bad_request:api", "JSON inválido").toResponse();
  }

  const rawIds = Array.isArray(body.fileIds) ? body.fileIds : [];
  const fileIds = rawIds
    .filter((id): id is string => typeof id === "string" && id.length > 0)
    .slice(0, MAX_ARCHIVOS_PER_REQUEST);

  if (fileIds.length === 0) {
    return new ChatbotError(
      "bad_request:api",
      "Envie pelo menos um fileId em fileIds."
    ).toResponse();
  }

  const folderId =
    typeof body.folderId === "string" ? parseFolderId(body.folderId) : null;

  const userFiles = await getUserFilesByIds({
    ids: fileIds,
    userId: session.user.id,
  });
  const fileById = new Map(userFiles.map((f) => [f.id, f]));

  const created: FromArchivosResult["created"] = [];
  const failed: NonNullable<FromArchivosResult["failed"]> = [];

  for (const fileId of fileIds) {
    const uf = fileById.get(fileId);
    if (!uf) {
      failed.push({
        fileId,
        filename: String(fileId),
        error: "Arquivo não encontrado ou não pertence ao utilizador.",
      });
      continue;
    }

    let content: string;
    if (
      typeof uf.extractedTextCache === "string" &&
      uf.extractedTextCache.trim().length > 0
    ) {
      content = uf.extractedTextCache.trim();
    } else {
      try {
        const res = await fetch(uf.url, {
          method: "GET",
          headers: { Accept: "*/*" },
          signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        });
        if (!res.ok) {
          failed.push({
            fileId,
            filename: uf.filename,
            error: `Não foi possível obter o ficheiro (${res.status}).`,
          });
          continue;
        }
        const contentLength = res.headers.get("content-length");
        if (contentLength) {
          const size = Number.parseInt(contentLength, 10);
          if (Number.isFinite(size) && size > MAX_FETCH_SIZE) {
            failed.push({
              fileId,
              filename: uf.filename,
              error: "Ficheiro demasiado grande para processar.",
            });
            continue;
          }
        }
        const buffer = await res.arrayBuffer();
        const contentType =
          uf.contentType || contentTypeFromFilename(uf.filename);
        const { extractedText } = await runExtractionAndClassification(
          buffer,
          contentType
        );
        const hasText =
          typeof extractedText === "string" && extractedText.trim().length > 0;
        content = hasText ? extractedText.trim() : FALLBACK_CONTENT;
      } catch (err) {
        failed.push({
          fileId,
          filename: uf.filename,
          error:
            err instanceof Error
              ? err.message
              : "Falha ao obter ou processar o ficheiro.",
        });
        continue;
      }
    }

    let title = sanitizeTitleFromFilename(uf.filename);
    if (content !== FALLBACK_CONTENT) {
      const extracted = await extractDocumentMetadata(content, uf.filename);
      if (extracted?.title?.trim()) {
        title = extracted.title.slice(0, TITLE_MAX_LENGTH).trim();
      }
    }

    try {
      const doc = await createKnowledgeDocument({
        userId: session.user.id,
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
      created.push({ id: doc.id, title: doc.title });
    } catch (err) {
      failed.push({
        fileId,
        filename: uf.filename,
        error: err instanceof Error ? err.message : "Erro ao criar documento.",
      });
    }
  }

  const result: FromArchivosResult = { created };
  if (failed.length > 0) {
    result.failed = failed;
  }
  return Response.json(result, { status: 201 });
}
