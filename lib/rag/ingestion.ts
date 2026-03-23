/**
 * Etapa de ingestão do pipeline RAG: parse de ficheiros (extração de texto + metadados).
 * Usado por from-files e from-archivos. Ver docs/RAG-PIPELINE-SEPARATION.md.
 */

import { runExtractionAndClassification } from "@/lib/upload/extract";
import { extractDocumentMetadata } from "@/lib/ai/extract-metadata";

const TITLE_MAX_LENGTH = 512;
const FALLBACK_CONTENT =
  "(Texto não extraído. Pode colar o conteúdo manualmente ao editar o documento.)";

/** Metadados opcionais extraídos pela IA. */
export interface IngestedMetadata {
  author: string;
  documentType: string;
  keyInfo: string;
}

export interface IngestedDocument {
  title: string;
  content: string;
  metadata?: IngestedMetadata;
}

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

/**
 * Extrai texto e metadados a partir de um buffer (ex.: ficheiro enviado).
 * Usa runExtractionAndClassification (PDF, DOCX, OCR, etc.) e extractDocumentMetadata para título/autor/tipo.
 */
export async function ingestFromBuffer(
  buffer: ArrayBuffer,
  contentType: string,
  filename: string
): Promise<IngestedDocument> {
  const { extractedText } = await runExtractionAndClassification(
    buffer,
    contentType
  );
  const hasText =
    typeof extractedText === "string" && extractedText.trim().length > 0;
  const content = hasText ? extractedText.trim() : FALLBACK_CONTENT;
  let title = sanitizeTitleFromFilename(filename);
  let metadata: IngestedMetadata | undefined;
  if (hasText && typeof extractedText === "string") {
    const extracted = await extractDocumentMetadata(extractedText, filename);
    if (extracted?.title?.trim()) {
      title = extracted.title.slice(0, TITLE_MAX_LENGTH).trim();
    }
    if (extracted) {
      metadata = {
        author: extracted.author,
        documentType: extracted.documentType,
        keyInfo: extracted.keyInfo,
      };
    }
  }
  return { title, content, metadata };
}

/**
 * Extrai apenas título e metadados quando o conteúdo já existe (ex.: cache em from-archivos).
 */
export async function ingestFromContent(
  content: string,
  filename: string
): Promise<IngestedDocument> {
  const title = sanitizeTitleFromFilename(filename);
  if (content.trim().length === 0 || content === FALLBACK_CONTENT) {
    return { title, content };
  }
  const extracted = await extractDocumentMetadata(content, filename);
  const finalTitle = extracted?.title?.trim()
    ? extracted.title.slice(0, TITLE_MAX_LENGTH).trim()
    : title;
  const metadata: IngestedMetadata | undefined = extracted
    ? {
        author: extracted.author,
        documentType: extracted.documentType,
        keyInfo: extracted.keyInfo,
      }
    : undefined;
  return { title: finalTitle, content, metadata };
}
