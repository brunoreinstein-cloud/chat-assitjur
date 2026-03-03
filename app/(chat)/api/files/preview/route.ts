import { auth } from "@/app/(auth)/auth";
import { ChatbotError } from "@/lib/errors";

/** Timeout para fetch do ficheiro remoto. */
const FETCH_TIMEOUT_MS = 60_000;
const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB para preview

const BLOB_HOST_SUFFIX = "blob.vercel-storage.com";
const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/**
 * Permite apenas URLs do nosso storage (Vercel Blob ou Supabase) para evitar SSRF.
 */
function isAllowedPreviewUrl(urlString: string): boolean {
  try {
    const u = new URL(urlString);
    if (u.protocol !== "https:") {
      return false;
    }
    const host = u.hostname.toLowerCase();
    if (host === BLOB_HOST_SUFFIX || host.endsWith(`.${BLOB_HOST_SUFFIX}`)) {
      return true;
    }
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (typeof supabaseUrl === "string" && supabaseUrl.length > 0) {
      const supabaseOrigin = new URL(supabaseUrl).origin;
      const uOrigin = `${u.protocol}//${u.host}`;
      return uOrigin === supabaseOrigin && u.pathname.startsWith("/storage/");
    }
    return false;
  } catch {
    return false;
  }
}

function buildPreviewHtml(title: string, bodyHtml: string): string {
  return `<!DOCTYPE html>
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
}

/**
 * GET /api/files/preview?url=...&title=...
 * Devolve um DOCX (por URL) convertido em HTML para pré-visualização em iframe.
 * Apenas URLs do nosso storage (Vercel Blob ou Supabase) são aceites.
 */
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return new ChatbotError("unauthorized:document").toResponse();
  }

  const { searchParams } = new URL(request.url);
  const urlParam = searchParams.get("url");
  const titleParam = searchParams.get("title");

  if (!urlParam || urlParam.trim().length === 0) {
    return new ChatbotError(
      "bad_request:api",
      "Parâmetro url é obrigatório."
    ).toResponse();
  }

  const decodedUrl = decodeURIComponent(urlParam.trim());
  if (!isAllowedPreviewUrl(decodedUrl)) {
    return new ChatbotError(
      "bad_request:api",
      "URL não permitida para pré-visualização."
    ).toResponse();
  }

  let res: Response;
  try {
    res = await fetch(decodedUrl, {
      method: "GET",
      headers: { Accept: DOCX_MIME },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Falha ao obter o ficheiro";
    return new ChatbotError(
      "bad_request:api",
      `Não foi possível obter o ficheiro: ${message}`
    ).toResponse();
  }

  if (!res.ok) {
    return new ChatbotError(
      "bad_request:api",
      `Falha ao obter o ficheiro (${res.status})`
    ).toResponse();
  }

  const contentLength = res.headers.get("content-length");
  if (contentLength) {
    const size = Number.parseInt(contentLength, 10);
    if (Number.isFinite(size) && size > MAX_FILE_SIZE) {
      return new ChatbotError(
        "bad_request:api",
        `Ficheiro demasiado grande para pré-visualizar (máx. ${MAX_FILE_SIZE / (1024 * 1024)} MB).`
      ).toResponse();
    }
  }

  let buffer: ArrayBuffer;
  try {
    buffer = await res.arrayBuffer();
  } catch {
    return new ChatbotError(
      "bad_request:api",
      "Falha ao ler o conteúdo do ficheiro."
    ).toResponse();
  }

  if (buffer.byteLength > MAX_FILE_SIZE) {
    return new ChatbotError(
      "bad_request:api",
      "Ficheiro demasiado grande para pré-visualizar."
    ).toResponse();
  }

  const mammoth = await import("mammoth");
  const result = await mammoth.convertToHtml({
    buffer: Buffer.from(buffer),
  });
  const bodyHtml = typeof result.value === "string" ? result.value : "";

  const title =
    typeof titleParam === "string" && titleParam.trim().length > 0
      ? titleParam.trim()
      : "Documento";
  const html = buildPreviewHtml(title, bodyHtml);

  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "private, no-store",
    },
  });
}
