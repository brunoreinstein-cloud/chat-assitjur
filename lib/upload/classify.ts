/** Document type classification: filename-based and text-based heuristics. */

/** Tipo de documento classificado (PI ou Contestação). */
export type DocumentType = "pi" | "contestacao";

/** Amostra do início do texto para classificação (evita analisar o doc inteiro). */
const CLASSIFY_SAMPLE_LENGTH = 6000;

/**
 * Mapeia o tipo de documento devolvido pela IA (metadados) para "pi" | "contestacao".
 * Usado como fallback quando a classificação por regex não identifica o tipo.
 */
export function mapMetadataDocumentType(
  raw: string | undefined
): DocumentType | undefined {
  if (raw == null || raw.trim().length === 0) {
    return undefined;
  }
  const n = raw.trim().toLowerCase();
  if (
    n.includes("contestação") ||
    n.includes("contestacao") ||
    n.includes("contestaçao") ||
    n === "contestação" ||
    n === "contestacao" ||
    n.startsWith("contest")
  ) {
    return "contestacao";
  }
  if (
    n.includes("petição inicial") ||
    n.includes("peticao inicial") ||
    n === "pi" ||
    n === "petição" ||
    n.startsWith("petição inicial")
  ) {
    return "pi";
  }
  return undefined;
}

/**
 * Classifica o tipo de documento (PI ou Contestação) pelo nome do ficheiro.
 * Usado como preferência quando o utilizador nomeia o ficheiro de forma explícita (ex.: "Contestação - RO.pdf").
 * Exportado para uso na rota de processamento (ficheiros grandes).
 */
export function classifyDocumentTypeFromFilename(
  filename: string
): DocumentType | undefined {
  const n = filename.toLowerCase().replaceAll(/\s+/g, " ");
  const looksLikeContestacao =
    n.includes("contest") ||
    n.includes("defesa") ||
    n.includes("reclamado") ||
    n.includes("impugna");
  const looksLikePi =
    (n.includes("inicial") ||
      n.includes("petição") ||
      n.includes("peticao") ||
      n.includes("reclamante")) &&
    !looksLikeContestacao;
  if (looksLikeContestacao) {
    return "contestacao";
  }
  if (looksLikePi) {
    return "pi";
  }
  return undefined;
}

/**
 * Classifica o tipo de documento (PI ou Contestação) por padrões no texto.
 * Usa apenas o início do documento; retorna undefined se não houver indício claro.
 */
export function classifyDocumentType(text: string): DocumentType | undefined {
  const sample = text.slice(0, CLASSIFY_SAMPLE_LENGTH).toUpperCase();
  const piMarkers = [
    /\bPETI[CÇ][AÃ]O\s+INICIAL\b/,
    /\bRECLAMANTE\s*[:\s]/,
    /\bRECLAMA[CÇ][AÃ]O\s+TRABALHISTA\b/,
    /\bEXCELENT[IÍ]SSIMO\s*\(?\s*A?\s*\)?\s*SENHOR\s*\(?\s*A?\s*\)?\s*JUIZ/,
    /\bDOS\s+FATOS\b/,
    /\bAJUIZAMENTO\b/,
  ];
  const contestacaoMarkers = [
    /\bCONTESTA[CÇ][AÃ]O\b/,
    /\bAPRESENTAR\s+CONTESTA[CÇ][AÃ]O\b/,
    /\bIMPUGNA\b/,
    /\bIMPUGNA[CÇ][AÃ]O\b/,
    /\bRECLAMADO\s*[:\s]/,
    /\bDEFESA\s+(?:DO\s+)?RECLAMADO\b/,
    /\bCONTESTA[CÇ][AÃ]O\s+AOS?\s+PEDIDOS?\b/,
    /\b(?:EM\s+)?RESPOSTA\s+[ÀA]\s+(?:RECLAMA[CÇ][AÃ]O|PETI[CÇ][AÃ]O)\b/,
    /\bNEGA\s+(?:INTEGRALMENTE|EM\s+PARTE)\b/,
    /\bCONTESTA[CÇ][AÃ]O\s+ÀS?\s+INICIAL\b/,
    /\bDEFESA\s+(?:PR[EÉ]VIA|APRESENTADA)\b/,
    /\b(?:VEM\s+)?(?:O\s+)?RECLAMADO\s+[AÀ]\s+PRESEN/,
  ];
  let piScore = 0;
  let contestacaoScore = 0;
  for (const re of piMarkers) {
    if (re.test(sample)) {
      piScore += 1;
    }
  }
  for (const re of contestacaoMarkers) {
    if (re.test(sample)) {
      contestacaoScore += 1;
    }
  }
  if (contestacaoScore > piScore) {
    return "contestacao";
  }
  if (piScore > contestacaoScore) {
    return "pi";
  }
  if (contestacaoScore > 0) {
    return "contestacao";
  }
  if (piScore > 0) {
    return "pi";
  }
  return undefined;
}
