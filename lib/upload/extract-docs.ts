/** Text extraction for non-PDF document formats: DOC, DOCX, images, TXT, CSV, Excel, ODT. */

import { extractTextFromPdf } from "./extract-pdf";
import {
  ACCEPTED_CSV_TYPE,
  ACCEPTED_DOC_TYPE,
  ACCEPTED_DOCX_TYPE,
  ACCEPTED_ODT_TYPE,
  ACCEPTED_PDF_TYPE,
  ACCEPTED_TXT_TYPE,
  ACCEPTED_XLS_TYPE,
  ACCEPTED_XLSX_TYPE,
  isImageContentType,
  MAX_EXTRACTED_TEXT_LENGTH,
} from "./mime-types";

export async function extractTextFromDoc(buffer: ArrayBuffer): Promise<string> {
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

export async function extractTextFromDocx(
  buffer: ArrayBuffer
): Promise<string> {
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
export async function extractTextFromImage(
  buffer: ArrayBuffer
): Promise<string> {
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
export function extractTextFromTxt(buffer: ArrayBuffer): string {
  const decoder = new TextDecoder("utf-8", { fatal: false });
  const text = decoder.decode(buffer);
  return text.length > MAX_EXTRACTED_TEXT_LENGTH
    ? `${text.slice(0, MAX_EXTRACTED_TEXT_LENGTH)}\n\n[... texto truncado ...]`
    : text;
}

/** CSV: usar papaparse e devolver texto legível (linhas com valores separados por tab). */
export async function extractTextFromCsv(buffer: ArrayBuffer): Promise<string> {
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

/** Excel (.xlsx / .xls): extrair texto de todas as folhas com exceljs. */
export async function extractTextFromExcel(
  buffer: ArrayBuffer
): Promise<string> {
  const ExcelJS = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  // biome-ignore lint/suspicious/noExplicitAny: exceljs type mismatch
  await workbook.xlsx.load(Buffer.from(buffer) as any);

  const parts: string[] = [];
  for (const worksheet of workbook.worksheets) {
    const lines: string[] = [];
    worksheet.eachRow((row) => {
      const values = Array.isArray(row.values) ? row.values : [];
      const rowValues = values
        .slice(1) // ExcelJS indexa de 1, remover primeiro elemento vazio
        .map((v: string | number | boolean | null | undefined) =>
          v != null ? String(v).trim() : ""
        )
        .join("\t");
      if (rowValues?.trim()) {
        lines.push(rowValues);
      }
    });
    const csv = lines.join("\n");
    if (csv.trim().length > 0) {
      parts.push(`[Folha: ${worksheet.name}]`, csv.trim());
    }
  }
  const text = parts.join("\n");
  return text.length > MAX_EXTRACTED_TEXT_LENGTH
    ? `${text.slice(0, MAX_EXTRACTED_TEXT_LENGTH)}\n\n[... texto truncado ...]`
    : text;
}

/** ODT: ZIP com content.xml; extrair texto do XML (tags removidas). */
export async function extractTextFromOdt(buffer: ArrayBuffer): Promise<string> {
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

export async function extractTextByContentType(
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
