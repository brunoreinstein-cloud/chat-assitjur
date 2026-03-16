"use client";

import { toast } from "sonner";

export type DocxLayout = "default" | "assistjur-master";

/**
 * Dispara download de um Blob no browser.
 * Extrai filename do header Content-Disposition, se disponível.
 */
export function triggerBlobDownload(
  blob: Blob,
  disposition: string | null,
  fallbackName: string
): void {
  const filenameMatch = disposition?.match(/filename="?([^";\n]+)"?/);
  const filename = filenameMatch?.[1] ?? fallbackName;
  const urlObj = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = urlObj;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(urlObj);
}

/**
 * Faz download de um DOCX individual via POST /api/document/export.
 * Funciona com conteúdo em memória (sem depender da BD).
 */
export async function downloadDocxFromPost(
  title: string,
  content: string,
  layout?: DocxLayout
): Promise<void> {
  try {
    const res = await fetch("/api/document/export", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, content, layout }),
      credentials: "include",
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      toast.error(
        (data as { message?: string }).message ?? "Falha ao exportar DOCX."
      );
      return;
    }
    const blob = await res.blob();
    triggerBlobDownload(
      blob,
      res.headers.get("Content-Disposition"),
      "documento.docx"
    );
    toast.success("DOCX descarregado.");
  } catch {
    toast.error("Falha ao descarregar DOCX.");
  }
}

/**
 * Faz download de um ZIP com múltiplos DOCX via POST /api/document/export-zip.
 * Funciona com conteúdo em memória (sem depender da BD).
 */
export async function downloadZipFromPost(
  docs: Array<{ title: string; content: string }>,
  layout?: DocxLayout
): Promise<void> {
  if (docs.length === 0) {
    toast.error("Documentos não disponíveis em memória. Tenta recarregar.");
    return;
  }
  try {
    const res = await fetch("/api/document/export-zip", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        docs: docs.map(({ title, content }) => ({ title, content })),
        layout,
      }),
      credentials: "include",
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      toast.error(
        (data as { message?: string }).message ?? "Falha ao exportar ZIP."
      );
      return;
    }
    const blob = await res.blob();
    triggerBlobDownload(
      blob,
      res.headers.get("Content-Disposition"),
      "documentos.zip"
    );
    toast.success("ZIP descarregado.");
  } catch {
    toast.error("Falha ao descarregar ZIP.");
  }
}
