/**
 * Validação cruzada PI × Contestação — compara campos extraídos de ambos
 * os documentos para detectar divergências relevantes (cargo, salário,
 * datas, jornada, pedidos não impugnados).
 *
 * Módulo síncrono (regex-based), sem chamadas a LLM.
 */

import type { StructuredFields } from "./extract-structured-fields";

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export type DivergenceField =
  | "cargo"
  | "salário"
  | "admissão"
  | "término"
  | "rescisão"
  | "jornada"
  | "pedido_nao_impugnado";

export type DivergenceSeverity = "critico" | "atencao" | "info";

export interface CrossDocDivergence {
  field: DivergenceField;
  piValue: string | null;
  contestacaoValue: string | null;
  severity: DivergenceSeverity;
  description: string;
}

export interface CrossDocValidationResult {
  divergences: CrossDocDivergence[];
  formattedHeader: string;
  hasData: boolean;
}

// ---------------------------------------------------------------------------
// Regex para jornada/escala
// ---------------------------------------------------------------------------

const JORNADA_RE =
  /\b(?:jornada|escala|hor[aá]rio|turno|12\s*x\s*36|6\s*x\s*1|5\s*x\s*2|44\s*h)/gi;
const MAX_JORNADA = 5;

function extractJornadaSnippets(fullText: string): string[] {
  const results: string[] = [];
  for (const match of fullText.matchAll(JORNADA_RE)) {
    if (results.length >= MAX_JORNADA) {
      break;
    }
    const idx = match.index ?? 0;
    const start = Math.max(0, idx - 60);
    const end = Math.min(fullText.length, idx + match[0].length + 60);
    const ctx = fullText.slice(start, end).replaceAll(/\s+/g, " ").trim();
    results.push(ctx);
  }
  return results;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normalizeCargo(snippets: Array<{ context: string }>): string | null {
  if (snippets.length === 0) {
    return null;
  }
  // Extrair o trecho mais relevante (pegar a primeira menção com contexto)
  return snippets[0].context.toLowerCase().trim();
}

function findMonetaryByLabel(
  fields: StructuredFields,
  label: string
): string | null {
  const match = fields.monetaryValues.find((m) => m.label === label);
  return match?.value ?? null;
}

function findDateByLabel(
  fields: StructuredFields,
  label: string
): string | null {
  const match = fields.dates.find((d) => d.label === label);
  return match?.date ?? null;
}

/** Extrai pedidos "NÃO VISÍVEL" do summary da Contestação. */
function extractPedidosNaoVisiveis(
  contestacaoSummary: string | null | undefined
): string[] {
  if (!contestacaoSummary) {
    return [];
  }
  const results: string[] = [];
  // Procura linhas da tabela de impugnações com "NÃO VISÍVEL"
  const lines = contestacaoSummary.split("\n");
  for (const line of lines) {
    if (/NÃO\s+VIS[IÍ]VEL/i.test(line)) {
      // Extrair nome do pedido da primeira coluna da tabela
      const match = line.match(/\|\s*([^|]+)\s*\|\s*NÃO\s+VIS/i);
      if (match?.[1]) {
        results.push(match[1].trim());
      }
    }
  }
  return results;
}

const SEVERITY_ICONS: Record<DivergenceSeverity, string> = {
  critico: "🔴",
  atencao: "⚠️",
  info: "ℹ️",
};

// ---------------------------------------------------------------------------
// Validação principal
// ---------------------------------------------------------------------------

export function validateCrossDocuments(
  piFields: StructuredFields,
  contestacaoFields: StructuredFields,
  _piSummary?: string | null,
  contestacaoSummary?: string | null,
  piFullText?: string,
  contestacaoFullText?: string
): CrossDocValidationResult {
  const divergences: CrossDocDivergence[] = [];

  // 1. Cargo / Função
  const piCargo = normalizeCargo(piFields.positionRole);
  const contestCargo = normalizeCargo(contestacaoFields.positionRole);
  if (piCargo && contestCargo && piCargo !== contestCargo) {
    divergences.push({
      field: "cargo",
      piValue: piFields.positionRole[0]?.context ?? null,
      contestacaoValue: contestacaoFields.positionRole[0]?.context ?? null,
      severity: "atencao",
      description: "Cargo divergente entre PI e Contestação",
    });
  }

  // 2. Salário
  const piSalario = findMonetaryByLabel(piFields, "salário");
  const contestSalario = findMonetaryByLabel(contestacaoFields, "salário");
  if (piSalario && contestSalario && piSalario !== contestSalario) {
    divergences.push({
      field: "salário",
      piValue: piSalario,
      contestacaoValue: contestSalario,
      severity: "critico",
      description: `Salário divergente: PI ${piSalario} vs Contestação ${contestSalario}`,
    });
  }

  // 3. Datas (admissão, término, rescisão)
  for (const label of ["admissão", "término", "rescisão"] as const) {
    const piDate = findDateByLabel(piFields, label);
    const contestDate = findDateByLabel(contestacaoFields, label);
    if (piDate && contestDate && piDate !== contestDate) {
      divergences.push({
        field: label,
        piValue: piDate,
        contestacaoValue: contestDate,
        severity: "critico",
        description: `Data de ${label} divergente: PI ${piDate} vs Contestação ${contestDate}`,
      });
    }
  }

  // 4. Jornada / Escala
  if (piFullText && contestacaoFullText) {
    const piJornada = extractJornadaSnippets(piFullText);
    const contestJornada = extractJornadaSnippets(contestacaoFullText);
    if (piJornada.length > 0 && contestJornada.length > 0) {
      // Comparação simples: verificar se há escalas diferentes mencionadas
      const piText = piJornada.join(" ").toLowerCase();
      const contestText = contestJornada.join(" ").toLowerCase();
      const scalePatterns = [/12\s*x\s*36/, /6\s*x\s*1/, /5\s*x\s*2/, /44\s*h/];
      for (const pattern of scalePatterns) {
        const inPI = pattern.test(piText);
        const inContest = pattern.test(contestText);
        if (inPI !== inContest) {
          divergences.push({
            field: "jornada",
            piValue: piJornada[0],
            contestacaoValue: contestJornada[0],
            severity: "atencao",
            description:
              "Escala/jornada mencionada de forma diferente entre PI e Contestação",
          });
          break; // Uma divergência de jornada basta
        }
      }
    }
  }

  // 5. Pedidos não impugnados
  const naoVisiveis = extractPedidosNaoVisiveis(contestacaoSummary);
  for (const pedido of naoVisiveis) {
    divergences.push({
      field: "pedido_nao_impugnado",
      piValue: pedido,
      contestacaoValue: null,
      severity: "critico",
      description: `Pedido não impugnado na Contestação: ${pedido}`,
    });
  }

  const hasData =
    piFields.positionRole.length > 0 ||
    contestacaoFields.positionRole.length > 0 ||
    piFields.monetaryValues.length > 0 ||
    contestacaoFields.monetaryValues.length > 0 ||
    piFields.dates.length > 0 ||
    contestacaoFields.dates.length > 0;

  return {
    divergences,
    formattedHeader: formatCrossDocHeader(divergences),
    hasData,
  };
}

// ---------------------------------------------------------------------------
// Formatação para injeção no prompt
// ---------------------------------------------------------------------------

function formatCrossDocHeader(divergences: CrossDocDivergence[]): string {
  if (divergences.length === 0) {
    return "";
  }

  const lines = divergences.map(
    (d) => `${SEVERITY_ICONS[d.severity]} ${d.description}`
  );

  return `[VALIDAÇÃO CRUZADA PI × CONTESTAÇÃO]\n${lines.join("\n")}\n[/VALIDAÇÃO CRUZADA]`;
}
