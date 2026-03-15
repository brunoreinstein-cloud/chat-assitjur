import type { Attachment } from "@/lib/types";

export interface ExtractionQuality {
  /** Nível: "high" | "medium" | "low" | "none" */
  level: "high" | "medium" | "low" | "none";
  /** Label curto para badges (ex.: "✓ Completo · 487 págs") */
  label: string;
  /** Classe CSS Tailwind para background/text */
  color: string;
  /** Tooltip descritivo */
  title: string;
  /** Total de caracteres extraídos */
  chars: number;
  /** Número de páginas (se disponível) */
  pages?: number;
  /** Caracteres por página (se disponível) */
  charsPerPage?: number;
}

/**
 * Avalia a qualidade da extração de texto de um attachment.
 * Retorna null se não há informação de extração.
 */
export function getExtractionQuality(
  attachment: Attachment
): ExtractionQuality | null {
  if (attachment.extractionFailed) {
    return {
      level: "none",
      label: "✗ Sem texto",
      color: "bg-red-500/15 text-red-700 dark:text-red-400",
      title:
        "Não foi possível extrair texto. O PDF pode ser apenas imagem (scan) sem camada de texto.",
      chars: 0,
    };
  }

  const text = attachment.extractedText;
  if (typeof text !== "string" || text.trim().length === 0) {
    return null;
  }

  const chars = text.length;
  const pages = attachment.pageCount;
  const pagesLabel = pages ? ` · ${pages} págs` : "";
  const charsPerPage =
    pages && pages > 0 ? Math.round(chars / pages) : undefined;
  const charsFormatted =
    chars >= 1000 ? `${(chars / 1000).toFixed(0)}k` : `${chars}`;

  if (chars < 500) {
    return {
      level: "low",
      label: `⚠ Baixa${pagesLabel}`,
      color: "bg-red-500/15 text-red-700 dark:text-red-400",
      title: `Texto extraído muito curto (${charsFormatted} chars${pagesLabel}). Verifique se o PDF tem camada de texto ou tente colar o texto manualmente.`,
      chars,
      pages: pages ?? undefined,
      charsPerPage,
    };
  }

  if (charsPerPage !== undefined && charsPerPage < 200) {
    return {
      level: "low",
      label: `⚠ Parcial${pagesLabel}`,
      color: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
      title: `Extração parcial (~${charsPerPage} chars/pág, esperado ~1500+). O PDF pode ter imagens ou scans sem OCR em algumas páginas.`,
      chars,
      pages: pages ?? undefined,
      charsPerPage,
    };
  }

  if (charsPerPage !== undefined && charsPerPage < 800) {
    return {
      level: "medium",
      label: `~ Razoável${pagesLabel}`,
      color: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
      title: `Extração razoável (~${charsPerPage} chars/pág). Algumas páginas podem ter conteúdo gráfico não extraído.`,
      chars,
      pages: pages ?? undefined,
      charsPerPage,
    };
  }

  return {
    level: "high",
    label: `✓ Completo${pagesLabel}`,
    color: "bg-green-500/15 text-green-700 dark:text-green-400",
    title: `Boa extração (${charsFormatted} chars${pagesLabel}${charsPerPage ? `, ~${charsPerPage} chars/pág` : ""}).`,
    chars,
    pages: pages ?? undefined,
    charsPerPage,
  };
}
