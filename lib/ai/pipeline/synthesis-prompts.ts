/**
 * Prompts de sintese dinamicos por modulo para o pipeline multi-chamadas.
 * Cada modulo tem sua propria estrutura de secoes, maxOutputTokens e timeout.
 */

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export interface SynthesisSection {
  number: number;
  title: string;
  description: string;
}

export interface ModuleSynthesisConfig {
  /** Secoes obrigatorias do relatorio */
  sections: SynthesisSection[];
  /** Max output tokens para a chamada de sintese */
  maxOutputTokens: number;
  /** Timeout em ms para a chamada de sintese */
  synthesisTimeoutMs: number;
}

// ---------------------------------------------------------------------------
// Secoes por modulo
// ---------------------------------------------------------------------------

const M03_SECTIONS: SynthesisSection[] = [
  {
    number: 1,
    title: "IDENTIFICACAO DO PROCESSO",
    description:
      "CNJ, Vara, Tribunal, Rito, Distribuicao, Valor Causa, Momento Processual (texto da Regua), Fase Atual, Duracao em meses.",
  },
  {
    number: 2,
    title: "QUALIFICACAO DAS PARTES",
    description:
      "2.1 Reclamante (nome, CPF, PIS, CTPS, advogados, OAB, procuracao, JG). 2.2 Reclamada (razao social, CNPJ, CNAE, escritorio RDA, advogado patrono). 2.3 Gestao do Caso (credenciado, dossie).",
  },
  {
    number: 3,
    title: "DADOS DO VINCULO EMPREGATICIO",
    description:
      "Cargo, Funcao, CBO, Lotacao, Admissao, Ultimo Dia Trabalhado, TRCT (data/codigo/causa), Causa Real (decisao), Regime, Salario. Condicionais: Afastamento, Estabilidade, Paradigma.",
  },
  {
    number: 4,
    title: "CAUSA DE PEDIR E PEDIDOS",
    description:
      "4.1 Narrativa Fatica. 4.2 Teses da Defesa. 4.3 Quadro de Pedidos por Instancia: | PEDIDO | 1a INSTANCIA | 2a INSTANCIA (RO) | TST | RESULTADO FINAL |. Cores: Verde=Indeferido, Laranja=Parcial, Vermelho=Deferido.",
  },
  {
    number: 5,
    title: "AUDIENCIAS E INSTRUCAO PROCESSUAL",
    description:
      "Para CADA audiencia: Data, ID, Tipo, Modalidade, Preposto, Advogado RDA, Conciliacao. Depoimentos ITEM POR ITEM com impacto (favoravel/desfavoravel). Testemunhas: nome, qualificacao, pontos-chave, contradita. Confissao ficta: CRITICO. Protestos e requerimentos. Pericias: perito, conclusoes, resultado.",
  },
  {
    number: 6,
    title: "TRATATIVAS DE ACORDO",
    description:
      "Tabela: | DATA | PROPOSTA RECLAMADA | PRETENSAO RECLAMANTE | RESULTADO/MOTIVO |",
  },
  {
    number: 7,
    title: "CONTINGENCIA E DRIVERS DE CUSTO",
    description:
      "7.1 Contingencia por fase: | FASE | LIQUIDA | BRUTA C/ INSS | DATA | CONTADOR |. 7.2 Drivers: fatores que elevam a condenacao.",
  },
  {
    number: 8,
    title: "SENTENCA — 1a INSTANCIA",
    description:
      "Juiz, Data, ID, Resultado, Custas, Honorarios. Fundamentos por pedido. 8.1 ED a Sentenca: separar por parte, materias e resultado.",
  },
  {
    number: 9,
    title: "RECURSO ORDINARIO",
    description:
      "9.1 RO Reclamada (materias). 9.2 RO Reclamante (materias). 9.3 Contrarrazoes. 9.4 Chance de exito por pedido. 9.5 Sustentacao Oral. 9.6 Acordao: Composicao COMPLETA (Relator + Revisor + 3o Votante), resultado SEPARADO por parte, voto vencido. 9.7 ED ao Acordao: separar por parte.",
  },
  {
    number: 10,
    title: "RECURSO DE REVISTA (TST)",
    description:
      "10.1 RR Reclamada. 10.2 RR Reclamante. 10.3 Despacho admissibilidade. 10.4 AIRR. 10.5 Acordao TST: composicao completa, resultado por parte.",
  },
  {
    number: 11,
    title: "FASE RECURSAL EM EXECUCAO",
    description:
      "11.1 Embargos a Execucao (materias por parte). 11.2 Sentenca de Embargos/ISL. 11.3 Agravo de Peticao. 11.4 Acordao AP (composicao + resultado). 11.5 RR/AIRR em Execucao. Se nao houve, OMITIR secao.",
  },
  {
    number: 12,
    title: "TRANSITO EM JULGADO",
    description: "Data, ID, Certidao. Execucao provisoria (se aplicavel).",
  },
  {
    number: 13,
    title: "FASE DE EXECUCAO E LIQUIDACAO",
    description:
      "13.1 OBFs (lista + prazo + status). 13.2 Calculos — Historico Comparativo: tabela RDA vs RTE vs Perito OBRIGATORIA. 13.3 Perito Contabil. 13.4 Depositos, Garantias e Bloqueios (tabela com status). 13.5 Alvaras (total soerguido). 13.6 Sentenca de Liquidacao. 13.7 Valores Homologados. 13.8 Situacao Atual e Saldo Devedor.",
  },
  {
    number: 14,
    title: "HONORARIOS SUCUMBENCIAIS",
    description:
      "Percentual, valor, base de calculo, beneficiario, condicao suspensiva (JG).",
  },
  {
    number: 15,
    title: "CORRECAO MONETARIA E JUROS",
    description:
      "Indice de correcao (SELIC, IPCA-E, TR), taxa de juros, periodo de aplicacao, decisao que fixou.",
  },
  {
    number: 16,
    title: "CRONOLOGIA PROCESSUAL DETALHADA",
    description: "Tabela: | DATA | DOCUMENTO | DESCRICAO | ID PJe |",
  },
  {
    number: 17,
    title: "ANALISE DE PERFORMANCE E CONFORMIDADE",
    description:
      "17.1 Escritorio RDA — Indicadores Operacionais (tempestividade, revelia, confissao ficta, desercao, apolice). 17.2 Cobertura Processual (todos pedidos contestados? toda condenacao recorrida? calculos aderentes? prescricao arguida? nulidades renovadas?). 17.3 Demais Indicadores. 17.4 Atuacao da Empresa (documentos, testemunhas, preposto). 17.5 Pontos de Atencao. 17.6 Classificacao (EXCELENTE/BOA/REGULAR/INADEQUADA) + justificativa.",
  },
  {
    number: 18,
    title: "ANALISE DE NULIDADES E ACAO RESCISORIA",
    description:
      "18.1 Nulidades processuais (vicio citacao, cerceamento defesa, impedimento juiz, violacao norma, prova falsa, documento novo, erro de fato). Para cada: fundamento, momento processual, se arguida, se renovada em recurso, prazo decadencial. 18.2 Conclusao: viabilidade de rescisoria SIM/NAO.",
  },
  {
    number: 19,
    title: "PREVENCAO E CAUSA RAIZ",
    description:
      "19.1 Causa raiz da condenacao (por verba): | VERBA | CAUSA RAIZ | O QUE PODERIA TER FEITO DIFERENTE |. 19.2 Recomendacoes preventivas (RH, procedimentos, documentacao, treinamentos, controles). 19.3 Exposicao em acoes similares.",
  },
  {
    number: 20,
    title: "RESUMO EXECUTIVO, PROXIMOS PASSOS E PROGNOSTICO",
    description:
      "20.1 Resumo (tabela: Resultado Final, Tipo Rescisao, Resultado por Instancia, Valor Homologado, Liquido Rte, Momento Processual). 20.2 Proximos Passos: | # | ACAO | PRAZO | RESPONSAVEL | PRIORIDADE |. 20.3 Plano de Acao. 20.4 Prognostico por pedido (se nao houver decisao definitiva). 20.5 Acao Rescisoria (se aplicavel). 20.6 Situacao Atual.",
  },
];

const DEFAULT_SECTIONS: SynthesisSection[] = [
  {
    number: 1,
    title: "Dados do Processo",
    description: "CNJ, Vara, Tribunal, Distribuicao, Valor da Causa, Fase.",
  },
  {
    number: 2,
    title: "Partes e Representantes",
    description:
      "Reclamante, Reclamada, Advogados, OAB, Procuracoes, Justica Gratuita.",
  },
  {
    number: 3,
    title: "Dados Contratuais",
    description:
      "Admissao, Demissao, Cargo, Salario, Tipo de Rescisao, Regime.",
  },
  {
    number: 4,
    title: "Objeto da Acao (Pedidos)",
    description: "Lista de pedidos com valores. Narrativa fatica.",
  },
  {
    number: 5,
    title: "Defesa (Principais Teses)",
    description:
      "Preliminares, Prescricao, Teses defensivas por pedido, Impugnacoes.",
  },
  {
    number: 6,
    title: "Audiencias e Instrucao Processual",
    description:
      "Para CADA audiencia: data, tipo, presencas, modalidade. Depoimentos do reclamante e preposto: ITEM POR ITEM com impacto e relevancia. Testemunhas: nome, qualificacao, pontos-chave, contradita. Confissao ficta: destacar se houve (critico). Propostas de acordo em audiencia.",
  },
  {
    number: 7,
    title: "Instrucao Probatoria (Pericias)",
    description:
      "Tipo, perito, conclusao, grau, nexo causal, EPI, incapacidade.",
  },
  {
    number: 8,
    title: "Sentenca",
    description:
      "Resultado, pedidos deferidos/indeferidos, valor condenacao, honorarios, custas, fundamentos.",
  },
  {
    number: 9,
    title: "Recursos e Acordao",
    description:
      "RO (materias por parte), Acordao (composicao, resultado), ED, RR, AIRR, Acordao TST.",
  },
  {
    number: 10,
    title: "Calculos e Liquidacao",
    description:
      "Valores bruto/liquido, descontos, periodo, indice, honorarios, contribuicoes.",
  },
  {
    number: 11,
    title: "Fase de Execucao Detalhada",
    description:
      "Tabela comparativa RDA vs RTE vs Perito. Embargos a execucao (materias + resultado). Agravo de peticao (materias + acordao AP). Depositos, garantias e penhoras (tabela com status). Alvaras e valores soerguidos. OBFs (lista + status). Situacao atual + saldo devedor.",
  },
  {
    number: 12,
    title: "Transito em Julgado / Acordo",
    description: "Data, ID, Certidao, Execucao provisoria.",
  },
  {
    number: 13,
    title: "Riscos e Alertas",
    description:
      "Flags de auditoria, divergencias, campos nao localizados, alertas criticos.",
  },
  {
    number: 14,
    title: "Observacoes",
    description: "Notas adicionais, pendencias, recomendacoes.",
  },
];

// ---------------------------------------------------------------------------
// Configs por modulo
// ---------------------------------------------------------------------------

const MODULE_CONFIGS: Record<string, ModuleSynthesisConfig> = {
  M03: {
    sections: M03_SECTIONS,
    maxOutputTokens: 24_576,
    synthesisTimeoutMs: 150_000,
  },
  M13: {
    sections: M03_SECTIONS, // M13 usa mesma estrutura que M03, com detalhamento maximo
    maxOutputTokens: 24_576,
    synthesisTimeoutMs: 150_000,
  },
  M07: {
    // Auditoria: 16 secoes especificas, mas usa DEFAULT sections + extensions
    sections: DEFAULT_SECTIONS,
    maxOutputTokens: 16_384,
    synthesisTimeoutMs: 120_000,
  },
  DEFAULT: {
    sections: DEFAULT_SECTIONS,
    maxOutputTokens: 16_384,
    synthesisTimeoutMs: 120_000,
  },
};

// ---------------------------------------------------------------------------
// API publica
// ---------------------------------------------------------------------------

/** Retorna a config de sintese para o modulo (ou DEFAULT). */
export function getModuleSynthesisConfig(
  moduleId: string
): ModuleSynthesisConfig {
  return MODULE_CONFIGS[moduleId] ?? MODULE_CONFIGS.DEFAULT;
}

/** Gera o prompt de sintese dinamico baseado no modulo. */
export function getSynthesisPrompt(moduleId: string): string {
  const config = getModuleSynthesisConfig(moduleId);
  const sectionsBlock = config.sections
    .map((s) => `## ${s.number}. ${s.title}\n${s.description}`)
    .join("\n\n");

  return `Voce e um especialista juridico trabalhista. Recebeu extracoes parciais de diferentes secoes de um processo.

TAREFA: Sintetize todas as extracoes num relatorio Markdown unificado e estruturado.

REGRAS:
- Mantenha TODAS as referencias "(fl. XXX)" originais.
- Campos com informacoes conflitantes → marque como "DIVERGENCIA: [versao A] (fl. X) | [versao B] (fl. Y)".
- Campos nao encontrados em nenhum bloco → "Nao localizado nos autos".
- NAO invente dados. Use apenas o que foi extraido.
- Organize pelo template do modulo ${moduleId}.
- Para CADA campo preenchido, inclua a referencia de folha. Ex: **Reclamante:** Joao da Silva (fl. 1)
- Secoes que nao possuem dados nos blocos extraidos devem constar com "Nao localizado nos autos" (NUNCA omitir secao obrigatoria).

ESTRUTURA DO RELATORIO (${config.sections.length} SECOES OBRIGATORIAS):

${sectionsBlock}`;
}
