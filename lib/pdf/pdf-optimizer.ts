/**
 * lib/pdf/pdf-optimizer.ts
 *
 * Comprime PDFs usando bibliotecas pure-JS (pdf-lib + unpdf + @napi-rs/canvas).
 * Funciona na Vercel serverless sem dependências externas (Ghostscript, etc.).
 *
 * Estratégia em 2 passos:
 *   1. pdf-lib: re-salva o PDF removendo objetos não utilizados
 *   2. Se o PDF continua grande (scanned/imagem): renderiza cada página como JPEG
 *      em DPI reduzido e recompõe um novo PDF com pdf-lib
 *
 * Fallback gracioso: qualquer erro retorna o buffer original.
 */

import { PDFDocument } from "pdf-lib";

import { OPTIMIZE_PRESETS, type OptimizePresetName } from "./gs-presets";

// ─── Constantes ──────────────────────────────────────────────────────────────

/** Tamanho mínimo para tentar otimizar (500 KB). PDFs menores não justificam o overhead. */
export const MIN_SIZE_TO_OPTIMIZE = 500 * 1024;

/** Se após o passo 1 (pdf-lib resave) o PDF ainda for > este limiar, tenta o passo 2 (render pages). */
const RENDER_THRESHOLD = 2 * 1024 * 1024; // 2 MB

/** Máximo de páginas a renderizar no passo 2 (evita timeout em PDFs enormes). */
const MAX_RENDER_PAGES = 80;

/** Timeout total para o optimizer (ms). */
const OPTIMIZE_TIMEOUT_MS = 120_000;

/** Prefixo para logs. */
const TAG = "[pdf-optimizer]";

const isDev = process.env.NODE_ENV === "development";

// ─── Tipos ───────────────────────────────────────────────────────────────────

export interface PdfOptimizeOptions {
  /** Preset de qualidade. Default: "ebook" */
  mode?: OptimizePresetName;
}

export interface PdfOptimizeResult {
  success: boolean;
  error?: string;
  /** Buffer do PDF otimizado (ou original se falhou/skip). */
  outputBuffer: Buffer;
  /** Tamanho original em bytes. */
  sizeBefore: number;
  /** Tamanho após otimização em bytes. */
  sizeAfter: number;
  /** Percentual de redução (0–100). Negativo se cresceu. */
  reductionPercent: number;
  /** Tempo de processamento em ms. */
  durationMs: number;
  /** Qual passo produziu o resultado: "resave" | "render" | "skip" */
  method: "resave" | "render" | "skip";
}

// ─── Optimizer principal ─────────────────────────────────────────────────────

/**
 * Otimiza um PDF em pure-JS (compatível com Vercel serverless).
 *
 * Comportamento:
 * - Buffer menor que MIN_SIZE_TO_OPTIMIZE → retorna original (skip)
 * - Passo 1: re-salva via pdf-lib (remove objetos não utilizados)
 * - Passo 2: se ainda grande, renderiza páginas como JPEG e recompõe
 * - Output maior que input → retorna original (PDF já otimizado)
 * - Qualquer erro → retorna original (fallback)
 */
export async function optimizePdfBuffer(
  buffer: Buffer,
  filename: string,
  options?: PdfOptimizeOptions
): Promise<PdfOptimizeResult> {
  const t0 = Date.now();
  const sizeBefore = buffer.length;

  // Skip para PDFs pequenos
  if (sizeBefore < MIN_SIZE_TO_OPTIMIZE) {
    if (isDev) {
      console.info(
        `${TAG} Skip: ${filename} (${fmtBytes(sizeBefore)}) < ${fmtBytes(MIN_SIZE_TO_OPTIMIZE)}`
      );
    }
    return skipResult(buffer, sizeBefore, t0);
  }

  const mode = options?.mode ?? "ebook";
  const preset = OPTIMIZE_PRESETS[mode];

  if (isDev) {
    console.info(
      `${TAG} Otimizando: ${filename} (${fmtBytes(sizeBefore)}, mode=${mode})`
    );
  }

  try {
    // ── Passo 1: pdf-lib resave ──────────────────────────────────────────
    const resaved = await resavePdf(buffer);

    if (resaved.length < sizeBefore) {
      const reduction1 = Math.round(
        ((sizeBefore - resaved.length) / sizeBefore) * 100
      );
      if (isDev) {
        console.info(
          `${TAG} Passo 1 (resave): ${fmtBytes(sizeBefore)} → ${fmtBytes(resaved.length)} (-${reduction1}%)`
        );
      }

      // Se o resave já reduziu bastante ou o resultado é pequeno, usar isso
      if (resaved.length <= RENDER_THRESHOLD) {
        return buildResult(buffer, resaved, sizeBefore, t0, "resave");
      }
    }

    // ── Passo 2: render pages como JPEG ──────────────────────────────────
    // Usar o buffer menor entre original e resaved
    const bestSoFar = resaved.length < sizeBefore ? resaved : buffer;

    if (bestSoFar.length > RENDER_THRESHOLD) {
      const elapsed = Date.now() - t0;
      if (elapsed < OPTIMIZE_TIMEOUT_MS - 10_000) {
        if (isDev) {
          console.info(
            `${TAG} Passo 2 (render): renderizando páginas como JPEG ${preset.dpi} DPI, qualidade ${preset.jpegQuality}%`
          );
        }

        const rendered = await renderPagesAsJpegPdf(
          buffer,
          preset.dpi,
          preset.jpegQuality
        );

        if (rendered && rendered.length < bestSoFar.length) {
          if (isDev) {
            const reduction2 = Math.round(
              ((sizeBefore - rendered.length) / sizeBefore) * 100
            );
            console.info(
              `${TAG} Passo 2 (render): ${fmtBytes(sizeBefore)} → ${fmtBytes(rendered.length)} (-${reduction2}%)`
            );
          }
          return buildResult(buffer, rendered, sizeBefore, t0, "render");
        }
      }
    }

    // Melhor resultado dos 2 passos
    if (resaved.length < sizeBefore) {
      return buildResult(buffer, resaved, sizeBefore, t0, "resave");
    }

    // Nenhuma melhoria
    if (isDev) {
      console.info(`${TAG} Nenhuma redução obtida, usando original`);
    }
    return skipResult(buffer, sizeBefore, t0);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro desconhecido";
    if (isDev) {
      console.warn(`${TAG} Falha: ${message}, usando original`);
    }
    return {
      success: false,
      error: message,
      outputBuffer: buffer,
      sizeBefore,
      sizeAfter: sizeBefore,
      reductionPercent: 0,
      durationMs: Date.now() - t0,
      method: "skip",
    };
  }
}

// ─── Passo 1: pdf-lib resave ─────────────────────────────────────────────────

/**
 * Carrega e re-salva o PDF com pdf-lib.
 * Isso remove objetos não referenciados, comprime object streams,
 * e normaliza a estrutura — frequentemente reduz 10–40% em PDFs "sujos".
 */
async function resavePdf(buffer: Buffer): Promise<Buffer> {
  const pdfDoc = await PDFDocument.load(buffer, {
    ignoreEncryption: true,
    updateMetadata: false,
  });

  // Limpar metadados pesados (XMP, etc.)
  pdfDoc.setTitle("");
  pdfDoc.setAuthor("");
  pdfDoc.setSubject("");
  pdfDoc.setKeywords([]);
  pdfDoc.setProducer("");
  pdfDoc.setCreator("");

  const bytes = await pdfDoc.save({
    useObjectStreams: true,
    addDefaultPage: false,
  });

  return Buffer.from(bytes);
}

// ─── Passo 2: render pages como JPEG ─────────────────────────────────────────

/**
 * Renderiza cada página do PDF como imagem JPEG em DPI reduzido,
 * depois cria um novo PDF com essas imagens embutidas.
 *
 * Muito eficaz para PDFs digitalizados (scanned) onde cada página
 * é uma imagem em alta resolução.
 *
 * Retorna null se não conseguir renderizar (ex: PDF protegido).
 */
async function renderPagesAsJpegPdf(
  buffer: Buffer,
  targetDpi: number,
  jpegQuality: number
): Promise<Buffer | null> {
  // Dynamic imports — estas libs já estão no projeto
  const { getDocumentProxy, renderPageAsImage } = await import("unpdf");
  const canvas = await import("@napi-rs/canvas");

  const data = new Uint8Array(buffer);
  const pdf = await getDocumentProxy(data);
  const numPages = (pdf as { numPages: number }).numPages;
  const pagesToProcess = Math.min(numPages, MAX_RENDER_PAGES);

  if (pagesToProcess <= 0) {
    return null;
  }

  // Calcular scale: renderPageAsImage usa 96 DPI base, scale multiplica isso
  const scale = targetDpi / 96;

  const newPdf = await PDFDocument.create();

  for (let i = 1; i <= pagesToProcess; i += 1) {
    try {
      // Renderizar página como PNG via unpdf + @napi-rs/canvas
      const imageBuffer = await renderPageAsImage(data, i, {
        canvasImport: () => import("@napi-rs/canvas"),
        scale,
      });

      if (!imageBuffer || imageBuffer.byteLength < 100) {
        continue;
      }

      // Converter PNG → JPEG com qualidade reduzida via @napi-rs/canvas
      const img = await canvas.loadImage(Buffer.from(imageBuffer));
      const jpegCanvas = canvas.createCanvas(img.width, img.height);
      const ctx = jpegCanvas.getContext("2d");
      ctx.drawImage(img, 0, 0);
      const jpegBuffer = jpegCanvas.toBuffer("image/jpeg", jpegQuality);

      // Embutir JPEG no novo PDF
      const jpegImage = await newPdf.embedJpg(jpegBuffer);
      const page = newPdf.addPage([jpegImage.width, jpegImage.height]);
      page.drawImage(jpegImage, {
        x: 0,
        y: 0,
        width: jpegImage.width,
        height: jpegImage.height,
      });
    } catch {
      // Página falhou — pular e continuar
    }
  }

  if (newPdf.getPageCount() === 0) {
    return null;
  }

  const bytes = await newPdf.save({ useObjectStreams: true });
  return Buffer.from(bytes);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function skipResult(
  buffer: Buffer,
  sizeBefore: number,
  t0: number,
  error?: string
): PdfOptimizeResult {
  return {
    success: !error,
    error,
    outputBuffer: buffer,
    sizeBefore,
    sizeAfter: sizeBefore,
    reductionPercent: 0,
    durationMs: Date.now() - t0,
    method: "skip",
  };
}

function buildResult(
  originalBuffer: Buffer,
  optimizedBuffer: Buffer,
  sizeBefore: number,
  t0: number,
  method: "resave" | "render"
): PdfOptimizeResult {
  const sizeAfter = optimizedBuffer.length;

  // Se cresceu, usar original
  if (sizeAfter >= sizeBefore) {
    return skipResult(originalBuffer, sizeBefore, t0);
  }

  const reductionPercent = Math.round(
    ((sizeBefore - sizeAfter) / sizeBefore) * 100
  );
  const durationMs = Date.now() - t0;

  if (isDev) {
    console.info(
      `${TAG} Concluído (${method}): ${fmtBytes(sizeBefore)} → ${fmtBytes(sizeAfter)} (-${reductionPercent}%) em ${durationMs}ms`
    );
  }

  return {
    success: true,
    outputBuffer: optimizedBuffer,
    sizeBefore,
    sizeAfter,
    reductionPercent,
    durationMs,
    method,
  };
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
