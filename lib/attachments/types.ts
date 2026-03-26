// Types extracted from components/multimodal-input.tsx

export type UploadPhase = "uploading" | "extracting" | "classifying" | "done";

export interface UploadQueueItem {
  id: string;
  label: string;
  /** Current phase of the upload pipeline */
  phase: UploadPhase;
  /** Upload progress 0-100 (only meaningful during 'uploading' phase) */
  percent: number;
  /** File size in bytes */
  fileSize?: number;
}

export interface FileUploadResponse {
  url?: string;
  pathname?: string;
  contentType?: string;
  extractedText?: string;
  extractionFailed?: boolean;
  extractionDetail?: string;
  documentType?: "pi" | "contestacao";
  pageCount?: number;
}

/** Response shape when a ZIP file is uploaded. */
export interface ZipUploadResponse {
  zip: true;
  files: FileUploadResponse[];
  summary: {
    processed: number;
    failed: number;
    skippedUnsupported: number;
    skippedNestedZips: number;
    skippedTooLarge: number;
  };
}

export interface DocumentPart {
  type: "document";
  name: string;
  text: string;
  documentType?: "pi" | "contestacao";
}

export interface FilePart {
  type: "file";
  url: string;
  name: string;
  mediaType: string;
}
