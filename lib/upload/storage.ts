/** Storage layer: upload to Supabase/Vercel Blob, build data URLs, persist and respond. */

import { put } from "@vercel/blob";
import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { ACCEPTED_IMAGE_TYPES } from "./mime-types";
import type { DocumentType } from "./classify";

export const SUPABASE_BUCKET =
  process.env.SUPABASE_STORAGE_BUCKET ?? "chat-files";

/**
 * Limite máximo para upload no Supabase Storage (plano Free = 50 MB por ficheiro).
 * Usamos 49 MB como margem de segurança para evitar o erro "exceeded maximum allowed size".
 * Ficheiros maiores são armazenados exclusivamente no Vercel Blob.
 */
export const SUPABASE_MAX_FILE_SIZE_BYTES = 49 * 1024 * 1024; // 49 MiB

const isDev = process.env.NODE_ENV === "development";
const hasBlobToken = Boolean(process.env.BLOB_READ_WRITE_TOKEN);

export type UploadResult =
  | { ok: true; url: string; pathname: string }
  | {
      ok: false;
      reason: "no_client" | "storage_error" | "too_large";
      message?: string;
    };

export function buildDataUrl(buffer: ArrayBuffer, contentType: string): string {
  const base64 = Buffer.from(buffer).toString("base64");
  return `data:${contentType};base64,${base64}`;
}

function storageErrorHint(message?: string): string {
  const isNotFound =
    message?.includes("Bucket not found") || message?.includes("not found");
  return isNotFound
    ? ` Crie o bucket "${SUPABASE_BUCKET}" em Supabase Dashboard → Storage, ou execute: pnpm run supabase:config-push`
    : ` Supabase: ${message ?? ""}`;
}

export async function uploadFile(
  userId: string,
  filename: string,
  fileBuffer: ArrayBuffer,
  contentType: string
): Promise<UploadResult> {
  // Verificação de tamanho antes de tentar o upload (evita round-trip ao Supabase
  // para ficheiros > 49 MB que iriam sempre falhar com "exceeded maximum allowed size").
  if (fileBuffer.byteLength > SUPABASE_MAX_FILE_SIZE_BYTES) {
    return {
      ok: false,
      reason: "too_large",
      message: `Ficheiro ${(fileBuffer.byteLength / 1024 / 1024).toFixed(1)} MB excede o limite Supabase (49 MB)`,
    };
  }

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
 * Envia o ficheiro para o storage (Supabase, Blob ou data URL em dev).
 * Usado para correr em paralelo com a extração de texto e reduzir tempo total.
 */
export async function uploadToStorage(
  userId: string,
  filename: string,
  fileBuffer: ArrayBuffer,
  contentType: string
): Promise<{ url: string; pathname: string }> {
  // Clone the buffer before Supabase upload — Supabase SDK may detach the original
  // ArrayBuffer, making it unusable for the Blob fallback.
  const bufferForSupabase = fileBuffer.slice(0);
  const uploadResult = await uploadFile(
    userId,
    filename,
    bufferForSupabase,
    contentType
  );
  if (uploadResult.ok) {
    return { url: uploadResult.url, pathname: uploadResult.pathname };
  }
  // Supabase não disponível ou ficheiro demasiado grande → fallback para Vercel Blob.
  if (isDev) {
    if (uploadResult.reason === "too_large") {
      console.info(
        "[upload] Ficheiro excede limite Supabase (49 MB); a usar Vercel Blob directamente:",
        uploadResult.message
      );
    } else if (uploadResult.reason === "storage_error") {
      console.warn(
        "[upload] Supabase storage_error, a tentar Blob:",
        uploadResult.message,
        storageErrorHint(uploadResult.message)
      );
    }
  }
  try {
    // Use original fileBuffer (not the detached clone sent to Supabase)
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

export function respondUploadSuccess(
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
  extraction?: PersistExtractionOptions,
  /**
   * URL existente no Vercel Blob (ficheiro já lá está, ex.: processo route).
   * Se fornecido e o upload para Supabase falhar, usa este URL como fallback
   * em vez de fazer re-upload para Blob (evita cópias duplicadas de ficheiros grandes).
   */
  existingBlobUrl?: string
): Promise<NextResponse> {
  try {
    let uploadResult: { url: string; pathname: string };
    if (existingBlobUrl) {
      // Ficheiro já está no Blob. Tentar Supabase apenas se couber no limite (49 MB);
      // ficheiros maiores vão directamente para Blob sem tentar Supabase (evita round-trip
      // desnecessário de 10-15s que termina sempre em "exceeded maximum allowed size").
      const fileSizeMB = fileBuffer.byteLength / 1024 / 1024;
      const tooLargeForSupabase =
        fileBuffer.byteLength > SUPABASE_MAX_FILE_SIZE_BYTES;
      if (isDev && tooLargeForSupabase) {
        console.info(
          `[upload] Ficheiro ${fileSizeMB.toFixed(1)} MB > 49 MB; a usar URL Blob directamente (sem tentar Supabase).`
        );
      }
      const supabaseResult = tooLargeForSupabase
        ? { ok: false as const, reason: "too_large" as const }
        : await uploadFile(userId, filename, fileBuffer.slice(0), contentType);

      if (supabaseResult.ok) {
        uploadResult = {
          url: supabaseResult.url,
          pathname: supabaseResult.pathname,
        };
      } else {
        if (isDev && supabaseResult.reason === "storage_error") {
          console.warn(
            "[upload] Supabase falhou para ficheiro já em Blob; a reutilizar URL existente:",
            supabaseResult.message
          );
        }
        // Reutiliza o URL original sem criar duplicado no Blob
        uploadResult = { url: existingBlobUrl, pathname: filename };
      }
    } else {
      uploadResult = await uploadToStorage(
        userId,
        filename,
        fileBuffer,
        contentType
      );
    }
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

// Re-export for callers that previously imported from the route
export { ACCEPTED_IMAGE_TYPES };
