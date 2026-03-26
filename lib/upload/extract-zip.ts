/**
 * Extract files from a ZIP archive with safety limits.
 * Reuses JSZip (already a project dependency for export-zip and ODT extraction).
 */
import JSZip from "jszip";

import {
  contentTypeFromFilename,
  isZipContentType,
  needsExtraction,
  OCTET_STREAM,
} from "./mime-types";

/** Maximum number of files inside a single ZIP. */
export const MAX_ZIP_FILES = 50;
/** Maximum total uncompressed size (500 MB). */
export const MAX_ZIP_UNCOMPRESSED_SIZE = 500 * 1024 * 1024;
/** Maximum single extracted file size (same as global upload limit). */
const MAX_SINGLE_FILE_SIZE = 100 * 1024 * 1024;

/** System/hidden file patterns to ignore. */
const IGNORED_PATTERNS = [
  /^__MACOSX\//,
  /\/\.DS_Store$/,
  /^\.DS_Store$/,
  /\/Thumbs\.db$/i,
  /^Thumbs\.db$/i,
  /\/desktop\.ini$/i,
  /^desktop\.ini$/i,
];

export interface ExtractedZipFile {
  /** Original filename inside the ZIP (basename only). */
  filename: string;
  /** Resolved MIME content type. */
  contentType: string;
  /** File contents. */
  buffer: ArrayBuffer;
}

export interface ZipExtractionResult {
  files: ExtractedZipFile[];
  /** Number of files skipped due to unsupported type. */
  skippedUnsupported: number;
  /** Number of files skipped because they were nested ZIPs. */
  skippedNestedZips: number;
  /** Number of files skipped due to size. */
  skippedTooLarge: number;
}

function isIgnoredPath(path: string): boolean {
  return IGNORED_PATTERNS.some((p) => p.test(path));
}

function basename(path: string): string {
  const parts = path.split("/");
  return parts.at(-1) ?? "";
}

function isSupportedContentType(ct: string): boolean {
  return (
    ct !== OCTET_STREAM && (needsExtraction(ct) || ct.startsWith("image/"))
  );
}

export async function extractFilesFromZip(
  buffer: ArrayBuffer
): Promise<ZipExtractionResult> {
  const zip = await JSZip.loadAsync(buffer);

  // Collect valid entries (non-directory, non-system)
  const entries: { path: string; file: JSZip.JSZipObject }[] = [];
  zip.forEach((relativePath, file) => {
    if (file.dir) {
      return;
    }
    if (isIgnoredPath(relativePath)) {
      return;
    }
    entries.push({ path: relativePath, file });
  });

  if (entries.length === 0) {
    throw new Error("O arquivo ZIP está vazio ou contém apenas pastas.");
  }

  if (entries.length > MAX_ZIP_FILES) {
    throw new Error(
      `O ZIP contém ${entries.length} arquivos (máximo: ${MAX_ZIP_FILES}). Reduza o número de arquivos e tente novamente.`
    );
  }

  const files: ExtractedZipFile[] = [];
  let totalUncompressedSize = 0;
  let skippedUnsupported = 0;
  let skippedNestedZips = 0;
  let skippedTooLarge = 0;

  for (const entry of entries) {
    const filename = basename(entry.path);
    if (!filename) {
      continue;
    }

    const contentType = contentTypeFromFilename(filename);

    // Reject nested ZIPs
    if (isZipContentType(contentType)) {
      skippedNestedZips++;
      continue;
    }

    // Skip unsupported types
    if (!isSupportedContentType(contentType)) {
      skippedUnsupported++;
      continue;
    }

    const fileBuffer = await entry.file.async("arraybuffer");

    // Check individual file size
    if (fileBuffer.byteLength > MAX_SINGLE_FILE_SIZE) {
      skippedTooLarge++;
      continue;
    }

    // Check cumulative uncompressed size (zip bomb protection)
    totalUncompressedSize += fileBuffer.byteLength;
    if (totalUncompressedSize > MAX_ZIP_UNCOMPRESSED_SIZE) {
      throw new Error(
        `O conteúdo descompactado excede ${MAX_ZIP_UNCOMPRESSED_SIZE / (1024 * 1024)} MB. Use um ZIP menor.`
      );
    }

    files.push({ filename, contentType, buffer: fileBuffer });
  }

  if (files.length === 0) {
    throw new Error(
      "O ZIP não contém arquivos com tipos suportados (PDF, DOC, DOCX, XLS, XLSX, CSV, TXT, ODT, JPEG, PNG)."
    );
  }

  return { files, skippedUnsupported, skippedNestedZips, skippedTooLarge };
}
