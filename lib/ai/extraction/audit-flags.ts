/**
 * Sistema de flags de auditoria — SPEC §6.1
 *
 * 18 flags organizadas em 3 níveis de severidade com SLA.
 * Detectadas automaticamente durante e após a extração de dados.
 *
 * Uso: Chamado pelo pipeline de extração e pelos gates de validação.
 */

import { MARCADORES } from "./regex-library";

// ─── Tipos ───────────────────────────────────────────────────────────

export type FlagSeverity = "CRITICO" | "ALTO" | "MEDIO";

export type AuditFlagCode =
  // Críticos (SLA 2h)
  | "CNJ_DIGITO_INVALIDO"
  | "PRESCRICAO_DUVIDA"
  | "VALOR_ALTO_DIVERGENTE"
  | "CAMPO_CRITICO_AUSENTE_MULTIPLO"
  // Altos (SLA 4h)
  | "CAMPO_CRITICO_VAZIO"
  | "VALORES_DIVERGENTES"
  | "OCR_BAIXA_CONFIANCA"
  | "DATA_FORA_SEQUENCIA"
  | "RDA_RCTE_MISMATCH"
  | "CNPJ_NAO_MATRIZ"
  // Médios (SLA 8h)
  | "SOMA_INCONSISTENTE"
  | "JUROS_DESCALIBRADOS"
  | "CAMPO_SECUNDARIO_VAZIO"
  | "FORMATO_INVALIDO"
  | "QUEBRA_CONSERVACAO"
  | "EMPRESA_NAO_CADASTRADA"
  | "CRONOLOGIA_INVALIDA"
  | "FONTE_UNICA";

export interface AuditFlag {
  code: AuditFlagCode;
  severity: FlagSeverity;
  /** SLA em horas para resolução */
  slaHours: number;
  label: string;
  description: string;
  /** Campo(s) afetado(s) */
  fields: string[];
  /** Marcador a aplicar no output */
  marcador: string;
  /** Detalhes específicos da detecção */
  detail?: string;
  /** Ação recomendada */
  action: string;
  /** Timestamp de detecção */
  detectedAt: string;
}

export interface AuditReport {
  /** Total de flags detectadas */
  totalFlags: number;
  /** Flags por severidade */
  bySeverity: Record<FlagSeverity, number>;
  /** Flags individuais */
  flags: AuditFlag[];
  /** Se há flags críticas que bloqueiam a entrega */
  blocked: boolean;
  /** Resumo textual para o chat */
  summary: string;
}

// ─── Definições das 18 flags ─────────────────────────────────────────

interface FlagDefinition {
  code: AuditFlagCode;
  severity: FlagSeverity;
  slaHours: number;
  label: string;
  defaultAction: string;
}

const FLAG_DEFINITIONS: Record<AuditFlagCode, FlagDefinition> = {
  // ─── CRÍTICO (SLA 2h) ───
  CNJ_DIGITO_INVALIDO: {
    code: "CNJ_DIGITO_INVALIDO",
    severity: "CRITICO",
    slaHours: 2,
    label: "CNJ com dígito verificador inválido",
    defaultAction:
      "Rejeitar número. Solicitar revisão humana imediata do número do processo.",
  },
  PRESCRICAO_DUVIDA: {
    code: "PRESCRICAO_DUVIDA",
    severity: "CRITICO",
    slaHours: 2,
    label: "Prescrição com cálculo ambíguo",
    defaultAction:
      "Escalonar para advogado. Apresentar datas e cálculos conflitantes.",
  },
  VALOR_ALTO_DIVERGENTE: {
    code: "VALOR_ALTO_DIVERGENTE",
    severity: "CRITICO",
    slaHours: 2,
    label: "Divergência em valor de alta magnitude (>R$ 50.000)",
    defaultAction:
      "Bloquear entrega. Listar todas as fontes com valores divergentes.",
  },
  CAMPO_CRITICO_AUSENTE_MULTIPLO: {
    code: "CAMPO_CRITICO_AUSENTE_MULTIPLO",
    severity: "CRITICO",
    slaHours: 2,
    label: "Múltiplos campos críticos ausentes (≥3)",
    defaultAction:
      "Bloquear entrega. Listar campos ausentes e sugerir re-extração.",
  },

  // ─── ALTO (SLA 4h) ───
  CAMPO_CRITICO_VAZIO: {
    code: "CAMPO_CRITICO_VAZIO",
    severity: "ALTO",
    slaHours: 4,
    label: "Campo crítico não localizado",
    defaultAction: "Marcar como [VERIFICAR]. Indicar campo e busca realizada.",
  },
  VALORES_DIVERGENTES: {
    code: "VALORES_DIVERGENTES",
    severity: "ALTO",
    slaHours: 4,
    label: "Fontes divergem sobre o mesmo valor",
    defaultAction:
      "Marcar como DIVERGÊNCIA. Listar valor de cada fonte com página.",
  },
  OCR_BAIXA_CONFIANCA: {
    code: "OCR_BAIXA_CONFIANCA",
    severity: "ALTO",
    slaHours: 4,
    label: "OCR com confiança < 85%",
    defaultAction: "Marcar como [VERIFICAR]. Indicar página e trecho ilegível.",
  },
  DATA_FORA_SEQUENCIA: {
    code: "DATA_FORA_SEQUENCIA",
    severity: "ALTO",
    slaHours: 4,
    label: "Data fora de sequência cronológica",
    defaultAction:
      "Marcar como [VERIFICAR]. Mostrar sequência esperada vs. encontrada.",
  },
  RDA_RCTE_MISMATCH: {
    code: "RDA_RCTE_MISMATCH",
    severity: "ALTO",
    slaHours: 4,
    label: "Cálculos RDA ≠ RCTE",
    defaultAction:
      "Marcar como DIVERGÊNCIA. Apresentar ambos os valores para revisão do perito.",
  },
  CNPJ_NAO_MATRIZ: {
    code: "CNPJ_NAO_MATRIZ",
    severity: "ALTO",
    slaHours: 4,
    label: "CNPJ é filial, não matriz",
    defaultAction:
      "Alertar. Confirmar se a entidade jurídica correta foi identificada.",
  },

  // ─── MÉDIO (SLA 8h) ───
  SOMA_INCONSISTENTE: {
    code: "SOMA_INCONSISTENTE",
    severity: "MEDIO",
    slaHours: 8,
    label: "Soma das partes ≠ total declarado",
    defaultAction:
      "Marcar como [VERIFICAR]. Mostrar cálculo esperado vs. encontrado.",
  },
  JUROS_DESCALIBRADOS: {
    code: "JUROS_DESCALIBRADOS",
    severity: "MEDIO",
    slaHours: 8,
    label: "Juros/correção fora do padrão esperado",
    defaultAction:
      "Marcar como [VERIFICAR]. Mostrar taxa esperada vs. aplicada.",
  },
  CAMPO_SECUNDARIO_VAZIO: {
    code: "CAMPO_SECUNDARIO_VAZIO",
    severity: "MEDIO",
    slaHours: 8,
    label: "Campo secundário não localizado",
    defaultAction: `Marcar como "${MARCADORES.NAO_LOCALIZADO}". Registrar busca realizada.`,
  },
  FORMATO_INVALIDO: {
    code: "FORMATO_INVALIDO",
    severity: "MEDIO",
    slaHours: 8,
    label: "Formato do campo não corresponde ao esperado",
    defaultAction: "Marcar como [VERIFICAR]. Indicar formato esperado.",
  },
  QUEBRA_CONSERVACAO: {
    code: "QUEBRA_CONSERVACAO",
    severity: "MEDIO",
    slaHours: 8,
    label: "Violação do princípio de conservação (dado alterado pós-trânsito)",
    defaultAction:
      "Alertar sobre res judicata. Manter valor original da sentença.",
  },
  EMPRESA_NAO_CADASTRADA: {
    code: "EMPRESA_NAO_CADASTRADA",
    severity: "MEDIO",
    slaHours: 8,
    label: "Empresa/parte não encontrada no cadastro",
    defaultAction: "Marcar como [PENDENTE]. Solicitar cadastro manual.",
  },
  CRONOLOGIA_INVALIDA: {
    code: "CRONOLOGIA_INVALIDA",
    severity: "MEDIO",
    slaHours: 8,
    label: "Sequência de datas logicamente impossível",
    defaultAction: "Marcar como [VERIFICAR]. Listar datas e ordem esperada.",
  },
  FONTE_UNICA: {
    code: "FONTE_UNICA",
    severity: "MEDIO",
    slaHours: 8,
    label: "Dado crítico com apenas uma fonte (sem cruzamento)",
    defaultAction: "Alertar confiança reduzida. Buscar fontes alternativas.",
  },
};

// ─── Funções de detecção ─────────────────────────────────────────────

/**
 * Cria uma flag de auditoria.
 */
export function createFlag(
  code: AuditFlagCode,
  fields: string[],
  detail?: string
): AuditFlag {
  const def = FLAG_DEFINITIONS[code];
  return {
    code: def.code,
    severity: def.severity,
    slaHours: def.slaHours,
    label: def.label,
    description: detail ?? def.label,
    fields,
    marcador: severityToMarcador(def.severity),
    detail,
    action: def.defaultAction,
    detectedAt: new Date().toISOString(),
  };
}

function severityToMarcador(severity: FlagSeverity): string {
  if (severity === "CRITICO") {
    return MARCADORES.ADVOGADO;
  }
  if (severity === "ALTO") {
    return MARCADORES.VERIFICAR;
  }
  return MARCADORES.PENDENTE;
}

/**
 * Detecta campos críticos vazios.
 */
export function detectCamposCriticosVazios(
  fields: Record<string, string>,
  criticalFieldNames: string[]
): AuditFlag[] {
  const flags: AuditFlag[] = [];
  const emptyFields: string[] = [];

  for (const name of criticalFieldNames) {
    const value = fields[name];
    if (
      !value ||
      value.trim() === "" ||
      value.trim() === MARCADORES.NAO_LOCALIZADO
    ) {
      emptyFields.push(name);
      flags.push(
        createFlag(
          "CAMPO_CRITICO_VAZIO",
          [name],
          `Campo "${name}" não localizado nos autos.`
        )
      );
    }
  }

  if (emptyFields.length >= 3) {
    flags.push(
      createFlag(
        "CAMPO_CRITICO_AUSENTE_MULTIPLO",
        emptyFields,
        `${emptyFields.length} campos críticos ausentes: ${emptyFields.join(", ")}`
      )
    );
  }

  return flags;
}

/**
 * Detecta divergências de valores entre fontes.
 */
export function detectValoresDivergentes(
  comparisons: Array<{
    field: string;
    source1: { label: string; value: number };
    source2: { label: string; value: number };
  }>
): AuditFlag[] {
  const flags: AuditFlag[] = [];

  for (const comp of comparisons) {
    const diff = Math.abs(comp.source1.value - comp.source2.value);
    if (diff < 0.01) {
      continue;
    }

    const isCritical = diff > 50_000;
    const code: AuditFlagCode = isCritical
      ? "VALOR_ALTO_DIVERGENTE"
      : "VALORES_DIVERGENTES";

    flags.push(
      createFlag(
        code,
        [comp.field],
        `${comp.field}: ${comp.source1.label} = R$ ${comp.source1.value.toFixed(2)} vs. ${comp.source2.label} = R$ ${comp.source2.value.toFixed(2)} (diff: R$ ${diff.toFixed(2)})`
      )
    );
  }

  return flags;
}

/**
 * Detecta datas fora de sequência cronológica.
 */
export function detectDatasForaSequencia(
  dates: Array<{ field: string; date: Date }>
): AuditFlag[] {
  const flags: AuditFlag[] = [];

  for (let i = 1; i < dates.length; i++) {
    if (dates[i].date < dates[i - 1].date) {
      flags.push(
        createFlag(
          "DATA_FORA_SEQUENCIA",
          [dates[i - 1].field, dates[i].field],
          `${dates[i - 1].field} (${formatDate(dates[i - 1].date)}) > ${dates[i].field} (${formatDate(dates[i].date)})`
        )
      );
    }
  }

  return flags;
}

function formatDate(d: Date): string {
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

/**
 * Detecta soma inconsistente (partes ≠ total).
 */
export function detectSomaInconsistente(
  field: string,
  parts: Array<{ label: string; value: number }>,
  declaredTotal: number,
  tolerance = 0.01
): AuditFlag | null {
  const computedTotal = parts.reduce((sum, p) => sum + p.value, 0);
  const diff = Math.abs(computedTotal - declaredTotal);

  if (diff <= tolerance) {
    return null;
  }

  return createFlag(
    "SOMA_INCONSISTENTE",
    [field],
    `Soma das partes: R$ ${computedTotal.toFixed(2)} vs. total declarado: R$ ${declaredTotal.toFixed(2)} (diff: R$ ${diff.toFixed(2)})`
  );
}

// ─── Gerador de relatório ────────────────────────────────────────────

/**
 * Gera relatório consolidado de auditoria a partir de flags individuais.
 */
export function buildAuditReport(flags: AuditFlag[]): AuditReport {
  const bySeverity: Record<FlagSeverity, number> = {
    CRITICO: 0,
    ALTO: 0,
    MEDIO: 0,
  };

  for (const flag of flags) {
    bySeverity[flag.severity]++;
  }

  const blocked = bySeverity.CRITICO > 0;

  const summary = buildAuditSummary(flags, bySeverity, blocked);

  return {
    totalFlags: flags.length,
    bySeverity,
    flags,
    blocked,
    summary,
  };
}

function buildAuditSummary(
  flags: AuditFlag[],
  bySeverity: Record<FlagSeverity, number>,
  blocked: boolean
): string {
  if (flags.length === 0) {
    return "✅ Nenhuma flag de auditoria detectada. Extração validada.";
  }

  const lines: string[] = [
    blocked
      ? "🔴 **ENTREGA BLOQUEADA** — Flags críticas detectadas."
      : "⚠️ Flags de auditoria detectadas — revisão necessária.",
    "",
    "| Severidade | Qtd | SLA |",
    "|------------|-----|-----|",
  ];

  if (bySeverity.CRITICO > 0) {
    lines.push(`| 🔴 CRÍTICO | ${bySeverity.CRITICO} | 2h |`);
  }
  if (bySeverity.ALTO > 0) {
    lines.push(`| 🟡 ALTO | ${bySeverity.ALTO} | 4h |`);
  }
  if (bySeverity.MEDIO > 0) {
    lines.push(`| 🟢 MÉDIO | ${bySeverity.MEDIO} | 8h |`);
  }

  lines.push("");

  // Top 5 flags detalhadas
  const topFlags = flags.slice(0, 5);
  for (const flag of topFlags) {
    const emoji =
      flag.severity === "CRITICO"
        ? "🔴"
        : flag.severity === "ALTO"
          ? "🟡"
          : "🟢";
    lines.push(`${emoji} **${flag.label}**: ${flag.description}`);
    lines.push(`   → Ação: ${flag.action}`);
  }

  if (flags.length > 5) {
    lines.push(`\n... e mais ${flags.length - 5} flag(s).`);
  }

  return lines.join("\n");
}

// ─── Exports utilitários ─────────────────────────────────────────────

/** Lista de todos os códigos de flag disponíveis. */
export const ALL_FLAG_CODES = Object.keys(FLAG_DEFINITIONS) as AuditFlagCode[];

/** Obter definição de uma flag por código. */
export function getFlagDefinition(code: AuditFlagCode): FlagDefinition {
  return FLAG_DEFINITIONS[code];
}

/** Campos críticos padrão para validação. */
export const DEFAULT_CRITICAL_FIELDS = [
  "numero_processo",
  "cnj",
  "reclamante",
  "reclamada",
  "cnpj",
  "data_admissao",
  "data_demissao",
  "data_distribuicao",
  "valor_causa",
  "valor_condenacao",
  "prazo_fatal",
  "data_transito",
] as const;
