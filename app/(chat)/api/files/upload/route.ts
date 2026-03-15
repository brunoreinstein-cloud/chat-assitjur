import { put } from "@vercel/blob";
import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/app/(auth)/auth";
import { extractDocumentMetadata } from "@/lib/ai/extract-metadata";
import {
  MIN_SIZE_TO_OPTIMIZE,
  optimizePdfBuffer,
} from "@/lib/pdf/pdf-optimizer";
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
/** Excel (.xlsx) */
const ACCEPTED_XLSX_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" as const;
/** Excel 97-2003 (.xls) */
const ACCEPTED_XLS_TYPE = "application/vnd.ms-excel" as const;
/** CSV */
const ACCEPTED_CSV_TYPE = "text/csv" as const;
/** Texto plano */
const ACCEPTED_TXT_TYPE = "text/plain" as const;
/** OpenDocument Text (.odt) */
const ACCEPTED_ODT_TYPE = "application/vnd.oasis.opendocument.text" as const;
const OCTET_STREAM = "application/octet-stream";
const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100 MB

/** Extensões aceites para fallback quando o browser envia type vazio ou octet-stream (comum em produção). */
const ACCEPTED_EXTENSIONS = /\.(docx?|pdf|jpe?g|png|xlsx?|csv|txt|odt)$/i;

/** Tipo de documento classificado (PI ou Contestação). */
export type DocumentType = "pi" | "contestacao";

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
  if (lower.endsWith(".xlsx")) {
    return ACCEPTED_XLSX_TYPE;
  }
  if (lower.endsWith(".xls")) {
    return ACCEPTED_XLS_TYPE;
  }
  if (lower.endsWith(".csv")) {
    return ACCEPTED_CSV_TYPE;
  }
  if (lower.endsWith(".txt")) {
    return ACCEPTED_TXT_TYPE;
  }
  if (lower.endsWith(".odt")) {
    return ACCEPTED_ODT_TYPE;
  }
  return OCTET_STREAM;
}
const MAX_EXTRACTED_TEXT_LENGTH = 600_000; // ~600k caracteres (PI + Contestação grandes)
/** Máximo de páginas a processar por OCR (PDFs digitalizados). PDFs enormes: pode demorar; maxDuration na rota permite até 5 min. */
const MAX_OCR_PAGES = 50;

/** Amostra do início do texto para classificação (evita analisar o doc inteiro). */
const CLASSIFY_SAMPLE_LENGTH = 6000;

/**
 * Mapeia o tipo de documento devolvido pela IA (metadados) para "pi" | "contestacao".
 * Usado como fallback quando a classificação por regex não identifica o tipo.
 */
function mapMetadataDocumentType(
  raw: string | undefined
): DocumentType | undefined {
  if (raw == null || raw.trim().length === 0) {
    return undefined;
  }
  const n = raw.trim().toLowerCase();
  if (
    n.includes("contestação") ||
    n.includes("contestacao") ||
    n.includes("contestaçao") ||
    n === "contestação" ||
    n === "contestacao" ||
    n.startsWith("contest")
  ) {
    return "contestacao";
  }
  if (
    n.includes("petição inicial") ||
    n.includes("peticao inicial") ||
    n === "pi" ||
    n === "petição" ||
    n.startsWith("petição inicial")
  ) {
    return "pi";
  }
  return undefined;
}

/**
 * Classifica o tipo de documento (PI ou Contestação) pelo nome do ficheiro.
 * Usado como preferência quando o utilizador nomeia o ficheiro de forma explícita (ex.: "Contestação - RO.pdf").
 * Exportado para uso na rota de processamento (ficheiros grandes).
 */
export function classifyDocumentTypeFromFilename(
  filename: string
): DocumentType | undefined {
  const n = filename.toLowerCase().replaceAll(/\s+/g, " ");
  const looksLikeContestacao =
    n.includes("contest") ||
    n.includes("defesa") ||
    n.includes("reclamado") ||
    n.includes("impugna");
  const looksLikePi =
    (n.includes("inicial") ||
      n.includes("petição") ||
      n.includes("peticao") ||
      n.includes("reclamante")) &&
    !looksLikeContestacao;
  if (looksLikeContestacao) {
    return "contestacao";
  }
  if (looksLikePi) {
    return "pi";
  }
  return undefined;
}

/**
 * Classifica o tipo de documento (PI ou Contestação) por padrões no texto.
 * Usa apenas o início do documento; retorna undefined se não houver indício claro.
 */
function classifyDocumentType(text: string): DocumentType | undefined {
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
    /\bCONTESTA[CÇ][AÃ]O\s+AOS?\s+PEDIDOS?\b/,
    /\b(?:EM\s+)?RESPOSTA\s+[ÀA]\s+(?:RECLAMA[CÇ][AÃ]O|PETI[CÇ][AÃ]O)\b/,
    /\bNEGA\s+(?:INTEGRALMENTE|EM\s+PARTE)\b/,
    /\bCONTESTA[CÇ][AÃ]O\s+ÀS?\s+INICIAL\b/,
    /\bDEFESA\s+(?:PR[EÉ]VIA|APRESENTADA)\b/,
    /\b(?:VEM\s+)?(?:O\s+)?RECLAMADO\s+[AÀ]\s+PRESEN/,
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
    type === ACCEPTED_DOCX_TYPE ||
    type === ACCEPTED_XLSX_TYPE ||
    type === ACCEPTED_XLS_TYPE ||
    type === ACCEPTED_CSV_TYPE ||
    type === ACCEPTED_TXT_TYPE ||
    type === ACCEPTED_ODT_TYPE
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
      message:
        "Tipos aceitos: JPEG, PNG, PDF, DOC, DOCX, XLS, XLSX, CSV, TXT ou ODT",
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
 * Extração principal com unpdf — agora página a página para preservar marcadores [Pag. N].
 * Cada página recebe um marcador `[Pag. N]` que permite rastreabilidade de folha.
 */
async function extractTextFromPdfUnpdf(
  buffer: ArrayBuffer
): Promise<{ text: string; pageCount: number }> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const data = new Uint8Array(buffer);
  const pdf = await getDocumentProxy(data);
  const numPages = (pdf as { numPages: number }).numPages;
  // mergePages: false → retorna string[] (uma por página)
  const result = await extractText(pdf, { mergePages: false });
  const pages = Array.isArray(result.text) ? result.text : [result.text];
  const marked = pages.map(
    (p, i) => `[Pag. ${i + 1}]\n${typeof p === "string" ? p : ""}`
  );
  return { text: marked.join("\n\n"), pageCount: numPages };
}

/**
 * Fallback: extração página a página com getPage + getTextContent.
 * Pode obter texto em PDFs onde extractText do unpdf devolve vazio (ex.: encoding não padrão).
 * Cada página recebe marcador `[Pag. N]` para rastreabilidade.
 */
async function extractTextFromPdfFallback(
  buffer: ArrayBuffer
): Promise<{ text: string; pageCount: number }> {
  const { getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const numPages = (pdf as { numPages: number }).numPages;
  if (numPages <= 0) {
    return { text: "", pageCount: 0 };
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
    parts.push(`[Pag. ${i}]\n${pageText}`);
  }
  return { text: parts.join("\n\n"), pageCount: numPages };
}

/**
 * OCR para PDFs digitalizados (sem camada de texto).
 * Renderiza cada página como imagem (unpdf + canvas) e extrai texto com Tesseract.js.
 * Chamado automaticamente quando a extração da camada de texto devolve vazio.
 */
async function extractTextFromPdfWithOcr(
  buffer: ArrayBuffer
): Promise<{ text: string; pageCount: number }> {
  const { getDocumentProxy, renderPageAsImage } = await import("unpdf");
  const data = new Uint8Array(buffer);
  const pdf = await getDocumentProxy(data);
  const numPages = (pdf as { numPages: number }).numPages;
  const pagesToProcess = Math.min(numPages, MAX_OCR_PAGES);
  if (pagesToProcess <= 0) {
    return { text: "", pageCount: 0 };
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
        parts.push(`[Pag. ${i}]\n${pageText}`);
      } catch {
        // Ignora falha numa página e continua com as restantes
      }
    }
  } finally {
    await worker.terminate();
  }

  const text = parts.join("\n\n");
  return {
    text:
      text.length > MAX_EXTRACTED_TEXT_LENGTH
        ? `${text.slice(0, MAX_EXTRACTED_TEXT_LENGTH)}\n\n[... texto truncado ...]`
        : text,
    pageCount: numPages,
  };
}

interface ExtractPdfResult {
  text: string;
  pageCount: number;
  lastError?: string;
}

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
  let pageCount = 0;
  let lastError: string | undefined;
  try {
    const r = await withPdfWarningsSuppressed(() =>
      extractTextFromPdfUnpdf(buffer.slice(0))
    );
    text = r.text;
    pageCount = r.pageCount;
  } catch {
    text = "";
  }
  if (text.trim().length === 0) {
    try {
      const r = await withPdfWarningsSuppressed(() =>
        extractTextFromPdfFallback(buffer.slice(0))
      );
      text = r.text;
      pageCount = r.pageCount;
    } catch {
      text = "";
    }
  }
  if (text.trim().length === 0) {
    try {
      const r = await withPdfWarningsSuppressed(() =>
        extractTextFromPdfWithOcr(buffer.slice(0))
      );
      text = r.text;
      pageCount = r.pageCount;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      text = "";
    }
  }
  if (text.length > MAX_EXTRACTED_TEXT_LENGTH) {
    text = `${text.slice(0, MAX_EXTRACTED_TEXT_LENGTH)}\n\n[... texto truncado ...]`;
  }
  return { text, pageCount, lastError };
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

/**
 * OCR para imagens (documentos escaneados em JPEG/PNG).
 * Transforma imagem em texto pesquisável e editável com Tesseract (por + eng).
 */
async function extractTextFromImage(buffer: ArrayBuffer): Promise<string> {
  const Tesseract = await import("tesseract.js");
  const worker = await Tesseract.createWorker(["por", "eng"], 1, {
    logger: () => {
      /* silenciar logs do Tesseract */
    },
  });
  await worker.setParameters({
    tessedit_pageseg_mode: Tesseract.PSM?.AUTO ?? "3",
  });
  try {
    const imageBuffer = Buffer.from(buffer);
    const result = await worker.recognize(imageBuffer);
    const text = typeof result?.data?.text === "string" ? result.data.text : "";
    return text.length > MAX_EXTRACTED_TEXT_LENGTH
      ? `${text.slice(0, MAX_EXTRACTED_TEXT_LENGTH)}\n\n[... texto truncado ...]`
      : text;
  } finally {
    await worker.terminate();
  }
}

/** Texto plano: decodificar UTF-8. */
function extractTextFromTxt(buffer: ArrayBuffer): string {
  const decoder = new TextDecoder("utf-8", { fatal: false });
  const text = decoder.decode(buffer);
  return text.length > MAX_EXTRACTED_TEXT_LENGTH
    ? `${text.slice(0, MAX_EXTRACTED_TEXT_LENGTH)}\n\n[... texto truncado ...]`
    : text;
}

/** CSV: usar papaparse e devolver texto legível (linhas com valores separados por tab). */
async function extractTextFromCsv(buffer: ArrayBuffer): Promise<string> {
  const Papa = (await import("papaparse")).default;
  const decoder = new TextDecoder("utf-8", { fatal: false });
  const csvString = decoder.decode(buffer);
  const parsed = Papa.parse<string[]>(csvString, {
    skipEmptyLines: true,
    dynamicTyping: false,
  });
  const lines =
    parsed.data?.map((row) =>
      Array.isArray(row) ? row.join("\t") : String(row)
    ) ?? [];
  const text = lines.join("\n");
  return text.length > MAX_EXTRACTED_TEXT_LENGTH
    ? `${text.slice(0, MAX_EXTRACTED_TEXT_LENGTH)}\n\n[... texto truncado ...]`
    : text;
}

/** Excel (.xlsx / .xls): extrair texto de todas as folhas com xlsx. */
async function extractTextFromExcel(buffer: ArrayBuffer): Promise<string> {
  const XLSX = await import("xlsx");
  const workbook = XLSX.read(new Uint8Array(buffer), { type: "array" });
  const parts: string[] = [];
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) {
      continue;
    }
    const csv = XLSX.utils.sheet_to_csv(sheet, {
      FS: "\t",
      RS: "\n",
      blankrows: false,
    });
    if (csv.trim().length > 0) {
      parts.push(`[Folha: ${sheetName}]`, csv.trim());
    }
  }
  const text = parts.join("\n");
  return text.length > MAX_EXTRACTED_TEXT_LENGTH
    ? `${text.slice(0, MAX_EXTRACTED_TEXT_LENGTH)}\n\n[... texto truncado ...]`
    : text;
}

/** ODT: ZIP com content.xml; extrair texto do XML (tags removidas). */
async function extractTextFromOdt(buffer: ArrayBuffer): Promise<string> {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(buffer);
  const contentFile = zip.file("content.xml");
  if (!contentFile) {
    return "";
  }
  const xmlString = await contentFile.async("string");
  // Extrair texto: remover tags e decodificar entidades comuns
  const text = xmlString
    .replaceAll(/<[^>]+>/g, " ")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll(/\s+/g, " ")
    .trim();
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

function isImageContentType(contentType: string): boolean {
  return ACCEPTED_IMAGE_TYPES.includes(
    contentType as (typeof ACCEPTED_IMAGE_TYPES)[number]
  );
}

async function extractTextByContentType(
  fileBuffer: ArrayBuffer,
  contentType: string
): Promise<{ text: string; detail?: string; pageCount?: number } | null> {
  if (contentType === ACCEPTED_PDF_TYPE) {
    const result = await extractTextFromPdf(fileBuffer);
    return {
      text: result.text,
      detail: result.lastError,
      pageCount: result.pageCount,
    };
  }
  if (contentType === ACCEPTED_DOC_TYPE) {
    const text = await extractTextFromDoc(fileBuffer);
    return { text };
  }
  if (contentType === ACCEPTED_DOCX_TYPE) {
    const text = await extractTextFromDocx(fileBuffer);
    return { text };
  }
  if (isImageContentType(contentType)) {
    const text = await extractTextFromImage(fileBuffer);
    return { text };
  }
  if (contentType === ACCEPTED_TXT_TYPE) {
    const text = extractTextFromTxt(fileBuffer);
    return { text };
  }
  if (contentType === ACCEPTED_CSV_TYPE) {
    const text = await extractTextFromCsv(fileBuffer);
    return { text };
  }
  if (contentType === ACCEPTED_XLSX_TYPE || contentType === ACCEPTED_XLS_TYPE) {
    const text = await extractTextFromExcel(fileBuffer);
    return { text };
  }
  if (contentType === ACCEPTED_ODT_TYPE) {
    const text = await extractTextFromOdt(fileBuffer);
    return { text };
  }
  return null;
}

/** Usado por upload (FormData) e por process (após fetch do Blob). */
export async function runExtractionAndClassification(
  fileBuffer: ArrayBuffer,
  contentType: string
): Promise<{
  extractedText?: string;
  extractionFailed: boolean;
  documentType?: DocumentType;
  extractionDetail?: string;
  pageCount?: number;
}> {
  let extracted: { text: string; detail?: string; pageCount?: number } | null =
    null;
  try {
    extracted = await extractTextByContentType(fileBuffer, contentType);
  } catch {
    return {
      extractedText: undefined,
      extractionFailed: true,
      documentType: undefined,
      extractionDetail: undefined,
    };
  }
  if (!extracted) {
    return {
      extractedText: undefined,
      extractionFailed: false,
      documentType: undefined,
      extractionDetail: undefined,
    };
  }
  const extractionFailed = extracted.text.trim().length === 0;
  const documentType =
    extracted.text.trim().length > 0
      ? classifyDocumentType(extracted.text)
      : undefined;
  return {
    extractedText: extracted.text,
    extractionFailed,
    documentType,
    extractionDetail: extracted.detail,
    ...(extracted.pageCount != null ? { pageCount: extracted.pageCount } : {}),
  };
}

/** Metadados extraídos pela IA (título, autor, tipo, informações-chave). Incluído na resposta do upload quando disponível. */
export interface UploadExtractedMetadata {
  title: string;
  author: string;
  documentType: string;
  keyInfo: string;
}

interface UploadSuccessOptions {
  extractionDetail?: string;
  extractedMetadata?: UploadExtractedMetadata;
  pageCount?: number;
}

function respondUploadSuccess(
  uploadResult: { url: string; pathname: string },
  contentType: string,
  _filename: string,
  extractedText?: string,
  extractionFailed?: boolean,
  documentType?: DocumentType,
  options?: UploadSuccessOptions
): NextResponse {
  const body = {
    url: uploadResult.url,
    pathname: uploadResult.pathname,
    contentType,
    ...(typeof extractedText === "string" ? { extractedText } : {}),
    ...(extractionFailed === true ? { extractionFailed: true } : {}),
    ...(documentType ? { documentType } : {}),
    ...(typeof options?.extractionDetail === "string" &&
    options.extractionDetail.length > 0
      ? { extractionDetail: options.extractionDetail }
      : {}),
    ...(options?.extractedMetadata
      ? { extractedMetadata: options.extractedMetadata }
      : {}),
    ...(options?.pageCount != null ? { pageCount: options.pageCount } : {}),
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
  // Supabase falhou (ex.: ficheiro > 50 MiB ou tipo não aceite no bucket chat-files); tentar Blob como fallback
  if (uploadResult.reason === "storage_error" && isDev) {
    console.warn(
      "[upload] Supabase storage_error, a tentar Blob:",
      uploadResult.message,
      storageErrorHint(uploadResult.message)
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

/** Opções de extração para persistAndRespond (agrupa 4 params para respeitar limite Sonar). */
export interface PersistExtractionOptions {
  extractedText?: string;
  extractionFailed?: boolean;
  documentType?: DocumentType;
  extractionDetail?: string;
  pageCount?: number;
}

export async function persistAndRespond(
  userId: string,
  filename: string,
  fileBuffer: ArrayBuffer,
  contentType: string,
  extraction?: PersistExtractionOptions
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
      extraction?.extractedText,
      extraction?.extractionFailed,
      extraction?.documentType,
      {
        ...(extraction?.extractionDetail
          ? { extractionDetail: extraction.extractionDetail }
          : {}),
        ...(extraction?.pageCount != null
          ? { pageCount: extraction.pageCount }
          : {}),
      }
    );
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Falha ao enviar o ficheiro.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function needsExtraction(contentType: string): boolean {
  return (
    contentType === ACCEPTED_PDF_TYPE ||
    contentType === ACCEPTED_DOC_TYPE ||
    contentType === ACCEPTED_DOCX_TYPE ||
    isImageContentType(contentType) ||
    contentType === ACCEPTED_TXT_TYPE ||
    contentType === ACCEPTED_CSV_TYPE ||
    contentType === ACCEPTED_XLSX_TYPE ||
    contentType === ACCEPTED_XLS_TYPE ||
    contentType === ACCEPTED_ODT_TYPE
  );
}

async function fetchMetadataIfAvailable(
  extractedText: string | undefined,
  filename: string
): Promise<{
  extractedMetadata?: UploadExtractedMetadata;
  documentTypeFromMeta?: DocumentType;
}> {
  if (typeof extractedText !== "string" || extractedText.trim().length === 0) {
    return {};
  }
  const meta = await extractDocumentMetadata(extractedText, filename);
  if (!meta) {
    return {};
  }
  return {
    extractedMetadata: {
      title: meta.title,
      author: meta.author,
      documentType: meta.documentType,
      keyInfo: meta.keyInfo,
    },
    documentTypeFromMeta: mapMetadataDocumentType(meta.documentType),
  };
}

async function handleUploadFormData(
  userId: string,
  formData: FormData
): Promise<NextResponse> {
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
  let fileBuffer = await file.arrayBuffer();
  const rawType = file.type;
  const contentType =
    rawType === "" || rawType === OCTET_STREAM
      ? contentTypeFromFilename(filename)
      : rawType;

  // Otimizar PDF via Ghostscript antes de extrair texto e armazenar.
  // Reduz tamanho de PDFs digitalizados (scanned) comuns em processos trabalhistas.
  if (
    contentType === ACCEPTED_PDF_TYPE &&
    fileBuffer.byteLength > MIN_SIZE_TO_OPTIMIZE
  ) {
    const optimized = await optimizePdfBuffer(
      Buffer.from(fileBuffer),
      filename,
      { mode: "ebook" }
    );
    if (optimized.success && optimized.reductionPercent > 0) {
      fileBuffer = optimized.outputBuffer.buffer.slice(
        optimized.outputBuffer.byteOffset,
        optimized.outputBuffer.byteOffset + optimized.outputBuffer.byteLength
      ) as ArrayBuffer;
      if (isDev) {
        console.info(
          `[upload] PDF otimizado: ${filename} (-${optimized.reductionPercent}%) em ${optimized.durationMs}ms`
        );
      }
    }
  }

  const bufferForStorage = fileBuffer.slice(0);

  const extractionPromise = needsExtraction(contentType)
    ? runExtractionAndClassification(fileBuffer, contentType)
    : Promise.resolve({
        extractedText: undefined,
        extractionFailed: false,
        documentType: undefined as DocumentType | undefined,
        extractionDetail: undefined,
      });

  const [uploadResult, extraction] = await Promise.all([
    uploadToStorage(userId, filename, bufferForStorage, contentType),
    extractionPromise,
  ]);

  const { extractedMetadata, documentTypeFromMeta } =
    await fetchMetadataIfAvailable(extraction.extractedText, filename);

  const finalDocumentType =
    classifyDocumentTypeFromFilename(filename) ??
    extraction.documentType ??
    documentTypeFromMeta;

  return respondUploadSuccess(
    uploadResult,
    contentType,
    filename,
    extraction.extractedText,
    extraction.extractionFailed,
    finalDocumentType,
    {
      extractionDetail: extraction.extractionDetail,
      ...(extractedMetadata ? { extractedMetadata } : {}),
      ...("pageCount" in extraction && extraction.pageCount != null
        ? { pageCount: extraction.pageCount }
        : {}),
    }
  );
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
    return await handleUploadFormData(session.user.id, formData);
  } catch (err) {
    const message =
      err instanceof Error && err.message.length > 0
        ? err.message
        : "Erro ao processar o upload. Verifique o tamanho e o tipo do ficheiro (até 100 MB).";
    if (isDev) {
      console.warn("[api/files/upload] 500:", message, err);
    }
    const detail = isDev && err instanceof Error ? err.message : undefined;
    return NextResponse.json(
      { error: message, ...(detail ? { detail } : {}) },
      { status: 500 }
    );
  }
}
