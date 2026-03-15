/**
 * Extração rápida de campos estruturados via regex — corre no texto COMPLETO
 * antes de qualquer truncagem, para que OAB, datas, audiência e cargo/função
 * nunca se percam por limite de contexto.
 */

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export interface OabMatch {
  /** Ex.: "OAB/SP nº 98504" */
  oab: string;
  /** ~100 chars antes do match (inclui nome do advogado). */
  context: string;
}

export interface DateMatch {
  /** Ex.: "10/02/2026" */
  date: string;
  /** Label inferido do contexto (admissão, rescisão, audiência, ajuizamento, término, outro). */
  label: string;
  /** ~80 chars antes do match (contexto curto). */
  context: string;
}

export interface ContextSnippet {
  /** Trecho de ~200 chars ao redor do match. */
  context: string;
}

export interface StructuredFields {
  oabNumbers: OabMatch[];
  cnjProcessNumber: string | null;
  dates: DateMatch[];
  hearingInfo: ContextSnippet[];
  positionRole: ContextSnippet[];
}

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

const MAX_OAB = 10;
const MAX_DATES = 20;
const MAX_HEARING = 5;
const MAX_POSITION = 10;

// ---------------------------------------------------------------------------
// Regex patterns (case-insensitive, Unicode)
// ---------------------------------------------------------------------------

const OAB_RE = /OAB\s*[/\\]\s*[A-Z]{2}\s*(?:n[ºo°]?\s*)?\d{3,6}/gi;
const CNJ_RE = /\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}/;
const DATE_RE = /\d{2}\/\d{2}\/\d{4}/g;
const HEARING_RE = /audi[eê]ncia/gi;
const POSITION_RE = /\b(?:cargo|fun[cç][aã]o|fun[cç][oõ]es)\b/gi;

/** Keywords para classificar datas pelo contexto que as precede. */
const DATE_LABELS: Array<{ re: RegExp; label: string }> = [
  { re: /admiss[ãa]o|admitid[oa]/i, label: "admissão" },
  { re: /resc(?:is[ãa]o|indid)|despedid|dispens/i, label: "rescisão" },
  { re: /audi[eê]ncia/i, label: "audiência" },
  { re: /ajuizamento|distribui[çc][ãa]o/i, label: "ajuizamento" },
  { re: /t[eé]rmino|desligad|sa[ií]da/i, label: "término" },
  { re: /nascimento/i, label: "nascimento" },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function snippet(text: string, start: number, end: number): string {
  const s = Math.max(0, start);
  const e = Math.min(text.length, end);
  return text.slice(s, e).replaceAll(/\s+/g, " ").trim();
}

function inferDateLabel(context: string): string {
  for (const { re, label } of DATE_LABELS) {
    if (re.test(context)) {
      return label;
    }
  }
  return "outro";
}

/** Deduplica OAB matches pelo número normalizado. */
function deduplicateOab(matches: OabMatch[]): OabMatch[] {
  const seen = new Set<string>();
  return matches.filter((m) => {
    const normalized = m.oab.replaceAll(/\s+/g, "").toUpperCase();
    if (seen.has(normalized)) {
      return false;
    }
    seen.add(normalized);
    return true;
  });
}

/** Deduplica datas idênticas com mesmo label. */
function deduplicateDates(matches: DateMatch[]): DateMatch[] {
  const seen = new Set<string>();
  return matches.filter((m) => {
    const key = `${m.date}|${m.label}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

// ---------------------------------------------------------------------------
// Extração principal
// ---------------------------------------------------------------------------

/**
 * Extrai campos estruturados do texto completo (antes de truncagem).
 * Síncrono e rápido (~10-50ms em textos de 1M chars).
 */
export function extractStructuredFields(fullText: string): StructuredFields {
  // OAB
  const oabMatches: OabMatch[] = [];
  for (const match of fullText.matchAll(OAB_RE)) {
    if (oabMatches.length >= MAX_OAB) {
      break;
    }
    oabMatches.push({
      oab: match[0].trim(),
      context: snippet(
        fullText,
        match.index - 100,
        match.index + match[0].length
      ),
    });
  }

  // CNJ
  const cnjMatch = fullText.match(CNJ_RE);

  // Datas
  const dateMatches: DateMatch[] = [];
  for (const match of fullText.matchAll(DATE_RE)) {
    if (dateMatches.length >= MAX_DATES) {
      break;
    }
    const ctx = snippet(fullText, match.index - 80, match.index);
    dateMatches.push({
      date: match[0],
      label: inferDateLabel(ctx),
      context: ctx,
    });
  }

  // Audiência
  const hearingMatches: ContextSnippet[] = [];
  for (const match of fullText.matchAll(HEARING_RE)) {
    if (hearingMatches.length >= MAX_HEARING) {
      break;
    }
    hearingMatches.push({
      context: snippet(
        fullText,
        match.index - 100,
        match.index + match[0].length + 100
      ),
    });
  }

  // Cargo / Função
  const positionMatches: ContextSnippet[] = [];
  for (const match of fullText.matchAll(POSITION_RE)) {
    if (positionMatches.length >= MAX_POSITION) {
      break;
    }
    positionMatches.push({
      context: snippet(
        fullText,
        match.index - 75,
        match.index + match[0].length + 75
      ),
    });
  }

  return {
    oabNumbers: deduplicateOab(oabMatches),
    cnjProcessNumber: cnjMatch?.[0] ?? null,
    dates: deduplicateDates(dateMatches),
    hearingInfo: hearingMatches,
    positionRole: positionMatches,
  };
}

// ---------------------------------------------------------------------------
// Formatação para injeção no prompt
// ---------------------------------------------------------------------------

/**
 * Formata os campos extraídos como bloco de texto compacto (~300-800 chars)
 * para ser prepended ao texto truncado do documento no prompt.
 * Retorna string vazia se nenhum campo relevante foi encontrado.
 */
export function formatStructuredFieldsAsHeader(
  fields: StructuredFields
): string {
  const lines: string[] = [];

  if (fields.cnjProcessNumber) {
    lines.push(`Processo: ${fields.cnjProcessNumber}`);
  }

  if (fields.oabNumbers.length > 0) {
    const oabs = fields.oabNumbers
      .map((o) => `${o.oab} (${o.context})`)
      .join("; ");
    lines.push(`OAB: ${oabs}`);
  }

  const relevantDates = fields.dates.filter((d) => d.label !== "outro");
  if (relevantDates.length > 0) {
    const grouped = new Map<string, string[]>();
    for (const d of relevantDates) {
      const existing = grouped.get(d.label);
      if (existing) {
        if (!existing.includes(d.date)) {
          existing.push(d.date);
        }
      } else {
        grouped.set(d.label, [d.date]);
      }
    }
    const parts: string[] = [];
    for (const [label, dates] of grouped) {
      parts.push(`${label}: ${dates.join(", ")}`);
    }
    lines.push(`Datas: ${parts.join(" | ")}`);
  }

  if (fields.hearingInfo.length > 0) {
    lines.push(
      `Audiência: ${fields.hearingInfo.map((h) => h.context).join(" | ")}`
    );
  }

  if (fields.positionRole.length > 0) {
    const unique = [
      ...new Set(fields.positionRole.map((p) => p.context)),
    ].slice(0, 5);
    lines.push(`Cargo/Função: ${unique.join(" | ")}`);
  }

  if (lines.length === 0) {
    return "";
  }

  return `[CAMPOS EXTRAÍDOS POR REGEX — texto completo, antes de truncagem]\n${lines.join("\n")}\n[/CAMPOS EXTRAÍDOS]`;
}
