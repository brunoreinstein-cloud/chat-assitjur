/**
 * lib/pdf/suggest-filename.ts
 *
 * Sugere nome de arquivo seguindo boas práticas de organização jurídica.
 * Formato: [TIPO]-[Nº PROCESSO]-[PARTE]-[ANO].pdf
 */

/** Regex para número de processo no formato CNJ. */
const CNJ_REGEX = /\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}/;

/** Mapeamento de palavras-chave → tipo de documento. */
const DOC_TYPE_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /peti[çc][ãa]o\s+inicial/i, label: "PI" },
  { pattern: /contesta[çc][ãa]o/i, label: "Contestacao" },
  { pattern: /recurso\s+ordin[áa]rio/i, label: "RO" },
  { pattern: /recurso\s+de\s+revista/i, label: "RR" },
  { pattern: /agravo/i, label: "Agravo" },
  { pattern: /embargos?\s+de\s+declara[çc][ãa]o/i, label: "ED" },
  { pattern: /senten[çc]a/i, label: "Sentenca" },
  { pattern: /ac[óo]rd[ãa]o/i, label: "Acordao" },
  { pattern: /laudo\s+pericial/i, label: "Laudo" },
  { pattern: /procura[çc][ãa]o/i, label: "Procuracao" },
  { pattern: /mandado/i, label: "Mandado" },
  { pattern: /ata\s+de\s+audi[êe]ncia/i, label: "Ata-Audiencia" },
];

/** Regex para encontrar nome de parte após label. */
const PARTY_PATTERNS = [
  /reclamante[:\s]+([A-ZÀ-Ü][a-zà-ü]+(?:\s+[A-ZÀ-Ü][a-zà-ü]+){1,4})/,
  /autor[a]?[:\s]+([A-ZÀ-Ü][a-zà-ü]+(?:\s+[A-ZÀ-Ü][a-zà-ü]+){1,4})/i,
  /reclamad[oa][:\s]+([A-ZÀ-Ü][a-zà-ü]+(?:\s+[A-ZÀ-Ü][a-zà-ü]+){1,4})/,
  /r[eé]u[:\s]+([A-ZÀ-Ü][a-zà-ü]+(?:\s+[A-ZÀ-Ü][a-zà-ü]+){1,4})/i,
];

/** Metadados extraídos do texto do PDF. */
export interface PdfMetadata {
  /** Número do processo no formato CNJ, se detectado. */
  cnj: string | null;
  /** Tipo de documento detectado (PI, Contestacao, RO, etc.). */
  docType: string | null;
  /** Nome da parte principal detectada. */
  party: string | null;
}

/**
 * Extrai metadados jurídicos do texto do PDF: número CNJ, tipo de documento e partes.
 */
export function extractMetadata(extractedText: string): PdfMetadata {
  const text = extractedText.slice(0, 6000);

  const cnjMatch = text.match(CNJ_REGEX);
  const cnj = cnjMatch ? cnjMatch[0] : null;

  let docType: string | null = null;
  for (const { pattern, label } of DOC_TYPE_PATTERNS) {
    if (pattern.test(text)) {
      docType = label;
      break;
    }
  }

  let party: string | null = null;
  for (const pat of PARTY_PATTERNS) {
    const match = text.match(pat);
    if (match?.[1]) {
      party = match[1].trim();
      break;
    }
  }

  return { cnj, docType, party };
}

function sanitize(str: string): string {
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

/**
 * Sugere um nome de arquivo baseado no conteúdo extraído do PDF.
 * Formato: [TIPO]-[Nº PROCESSO]-[PARTE]-[ANO].pdf
 * Fallback: documento-comprimido-YYYY-MM-DD.pdf
 */
export function suggestFilename(
  extractedText: string,
  originalName: string
): string {
  const text = extractedText.slice(0, 6000);
  const year = new Date().getFullYear();

  // Detectar número do processo (CNJ)
  const cnjMatch = text.match(CNJ_REGEX);
  const cnj = cnjMatch ? cnjMatch[0] : null;

  // Detectar tipo de documento
  let docType = "Documento";
  for (const { pattern, label } of DOC_TYPE_PATTERNS) {
    if (pattern.test(text)) {
      docType = label;
      break;
    }
  }

  // Detectar parte principal
  let party: string | null = null;
  for (const pattern of PARTY_PATTERNS) {
    const match = text.match(pattern);
    if (match?.[1]) {
      party = match[1].trim();
      break;
    }
  }

  // Montar nome
  const parts: string[] = [docType];

  if (cnj) {
    parts.push(cnj);
  }

  if (party) {
    parts.push(sanitize(party));
  }

  parts.push(String(year));

  const suggested = parts.join("-");

  // Se não encontrou nada útil, usar fallback
  if (!(cnj || party) && docType === "Documento") {
    const base = originalName.replace(/\.pdf$/i, "");
    const clean = sanitize(base);
    return `${clean || "documento"}-comprimido-${year}.pdf`;
  }

  return `${suggested}.pdf`;
}
