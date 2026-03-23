/**
 * Prompts de extração por tipo de bloco do pipeline multi-chamadas.
 */

import { getAudienciasExtractionPrompt } from "./rag-audiencias";
import { getExecucaoExtractionPrompt } from "./rag-execucao";
import type { PhaseType } from "./split-processo-sections";

// ---------------------------------------------------------------------------
// Regras base de extração (compartilhadas com RAGs especializados)
// ---------------------------------------------------------------------------

/** Regras base de extração reutilizadas por todos os prompts (incluindo RAGs especializados). */
export const BASE_EXTRACTION_RULES = `Você é um extrator jurídico especializado em processos trabalhistas brasileiros.
REGRAS INVIOLÁVEIS:
- Para CADA valor extraído, inclua a referência "(fl. XXX)" baseada nos marcadores [Pag. N] do texto.
- Se não encontrar um campo, escreva "Não localizado nos autos".
- NUNCA invente, deduza ou estime valores. Melhor vazio que errado.
- Datas em DD/MM/AAAA. Valores em R$ 0.000,00.
- Extraia LITERALMENTE do texto, sem parafrasear.

Responda em JSON com a estrutura: { "fields": { "campo": "valor (fl. XX)" }, "analysis": "resumo em markdown" }`;

// ---------------------------------------------------------------------------
// Prompts por tipo de secção
// ---------------------------------------------------------------------------

export function getBlockExtractionPrompt(
  blockLabel: string,
  primaryPhase?: PhaseType
): string {
  const base = BASE_EXTRACTION_RULES;

  const lowerLabel = blockLabel.toLowerCase();

  if (
    lowerLabel.includes("petição inicial") ||
    lowerLabel.includes("reclamat")
  ) {
    return `${base}

CAMPOS A EXTRAIR DESTA SECÇÃO (Petição Inicial):
- numero_processo: Número CNJ completo
- vara: Vara do Trabalho
- reclamante: Nome completo
- reclamada: Nome(s) completo(s)
- advogado_reclamante: Nome + OAB
- data_ajuizamento: Data de distribuição
- data_admissao: Data de admissão
- data_demissao: Data de demissão/rescisão
- ultimo_salario: Último salário ou remuneração
- funcao_cargo: Função/cargo
- tipo_rescisao: Tipo de rescisão contratual
- pedidos: Lista de pedidos (com valores se indicados)
- valor_causa: Valor da causa
- justica_gratuita: Se requer benefício de justiça gratuita`;
  }

  if (lowerLabel.includes("contestação") || lowerLabel.includes("defesa")) {
    return `${base}

CAMPOS A EXTRAIR DESTA SECÇÃO (Contestação/Defesa):
- reclamada_cnpj: CNPJ da reclamada
- advogado_reclamada: Nome + OAB
- preliminares: Preliminares arguidas
- prescricao: Alegação de prescrição (bienal/quinquenal)
- teses_defesa: Principais teses de defesa por pedido
- impugnacoes: Impugnações específicas
- documentos_juntados: Documentos relevantes mencionados
- pedido_improcedencia: Pedidos de improcedência`;
  }

  if (
    lowerLabel.includes("sentença") ||
    lowerLabel.includes("decisão") ||
    lowerLabel.includes("vistos")
  ) {
    return `${base}

CAMPOS A EXTRAIR DESTA SECÇÃO (Sentença/Decisão):
- tipo_sentenca: Procedente/Improcedente/Parcialmente Procedente
- pedidos_deferidos: Pedidos deferidos (lista)
- pedidos_indeferidos: Pedidos indeferidos (lista)
- valor_condenacao: Valor da condenação (se fixado)
- honorarios: Honorários advocatícios
- custas: Custas processuais
- responsabilidade_subsidiaria: Se há condenação subsidiária
- juros_correcao: Índices de juros e correção monetária
- data_sentenca: Data da sentença
- compensacao_dedução: Compensações/deduções determinadas`;
  }

  if (lowerLabel.includes("acórdão") || lowerLabel.includes("ementa")) {
    return `${base}

CAMPOS A EXTRAIR DESTA SECÇÃO (Acórdão):
- orgao_julgador: Turma/Câmara
- relator: Desembargador relator
- revisor: Desembargador revisor
- terceiro_votante: Terceiro votante ou juiz convocado
- redator_designado: Redator designado (se diferente do relator)
- resultado: Provido/Desprovido/Parcialmente provido
- resultado_reclamada: Resultado específico do recurso da reclamada
- resultado_reclamante: Resultado específico do recurso do reclamante
- reformas: O que foi reformado da sentença (lista por pedido)
- manutencoes: O que foi mantido
- voto_vencido: Resumo do voto vencido (se houve divergência)
- tipo_recurso: Tipo do recurso julgado (RO/RR/AIRR/AP/ED)
- data_julgamento: Data do julgamento
- data_publicacao: Data de publicação (DEJT)
- ed_ao_acordao: Embargos de Declaração ao Acórdão — matérias arguidas + resultado (se houver)`;
  }

  // --- RAGs especializados (Sprint 3) — avaliados ANTES dos genéricos ---

  // Audiências / Instrução — sempre prioridade sobre genérico
  if (
    lowerLabel.includes("ata de audiência") ||
    lowerLabel.includes("audiência") ||
    lowerLabel.includes("termo de audiência")
  ) {
    return getAudienciasExtractionPrompt(base);
  }

  // Execução: embargos, agravo de petição, penhoras, alvarás — sempre prioridade
  if (
    lowerLabel.includes("embargos à execução") ||
    lowerLabel.includes("agravo de petição") ||
    lowerLabel.includes("penhora") ||
    lowerLabel.includes("bloqueio") ||
    lowerLabel.includes("alvará")
  ) {
    return getExecucaoExtractionPrompt(base);
  }

  // Cálculos / Liquidação — usa RAG execução se a fase é execução
  if (
    lowerLabel.includes("cálculo") ||
    lowerLabel.includes("liquidação") ||
    lowerLabel.includes("planilha")
  ) {
    if (primaryPhase === "execucao") {
      return getExecucaoExtractionPrompt(base);
    }
    return `${base}

CAMPOS A EXTRAIR DESTA SECÇÃO (Cálculos/Liquidação):
- valor_bruto: Valor bruto dos cálculos
- valor_liquido: Valor líquido
- descontos: Descontos aplicados (INSS, IR, etc.)
- periodo_calculo: Período de cálculo
- indice_correcao: Índice de correção monetária
- juros: Taxa de juros aplicada
- base_calculo: Base de cálculo
- honorarios_calculo: Honorários sobre o valor
- contribuicoes_previdenciarias: Contribuições previdenciárias`;
  }

  if (lowerLabel.includes("laudo") || lowerLabel.includes("perícia")) {
    return `${base}

CAMPOS A EXTRAIR DESTA SECÇÃO (Laudo Pericial):
- tipo_pericia: Tipo (insalubridade, periculosidade, médica, etc.)
- perito: Nome do perito
- conclusao: Conclusão principal
- grau_insalubridade: Grau (se aplicável)
- nexo_causal: Nexo causal (se perícia médica)
- agente_nocivo: Agente nocivo identificado
- epi_fornecido: Se EPI foi fornecido/eficaz
- incapacidade: Grau de incapacidade (se médica)`;
  }

  // Fallback por fase processual (quando o label é ambíguo)
  if (primaryPhase === "instrucao") {
    return getAudienciasExtractionPrompt(base);
  }
  if (primaryPhase === "execucao") {
    return getExecucaoExtractionPrompt(base);
  }

  // Genérico
  return `${base}

CAMPOS A EXTRAIR DESTA SECÇÃO (${blockLabel}):
- Extraia todas as informações juridicamente relevantes
- Identifique datas, valores, nomes de partes, decisões
- Documente referências a outras peças processuais
- Destaque riscos ou pontos críticos`;
}

// ---------------------------------------------------------------------------
// Humanização de labels de bloco
// ---------------------------------------------------------------------------

/**
 * Converte um label técnico de bloco em linguagem natural para o advogado.
 * Ex: "Sentença" → "a sentença", "Cálculos/Liquidação" → "os cálculos"
 */
export function humanizeBlockLabel(label: string): string {
  const l = label.toLowerCase();
  if (l.includes("petição inicial") || l.includes("reclamat")) {
    return "a petição inicial";
  }
  if (l.includes("contestação") || l.includes("defesa")) {
    return "a contestação";
  }
  if (l.includes("sentença") || l.includes("vistos")) {
    return "a sentença";
  }
  if (l.includes("acórdão") || l.includes("ementa")) {
    return "o acórdão";
  }
  if (l.includes("audiência") || l.includes("ata de")) {
    return "as audiências e depoimentos";
  }
  if (
    l.includes("cálculo") ||
    l.includes("liquidação") ||
    l.includes("planilha")
  ) {
    return "os cálculos e liquidação";
  }
  if (l.includes("laudo") || l.includes("perícia")) {
    return "o laudo pericial";
  }
  if (l.includes("embargos à execução") || l.includes("agravo de petição")) {
    return "os embargos à execução";
  }
  if (l.includes("embargos")) {
    return "os embargos de declaração";
  }
  if (l.includes("execução") || l.includes("penhora")) {
    return "a fase de execução";
  }
  if (l.includes("recurso ordinário") || l.includes("recurso de revista")) {
    return "os recursos";
  }
  return `a seção "${label}"`;
}
