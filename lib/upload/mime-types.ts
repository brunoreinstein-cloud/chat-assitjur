/** MIME type constants, file size limits, and filename-based utilities shared across upload modules. */

export const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png"] as const;
export const ACCEPTED_PDF_TYPE = "application/pdf" as const;
/** Word 97-2003 (.doc) */
export const ACCEPTED_DOC_TYPE = "application/msword" as const;
/** Word Open XML (.docx) */
export const ACCEPTED_DOCX_TYPE =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document" as const;
/** Excel (.xlsx) */
export const ACCEPTED_XLSX_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" as const;
/** Excel 97-2003 (.xls) */
export const ACCEPTED_XLS_TYPE = "application/vnd.ms-excel" as const;
/** CSV */
export const ACCEPTED_CSV_TYPE = "text/csv" as const;
/** Texto plano */
export const ACCEPTED_TXT_TYPE = "text/plain" as const;
/** OpenDocument Text (.odt) */
export const ACCEPTED_ODT_TYPE =
  "application/vnd.oasis.opendocument.text" as const;
/** ZIP archive */
export const ACCEPTED_ZIP_TYPE = "application/zip" as const;
/** Alias que alguns browsers enviam para ZIP */
export const ACCEPTED_ZIP_COMPRESSED_TYPE =
  "application/x-zip-compressed" as const;
export const OCTET_STREAM = "application/octet-stream";
export const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100 MB

export const MAX_EXTRACTED_TEXT_LENGTH = 1_500_000; // ~1.5M chars — processos trabalhistas grandes (500+ págs). Schema aceita 2M.
/** Máximo de páginas a processar por OCR (PDFs digitalizados). PDFs enormes: pode demorar; maxDuration na rota permite até 5 min. */
export const MAX_OCR_PAGES = 50;

/** Extensões aceites para fallback quando o browser envia type vazio ou octet-stream (comum em produção). */
const ACCEPTED_EXTENSIONS = /\.(docx?|pdf|jpe?g|png|xlsx?|csv|txt|odt|zip)$/i;

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
  if (lower.endsWith(".zip")) {
    return ACCEPTED_ZIP_TYPE;
  }
  return OCTET_STREAM;
}

export function isAcceptedFileType(file: Blob): boolean {
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
    type === ACCEPTED_ODT_TYPE ||
    type === ACCEPTED_ZIP_TYPE ||
    type === ACCEPTED_ZIP_COMPRESSED_TYPE
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

export function needsExtraction(contentType: string): boolean {
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

export function isImageContentType(contentType: string): boolean {
  return ACCEPTED_IMAGE_TYPES.includes(
    contentType as (typeof ACCEPTED_IMAGE_TYPES)[number]
  );
}

export function isZipContentType(contentType: string): boolean {
  return (
    contentType === ACCEPTED_ZIP_TYPE ||
    contentType === ACCEPTED_ZIP_COMPRESSED_TYPE
  );
}
