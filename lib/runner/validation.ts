import type { Attachment } from "@/lib/types";
import type { DocumentType } from "./types";
import { DOCUMENT_TYPE_LABELS } from "./types";

export interface RunnerValidationResult {
  valid: boolean;
  /** Document types still missing from the attachments. */
  missing: DocumentType[];
  /** Human-readable error message, or null if valid. */
  error: string | null;
}

/**
 * Validates that uploaded attachments satisfy the agent's document requirements.
 *
 * - All `requiredDocumentTypes` must be present in the attachments' `documentType` field.
 * - Total document count must be >= `minDocuments` (defaults to requiredDocumentTypes.length).
 * - All documents must have `extractedText` (text extraction complete).
 */
export function validateRunnerDocuments(
  attachments: Attachment[],
  requiredDocumentTypes: DocumentType[],
  minDocuments?: number
): RunnerValidationResult {
  const effectiveMin = minDocuments ?? requiredDocumentTypes.length;

  // Check minimum document count
  if (attachments.length < effectiveMin) {
    return {
      valid: false,
      missing: requiredDocumentTypes,
      error:
        effectiveMin === 1
          ? "Anexe pelo menos 1 documento."
          : `Anexe pelo menos ${effectiveMin} documentos.`,
    };
  }

  // Check all required document types are present
  const missing: DocumentType[] = [];
  for (const reqType of requiredDocumentTypes) {
    const found = attachments.some((a) => a.documentType === reqType);
    if (!found) {
      missing.push(reqType);
    }
  }

  if (missing.length > 0) {
    const labels = missing.map((t) => DOCUMENT_TYPE_LABELS[t]).join(" e ");
    return {
      valid: false,
      missing,
      error: `Documentos em falta: ${labels}.`,
    };
  }

  // Check text extraction is complete for all docs
  const pendingExtraction = attachments.filter(
    (a) => !(a.extractedText || a.extractionFailed)
  );
  if (pendingExtraction.length > 0) {
    return {
      valid: false,
      missing: [],
      error: "A aguardar extração de texto dos documentos.",
    };
  }

  return { valid: true, missing: [], error: null };
}
