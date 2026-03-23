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

export interface MonetaryMatch {
  /** Ex.: "R$ 1.234,56" */
  value: string;
  /** Label inferido do contexto (salário, valor da causa, FGTS, horas extras, dano moral, verbas rescisórias, multa, outro). */
  label: string;
  /** ~80 chars antes do match. */
  context: string;
}

export interface PercentageMatch {
  /** Ex.: "40%" */
  value: string;
  /** Label inferido (adicional noturno, FGTS multa, horas extras, insalubridade, periculosidade, outro). */
  label: string;
  /** ~80 chars antes do match. */
  context: string;
}

export interface StructuredFields {
  oabNumbers: OabMatch[];
  cnjProcessNumber: string | null;
  dates: DateMatch[];
  hearingInfo: ContextSnippet[];
  positionRole: ContextSnippet[];
  monetaryValues: MonetaryMatch[];
  percentages: PercentageMatch[];
}

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

const MAX_OAB = 10;
const MAX_DATES = 20;
const MAX_HEARING = 5;
const MAX_POSITION = 10;
const MAX_MONETARY = 20;
const MAX_PERCENTAGES = 15;

// ---------------------------------------------------------------------------
// Regex patterns (case-insensitive, Unicode)
// ---------------------------------------------------------------------------

const OAB_RE = /OAB\s*[/\\]\s*[A-Z]{2}\s*(?:n[ºo°]?\s*)?\d{3,6}/gi;
const CNJ_RE = /\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}/;
const DATE_RE = /\d{2}\/\d{2}\/\d{4}/g;
const HEARING_RE = /audi[eê]ncia/gi;
const POSITION_RE = /\b(?:cargo|fun[cç][aã]o|fun[cç][oõ]es)\b/gi;

// Valores monetários: R$ 1.234,56 ou R$1234 ou R$ 10.000,00
const MONETARY_RE = /R\$\s*\d{1,3}(?:[.\s]?\d{3})*(?:,\d{1,2})?/gi;

// Percentuais: 40%, 50,5%, etc.
const PERCENTAGE_RE = /\d{1,3}(?:[,.]\d{1,2})?\s*%/g;

/** Keywords para classificar valores monetários pelo contexto. */
const MONETARY_LABELS: Array<{ re: RegExp; label: string }> = [
  { re: /sal[aá]rio|remunera[çc][ãa]o|piso/i, label: "salário" },
  { re: /valor\s+da\s+causa/i, label: "valor da causa" },
  { re: /FGTS|fundo\s+de\s+garantia/i, label: "FGTS" },
  { re: /horas?\s+extras?|HE\b|sobrejornada/i, label: "horas extras" },
  { re: /dano\s+moral|indeniza[çc][ãa]o/i, label: "dano moral" },
  {
    re: /verbas?\s+rescis[oó]rias?|TRCT|saldo|aviso\s+pr[ée]vio|f[ée]rias|13[ºo°]/i,
    label: "verbas rescisórias",
  },
  { re: /multa/i, label: "multa" },
];

/** Keywords para classificar percentuais pelo contexto. */
const PERCENTAGE_LABELS: Array<{ re: RegExp; label: string }> = [
  { re: /adicional\s+noturno/i, label: "adicional noturno" },
  { re: /FGTS|multa\s+de\s+40/i, label: "FGTS multa" },
  { re: /horas?\s+extras?/i, label: "horas extras" },
  { re: /insalubridade/i, label: "insalubridade" },
  { re: /periculosidade/i, label: "periculosidade" },
];

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

function inferMonetaryLabel(context: string): string {
  for (const { re, label } of MONETARY_LABELS) {
    if (re.test(context)) {
      return label;
    }
  }
  return "outro";
}

function inferPercentageLabel(context: string): string {
  for (const { re, label } of PERCENTAGE_LABELS) {
    if (re.test(context)) {
      return label;
    }
  }
  return "outro";
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

  // Valores monetários
  const monetaryMatches: MonetaryMatch[] = [];
  for (const match of fullText.matchAll(MONETARY_RE)) {
    if (monetaryMatches.length >= MAX_MONETARY) {
      break;
    }
    const idx = match.index ?? 0;
    const ctx = snippet(fullText, idx - 80, idx);
    monetaryMatches.push({
      value: match[0].trim(),
      label: inferMonetaryLabel(ctx),
      context: ctx,
    });
  }

  // Percentuais
  const percentageMatches: PercentageMatch[] = [];
  for (const match of fullText.matchAll(PERCENTAGE_RE)) {
    if (percentageMatches.length >= MAX_PERCENTAGES) {
      break;
    }
    const idx = match.index ?? 0;
    const ctx = snippet(fullText, idx - 80, idx);
    percentageMatches.push({
      value: match[0].trim(),
      label: inferPercentageLabel(ctx),
      context: ctx,
    });
  }

  return {
    oabNumbers: deduplicateOab(oabMatches),
    cnjProcessNumber: cnjMatch?.[0] ?? null,
    dates: deduplicateDates(dateMatches),
    hearingInfo: hearingMatches,
    positionRole: positionMatches,
    monetaryValues: monetaryMatches,
    percentages: percentageMatches,
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

  if (fields.monetaryValues.length > 0) {
    const labeled = fields.monetaryValues.filter((m) => m.label !== "outro");
    if (labeled.length > 0) {
      const grouped = new Map<string, string[]>();
      for (const m of labeled) {
        const existing = grouped.get(m.label);
        if (existing) {
          if (!existing.includes(m.value)) {
            existing.push(m.value);
          }
        } else {
          grouped.set(m.label, [m.value]);
        }
      }
      const parts: string[] = [];
      for (const [label, values] of grouped) {
        parts.push(`${label}: ${values.join(", ")}`);
      }
      lines.push(`Valores: ${parts.join(" | ")}`);
    }
  }

  if (fields.percentages.length > 0) {
    const labeled = fields.percentages.filter((p) => p.label !== "outro");
    if (labeled.length > 0) {
      const parts = labeled.map((p) => `${p.label}: ${p.value}`);
      const unique = [...new Set(parts)].slice(0, 8);
      lines.push(`Percentuais: ${unique.join(" | ")}`);
    }
  }

  if (lines.length === 0) {
    return "";
  }

  return `[CAMPOS EXTRAÍDOS POR REGEX — texto completo, antes de truncagem]\n${lines.join("\n")}\n[/CAMPOS EXTRAÍDOS]`;
}
