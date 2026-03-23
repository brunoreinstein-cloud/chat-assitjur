/** PDF text extraction: unpdf primary, page-by-page fallback, and OCR for scanned PDFs. */

import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { MAX_EXTRACTED_TEXT_LENGTH, MAX_OCR_PAGES } from "./mime-types";

/**
 * Opções padrão para getDocumentProxy (unpdf).
 * Configura standardFontDataUrl para eliminar o warning
 * "Ensure that the standardFontDataUrl API parameter is provided".
 */
export const PDFJS_OPTIONS = {
  standardFontDataUrl: pathToFileURL(
    `${join(process.cwd(), "node_modules", "pdfjs-dist", "standard_fonts")}/`
  ).href,
};

const isDev = process.env.NODE_ENV === "development";

/** Suprime avisos do PDF.js (ex.: "TT: undefined function", "Type3 font resource") durante a extração. */
export async function withPdfWarningsSuppressed<T>(
  fn: () => Promise<T>
): Promise<T> {
  const originalWarn = console.warn;
  console.warn = (...args: unknown[]) => {
    const msg = args[0];
    if (
      typeof msg === "string" &&
      (msg.includes("TT:") ||
        msg.includes("Type3 font") ||
        msg.includes("standardFontDataUrl") ||
        msg.includes("UnknownErrorException"))
    ) {
      return;
    }
    originalWarn.apply(console, args);
  };
  try {
    return await fn();
  } finally {
    console.warn = originalWarn;
  }
}

/**
 * Extração principal com unpdf — agora página a página para preservar marcadores [Pag. N].
 * Cada página recebe um marcador `[Pag. N]` que permite rastreabilidade de folha.
 */
export async function extractTextFromPdfUnpdf(
  buffer: ArrayBuffer
): Promise<{ text: string; pageCount: number }> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const data = new Uint8Array(buffer);
  const pdf = await getDocumentProxy(data, PDFJS_OPTIONS);
  const numPages = (pdf as { numPages: number }).numPages;
  // mergePages: false → retorna string[] (uma por página)
  const result = await extractText(pdf, { mergePages: false });
  const pages = Array.isArray(result.text) ? result.text : [result.text];
  const marked = pages.map(
    (p, i) => `[Pag. ${i + 1}]\n${typeof p === "string" ? p : ""}`
  );
  return { text: marked.join("\n\n"), pageCount: numPages };
}

/**
 * Fallback: extração página a página com getPage + getTextContent.
 * Pode obter texto em PDFs onde extractText do unpdf devolve vazio (ex.: encoding não padrão).
 * Cada página recebe marcador `[Pag. N]` para rastreabilidade.
 */
export async function extractTextFromPdfFallback(
  buffer: ArrayBuffer
): Promise<{ text: string; pageCount: number }> {
  const { getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(buffer), PDFJS_OPTIONS);
  const numPages = (pdf as { numPages: number }).numPages;
  if (numPages <= 0) {
    return { text: "", pageCount: 0 };
  }
  const parts: string[] = [];
  for (let i = 1; i <= numPages; i += 1) {
    const page = await (
      pdf as {
        getPage: (n: number) => Promise<{
          getTextContent: () => Promise<{ items: Array<{ str?: string }> }>;
        }>;
      }
    ).getPage(i);
    const content = await page.getTextContent();
    const pageText = (content.items as Array<{ str?: string }>)
      .map((item) => item.str ?? "")
      .join(" ");
    parts.push(`[Pag. ${i}]\n${pageText}`);
  }
  return { text: parts.join("\n\n"), pageCount: numPages };
}

/**
 * OCR para PDFs digitalizados (sem camada de texto).
 * Renderiza cada página como imagem (unpdf + canvas) e extrai texto com Tesseract.js.
 * Chamado automaticamente quando a extração da camada de texto devolve vazio.
 */
export async function extractTextFromPdfWithOcr(
  buffer: ArrayBuffer
): Promise<{ text: string; pageCount: number }> {
  const { getDocumentProxy, renderPageAsImage } = await import("unpdf");
  const data = new Uint8Array(buffer);
  const pdf = await getDocumentProxy(data, PDFJS_OPTIONS);
  const numPages = (pdf as { numPages: number }).numPages;
  const pagesToProcess = Math.min(numPages, MAX_OCR_PAGES);
  if (pagesToProcess <= 0) {
    return { text: "", pageCount: 0 };
  }

  const Tesseract = await import("tesseract.js");
  const worker = await Tesseract.createWorker(["por", "eng"], 1, {
    logger: () => {
      /* silenciar logs do Tesseract */
    },
  });
  await worker.setParameters({
    tessedit_pageseg_mode: Tesseract.PSM?.AUTO ?? "3",
  });
  const parts: string[] = [];

  try {
    for (let i = 1; i <= pagesToProcess; i += 1) {
      try {
        const imageBuffer = await renderPageAsImage(data, i, {
          canvasImport: () => import("@napi-rs/canvas"),
          scale: 3,
        });
        if (!imageBuffer || imageBuffer.byteLength < 100) {
          continue;
        }
        const result = await worker.recognize(Buffer.from(imageBuffer));
        const pageText =
          typeof result?.data?.text === "string" ? result.data.text : "";
        parts.push(`[Pag. ${i}]\n${pageText}`);
      } catch {
        // Ignora falha numa página e continua com as restantes
      }
    }
  } finally {
    await worker.terminate();
  }

  const text = parts.join("\n\n");
  return {
    text:
      text.length > MAX_EXTRACTED_TEXT_LENGTH
        ? `${text.slice(0, MAX_EXTRACTED_TEXT_LENGTH)}\n\n[... texto truncado ...]`
        : text,
    pageCount: numPages,
  };
}

interface ExtractPdfResult {
  text: string;
  pageCount: number;
  lastError?: string;
}

export async function extractTextFromPdf(
  buffer: ArrayBuffer
): Promise<ExtractPdfResult> {
  let text = "";
  let pageCount = 0;
  let lastError: string | undefined;

  const t0 = Date.now();

  // Reutilizar o mesmo buffer (sem .slice(0) desnecessário) — poupa memória em PDFs grandes
  try {
    const r = await withPdfWarningsSuppressed(() =>
      extractTextFromPdfUnpdf(buffer)
    );
    text = r.text;
    pageCount = r.pageCount;
    if (isDev) {
      console.log(
        `[pdf-extract] unpdf: ${Date.now() - t0}ms, ${pageCount} págs, ${text.length} chars`
      );
    }
  } catch {
    text = "";
  }

  if (text.trim().length === 0) {
    const t1 = Date.now();
    try {
      const r = await withPdfWarningsSuppressed(() =>
        extractTextFromPdfFallback(buffer)
      );
      text = r.text;
      pageCount = r.pageCount;
      if (isDev) {
        console.log(
          `[pdf-extract] fallback: ${Date.now() - t1}ms, ${pageCount} págs, ${text.length} chars`
        );
      }
    } catch {
      text = "";
    }
  }

  if (text.trim().length === 0) {
    const t2 = Date.now();
    try {
      const r = await withPdfWarningsSuppressed(() =>
        extractTextFromPdfWithOcr(buffer)
      );
      text = r.text;
      pageCount = r.pageCount;
      if (isDev) {
        console.log(
          `[pdf-extract] OCR: ${Date.now() - t2}ms, ${pageCount} págs, ${text.length} chars`
        );
      }
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      text = "";
    }
  }

  if (text.length > MAX_EXTRACTED_TEXT_LENGTH) {
    text = `${text.slice(0, MAX_EXTRACTED_TEXT_LENGTH)}\n\n[... texto truncado ...]`;
  }

  if (isDev) {
    console.log(`[pdf-extract] total: ${Date.now() - t0}ms`);
  }
  return { text, pageCount, lastError };
}
