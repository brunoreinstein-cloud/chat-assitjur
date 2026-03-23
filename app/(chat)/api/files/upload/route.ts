import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/app/(auth)/auth";
import { extractDocumentMetadata } from "@/lib/ai/extract-metadata";
import {
  MIN_SIZE_TO_OPTIMIZE,
  optimizePdfBuffer,
} from "@/lib/pdf/pdf-optimizer";
import {
  ACCEPTED_PDF_TYPE,
  OCTET_STREAM,
  MAX_FILE_SIZE,
  contentTypeFromFilename,
  isAcceptedFileType,
  needsExtraction,
} from "@/lib/upload/mime-types";
import {
  classifyDocumentTypeFromFilename,
  mapMetadataDocumentType,
  type DocumentType,
} from "@/lib/upload/classify";
import { runExtractionAndClassification } from "@/lib/upload/extract";
import {
  uploadToStorage,
  respondUploadSuccess,
  type UploadExtractedMetadata,
  type PersistExtractionOptions,
  persistAndRespond,
} from "@/lib/upload/storage";

// Re-export symbols consumed by other modules (process/route.ts, rag/ingestion.ts, etc.)
export type { DocumentType };
export {
  classifyDocumentTypeFromFilename,
  contentTypeFromFilename,
  persistAndRespond,
  runExtractionAndClassification,
};
export type { PersistExtractionOptions, UploadExtractedMetadata };

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
        "Tipos aceitos: JPEG, PNG, PDF, DOC, DOCX, XLS, XLSX, CSV, TXT ou ODT",
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
