import { NextResponse } from "next/server";

import { auth } from "@/app/(auth)/auth";
import {
  contentTypeFromFilename,
  persistAndRespond,
  runExtractionAndClassification,
} from "@/app/(chat)/api/files/upload/route";

const OCTET_STREAM = "application/octet-stream";
const MAX_BLOB_FETCH_SIZE = 100 * 1024 * 1024; // 100 MB

/** Sufixo do host Vercel Blob (evitar SSRF). */
const BLOB_HOST_SUFFIX = "blob.vercel-storage.com";

function isAllowedBlobUrl(urlString: string): boolean {
  try {
    const u = new URL(urlString);
    if (u.protocol !== "https:") return false;
    const host = u.hostname.toLowerCase();
    return (
      host === BLOB_HOST_SUFFIX || host.endsWith(`.${BLOB_HOST_SUFFIX}`)
    );
  } catch {
    return false;
  }
}

const ProcessBodySchema = {
  url: (v: unknown) => typeof v === "string" && v.length > 0,
  pathname: (v: unknown) => typeof v === "string" && v.length > 0,
  contentType: (v: unknown) => typeof v === "string",
  filename: (v: unknown) => typeof v === "string" && v.length > 0,
} as const;

/**
 * Processa um ficheiro já em Vercel Blob: extrai texto, classifica e persiste em Supabase.
 * Usado após upload direto cliente → Blob (ficheiros > 4,5 MB).
 */
export async function POST(request: Request): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  let body: {
    url?: string;
    pathname?: string;
    contentType?: string;
    filename?: string;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json(
      { error: "Corpo da requisição inválido" },
      { status: 400 }
    );
  }

  const url = body.url;
  const pathname = body.pathname;
  const filename = body.filename;
  let contentType = body.contentType ?? OCTET_STREAM;

  if (
    !ProcessBodySchema.url(url) ||
    !ProcessBodySchema.pathname(pathname) ||
    !ProcessBodySchema.filename(filename)
  ) {
    return NextResponse.json(
      { error: "Campos obrigatórios: url, pathname, filename" },
      { status: 400 }
    );
  }

  const urlString = url as string;
  const filenameStr = filename as string;
  if (!isAllowedBlobUrl(urlString)) {
    return NextResponse.json(
      { error: "URL de ficheiro não permitida" },
      { status: 400 }
    );
  }

  if (
    contentType === "" ||
    contentType === OCTET_STREAM
  ) {
    contentType = contentTypeFromFilename(filenameStr);
  }

  let res: Response;
  try {
    res = await fetch(urlString, {
      method: "GET",
      headers: { Accept: "*/*" },
      signal: AbortSignal.timeout(30_000),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Falha ao obter o ficheiro";
    return NextResponse.json(
      { error: `Não foi possível obter o ficheiro: ${message}` },
      { status: 502 }
    );
  }

  if (!res.ok) {
    return NextResponse.json(
      { error: `Falha ao obter o ficheiro (${res.status})` },
      { status: 502 }
    );
  }

  const contentLength = res.headers.get("content-length");
  if (contentLength) {
    const size = Number.parseInt(contentLength, 10);
    if (Number.isFinite(size) && size > MAX_BLOB_FETCH_SIZE) {
      return NextResponse.json(
        {
          error: `Ficheiro demasiado grande para processar (máx. ${MAX_BLOB_FETCH_SIZE / (1024 * 1024)} MB).`,
        },
        { status: 413 }
      );
    }
  }

  let buffer: ArrayBuffer;
  try {
    buffer = await res.arrayBuffer();
  } catch {
    return NextResponse.json(
      { error: "Falha ao ler o conteúdo do ficheiro" },
      { status: 502 }
    );
  }

  const {
    extractedText,
    extractionFailed,
    documentType,
    extractionDetail,
  } = await runExtractionAndClassification(buffer, contentType);

  return persistAndRespond(
    session.user.id,
    filenameStr,
    buffer,
    contentType,
    extractedText,
    extractionFailed,
    documentType,
    extractionDetail
  );
}
