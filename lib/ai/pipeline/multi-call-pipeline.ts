/**
 * Pipeline multi-chamadas para processar PDFs grandes (>500 pgs) de processos trabalhistas.
 * Divide o texto em blocos temáticos e faz chamadas Claude API sequenciais,
 * seguidas de uma chamada de síntese para gerar o relatório unificado.
 */

import { generateText } from "ai";

import { getLanguageModel } from "@/lib/ai/providers";
import { getAudienciasExtractionPrompt } from "./rag-audiencias";
import { getExecucaoExtractionPrompt } from "./rag-execucao";
import {
  mergeSectionsIntoBlocks,
  type PhaseType,
  type ProcessoBlock,
  splitIntoSections,
} from "./split-processo-sections";

// ---------------------------------------------------------------------------
// Tipos públicos
// ---------------------------------------------------------------------------

export interface PipelineConfig {
  /** Texto completo extraído com marcadores [Pag. N] */
  fullText: string;
  /** Número total de páginas do PDF */
  pageCount: number;
  /** Modelo para extração de blocos 1–N (Sonnet — rápido/barato) */
  extractionModelId: string;
  /** Modelo para compilação/síntese (Opus — mais inteligente) */
  synthesisModelId: string;
  /** Modelo para validação cruzada (Sonnet — custo controlado) */
  validationModelId: string;
  /** ID do módulo Master (ex: "M03") */
  moduleId: string;
  /** Callback de progresso (mensagens para o utilizador) */
  onProgress?: (message: string) => void;
  /** Signal para cancelamento */
  abortSignal?: AbortSignal;
}

export interface BlockResult {
  /** Label do bloco processado */
  blockLabel: string;
  /** Intervalo de páginas */
  pageRange: [number, number];
  /** Campos extraídos: chave → valor com referência fl. */
  extractedFields: Record<string, string>;
  /** Análise em texto livre (markdown) */
  rawAnalysis: string;
  /** Tokens utilizados nesta chamada */
  tokensUsed: number;
}

export interface ValidationScore {
  /** Score de completude (0-100%) */
  completude: number;
  /** Total de campos esperados */
  totalFields: number;
  /** Campos preenchidos com referência */
  filledFields: number;
  /** Erros temporais (T001) */
  temporalErrors: string[];
  /** Erros financeiros (F001) */
  financialErrors: string[];
  /** Erros de classificação (C001) */
  classificationErrors: string[];
  /** Erros de audiência (A001) */
  audienciaErrors: string[];
  /** Erros de execução (E001) */
  execucaoErrors: string[];
}

export interface PipelineResult {
  /** Resultados por bloco */
  blocks: BlockResult[];
  /** Relatório final sintetizado (markdown) */
  synthesizedReport: string;
  /** Erros de validação (campos sem fl.) */
  validationErrors: string[];
  /** Score de validação cruzada (T001/F001/C001) */
  validationScore: ValidationScore;
  /** Total de tokens consumidos */
  totalTokens: number;
}

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

/** Timeout por chamada de bloco (ms) */
const BLOCK_CALL_TIMEOUT_MS = 45_000;
/** Timeout para chamada de síntese/compilação (ms) — aumentado para 90s dado maxOutputTokens 12288 */
const SYNTHESIS_CALL_TIMEOUT_MS = 90_000;
/** Timeout para chamada de validação cruzada (ms) */
const VALIDATION_CALL_TIMEOUT_MS = 40_000;
/** Máximo de caracteres por bloco para enviar ao modelo */
const MAX_BLOCK_CHARS = 120_000;

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

function getBlockExtractionPrompt(
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
- resultado: Provido/Desprovido/Parcialmente provido
- reformas: O que foi reformado da sentença
- manutencoes: O que foi mantido
- data_julgamento: Data do julgamento
- data_publicacao: Data de publicação (DEJT)
- votos_divergentes: Se houve divergência`;
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
// Prompt de síntese
// ---------------------------------------------------------------------------

function getSynthesisPrompt(moduleId: string): string {
  return `Você é um especialista jurídico trabalhista. Recebeu extrações parciais de diferentes secções de um processo.

TAREFA: Sintetize todas as extrações num relatório Markdown unificado e estruturado.

REGRAS:
- Mantenha TODAS as referências "(fl. XXX)" originais.
- Campos com informações conflitantes → marque como "DIVERGÊNCIA: [versão A] (fl. X) | [versão B] (fl. Y)".
- Campos não encontrados em nenhum bloco → "Não localizado nos autos".
- NÃO invente dados. Use apenas o que foi extraído.
- Organize pelo template do módulo ${moduleId}.

ESTRUTURA DO RELATÓRIO:
## 1. Dados do Processo
## 2. Partes e Representantes
## 3. Dados Contratuais
## 4. Objeto da Ação (Pedidos)
## 5. Defesa (Principais Teses)
## 6. Audiências e Instrução Processual
  - Para CADA audiência: data, tipo, presenças, modalidade
  - Depoimentos do reclamante e preposto: ITEM POR ITEM com impacto e relevância
  - Testemunhas: nome, qualificação, pontos-chave, contradita
  - Confissão ficta: destacar se houve (crítico)
  - Propostas de acordo em audiência
## 7. Instrução Probatória (Perícias)
## 8. Sentença
## 9. Recursos e Acórdão
## 10. Cálculos e Liquidação
## 11. Fase de Execução Detalhada
  - Tabela comparativa: RDA vs RTE vs Perito (quando houver >1 conta)
  - Embargos à execução: matérias arguidas e resultado
  - Agravo de petição: matérias e acórdão AP
  - Depósitos, garantias e penhoras: tabela consolidada com status
  - Alvarás e valores soerguidos: total levantado
  - Obrigações de fazer: lista + status cumprimento
  - Situação atual da execução + saldo devedor estimado
## 12. Trânsito em Julgado / Acordo
## 13. Riscos e Alertas
## 14. Observações

Para cada campo, inclua a referência de folha. Ex: **Reclamante:** João da Silva (fl. 1)`;
}

// ---------------------------------------------------------------------------
// Pipeline principal
// ---------------------------------------------------------------------------

export async function runMultiCallPipeline(
  config: PipelineConfig
): Promise<PipelineResult> {
  const {
    fullText,
    pageCount,
    extractionModelId,
    synthesisModelId,
    validationModelId,
    moduleId,
    onProgress,
  } = config;

  onProgress?.(
    `📄 Documento com ${pageCount} páginas detectado. Iniciando pipeline multi-passagem...`
  );

  // 1. Dividir em secções temáticas
  const sections = splitIntoSections(fullText);
  onProgress?.(`🔍 ${sections.length} secções processuais identificadas.`);

  // 2. Agrupar em blocos (target 5-7)
  const blocks = mergeSectionsIntoBlocks(sections, 6);
  onProgress?.(
    `📦 ${blocks.length} blocos para análise: ${blocks.map((b) => b.label).join(", ")}`
  );

  // 3. Chamadas 1–N: Extração por bloco (Sonnet — rápido/barato)
  const blockResults: BlockResult[] = [];
  let totalTokens = 0;

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    onProgress?.(
      `⏳ [Sonnet] Extraindo bloco ${i + 1}/${blocks.length}: ${block.label} (pp. ${block.pageRange[0]}–${block.pageRange[1]})...`
    );

    try {
      const result = await processBlock(
        block,
        extractionModelId,
        BLOCK_CALL_TIMEOUT_MS
      );
      blockResults.push(result);
      totalTokens += result.tokensUsed;
      onProgress?.(
        `✅ Bloco ${i + 1} concluído: ${Object.keys(result.extractedFields).length} campos extraídos.`
      );
    } catch (error) {
      blockResults.push({
        blockLabel: block.label,
        pageRange: block.pageRange,
        extractedFields: {},
        rawAnalysis: `⚠️ Erro ao processar bloco: ${error instanceof Error ? error.message : "timeout"}`,
        tokensUsed: 0,
      });
      onProgress?.(`⚠️ Bloco ${i + 1} falhou — continuando com os restantes.`);
    }
  }

  // 4. Chamada de compilação/síntese (Opus — mais inteligente)
  onProgress?.(
    "🔄 [Opus] Compilando relatório unificado + seções estratégicas..."
  );
  const synthesized = await synthesizeResults(
    blockResults,
    moduleId,
    synthesisModelId,
    SYNTHESIS_CALL_TIMEOUT_MS
  );
  totalTokens += synthesized.tokensUsed;

  // 5. Validação de referências de página (local, sem LLM)
  const pageRefErrors = validatePageReferences(synthesized.report);

  // 6. Chamada de validação cruzada T001/F001/C001/A001/E001 (Sonnet — custo controlado)
  onProgress?.(
    "🔍 [Sonnet] Validação cruzada T001/F001/C001/A001/E001 + score de completude..."
  );
  const validationScore = await runCrossValidation(
    synthesized.report,
    blockResults,
    validationModelId,
    VALIDATION_CALL_TIMEOUT_MS,
    blocks.map((b) => ({ label: b.label, primaryPhase: b.primaryPhase }))
  );
  totalTokens += validationScore.tokensUsed;

  const allErrors = [...pageRefErrors, ...validationScore.errors];

  if (allErrors.length > 0) {
    onProgress?.(`⚠️ ${allErrors.length} problema(s) detectados na validação.`);
  }

  onProgress?.(
    `✅ Pipeline concluído: ${blockResults.length} blocos | Score: ${validationScore.score.completude}% | ${totalTokens} tokens totais.`
  );

  return {
    blocks: blockResults,
    synthesizedReport: synthesized.report,
    validationErrors: allErrors,
    validationScore: validationScore.score,
    totalTokens,
  };
}

// ---------------------------------------------------------------------------
// Processamento de bloco individual
// ---------------------------------------------------------------------------

async function processBlock(
  block: ProcessoBlock,
  modelId: string,
  timeoutMs: number
): Promise<BlockResult> {
  // Truncar bloco se muito grande
  const blockText =
    block.text.length > MAX_BLOCK_CHARS
      ? block.text.slice(0, MAX_BLOCK_CHARS) +
        "\n\n[... bloco truncado para caber no limite ...]"
      : block.text;

  const { text, usage } = await generateText({
    model: getLanguageModel(modelId),
    temperature: 0.1,
    maxOutputTokens: 4096,
    abortSignal: AbortSignal.timeout(timeoutMs),
    system: getBlockExtractionPrompt(block.label, block.primaryPhase),
    prompt: `Analise o seguinte trecho do processo (páginas ${block.pageRange[0]} a ${block.pageRange[1]}):\n\n${blockText}`,
  });

  // Parse JSON da resposta
  let extractedFields: Record<string, string> = {};
  let rawAnalysis = text;

  try {
    // Tentar extrair JSON da resposta (pode estar em code block)
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as {
        fields?: Record<string, string>;
        analysis?: string;
      };
      extractedFields = parsed.fields ?? {};
      rawAnalysis = parsed.analysis ?? text;
    }
  } catch {
    // Se não for JSON válido, usar texto completo como análise
    rawAnalysis = text;
  }

  return {
    blockLabel: block.label,
    pageRange: block.pageRange,
    extractedFields,
    rawAnalysis,
    tokensUsed: usage?.totalTokens ?? 0,
  };
}

// ---------------------------------------------------------------------------
// Síntese dos resultados
// ---------------------------------------------------------------------------

async function synthesizeResults(
  blockResults: BlockResult[],
  moduleId: string,
  modelId: string,
  timeoutMs: number
): Promise<{ report: string; tokensUsed: number }> {
  // Montar contexto com todos os resultados parciais
  const blocksContext = blockResults
    .map((br) => {
      const fieldsStr = Object.entries(br.extractedFields)
        .map(([k, v]) => `  - ${k}: ${v}`)
        .join("\n");
      return `### ${br.blockLabel} (pp. ${br.pageRange[0]}–${br.pageRange[1]})\n${fieldsStr}\n\n${br.rawAnalysis}`;
    })
    .join("\n\n---\n\n");

  const { text, usage } = await generateText({
    model: getLanguageModel(modelId),
    temperature: 0.15,
    maxOutputTokens: 12_288,
    abortSignal: AbortSignal.timeout(timeoutMs),
    system: getSynthesisPrompt(moduleId),
    prompt: `Extrações parciais dos blocos do processo:\n\n${blocksContext}\n\nGere o relatório unificado em Markdown.`,
  });

  return {
    report: text,
    tokensUsed: usage?.totalTokens ?? 0,
  };
}

// ---------------------------------------------------------------------------
// Chamada 6: Validação cruzada T001/F001/C001 (LLM)
// ---------------------------------------------------------------------------

const VALIDATION_PROMPT = `Você é um auditor jurídico. Analise o relatório abaixo e execute 5 validações:

## T001 — VALIDAÇÃO TEMPORAL
Verifique se as datas extraídas estão em ordem cronológica:
admissão < demissão < ajuizamento < sentença < acórdão < trânsito em julgado
Reporte CADA inversão temporal encontrada.

## F001 — VALIDAÇÃO FINANCEIRA
Verifique:
- Valores em formato R$ válido (R$ #.###,##)
- |Total - (Parcelas somadas)| < 0.5% do Total (quando aplicável)
- Honorários ≤ 15% do valor total
- Valor da causa > 0
Reporte CADA inconsistência financeira.

## C001 — VALIDAÇÃO DE CLASSIFICAÇÃO
Verifique se as classificações são válidas:
- tipo_sentença ∈ {procedente, improcedente, parcialmente procedente, extinto, acordo, homologação}
- rito ∈ {ordinário, sumaríssimo, sumário} (quando informado)
- fase ∈ {conhecimento, recursal, execução, encerrado} (quando informado)
Reporte classificações inválidas ou ausentes obrigatórias.

## A001 — VALIDAÇÃO DE AUDIÊNCIA
Verifique consistência dos dados de audiência:
- Se há data de audiência, deve haver registro de presenças das partes
- Se houve audiência de instrução, deve haver ao menos 1 depoimento (reclamante OU preposto)
- Se há testemunha listada, deve ter pelo menos 1 ponto-chave registrado
- Se há confissão ficta, deve indicar de qual parte e motivo
Reporte CADA inconsistência de audiência encontrada.

## E001 — VALIDAÇÃO DE EXECUÇÃO
Verifique consistência dos dados de execução:
- Se há cálculos RDA, deve haver cálculos RTE (e vice-versa, quando em fase de execução)
- Valores de depósitos/garantias devem estar em formato R$ válido
- Se há embargos à execução, deve haver sentença de embargos (ou indicar "pendente de julgamento")
- Datas de cálculos em ordem cronológica
- Se há apólice de seguro garantia, verificar se vigência não está vencida
Reporte CADA inconsistência de execução encontrada.

## SCORE DE COMPLETUDE
Conte quantos dos seguintes campos obrigatórios estão preenchidos (com valor real, não "Não localizado"):

Campos base (19):
numero_processo, vara, reclamante, reclamada, advogado_reclamante, data_admissao, data_demissao,
funcao_cargo, ultimo_salario, pedidos, valor_causa, tipo_sentenca, pedidos_deferidos,
valor_condenacao, honorarios, data_sentenca, resultado_recurso, valor_liquido, data_transito

Campos audiência (5) — contar apenas se existir seção de audiência no relatório:
audiencia_data, audiencia_tipo, depoimento_reclamante, depoimento_preposto, testemunhas

Campos execução (4) — contar apenas se existir seção de execução no relatório:
calculos_reclamante_rda, calculos_reclamado_rte, homologacao_calculos, situacao_execucao

IMPORTANTE: total_count é dinâmico — 19 base + 5 se há audiência + 4 se há execução.
Se o relatório não contém seção de audiência, não conte os 5 campos de audiência.
Se o relatório não contém seção de execução, não conte os 4 campos de execução.

Responda em JSON:
{
  "temporal_errors": ["descrição do erro 1", ...],
  "financial_errors": ["descrição do erro 1", ...],
  "classification_errors": ["descrição do erro 1", ...],
  "audiencia_errors": ["descrição do erro 1", ...],
  "execucao_errors": ["descrição do erro 1", ...],
  "filled_count": <número>,
  "total_count": <19 a 28, conforme seções presentes>,
  "completude_score": <0-100>
}`;

async function runCrossValidation(
  report: string,
  _blockResults: BlockResult[],
  modelId: string,
  timeoutMs: number,
  blockMeta?: Array<{ label: string; primaryPhase?: PhaseType }>
): Promise<{
  score: ValidationScore;
  errors: string[];
  tokensUsed: number;
}> {
  try {
    // Montar metadata de blocos para ajudar a validação a saber quais fases existem
    const metaSection = blockMeta?.length
      ? `\n\nBLOCOS PROCESSADOS:\n${blockMeta.map((b) => `- ${b.label} (fase: ${b.primaryPhase ?? "indefinida"})`).join("\n")}\n\nUse esta informação para determinar se o processo contém seções de audiência (fase instrucao) e/ou execução (fase execucao). Só conte campos de audiência/execução se os blocos correspondentes existirem.`
      : "";

    const { text, usage } = await generateText({
      model: getLanguageModel(modelId),
      temperature: 0.05,
      maxOutputTokens: 2048,
      abortSignal: AbortSignal.timeout(timeoutMs),
      system: VALIDATION_PROMPT,
      prompt: `Relatório para validação:\n\n${report.slice(0, 80_000)}${metaSection}`,
    });

    // Parse JSON
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as {
        temporal_errors?: string[];
        financial_errors?: string[];
        classification_errors?: string[];
        audiencia_errors?: string[];
        execucao_errors?: string[];
        filled_count?: number;
        total_count?: number;
        completude_score?: number;
      };

      const score: ValidationScore = {
        completude: parsed.completude_score ?? 0,
        totalFields: parsed.total_count ?? 19,
        filledFields: parsed.filled_count ?? 0,
        temporalErrors: parsed.temporal_errors ?? [],
        financialErrors: parsed.financial_errors ?? [],
        classificationErrors: parsed.classification_errors ?? [],
        audienciaErrors: parsed.audiencia_errors ?? [],
        execucaoErrors: parsed.execucao_errors ?? [],
      };

      const errors: string[] = [
        ...score.temporalErrors.map((e) => `[T001] ${e}`),
        ...score.financialErrors.map((e) => `[F001] ${e}`),
        ...score.classificationErrors.map((e) => `[C001] ${e}`),
        ...score.audienciaErrors.map((e) => `[A001] ${e}`),
        ...score.execucaoErrors.map((e) => `[E001] ${e}`),
      ];

      return { score, errors, tokensUsed: usage?.totalTokens ?? 0 };
    }

    // Fallback se não conseguiu parsear
    return {
      score: {
        completude: 0,
        totalFields: 19,
        filledFields: 0,
        temporalErrors: [],
        financialErrors: [],
        classificationErrors: [],
        audienciaErrors: [],
        execucaoErrors: [],
      },
      errors: ["Validação cruzada: resposta não parseável"],
      tokensUsed: usage?.totalTokens ?? 0,
    };
  } catch {
    // Timeout ou erro — não bloquear pipeline
    return {
      score: {
        completude: 0,
        totalFields: 19,
        filledFields: 0,
        temporalErrors: [],
        financialErrors: [],
        classificationErrors: [],
        audienciaErrors: [],
        execucaoErrors: [],
      },
      errors: ["Validação cruzada: timeout ou erro na chamada"],
      tokensUsed: 0,
    };
  }
}

// ---------------------------------------------------------------------------
// Validação de referências de página (local, sem LLM)
// ---------------------------------------------------------------------------

/**
 * Verifica se campos com valores no relatório possuem referência de folha (fl. XXX).
 * Retorna lista de campos sem referência.
 */
export function validatePageReferences(report: string): string[] {
  const errors: string[] = [];
  // Padrão: **Campo:** Valor — esperamos (fl. X) em algum lugar do valor
  const fieldPattern =
    /\*\*([^*]+)\*\*:\s*(?!Não localizado|---|-{2,}|NÃO LOCALIZADO|N\/A)(.+)/g;
  let match: RegExpExecArray | null = fieldPattern.exec(report);
  while (match !== null) {
    const fieldName = match[1].trim();
    const value = match[2].trim();
    // Ignorar campos sem valor real
    if (value.length < 3) {
      continue;
    }
    // Verificar se contém referência de folha
    if (!(/\(?\s*fl\.\s*\d+/i.test(value) || /\[Pag\.\s*\d+\]/i.test(value))) {
      errors.push(
        `Campo "${fieldName}" sem referência de página: "${value.slice(0, 60)}..."`
      );
    }
    match = fieldPattern.exec(report);
  }
  return errors;
}
