import { NextResponse } from "next/server";

import { auth } from "@/app/(auth)/auth";
import { classifyDocumentTypeFromFilename } from "@/lib/upload/classify";
import { runExtractionAndClassification } from "@/lib/upload/extract";
import { extractFilesFromZip } from "@/lib/upload/extract-zip";
import {
  contentTypeFromFilename,
  isZipContentType,
  needsExtraction,
} from "@/lib/upload/mime-types";
import { persistAndRespond, uploadToStorage } from "@/lib/upload/storage";

/** Permite tempo suficiente para descarregar e processar PDFs muito grandes (até 100 MB). */
export const maxDuration = 300;

const OCTET_STREAM = "application/octet-stream";
const MAX_BLOB_FETCH_SIZE = 100 * 1024 * 1024; // 100 MB
/** Timeout do fetch ao Blob: PDFs enormes podem demorar a transferir. */
const BLOB_FETCH_TIMEOUT_MS = 180_000; // 3 min

/** Sufixo do host Vercel Blob (evitar SSRF). */
const BLOB_HOST_SUFFIX = "blob.vercel-storage.com";

function isAllowedBlobUrl(urlString: string): boolean {
  try {
    const u = new URL(urlString);
    if (u.protocol !== "https:") {
      return false;
    }
    const host = u.hostname.toLowerCase();
    return host === BLOB_HOST_SUFFIX || host.endsWith(`.${BLOB_HOST_SUFFIX}`);
  } catch {
    return false;
  }
}

interface ProcessBody {
  url: string;
  pathname: string;
  contentType: string;
  filename: string;
}

const ProcessBodySchema = {
  url: (v: unknown) => typeof v === "string" && v.length > 0,
  pathname: (v: unknown) => typeof v === "string" && v.length > 0,
  contentType: (v: unknown) => typeof v === "string",
  filename: (v: unknown) => typeof v === "string" && v.length > 0,
} as const;

async function parseProcessBody(
  request: Request
): Promise<
  { ok: true; body: ProcessBody } | { ok: false; response: NextResponse }
> {
  interface RawBody {
    url?: string;
    pathname?: string;
    contentType?: string;
    filename?: string;
  }
  let raw: RawBody;
  try {
    raw = (await request.json()) as RawBody;
  } catch {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Corpo da requisição inválido" },
        { status: 400 }
      ),
    };
  }
  const url = raw.url;
  const pathname = raw.pathname;
  const filename = raw.filename;
  const valid =
    ProcessBodySchema.url(url) &&
    ProcessBodySchema.pathname(pathname) &&
    ProcessBodySchema.filename(filename);
  if (!valid) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Campos obrigatórios: url, pathname, filename" },
        { status: 400 }
      ),
    };
  }
  const urlString = url as string;
  const filenameStr = filename as string;
  if (!isAllowedBlobUrl(urlString)) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "URL de ficheiro não permitida" },
        { status: 400 }
      ),
    };
  }
  let contentType = raw.contentType ?? OCTET_STREAM;
  if (contentType === "" || contentType === OCTET_STREAM) {
    contentType = contentTypeFromFilename(filenameStr);
  }
  return {
    ok: true,
    body: {
      url: urlString,
      pathname: pathname as string,
      contentType,
      filename: filenameStr,
    },
  };
}

async function fetchBlobBuffer(
  urlString: string
): Promise<
  { ok: true; buffer: ArrayBuffer } | { ok: false; response: NextResponse }
> {
  let res: Response;
  try {
    res = await fetch(urlString, {
      method: "GET",
      headers: { Accept: "*/*" },
      signal: AbortSignal.timeout(BLOB_FETCH_TIMEOUT_MS),
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Falha ao obter o ficheiro";
    return {
      ok: false,
      response: NextResponse.json(
        { error: `Não foi possível obter o ficheiro: ${message}` },
        { status: 502 }
      ),
    };
  }
  if (!res.ok) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: `Falha ao obter o ficheiro (${res.status})` },
        { status: 502 }
      ),
    };
  }
  const contentLength = res.headers.get("content-length");
  if (contentLength) {
    const size = Number.parseInt(contentLength, 10);
    if (Number.isFinite(size) && size > MAX_BLOB_FETCH_SIZE) {
      return {
        ok: false,
        response: NextResponse.json(
          {
            error: `Ficheiro demasiado grande para processar (máx. ${MAX_BLOB_FETCH_SIZE / (1024 * 1024)} MB).`,
          },
          { status: 413 }
        ),
      };
    }
  }
  try {
    const buffer = await res.arrayBuffer();
    return { ok: true, buffer };
  } catch {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Falha ao ler o conteúdo do ficheiro" },
        { status: 502 }
      ),
    };
  }
}

/**
 * Processa um ficheiro já em Vercel Blob: extrai texto, classifica e persiste em Supabase.
 * Usado após upload direto cliente → Blob (ficheiros > 4,5 MB).
 */
export async function POST(request: Request): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const parsed = await parseProcessBody(request);
  if (!parsed.ok) {
    return parsed.response;
  }

  const { body } = parsed;
  const isDev = process.env.NODE_ENV === "development";
  const t0 = Date.now();
  const fetched = await fetchBlobBuffer(body.url);
  if (!fetched.ok) {
    return fetched.response;
  }
  if (isDev) {
    const sizeMB = (fetched.buffer.byteLength / (1024 * 1024)).toFixed(1);
    console.log(`[process] download: ${Date.now() - t0}ms (${sizeMB} MB)`);
  }

  try {
    // --- ZIP handling for large files ---
    if (isZipContentType(body.contentType)) {
      const zipResult = await extractFilesFromZip(fetched.buffer);
      const results = await Promise.allSettled(
        zipResult.files.map(async (entry) => {
          const entryBuffer = entry.buffer.slice(0);
          const extraction = needsExtraction(entry.contentType)
            ? await runExtractionAndClassification(
                entry.buffer,
                entry.contentType
              )
            : {
                extractedText: undefined,
                extractionFailed: false,
                documentType: undefined,
                extractionDetail: undefined,
              };
          const uploadResult = await uploadToStorage(
            session.user.id,
            entry.filename,
            entryBuffer,
            entry.contentType
          );
          const documentType =
            extraction.documentType ??
            classifyDocumentTypeFromFilename(entry.filename);
          return {
            url: uploadResult.url,
            pathname: uploadResult.pathname,
            contentType: entry.contentType,
            ...(typeof extraction.extractedText === "string"
              ? { extractedText: extraction.extractedText }
              : {}),
            ...(extraction.extractionFailed === true
              ? { extractionFailed: true }
              : {}),
            ...(typeof extraction.extractionDetail === "string" &&
            extraction.extractionDetail.length > 0
              ? { extractionDetail: extraction.extractionDetail }
              : {}),
            ...(documentType ? { documentType } : {}),
            ...("pageCount" in extraction && extraction.pageCount != null
              ? { pageCount: extraction.pageCount }
              : {}),
          };
        })
      );
      const fulfilled = results.filter(
        (r) => r.status === "fulfilled"
      ) as PromiseFulfilledResult<Record<string, unknown>>[];
      const files = fulfilled.map((r) => r.value);
      const failedCount = results.length - fulfilled.length;
      return NextResponse.json({
        zip: true,
        files,
        summary: {
          processed: files.length,
          failed: failedCount,
          skippedUnsupported: zipResult.skippedUnsupported,
          skippedNestedZips: zipResult.skippedNestedZips,
          skippedTooLarge: zipResult.skippedTooLarge,
        },
      });
    }

    // --- Normal (non-ZIP) file ---
    // Clone the buffer before extraction — PDF.js may detach the original ArrayBuffer,
    // making it unusable for the subsequent storage upload in persistAndRespond.
    const bufferForStorage = fetched.buffer.slice(0);
    const t1 = Date.now();
    const extraction = await runExtractionAndClassification(
      fetched.buffer,
      body.contentType
    );
    if (isDev) {
      console.log(
        `[process] extraction+classification: ${Date.now() - t1}ms | total: ${Date.now() - t0}ms`
      );
    }
    const documentType =
      extraction.documentType ??
      classifyDocumentTypeFromFilename(body.filename);

    return await persistAndRespond(
      session.user.id,
      body.filename,
      bufferForStorage,
      body.contentType,
      {
        extractedText: extraction.extractedText,
        extractionFailed: extraction.extractionFailed,
        documentType,
        extractionDetail: extraction.extractionDetail,
        ...(extraction.pageCount != null
          ? { pageCount: extraction.pageCount }
          : {}),
      },
      // Ficheiro já está no Vercel Blob (upload direto do cliente).
      // Se Supabase falhar (ex.: >50MB), reutiliza este URL em vez de criar duplicado.
      body.url
    );
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Erro ao processar o ficheiro.";
    if (process.env.NODE_ENV === "development") {
      console.warn("[api/files/process] 500:", message, err);
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
