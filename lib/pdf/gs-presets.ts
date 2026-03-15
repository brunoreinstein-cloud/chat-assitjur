/**
 * lib/pdf/gs-presets.ts
 *
 * Presets de qualidade para o PDF optimizer (pure-JS).
 * Define DPI de renderização e qualidade JPEG para cada modo.
 */

export interface OptimizePreset {
  /** Nome legível do preset */
  label: string;
  /** DPI de destino para renderização de páginas (scanned PDFs) */
  dpi: number;
  /** Qualidade JPEG (0–100) para imagens re-codificadas */
  jpegQuality: number;
}

export const OPTIMIZE_PRESETS = {
  /** 72 DPI, JPEG 50%. Máxima compressão, OK para visualização em tela. */
  screen: {
    label: "Screen (72 DPI)",
    dpi: 72,
    jpegQuality: 50,
  },
  /** 150 DPI, JPEG 75%. Bom equilíbrio para upload e OCR. Default. */
  ebook: {
    label: "eBook (150 DPI)",
    dpi: 150,
    jpegQuality: 75,
  },
  /** 300 DPI, JPEG 90%. Para impressão ou export final. */
  printer: {
    label: "Printer (300 DPI)",
    dpi: 300,
    jpegQuality: 90,
  },
} as const satisfies Record<string, OptimizePreset>;

export type OptimizePresetName = keyof typeof OPTIMIZE_PRESETS;
