import { put } from "@vercel/blob";
import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/app/(auth)/auth";
import { getSupabaseServerClient } from "@/lib/supabase/server";

/** PDFs enormes (muitas páginas ou OCR) podem demorar; permite até 5 min na Vercel (Pro). */
export const maxDuration = 300;

const SUPABASE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET ?? "chat-files";

const isDev = process.env.NODE_ENV === "development";
const hasBlobToken = Boolean(process.env.BLOB_READ_WRITE_TOKEN);

function buildDataUrl(buffer: ArrayBuffer, contentType: string): string {
  const base64 = Buffer.from(buffer).toString("base64");
  return `data:${contentType};base64,${base64}`;
}

const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png"] as const;
const ACCEPTED_PDF_TYPE = "application/pdf" as const;
/** Word 97-2003 (.doc) */
const ACCEPTED_DOC_TYPE = "application/msword" as const;
/** Word Open XML (.docx) */
const ACCEPTED_DOCX_TYPE =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document" as const;
const OCTET_STREAM = "application/octet-stream";
const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100 MB

/** Extensões aceites para fallback quando o browser envia type vazio ou octet-stream (comum em produção). */
const ACCEPTED_EXTENSIONS = /\.(docx?|pdf|jpe?g|png)$/i;

export function contentTypeFromFilename(filename: string): string {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".doc")) {
    return ACCEPTED_DOC_TYPE;
  }
  if (lower.endsWith(".docx")) {
    return ACCEPTED_DOCX_TYPE;
  }
  if (lower.endsWith(".pdf")) {
    return ACCEPTED_PDF_TYPE;
  }
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) {
    return "image/jpeg";
  }
  if (lower.endsWith(".png")) {
    return "image/png";
  }
  return OCTET_STREAM;
}
const MAX_EXTRACTED_TEXT_LENGTH = 600_000; // ~600k caracteres (PI + Contestação grandes)
/** Máximo de páginas a processar por OCR (PDFs digitalizados). PDFs enormes: pode demorar; maxDuration na rota permite até 5 min. */
const MAX_OCR_PAGES = 50;

/** Amostra do início do texto para classificação (evita analisar o doc inteiro). */
const CLASSIFY_SAMPLE_LENGTH = 4000;

/**
 * Classifica o tipo de documento (PI ou Contestação) por padrões no texto.
 * Usa apenas o início do documento; retorna undefined se não houver indício claro.
 */
function classifyDocumentType(text: string): "pi" | "contestacao" | undefined {
  const sample = text.slice(0, CLASSIFY_SAMPLE_LENGTH).toUpperCase();
  const piMarkers = [
    /\bPETI[CÇ][AÃ]O\s+INICIAL\b/,
    /\bRECLAMANTE\s*[:\s]/,
    /\bRECLAMA[CÇ][AÃ]O\s+TRABALHISTA\b/,
    /\bEXCELENT[IÍ]SSIMO\s*\(?\s*A?\s*\)?\s*SENHOR\s*\(?\s*A?\s*\)?\s*JUIZ/,
    /\bDOS\s+FATOS\b/,
    /\bAJUIZAMENTO\b/,
  ];
  const contestacaoMarkers = [
    /\bCONTESTA[CÇ][AÃ]O\b/,
    /\bAPRESENTAR\s+CONTESTA[CÇ][AÃ]O\b/,
    /\bIMPUGNA\b/,
    /\bIMPUGNA[CÇ][AÃ]O\b/,
    /\bRECLAMADO\s*[:\s]/,
    /\bDEFESA\s+(?:DO\s+)?RECLAMADO\b/,
    /\bCONTESTA[CÇ][AÃ]O\s+AO[S]?\s+PEDIDOS?\b/,
  ];
  let piScore = 0;
  let contestacaoScore = 0;
  for (const re of piMarkers) {
    if (re.test(sample)) {
      piScore += 1;
    }
  }
  for (const re of contestacaoMarkers) {
    if (re.test(sample)) {
      contestacaoScore += 1;
    }
  }
  if (contestacaoScore > piScore) {
    return "contestacao";
  }
  if (piScore > contestacaoScore) {
    return "pi";
  }
  if (contestacaoScore > 0) {
    return "contestacao";
  }
  if (piScore > 0) {
    return "pi";
  }
  return undefined;
}

function isAcceptedFileType(file: Blob): boolean {
  const type = file.type;
  if (
    ACCEPTED_IMAGE_TYPES.includes(
      type as (typeof ACCEPTED_IMAGE_TYPES)[number]
    ) ||
    type === ACCEPTED_PDF_TYPE ||
    type === ACCEPTED_DOC_TYPE ||
    type === ACCEPTED_DOCX_TYPE
  ) {
    return true;
  }
  // Em produção o browser pode enviar type vazio ou application/octet-stream para Word/PDF
  if (
    (type === "" || type === OCTET_STREAM) &&
    file instanceof File &&
    ACCEPTED_EXTENSIONS.test(file.name)
  ) {
    return true;
  }
  return false;
}

const FileSchema = z.object({
  file: z
    .instanceof(Blob)
    .refine((file) => file.size <= MAX_FILE_SIZE, {
      message: "O arquivo deve ter no máximo 100 MB",
    })
    .refine(isAcceptedFileType, {
      message: "Tipos aceitos: JPEG, PNG, PDF, DOC ou DOCX",
    }),
});

type UploadResult =
  | { ok: true; url: string; pathname: string }
  | { ok: false; reason: "no_client" | "storage_error"; message?: string };

async function uploadFile(
  userId: string,
  filename: string,
  fileBuffer: ArrayBuffer,
  contentType: string
): Promise<UploadResult> {
  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return { ok: false, reason: "no_client" };
  }

  const safeName = filename.replaceAll(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${userId}/${Date.now()}-${safeName}`;

  const { error } = await supabase.storage
    .from(SUPABASE_BUCKET)
    .upload(path, fileBuffer, {
      contentType,
      upsert: false,
    });

  if (error) {
    return {
      ok: false,
      reason: "storage_error",
      message: error.message,
    };
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from(SUPABASE_BUCKET).getPublicUrl(path);
  return { ok: true, url: publicUrl, pathname: path };
}

/**
 * Extração principal com unpdf (mergePages). Funciona bem para a maioria dos PDFs com camada de texto.
 */
async function extractTextFromPdfUnpdf(buffer: ArrayBuffer): Promise<string> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const data = new Uint8Array(buffer);
  const pdf = await getDocumentProxy(data);
  const result = await extractText(pdf, { mergePages: true });
  return typeof result.text === "string" ? result.text : "";
}

/**
 * Fallback: extração página a página com getPage + getTextContent.
 * Pode obter texto em PDFs onde extractText do unpdf devolve vazio (ex.: encoding não padrão).
 */
async function extractTextFromPdfFallback(
  buffer: ArrayBuffer
): Promise<string> {
  const { getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const numPages = (pdf as { numPages: number }).numPages;
  if (numPages <= 0) {
    return "";
  }
  const parts: string[] = [];
  for (let i = 1; i <= numPages; i += 1) {
    const page = await (
      pdf as {
        getPage: (n: number) => Promise<{
          getTextContent: () => Promise<{ items: Array<{ str?: string }> }>;
        }>;
      }
    ).getPage(i);
    const content = await page.getTextContent();
    const pageText = (content.items as Array<{ str?: string }>)
      .map((item) => item.str ?? "")
      .join(" ");
    parts.push(pageText);
  }
  return parts.join("\n\n");
}

/**
 * OCR para PDFs digitalizados (sem camada de texto).
 * Renderiza cada página como imagem (unpdf + canvas) e extrai texto com Tesseract.js.
 * Chamado automaticamente quando a extração da camada de texto devolve vazio.
 */
async function extractTextFromPdfWithOcr(buffer: ArrayBuffer): Promise<string> {
  const { getDocumentProxy, renderPageAsImage } = await import("unpdf");
  const data = new Uint8Array(buffer);
  const pdf = await getDocumentProxy(data);
  const numPages = (pdf as { numPages: number }).numPages;
  const pagesToProcess = Math.min(numPages, MAX_OCR_PAGES);
  if (pagesToProcess <= 0) {
    return "";
  }

  const Tesseract = await import("tesseract.js");
  const worker = await Tesseract.createWorker(["por", "eng"], 1, {
    logger: () => {
      /* silenciar logs do Tesseract */
    },
  });
  await worker.setParameters({
    tessedit_pageseg_mode: Tesseract.PSM?.AUTO ?? "3",
  });
  const parts: string[] = [];

  try {
    for (let i = 1; i <= pagesToProcess; i += 1) {
      try {
        const imageBuffer = await renderPageAsImage(data, i, {
          canvasImport: () => import("@napi-rs/canvas"),
          scale: 3,
        });
        if (!imageBuffer || imageBuffer.byteLength < 100) {
          continue;
        }
        const result = await worker.recognize(Buffer.from(imageBuffer));
        const pageText =
          typeof result?.data?.text === "string" ? result.data.text : "";
        parts.push(pageText);
      } catch {
        // Ignora falha numa página e continua com as restantes
      }
    }
  } finally {
    await worker.terminate();
  }

  const text = parts.join("\n\n");
  return text.length > MAX_EXTRACTED_TEXT_LENGTH
    ? `${text.slice(0, MAX_EXTRACTED_TEXT_LENGTH)}\n\n[... texto truncado ...]`
    : text;
}

type ExtractPdfResult = { text: string; lastError?: string };

/** Suprime avisos do PDF.js (ex.: "TT: undefined function") durante a extração. */
async function withPdfWarningsSuppressed<T>(fn: () => Promise<T>): Promise<T> {
  const originalWarn = console.warn;
  console.warn = (...args: unknown[]) => {
    const msg = args[0];
    if (typeof msg === "string" && msg.includes("TT:")) {
      return;
    }
    originalWarn.apply(console, args);
  };
  try {
    return await fn();
  } finally {
    console.warn = originalWarn;
  }
}

async function extractTextFromPdf(
  buffer: ArrayBuffer
): Promise<ExtractPdfResult> {
  let text = "";
  let lastError: string | undefined;
  try {
    text = await withPdfWarningsSuppressed(() =>
      extractTextFromPdfUnpdf(buffer.slice(0))
    );
  } catch {
    text = "";
  }
  if (text.trim().length === 0) {
    try {
      text = await withPdfWarningsSuppressed(() =>
        extractTextFromPdfFallback(buffer.slice(0))
      );
    } catch {
      text = "";
    }
  }
  if (text.trim().length === 0) {
    try {
      text = await withPdfWarningsSuppressed(() =>
        extractTextFromPdfWithOcr(buffer.slice(0))
      );
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      text = "";
    }
  }
  if (text.length > MAX_EXTRACTED_TEXT_LENGTH) {
    text = `${text.slice(0, MAX_EXTRACTED_TEXT_LENGTH)}\n\n[... texto truncado ...]`;
  }
  return { text, lastError };
}

async function extractTextFromDoc(buffer: ArrayBuffer): Promise<string> {
  const mod = await import("word-extractor");
  const WordExtractor = ((mod as { default?: typeof import("word-extractor") })
    .default ?? mod) as typeof import("word-extractor");
  const extractor = new WordExtractor();
  const doc = await extractor.extract(Buffer.from(buffer));
  const text = doc.getBody() ?? "";
  return text.length > MAX_EXTRACTED_TEXT_LENGTH
    ? `${text.slice(0, MAX_EXTRACTED_TEXT_LENGTH)}\n\n[... texto truncado ...]`
    : text;
}

async function extractTextFromDocx(buffer: ArrayBuffer): Promise<string> {
  const mammoth = await import("mammoth");
  const result = await mammoth.extractRawText({
    buffer: Buffer.from(buffer),
  });
  const text = typeof result?.value === "string" ? result.value : "";
  return text.length > MAX_EXTRACTED_TEXT_LENGTH
    ? `${text.slice(0, MAX_EXTRACTED_TEXT_LENGTH)}\n\n[... texto truncado ...]`
    : text;
}

function storageErrorHint(message?: string): string {
  const isNotFound =
    message?.includes("Bucket not found") || message?.includes("not found");
  return isNotFound
    ? ` Crie o bucket "${SUPABASE_BUCKET}" em Supabase Dashboard → Storage, ou execute: pnpm run supabase:config-push`
    : ` Supabase: ${message ?? ""}`;
}

/** Usado por upload (FormData) e por process (após fetch do Blob). */
export async function runExtractionAndClassification(
  fileBuffer: ArrayBuffer,
  contentType: string
): Promise<{
  extractedText?: string;
  extractionFailed: boolean;
  documentType?: "pi" | "contestacao";
  extractionDetail?: string;
}> {
  const isPdf = contentType === ACCEPTED_PDF_TYPE;
  const isDoc = contentType === ACCEPTED_DOC_TYPE;
  const isDocx = contentType === ACCEPTED_DOCX_TYPE;
  let extractedText: string | undefined;
  let extractionFailed = false;
  let extractionDetail: string | undefined;
  let documentType: "pi" | "contestacao" | undefined;
  if (isPdf || isDoc || isDocx) {
    try {
      if (isPdf) {
        const result = await extractTextFromPdf(fileBuffer);
        extractedText = result.text;
        extractionDetail = result.lastError;
      } else if (isDoc) {
        extractedText = await extractTextFromDoc(fileBuffer);
      } else {
        extractedText = await extractTextFromDocx(fileBuffer);
      }
      if (
        typeof extractedText === "string" &&
        extractedText.trim().length === 0
      ) {
        extractionFailed = true;
      } else if (typeof extractedText === "string") {
        documentType = classifyDocumentType(extractedText);
      }
    } catch {
      extractionFailed = true;
    }
  }
  return { extractedText, extractionFailed, documentType, extractionDetail };
}

function respondUploadSuccess(
  uploadResult: { url: string; pathname: string },
  contentType: string,
  _filename: string,
  extractedText?: string,
  extractionFailed?: boolean,
  documentType?: "pi" | "contestacao",
  extractionDetail?: string
): NextResponse {
  const body = {
    url: uploadResult.url,
    pathname: uploadResult.pathname,
    contentType,
    ...(typeof extractedText === "string" ? { extractedText } : {}),
    ...(extractionFailed === true ? { extractionFailed: true } : {}),
    ...(documentType ? { documentType } : {}),
    ...(typeof extractionDetail === "string" && extractionDetail.length > 0
      ? { extractionDetail }
      : {}),
  };
  return NextResponse.json(body);
}

/**
 * Envia o ficheiro para o storage (Supabase, Blob ou data URL em dev).
 * Usado para correr em paralelo com a extração de texto e reduzir tempo total.
 */
async function uploadToStorage(
  userId: string,
  filename: string,
  fileBuffer: ArrayBuffer,
  contentType: string
): Promise<{ url: string; pathname: string }> {
  const uploadResult = await uploadFile(
    userId,
    filename,
    fileBuffer,
    contentType
  );
  if (uploadResult.ok) {
    return { url: uploadResult.url, pathname: uploadResult.pathname };
  }
  if (uploadResult.reason === "storage_error") {
    throw new Error(
      `Falha ao enviar o ficheiro para o Storage.${storageErrorHint(uploadResult.message)}`
    );
  }
  try {
    const data = await put(filename, fileBuffer, { access: "public" });
    return { url: data.url, pathname: data.pathname ?? filename };
  } catch {
    if (isDev && !hasBlobToken) {
      const dataUrl = buildDataUrl(fileBuffer, contentType);
      return { url: dataUrl, pathname: `dev/${filename}` };
    }
    throw new Error(
      "Falha ao enviar o ficheiro. Configure Supabase Storage (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) ou BLOB_READ_WRITE_TOKEN no .env.local."
    );
  }
}

export async function persistAndRespond(
  userId: string,
  filename: string,
  fileBuffer: ArrayBuffer,
  contentType: string,
  extractedText?: string,
  extractionFailed?: boolean,
  documentType?: "pi" | "contestacao",
  extractionDetail?: string
): Promise<NextResponse> {
  try {
    const uploadResult = await uploadToStorage(
      userId,
      filename,
      fileBuffer,
      contentType
    );
    return respondUploadSuccess(
      uploadResult,
      contentType,
      filename,
      extractedText,
      extractionFailed,
      documentType,
      extractionDetail
    );
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Falha ao enviar o ficheiro.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  if (request.body === null) {
    return NextResponse.json(
      { error: "Corpo da requisição vazio" },
      { status: 400 }
    );
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file") as Blob | null;

    if (!file) {
      return NextResponse.json(
        { error: "Nenhum arquivo enviado" },
        { status: 400 }
      );
    }

    const parsed = FileSchema.safeParse({ file });
    if (!parsed.success) {
      const message = parsed.error.errors.map((e) => e.message).join(". ");
      return NextResponse.json({ error: message }, { status: 400 });
    }

    const filename =
      (file instanceof File ? file.name : undefined) ?? "documento";
    const fileBuffer = await file.arrayBuffer();
    // Cópia para o Storage: a extração (unpdf/PDF.js) pode transferir o buffer e deixá-lo detached.
    const bufferForStorage = fileBuffer.slice(0);
    const rawType = file.type;
    const contentType =
      rawType === "" || rawType === OCTET_STREAM
        ? contentTypeFromFilename(filename)
        : rawType;
    const isPdf = contentType === ACCEPTED_PDF_TYPE;
    const isDoc = contentType === ACCEPTED_DOC_TYPE;
    const isDocx = contentType === ACCEPTED_DOCX_TYPE;

    // Upload e extração em paralelo: o tempo total é o máximo dos dois, não a soma.
    const extractionPromise =
      isPdf || isDoc || isDocx
        ? runExtractionAndClassification(fileBuffer, contentType)
        : Promise.resolve({
            extractedText: undefined,
            extractionFailed: false,
            documentType: undefined as "pi" | "contestacao" | undefined,
            extractionDetail: undefined,
          });

    const uploadPromise = uploadToStorage(
      session.user.id,
      filename,
      bufferForStorage,
      contentType
    );

    const [uploadResult, extraction] = await Promise.all([
      uploadPromise,
      extractionPromise,
    ]);

    return respondUploadSuccess(
      uploadResult,
      contentType,
      filename,
      extraction.extractedText,
      extraction.extractionFailed,
      extraction.documentType,
      extraction.extractionDetail
    );
  } catch (err) {
    const message =
      err instanceof Error && err.message.length > 0
        ? err.message
        : "Erro ao processar o upload. Verifique o tamanho e o tipo do ficheiro (JPEG, PNG, PDF, DOC ou DOCX até 100 MB).";
    const detail = isDev && err instanceof Error ? err.message : undefined;
    return NextResponse.json(
      {
        error: message,
        ...(detail ? { detail } : {}),
      },
      { status: 500 }
    );
  }
}
