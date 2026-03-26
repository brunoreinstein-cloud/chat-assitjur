import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/app/(auth)/auth";
import { extractDocumentMetadata } from "@/lib/ai/extract-metadata";
import {
  MIN_SIZE_TO_OPTIMIZE,
  optimizePdfBuffer,
} from "@/lib/pdf/pdf-optimizer";
import {
  classifyDocumentTypeFromFilename,
  type DocumentType,
  mapMetadataDocumentType,
} from "@/lib/upload/classify";
import { runExtractionAndClassification } from "@/lib/upload/extract";
import { extractFilesFromZip } from "@/lib/upload/extract-zip";
import {
  ACCEPTED_PDF_TYPE,
  contentTypeFromFilename,
  isAcceptedFileType,
  isZipContentType,
  MAX_FILE_SIZE,
  needsExtraction,
  OCTET_STREAM,
} from "@/lib/upload/mime-types";
import {
  type UploadExtractedMetadata,
  uploadToStorage,
} from "@/lib/upload/storage";

// Re-export symbols consumed by other modules (process/route.ts, rag/ingestion.ts, etc.)
export type { DocumentType } from "@/lib/upload/classify";
export { classifyDocumentTypeFromFilename } from "@/lib/upload/classify";
export { runExtractionAndClassification } from "@/lib/upload/extract";
export { contentTypeFromFilename } from "@/lib/upload/mime-types";
export type {
  PersistExtractionOptions,
  UploadExtractedMetadata,
} from "@/lib/upload/storage";
export { persistAndRespond } from "@/lib/upload/storage";

/** PDFs enormes (muitas páginas ou OCR) podem demorar; permite até 5 min na Vercel (Pro). */
export const maxDuration = 300;

const isDev = process.env.NODE_ENV === "development";

const FileSchema = z.object({
  file: z
    .instanceof(Blob)
    .refine((file) => file.size <= MAX_FILE_SIZE, {
      message: "O arquivo deve ter no máximo 100 MB",
    })
    .refine(isAcceptedFileType, {
      message:
        "Tipos aceitos: JPEG, PNG, PDF, DOC, DOCX, XLS, XLSX, CSV, TXT, ODT ou ZIP",
    }),
});

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

/** Process a single file buffer (shared between normal uploads and ZIP entries). */
async function processSingleFile(
  userId: string,
  fileBuffer: ArrayBuffer,
  contentType: string,
  filename: string
): Promise<{
  url: string;
  pathname: string;
  contentType: string;
  extractedText?: string;
  extractionFailed?: boolean;
  extractionDetail?: string;
  documentType?: DocumentType;
  pageCount?: number;
}> {
  let buffer = fileBuffer;

  // Optimize PDF via Ghostscript
  if (
    contentType === ACCEPTED_PDF_TYPE &&
    buffer.byteLength > MIN_SIZE_TO_OPTIMIZE
  ) {
    const optimized = await optimizePdfBuffer(Buffer.from(buffer), filename, {
      mode: "ebook",
    });
    if (optimized.success && optimized.reductionPercent > 0) {
      buffer = optimized.outputBuffer.buffer.slice(
        optimized.outputBuffer.byteOffset,
        optimized.outputBuffer.byteOffset + optimized.outputBuffer.byteLength
      ) as ArrayBuffer;
    }
  }

  const bufferForStorage = buffer.slice(0);

  const extractionPromise = needsExtraction(contentType)
    ? runExtractionAndClassification(buffer, contentType)
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

  return {
    url: uploadResult.url,
    pathname: uploadResult.pathname,
    contentType,
    ...(typeof extraction.extractedText === "string"
      ? { extractedText: extraction.extractedText }
      : {}),
    ...(extraction.extractionFailed === true ? { extractionFailed: true } : {}),
    ...(typeof extraction.extractionDetail === "string" &&
    extraction.extractionDetail.length > 0
      ? { extractionDetail: extraction.extractionDetail }
      : {}),
    ...(finalDocumentType ? { documentType: finalDocumentType } : {}),
    ...(extractedMetadata ? { extractedMetadata } : {}),
    ...("pageCount" in extraction && extraction.pageCount != null
      ? { pageCount: extraction.pageCount }
      : {}),
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
  const fileBuffer = await file.arrayBuffer();
  const rawType = file.type;
  const contentType =
    rawType === "" || rawType === OCTET_STREAM
      ? contentTypeFromFilename(filename)
      : rawType;

  // --- ZIP handling: extract inner files and process each one ---
  if (isZipContentType(contentType)) {
    const zipResult = await extractFilesFromZip(fileBuffer);
    const results = await Promise.allSettled(
      zipResult.files.map((entry) =>
        processSingleFile(
          userId,
          entry.buffer,
          entry.contentType,
          entry.filename
        )
      )
    );
    const files = results
      .filter(
        (
          r
        ): r is PromiseFulfilledResult<
          Awaited<ReturnType<typeof processSingleFile>>
        > => r.status === "fulfilled"
      )
      .map((r) => r.value);
    const failedCount = results.filter((r) => r.status === "rejected").length;
    return NextResponse.json({
      zip: true,
      files,
      summary: {
        processed: files.length,
        failed: failedCount,
        skippedUnsupported: zipResult.skippedUnsupported,
        skippedNestedZips: zipResult.skippedNestedZips,
        skippedTooLarge: zipResult.skippedTooLarge,
      },
    });
  }

  // --- Normal (non-ZIP) file ---
  const result = await processSingleFile(
    userId,
    fileBuffer,
    contentType,
    filename
  );
  return NextResponse.json(result);
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
