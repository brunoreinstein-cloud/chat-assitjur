/**
 * Validação estática do system prompt do Agente Revisor de Defesas.
 */

export interface PromptValidationResult {
  valido: boolean;
  erros: string[];
  avisos: string[];
  estatisticas: {
    totalTokensEstimados: number;
    totalModulos: number;
    modulosVazios: string[];
  };
}

const MIN_LENGTH = 500;
const SIGLAS_PROIBIDAS = /\b(RTE|RDO|DAJ|DTC)\b/g;
const TITULOS_DOCS = [
  "AVALIAÇÃO DA DEFESA",
  "ROTEIRO ADVOGADO",
  "ROTEIRO PREPOSTO",
];
const SEPARATOR = "---";

/** Estima tokens por caractere (heurística ~4 chars/token). */
function estimateTokens(prompt: string): number {
  return Math.ceil(prompt.length / 4);
}

/** Extrai o trecho dos templates dos 3 DOC (entre ## DOC 1 e fim de ## DOC 3). */
function getDocTemplatesSection(prompt: string): string {
  const start = prompt.indexOf("## DOC 1:");
  if (start === -1) {
    return "";
  }
  return prompt.slice(start);
}

/** Verifica se há siglas proibidas nos templates dos documentos (não na seção de siglas nem nas regras). */
function siglasProibidasNosDocumentos(prompt: string): boolean {
  const docTemplates = getDocTemplatesSection(prompt);
  if (!docTemplates) {
    return false;
  }
  const withoutPlaceholders = docTemplates.replace(/\[[^\]]*\]/g, "[]");
  SIGLAS_PROIBIDAS.lastIndex = 0;
  return SIGLAS_PROIBIDAS.test(withoutPlaceholders);
}

/** Conta ocorrências de "---" como separador entre módulos. */
function countSeparators(prompt: string): number {
  const matches = prompt.match(
    new RegExp(SEPARATOR.replace(/[-]/g, "\\$&"), "g")
  );
  return matches?.length ?? 0;
}

export function validateSystemPrompt(prompt: string): PromptValidationResult {
  const erros: string[] = [];
  const avisos: string[] = [];
  const modulosVazios: string[] = [];

  // E1
  if (!prompt || prompt.length < MIN_LENGTH) {
    erros.push(`E1: Prompt vazio ou menor que ${MIN_LENGTH} caracteres.`);
  }

  // E2: siglas não podem aparecer nos templates dos 3 DOC (podem nas regras internas)
  if (prompt && siglasProibidasNosDocumentos(prompt)) {
    erros.push(
      "E2: Contém siglas proibidas (RTE, RDO, DAJ, DTC) nos templates dos documentos."
    );
  }

  // E3
  if (prompt && !prompt.includes("GATE-1")) {
    erros.push("E3: Fluxo obrigatório GATE-1 ausente.");
  }

  // E4
  if (prompt && !prompt.includes("Gate 0.5")) {
    erros.push("E4: Checkpoint Gate 0.5 ausente.");
  }

  // E5
  if (prompt && !prompt.includes("art. 342") && !prompt.includes("art.342")) {
    erros.push("E5: Instrução anti-testemunha (art. 342) ausente.");
  }

  // E6
  if (prompt) {
    const upper = prompt.toUpperCase();
    for (const titulo of TITULOS_DOCS) {
      if (!upper.includes(titulo)) {
        erros.push(`E6: Título do documento ausente: "${titulo}".`);
      }
    }
  }

  // A1
  const totalTokensEstimados = estimateTokens(prompt);
  if (totalTokensEstimados > 4000) {
    avisos.push(
      `A1: Estimativa de tokens (${totalTokensEstimados}) > 4000; pode impactar custo.`
    );
  }

  // A2
  if (prompt && !prompt.includes("@bancodetese")) {
    avisos.push("A2: Banco de teses não referenciado (@bancodetese).");
  }

  // A3
  const numSeparators = countSeparators(prompt);
  if (prompt && numSeparators < 3) {
    avisos.push(
      `A3: Poucos separadores "---" entre módulos (encontrados: ${numSeparators}, esperados >= 3).`
    );
  }

  // Estatísticas: módulos = seções ##
  const modulosMatch = prompt.match(/^## /gm);
  const totalModulos = modulosMatch?.length ?? 0;

  return {
    valido: erros.length === 0,
    erros,
    avisos,
    estatisticas: {
      totalTokensEstimados,
      totalModulos,
      modulosVazios,
    },
  };
}
