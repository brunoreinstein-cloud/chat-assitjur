import { auth } from "@/app/(auth)/auth";
import { contentTypeFromFilename } from "@/lib/upload/mime-types";
import { createKnowledgeDocument, getUserFilesByIds } from "@/lib/db/queries";
import { ChatbotError } from "@/lib/errors";
import { vectorizeAndIndex } from "@/lib/rag";
import { ingestFromBuffer, ingestFromContent } from "@/lib/rag/ingestion";

export const maxDuration = 300;

const MAX_ARCHIVOS_PER_REQUEST = 50;
const MAX_FETCH_SIZE = 100 * 1024 * 1024; // 100 MB
const FETCH_TIMEOUT_MS = 120_000; // 2 min

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

  let body: {
    fileIds?: unknown;
    folderId?: string | null;
    /** Se true, cria documentos sem vetorizar (indexingStatus = pending). */
    skipVectorize?: boolean;
  };
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
  const skipVectorize = Boolean(body.skipVectorize);

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

    let ingested: Awaited<ReturnType<typeof ingestFromBuffer>>;
    if (
      typeof uf.extractedTextCache === "string" &&
      uf.extractedTextCache.trim().length > 0
    ) {
      ingested = await ingestFromContent(
        uf.extractedTextCache.trim(),
        uf.filename
      );
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
        ingested = await ingestFromBuffer(buffer, contentType, uf.filename);
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

    try {
      const doc = await createKnowledgeDocument({
        userId: session.user.id,
        folderId,
        title: ingested.title,
        content: ingested.content,
        indexingStatus: skipVectorize ? "pending" : "indexed",
      });
      if (!skipVectorize) {
        await vectorizeAndIndex(doc.id, ingested.content, {
          meta: { userId: doc.userId, title: doc.title },
        });
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
