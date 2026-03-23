/** Orchestrator: runs text extraction and document-type classification together. Re-exports DocumentType. */

import type { DocumentType } from "./classify";
import { classifyDocumentType } from "./classify";
import { extractTextByContentType } from "./extract-docs";

export type { DocumentType } from "./classify";

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
