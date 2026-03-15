import { NextResponse } from "next/server";

import {
  optimizePdfBuffer,
  type PdfOptimizeOptions,
} from "@/lib/pdf/pdf-optimizer";
import { extractMetadata, suggestFilename } from "@/lib/pdf/suggest-filename";

/** Tamanho máximo aceite: 20 MB. */
const MAX_FILE_SIZE = 20 * 1024 * 1024;

/**
 * Extrai texto das primeiras páginas de um PDF via unpdf.
 * Versão simplificada para o compress route (sem OCR/fallback).
 */
async function extractQuickText(buffer: Buffer, maxPages = 5): Promise<string> {
  try {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const data = new Uint8Array(buffer);
    const pdf = await getDocumentProxy(data);
    const numPages = Math.min((pdf as { numPages: number }).numPages, maxPages);

    const result = await extractText(pdf, { mergePages: false });
    const pages = Array.isArray(result.text) ? result.text : [result.text];

    return pages
      .slice(0, numPages)
      .map((p) => (typeof p === "string" ? p : ""))
      .join("\n\n")
      .trim();
  } catch {
    return "";
  }
}

function fmtBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(0)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * POST /api/compress
 *
 * Recebe um PDF via FormData, comprime e retorna o resultado como download direto.
 * Ferramenta pública — sem autenticação.
 */
export async function POST(request: Request) {
  const formData = await request.formData();
  const file = formData.get("file");
  const mode = (formData.get("mode") as string) || "ebook";

  if (!(file && file instanceof File)) {
    return NextResponse.json(
      { error: "Nenhum arquivo enviado." },
      { status: 400 }
    );
  }

  if (file.type !== "application/pdf") {
    return NextResponse.json(
      { error: "Apenas arquivos PDF são aceites." },
      { status: 400 }
    );
  }

  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      { error: `Arquivo muito grande. Limite: ${fmtBytes(MAX_FILE_SIZE)}.` },
      { status: 413 }
    );
  }

  const validModes = ["screen", "ebook", "printer"];
  const safeMode = validModes.includes(mode) ? mode : "ebook";

  const buffer = Buffer.from(await file.arrayBuffer());

  // 1. Comprimir
  const result = await optimizePdfBuffer(buffer, file.name, {
    mode: safeMode as PdfOptimizeOptions["mode"],
  });

  // 2. Extrair texto para resumo, metadados e sugestão de nome
  const extractedText = await extractQuickText(result.outputBuffer);
  const summary = extractedText.slice(0, 1500);
  const metadata = extractMetadata(extractedText);
  const suggestedName = suggestFilename(extractedText, file.name);

  // 3. Retornar PDF comprimido como base64 + metadados
  const base64 = result.outputBuffer.toString("base64");

  return NextResponse.json({
    pdfBase64: base64,
    sizeBefore: result.sizeBefore,
    sizeAfter: result.sizeAfter,
    reductionPercent: result.reductionPercent,
    method: result.method,
    durationMs: result.durationMs,
    summary,
    suggestedName,
    metadata,
    sizeBeforeFormatted: fmtBytes(result.sizeBefore),
    sizeAfterFormatted: fmtBytes(result.sizeAfter),
  });
}
