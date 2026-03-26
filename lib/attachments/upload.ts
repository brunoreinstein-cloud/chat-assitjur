// Upload functions extracted from components/multimodal-input.tsx

import { upload as uploadToBlob } from "@vercel/blob/client";
import { toast } from "sonner";
import type {
  FileUploadResponse,
  UploadPhase,
  ZipUploadResponse,
} from "./types";
import { buildAttachmentFromUploadResponse } from "./utils";

type BuiltAttachment = ReturnType<typeof buildAttachmentFromUploadResponse>;

export interface UploadResult {
  /** Single attachment for normal files, array for ZIP. */
  attachments: BuiltAttachment[];
  /** ZIP summary info, if applicable. */
  zipSummary?: ZipUploadResponse["summary"];
}

function isZipResponse(
  data: FileUploadResponse | ZipUploadResponse
): data is ZipUploadResponse {
  return "zip" in data && data.zip === true;
}

function handleZipResponse(data: ZipUploadResponse): UploadResult {
  const attachments: BuiltAttachment[] = [];
  for (const entry of data.files) {
    // Build a synthetic File-like object for each ZIP entry
    const syntheticFile = { name: entry.pathname ?? "documento" } as File;
    attachments.push(buildAttachmentFromUploadResponse(entry, syntheticFile));
  }
  const { summary } = data;
  const parts: string[] = [];
  parts.push(`${summary.processed} arquivo(s) extraído(s) do ZIP`);
  if (summary.failed > 0) {
    parts.push(`${summary.failed} falha(s)`);
  }
  if (summary.skippedUnsupported > 0) {
    parts.push(`${summary.skippedUnsupported} tipo(s) não suportado(s)`);
  }
  if (summary.skippedNestedZips > 0) {
    parts.push(`${summary.skippedNestedZips} ZIP(s) aninhado(s) ignorado(s)`);
  }
  if (summary.skippedTooLarge > 0) {
    parts.push(`${summary.skippedTooLarge} arquivo(s) grande(s) demais`);
  }
  toast.success(parts.join(" · "));
  return { attachments, zipSummary: summary };
}

export async function uploadLargeFile(
  file: File,
  onPhase?: (phase: UploadPhase, percent: number) => void
): Promise<UploadResult | undefined> {
  const tokenCheckRes = await fetch("/api/files/upload-token", {
    method: "GET",
  });
  if (!tokenCheckRes.ok) {
    const errData = (await tokenCheckRes.json().catch(() => ({}))) as {
      error?: string;
    };
    const msg =
      typeof errData.error === "string"
        ? errData.error
        : "Upload de ficheiros grandes não disponível. Use um ficheiro com menos de 4,5 MB.";
    toast.error(msg);
    return undefined;
  }
  try {
    onPhase?.("uploading", 10);
    const blob = await uploadToBlob(file.name, file, {
      access: "public",
      handleUploadUrl: "/api/files/upload-token",
    });
    onPhase?.("extracting", 50);
    const processRes = await fetch("/api/files/process", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: blob.url,
        pathname: blob.pathname,
        contentType: file.type || "application/octet-stream",
        filename: file.name,
      }),
    });
    if (!processRes.ok) {
      const errData = (await processRes.json().catch(() => ({}))) as {
        error?: string;
      };
      const msg =
        typeof errData.error === "string"
          ? errData.error
          : "Falha ao processar o ficheiro após o upload.";
      toast.error(msg);
      return undefined;
    }
    onPhase?.("classifying", 90);
    const data = (await processRes.json()) as
      | FileUploadResponse
      | ZipUploadResponse;
    onPhase?.("done", 100);
    if (isZipResponse(data)) {
      return handleZipResponse(data);
    }
    return {
      attachments: [buildAttachmentFromUploadResponse(data, file)],
    };
  } catch (directError: unknown) {
    const msg =
      directError instanceof Error
        ? directError.message
        : "Upload de ficheiros grandes não disponível.";
    toast.error(
      `${msg} Use um ficheiro com menos de 4,5 MB ou tente novamente.`
    );
    return undefined;
  }
}

export async function uploadSmallFile(
  file: File,
  onPhase?: (phase: UploadPhase, percent: number) => void
): Promise<UploadResult | undefined> {
  onPhase?.("uploading", 0);
  const formData = new FormData();
  formData.append("file", file);

  // Use XHR for real upload progress tracking
  const result = await new Promise<{
    ok: boolean;
    status: number;
    body: string;
  }>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/files/upload");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        const pct = Math.round((e.loaded / e.total) * 60); // Upload = 0-60%
        onPhase?.("uploading", pct);
      }
    };
    xhr.onload = () => {
      onPhase?.("extracting", 65);
      resolve({
        ok: xhr.status >= 200 && xhr.status < 300,
        status: xhr.status,
        body: xhr.responseText,
      });
    };
    xhr.onerror = () => reject(new Error("Network error"));
    xhr.send(formData);
  });

  if (result.ok) {
    onPhase?.("classifying", 90);
    try {
      const data = JSON.parse(result.body) as
        | FileUploadResponse
        | ZipUploadResponse;
      onPhase?.("done", 100);
      if (isZipResponse(data)) {
        return handleZipResponse(data);
      }
      return {
        attachments: [buildAttachmentFromUploadResponse(data, file)],
      };
    } catch {
      toast.error("Resposta inválida do servidor.");
      return undefined;
    }
  }

  // Error handling
  try {
    const errData = JSON.parse(result.body) as {
      error?: string;
      message?: string;
    };
    toast.error(
      errData.error ??
        errData.message ??
        "Falha ao enviar o arquivo. Tente novamente."
    );
  } catch {
    toast.error("Falha ao enviar o arquivo. Tente novamente.");
  }
  return undefined;
}
