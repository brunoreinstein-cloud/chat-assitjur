/**
 * Tool runProcessoGates — Validação dos 6 Gates obrigatórios do Playbook v9.0.
 *
 * Sprint 2 (SPEC-ASSISTJUR-V9.md §7 Gap 4).
 * Executar ANTES de chamar createMasterDocuments, createRevisorDefesaDocuments, etc.
 *
 * Gates:
 *  1 — CNJ válido: formato + dígito verificador (mod 97)
 *  2 — CNPJ validado: dígitos verificadores + MATRIZ (últimos 4 = 0001)
 *  3 — Cronologia válida: admissão < demissão ≤ distribuição ≤ sentença ≤ trânsito
 *  4 — Valores plausíveis: condenação ≤ valor da causa; RDA ≥ 0 se informado
 *  5 — Campos críticos com confiança ≥ 0.998
 *  6 — Res judicata: se pós-trânsito, apenas aritmética é permitida
 */

import { tool } from "ai";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Helpers de validação
// ---------------------------------------------------------------------------

/** Valida formato CNJ: NNNNNNN-DD.AAAA.J.TT.OOOO */
const CNJ_RE = /^\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}$/;

function validateCNJFormat(cnj: string): boolean {
  return CNJ_RE.test(cnj.trim());
}

/**
 * Valida dígito verificador do CNJ (Resolução CNJ 65/2008).
 * Algoritmo: sem os 2 dígitos verificadores → NNNNNNNAAAAJTTOOOO (18 dígitos)
 * DD = 98 − (number mod 97)
 */
function validateCNJCheckDigit(cnj: string): boolean {
  const digits = cnj.replace(/\D/g, "");
  if (digits.length !== 20) {
    return false;
  }

  const N = digits.slice(0, 7); // processo (7)
  const DD = Number.parseInt(digits.slice(7, 9), 10); // verificadores (2)
  const rest = digits.slice(9); // AAAAJTTOOOO (11)

  try {
    const base = BigInt(N + rest);
    const remainder = Number(base % 97n);
    const expected = 98 - remainder;
    return DD === expected;
  } catch {
    return false;
  }
}

/**
 * Valida CNPJ: comprimento, dígitos verificadores.
 */
function validateCNPJ(raw: string): boolean {
  const d = raw.replace(/\D/g, "");
  if (d.length !== 14) {
    return false;
  }
  if (/^(\d)\1+$/.test(d)) {
    return false; // todos iguais
  }

  const calc = (weights: number[]) => {
    const sum = weights.reduce((acc, w, i) => acc + Number(d[i]) * w, 0);
    const r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  };

  const w1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const w2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

  return calc(w1) === Number(d[12]) && calc(w2) === Number(d[13]);
}

/** CNPJ MATRIZ: últimos 4 dígitos = 0001 */
function isCNPJMatriz(raw: string): boolean {
  const d = raw.replace(/\D/g, "");
  return d.slice(8, 12) === "0001";
}

/**
 * Parse de data nos formatos dd/mm/aaaa ou ISO (aaaa-mm-dd).
 * Retorna null se inválida.
 */
function parseDate(s: string): Date | null {
  if (!s) {
    return null;
  }
  const trimmed = s.trim();

  // dd/mm/aaaa
  const dmY = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmY) {
    const d = new Date(
      `${dmY[3]}-${dmY[2].padStart(2, "0")}-${dmY[1].padStart(2, "0")}`
    );
    return Number.isNaN(d.getTime()) ? null : d;
  }

  // aaaa-mm-dd (ISO)
  const iso = trimmed.match(/^\d{4}-\d{2}-\d{2}/);
  if (iso) {
    const d = new Date(trimmed.slice(0, 10));
    return Number.isNaN(d.getTime()) ? null : d;
  }

  return null;
}

// ---------------------------------------------------------------------------
// Tipos de resultado
// ---------------------------------------------------------------------------

const CONFIDENCE_THRESHOLD = 0.998;

type GateStatus = "PASSOU" | "FALHOU" | "NAO_AVALIADO";

interface GateResult {
  gate: number;
  nome: string;
  status: GateStatus;
  mensagem: string;
}

// ---------------------------------------------------------------------------
// Tool
// ---------------------------------------------------------------------------

export const runProcessoGates = tool({
  description:
    "Executa os 6 Gates obrigatórios de validação antes de gerar qualquer documento do processo. " +
    "Use SEMPRE antes de chamar createMasterDocuments, createRevisorDefesaDocuments ou qualquer outra ferramenta de geração de documento. " +
    "Retorna quais gates passaram, quais falharam e um resumo. Se algum gate falhar, corrija ou sinalize antes de prosseguir.",
  inputSchema: z.object({
    numeroCNJ: z
      .string()
      .optional()
      .describe(
        "Número do processo no formato CNJ (NNNNNNN-DD.AAAA.J.TT.OOOO)"
      ),
    cnpjReclamada: z
      .string()
      .optional()
      .describe(
        "CNPJ da empresa reclamada (apenas dígitos ou formatado com . / -)"
      ),
    dataAdmissao: z
      .string()
      .optional()
      .describe("Data de admissão (dd/mm/aaaa ou aaaa-mm-dd)"),
    dataDemissao: z
      .string()
      .optional()
      .describe(
        "Data de término do contrato / demissão (dd/mm/aaaa ou aaaa-mm-dd)"
      ),
    dataDistribuicao: z
      .string()
      .optional()
      .describe(
        "Data de distribuição / ajuizamento (dd/mm/aaaa ou aaaa-mm-dd)"
      ),
    dataSentenca: z
      .string()
      .optional()
      .describe("Data da sentença (dd/mm/aaaa ou aaaa-mm-dd)"),
    dataTransito: z
      .string()
      .optional()
      .describe("Data do trânsito em julgado (dd/mm/aaaa ou aaaa-mm-dd)"),
    valorCausa: z
      .number()
      .optional()
      .describe("Valor da causa em R$ (número positivo)"),
    valorCondenacao: z
      .number()
      .optional()
      .describe("Valor total da condenação / acordo em R$ (número positivo)"),
    posTransito: z
      .boolean()
      .optional()
      .describe(
        "Indicar true se o processo já tem trânsito em julgado (fase de execução definitiva)"
      ),
    camposCriticos: z
      .array(
        z.object({
          nome: z
            .string()
            .describe(
              "Nome do campo (ex: 'prazo_fatal', 'CNJ', 'data_transito', 'valor_homologado')"
            ),
          confianca: z
            .number()
            .min(0)
            .max(1)
            .describe("Score de confiança na extração deste campo (0–1)"),
        })
      )
      .optional()
      .describe(
        "Campos críticos com seus scores de confiança para o GATE 5. " +
          "Campos críticos: prazo_fatal, CNJ, data_transito, valor_homologado, RDA, RCTE, valor_condenacao."
      ),
  }),

  execute: ({
    numeroCNJ,
    cnpjReclamada,
    dataAdmissao,
    dataDemissao,
    dataDistribuicao,
    dataSentenca,
    dataTransito,
    valorCausa,
    valorCondenacao,
    posTransito,
    camposCriticos,
  }) => {
    const resultados: GateResult[] = [];

    // -----------------------------------------------------------------------
    // GATE 1 — CNJ válido
    // -----------------------------------------------------------------------
    if (numeroCNJ) {
      const fmtOk = validateCNJFormat(numeroCNJ);
      const dvOk = fmtOk && validateCNJCheckDigit(numeroCNJ);
      resultados.push({
        gate: 1,
        nome: "CNJ válido",
        status: dvOk ? "PASSOU" : "FALHOU",
        mensagem: dvOk
          ? `CNJ ${numeroCNJ} com formato e dígito verificador corretos.`
          : fmtOk
            ? `CNJ "${numeroCNJ}" com formato correto mas dígito verificador inválido.`
            : `CNJ "${numeroCNJ}" com formato inválido. Esperado: NNNNNNN-DD.AAAA.J.TT.OOOO`,
      });
    } else {
      resultados.push({
        gate: 1,
        nome: "CNJ válido",
        status: "NAO_AVALIADO",
        mensagem: "numeroCNJ não fornecido — GATE 1 não avaliado.",
      });
    }

    // -----------------------------------------------------------------------
    // GATE 2 — CNPJ validado (dígitos + MATRIZ)
    // -----------------------------------------------------------------------
    if (cnpjReclamada) {
      const cnpjOk = validateCNPJ(cnpjReclamada);
      const matrizOk = cnpjOk && isCNPJMatriz(cnpjReclamada);
      resultados.push({
        gate: 2,
        nome: "CNPJ reclamada válido (MATRIZ)",
        status: cnpjOk ? "PASSOU" : "FALHOU",
        mensagem: cnpjOk
          ? matrizOk
            ? `CNPJ ${cnpjReclamada} válido e MATRIZ (últimos 4 dígitos = 0001).`
            : `CNPJ ${cnpjReclamada} válido mas NÃO é MATRIZ (filial). Verificar se é o CNPJ correto da empresa.`
          : `CNPJ "${cnpjReclamada}" inválido — dígitos verificadores incorretos.`,
      });
    } else {
      resultados.push({
        gate: 2,
        nome: "CNPJ reclamada válido (MATRIZ)",
        status: "NAO_AVALIADO",
        mensagem: "cnpjReclamada não fornecido — GATE 2 não avaliado.",
      });
    }

    // -----------------------------------------------------------------------
    // GATE 3 — Cronologia válida
    // -----------------------------------------------------------------------
    const dates: Array<{
      label: string;
      date: Date | null;
      raw: string | undefined;
    }> = [
      {
        label: "admissão",
        date: parseDate(dataAdmissao ?? ""),
        raw: dataAdmissao,
      },
      {
        label: "demissão",
        date: parseDate(dataDemissao ?? ""),
        raw: dataDemissao,
      },
      {
        label: "distribuição",
        date: parseDate(dataDistribuicao ?? ""),
        raw: dataDistribuicao,
      },
      {
        label: "sentença",
        date: parseDate(dataSentenca ?? ""),
        raw: dataSentenca,
      },
      {
        label: "trânsito",
        date: parseDate(dataTransito ?? ""),
        raw: dataTransito,
      },
    ].filter((d) => d.raw !== undefined);

    if (dates.length >= 2) {
      const errors: string[] = [];
      const validDates = dates.filter((d) => d.date !== null);
      const invalidDates = dates.filter((d) => d.date === null);

      for (const inv of invalidDates) {
        errors.push(
          `Data de ${inv.label} "${inv.raw}" não pôde ser interpretada.`
        );
      }

      // Ordena para mensagem de resumo legível (cronologia)
      validDates.sort(
        (a, b) => (a.date as Date).getTime() - (b.date as Date).getTime()
      );
      const misorder: string[] = [];
      for (const pair of [
        ["admissão", "demissão"],
        ["admissão", "distribuição"],
        ["demissão", "distribuição"],
        ["distribuição", "sentença"],
        ["sentença", "trânsito"],
      ]) {
        const a = validDates.find((d) => d.label === pair[0]);
        const b = validDates.find((d) => d.label === pair[1]);
        if (a?.date && b?.date && a.date > b.date) {
          misorder.push(`${pair[0]} (${a.raw}) > ${pair[1]} (${b.raw})`);
        }
      }

      errors.push(...misorder);
      const passed = errors.length === 0;
      resultados.push({
        gate: 3,
        nome: "Cronologia válida",
        status: passed ? "PASSOU" : "FALHOU",
        mensagem: passed
          ? `Cronologia válida: ${validDates.map((d) => `${d.label}=${d.raw}`).join(", ")}.`
          : `Cronologia inválida: ${errors.join("; ")}`,
      });
    } else {
      resultados.push({
        gate: 3,
        nome: "Cronologia válida",
        status: "NAO_AVALIADO",
        mensagem:
          "Menos de 2 datas fornecidas — GATE 3 não avaliado. Fornecer ao menos 2 das datas: admissão, demissão, distribuição, sentença, trânsito.",
      });
    }

    // -----------------------------------------------------------------------
    // GATE 4 — Valores plausíveis
    // -----------------------------------------------------------------------
    if (valorCausa !== undefined || valorCondenacao !== undefined) {
      const errors: string[] = [];
      if (valorCausa !== undefined && valorCausa <= 0) {
        errors.push(`Valor da causa R$ ${valorCausa} deve ser positivo.`);
      }
      if (valorCondenacao !== undefined && valorCondenacao < 0) {
        errors.push(`Valor da condenação R$ ${valorCondenacao} deve ser ≥ 0.`);
      }
      if (
        valorCausa !== undefined &&
        valorCondenacao !== undefined &&
        valorCondenacao > valorCausa * 1.5
      ) {
        errors.push(
          `Condenação (R$ ${valorCondenacao}) supera 150% do valor da causa (R$ ${valorCausa}). Verificar se os valores estão corretos.`
        );
      }
      const passed = errors.length === 0;
      resultados.push({
        gate: 4,
        nome: "Valores plausíveis",
        status: passed ? "PASSOU" : "FALHOU",
        mensagem: passed
          ? `Valores plausíveis: causa=R$ ${valorCausa ?? "n/a"}, condenação=R$ ${valorCondenacao ?? "n/a"}.`
          : errors.join("; "),
      });
    } else {
      resultados.push({
        gate: 4,
        nome: "Valores plausíveis",
        status: "NAO_AVALIADO",
        mensagem:
          "valorCausa e valorCondenacao não fornecidos — GATE 4 não avaliado.",
      });
    }

    // -----------------------------------------------------------------------
    // GATE 5 — Confiança em campos críticos ≥ 0.998
    // -----------------------------------------------------------------------
    if (camposCriticos && camposCriticos.length > 0) {
      const abaixoLimiar = camposCriticos.filter(
        (c) => c.confianca < CONFIDENCE_THRESHOLD
      );
      const passed = abaixoLimiar.length === 0;
      resultados.push({
        gate: 5,
        nome: `Confiança campos críticos ≥ ${CONFIDENCE_THRESHOLD}`,
        status: passed ? "PASSOU" : "FALHOU",
        mensagem: passed
          ? `Todos os ${camposCriticos.length} campo(s) crítico(s) com confiança ≥ ${CONFIDENCE_THRESHOLD}.`
          : `${abaixoLimiar.length} campo(s) crítico(s) com confiança insuficiente — FLAG revisão humana: ${abaixoLimiar.map((c) => `${c.nome}=${c.confianca.toFixed(3)}`).join(", ")}`,
      });
    } else {
      resultados.push({
        gate: 5,
        nome: `Confiança campos críticos ≥ ${CONFIDENCE_THRESHOLD}`,
        status: "NAO_AVALIADO",
        mensagem:
          "camposCriticos não fornecido — GATE 5 não avaliado. " +
          "Fornecer scores de confiança para: prazo_fatal, CNJ, data_transito, valor_homologado.",
      });
    }

    // -----------------------------------------------------------------------
    // GATE 6 — Res judicata: pós-trânsito apenas aritmética
    // -----------------------------------------------------------------------
    if (posTransito !== undefined) {
      resultados.push({
        gate: 6,
        nome: "Res judicata (pós-trânsito)",
        status: "PASSOU",
        mensagem: posTransito
          ? "Processo em fase de execução (pós-trânsito). Apenas operações aritméticas sobre valores homologados são permitidas. Fatos e condenações são imutáveis."
          : "Processo ainda não transitado — res judicata não aplicável. Conteúdo pode ser editado conforme estratégia.",
      });
    } else {
      resultados.push({
        gate: 6,
        nome: "Res judicata (pós-trânsito)",
        status: "NAO_AVALIADO",
        mensagem: "posTransito não fornecido — GATE 6 não avaliado.",
      });
    }

    // -----------------------------------------------------------------------
    // Resumo
    // -----------------------------------------------------------------------
    const executados = resultados.filter((r) => r.status !== "NAO_AVALIADO");
    const passaram = executados.filter((r) => r.status === "PASSOU");
    const falharam = executados.filter((r) => r.status === "FALHOU");
    const aprovado = falharam.length === 0 && executados.length > 0;

    const resumo = aprovado
      ? `✅ Todos os ${executados.length} gates avaliados passaram. Processo pode prosseguir para geração de documentos.`
      : falharam.length > 0
        ? `⚠️ ${falharam.length} gate(s) falharam: ${falharam.map((r) => `GATE ${r.gate} (${r.nome})`).join(", ")}. Corrigir antes de gerar documentos.`
        : "ℹ️ Nenhum gate avaliado (todos os campos foram omitidos). Fornecer dados para validação.";

    return {
      gatesExecutados: executados.length,
      gatesPassaram: passaram.length,
      gatesFalharam: falharam.length,
      aprovado,
      resultados,
      resumo,
    };
  },
});
