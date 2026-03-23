/** Pure utility functions for the knowledge sidebar (no React). */

import {
  ACCEPTED_EXTENSIONS,
  COVERAGE_FULL_LIMIT,
  COVERAGE_SAMPLED_LIMIT,
  LEGAL_DOC_RE,
  MAX_FILE_SIZE_BYTES,
} from "@/lib/knowledge/constants";

/** Avalia a cobertura esperada de um documento com base no tamanho e tipo. */
export function getDocumentCoverageInfo(
  contentLength: number,
  documentType?: string
): {
  level: "full" | "structured" | "sampled" | "truncated";
  label: string;
  detail: string;
} {
  const isLegal = documentType ? LEGAL_DOC_RE.test(documentType) : false;
  if (contentLength <= COVERAGE_FULL_LIMIT) {
    return {
      level: "full",
      label: "Cobertura total",
      detail: `${Math.round(contentLength / 1000)}k chars — documento completo no contexto`,
    };
  }
  if (isLegal && contentLength <= COVERAGE_SAMPLED_LIMIT) {
    return {
      level: "structured",
      label: "Resumo estruturado",
      detail: `${Math.round(contentLength / 1000)}k chars — PI/Contestação: resumo estruturado em geração (~10s)`,
    };
  }
  if (isLegal) {
    return {
      level: "sampled",
      label: "Resumo com amostragem",
      detail: `${Math.round(contentLength / 1000)}k chars — documento muito grande; início+fim amostrados`,
    };
  }
  return {
    level: "truncated",
    label: "⚠️ Truncado",
    detail: `${Math.round(contentLength / 1000)}k chars — excede 80k; texto será truncado. Considere dividir o documento.`,
  };
}

/** Extrai informações do resumo estruturado para exibir no badge. */
export function parseSummaryBadge(summary: string): {
  docType: "pi" | "contestacao";
  pedidosCount: number;
  isPartial: boolean;
} {
  const isPI = summary.includes("Petição Inicial");
  const docType = isPI ? "pi" : "contestacao";
  // Conta linhas de tabela de pedidos (linhas com | que não são cabeçalho/separador)
  const tableRows = summary.match(/^\|\s*\d+\s*\|/gm);
  const pedidosCount = tableRows?.length ?? 0;
  const isPartial =
    summary.includes("NÃO VISÍVEL") || summary.includes("não visível");
  return { docType, pedidosCount, isPartial };
}

/** Filtra ficheiros por extensão e tamanho (útil quando vêm de uma pasta). */
export function filterAcceptedFiles(files: File[]): File[] {
  return files.filter(
    (f) => f.size <= MAX_FILE_SIZE_BYTES && ACCEPTED_EXTENSIONS.test(f.name)
  );
}
