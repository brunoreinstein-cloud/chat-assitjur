/**
 * Pipeline multi-chamadas para processar PDFs grandes (>500 pgs) de processos trabalhistas.
 * Divide o texto em blocos temáticos e faz chamadas Claude API sequenciais,
 * seguidas de uma chamada de síntese para gerar o relatório unificado.
 */

import { generateText } from "ai";

import { getLanguageModel } from "@/lib/ai/providers";
import { extractJsonObject } from "./json-utils";
import { getAudienciasExtractionPrompt } from "./rag-audiencias";
import { getExecucaoExtractionPrompt } from "./rag-execucao";
import {
  mergeSectionsIntoBlocks,
  type PhaseType,
  type ProcessoBlock,
  splitIntoSections,
} from "./split-processo-sections";
import {
  getModuleSynthesisConfig,
  getSynthesisPrompt,
} from "./synthesis-prompts";
import { getValidationPrompt } from "./validation-prompts";

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
/** Timeout para chamada de validação cruzada (ms) */
const VALIDATION_CALL_TIMEOUT_MS = 40_000;
/** Máximo de caracteres por bloco para enviar ao modelo */
const MAX_BLOCK_CHARS = 120_000;
/** Regex para detectar blocos críticos (retry obrigatório em caso de falha) */
const CRITICAL_BLOCK_LABELS =
  /Senten[çc]a|Ac[óo]rd[ãa]o|C[áa]lculos|Liquida[çc][ãa]o|Embargos/i;
/**
 * Nº máximo de blocos a extrair em paralelo.
 * 3 permite reduzir o tempo de extracção para ~1/3 sem pressionar o rate limit
 * da API Anthropic (cada bloco usa ≤ 120 K chars de input + ≤ 4096 tokens output).
 */
const BLOCK_EXTRACTION_CONCURRENCY = 3;
/**
 * Budget de tokens de saída por bloco.
 * Blocos não-críticos raramente precisam de mais de 2048 tokens;
 * reservar 4096 apenas para Sentença, Acórdão, Cálculos, etc.
 */
const BLOCK_MAX_OUTPUT_TOKENS_DEFAULT = 2048;
const BLOCK_MAX_OUTPUT_TOKENS_CRITICAL = 4096;

// ---------------------------------------------------------------------------
// Semáforo de concorrência (sem dependência externa)
// ---------------------------------------------------------------------------

/**
 * Cria um semáforo que limita o número de Promises em execução simultânea.
 * Uso:
 *   const sem = createSemaphore(3);
 *   await Promise.all(items.map(item => sem(() => processItem(item))));
 */
function createSemaphore(concurrency: number) {
  let active = 0;
  const queue: Array<() => void> = [];

  function release() {
    active--;
    const next = queue.shift();
    if (next) {
      active++;
      next();
    }
  }

  return function run<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      function attempt() {
        fn().then(resolve, reject).finally(release);
      }
      if (active < concurrency) {
        active++;
        attempt();
      } else {
        queue.push(attempt);
      }
    });
  };
}

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
// Prompt de síntese — importado de synthesis-prompts.ts (dinâmico por módulo)
// ---------------------------------------------------------------------------

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
  //    Blocos > MAX_BLOCK_CHARS são divididos em sub-blocos (sub-loop sequencial).
  //    Blocos críticos (Sentença, Acórdão, etc.) têm retry em caso de falha.
  //
  //    PARALELISMO: os N blocos de topo correm em simultâneo com concorrência
  //    máxima BLOCK_EXTRACTION_CONCURRENCY (3). Cada bloco mantém o sub-loop
  //    sequencial para garantir a fusão correcta de campos entre sub-blocos.
  //    Resultados são recolhidos por índice para preservar a ordem original.
  let totalTokens = 0;

  const sem = createSemaphore(BLOCK_EXTRACTION_CONCURRENCY);
  const blockResultsOrdered = await Promise.all(
    blocks.map((block, i) =>
      sem(async () => {
        // Sub-blocos: dividir se excede MAX_BLOCK_CHARS
        const subBlocks =
          block.text.length > MAX_BLOCK_CHARS
            ? splitBlockIntoSubBlocks(block, MAX_BLOCK_CHARS)
            : [block];

        if (subBlocks.length > 1) {
          onProgress?.(
            `📦 Bloco ${i + 1}/${blocks.length}: ${block.label} dividido em ${subBlocks.length} sub-blocos.`
          );
        }

        const mergedFields: Record<string, string> = {};
        const mergedAnalysisParts: string[] = [];
        let mergedTokens = 0;
        let anySuccess = false;

        for (let j = 0; j < subBlocks.length; j++) {
          const sub = subBlocks[j];
          const subLabel =
            subBlocks.length > 1
              ? `${block.label} (sub-bloco ${j + 1}/${subBlocks.length})`
              : block.label;

          onProgress?.(
            `⏳ [Sonnet] Extraindo bloco ${i + 1}/${blocks.length}: ${subLabel} (pp. ${sub.pageRange[0]}–${sub.pageRange[1]})...`
          );

          try {
            const result = await processBlockWithRetry(
              sub,
              extractionModelId,
              BLOCK_CALL_TIMEOUT_MS,
              CRITICAL_BLOCK_LABELS.test(sub.label) ? 1 : 0,
              onProgress
            );
            // Merge fields: valores posteriores sobrescrevem, salvo divergência
            for (const [key, value] of Object.entries(result.extractedFields)) {
              if (mergedFields[key] && mergedFields[key] !== value) {
                mergedFields[key] = `DIVERGÊNCIA: ${mergedFields[key]} | ${value}`;
              } else {
                mergedFields[key] = value;
              }
            }
            mergedAnalysisParts.push(result.rawAnalysis);
            mergedTokens += result.tokensUsed;
            anySuccess = true;
            onProgress?.(
              `✅ ${subLabel} concluído: ${Object.keys(result.extractedFields).length} campos extraídos.`
            );
          } catch (error) {
            mergedAnalysisParts.push(
              `⚠️ Erro ao processar ${subLabel}: ${error instanceof Error ? error.message : "timeout"}`
            );
            onProgress?.(`⚠️ ${subLabel} falhou — continuando com os restantes.`);
          }
        }

        if (!anySuccess) {
          onProgress?.(
            `⚠️ Bloco ${i + 1} (${block.label}) falhou completamente — continuando.`
          );
        }

        return {
          blockLabel: block.label,
          pageRange: block.pageRange,
          extractedFields: mergedFields,
          rawAnalysis: mergedAnalysisParts.join("\n\n"),
          tokensUsed: mergedTokens,
        } satisfies BlockResult;
      })
    )
  );

  const blockResults: BlockResult[] = blockResultsOrdered;

  // 4. Chamada de compilação/síntese (Opus — mais inteligente)
  //    maxOutputTokens e timeout dinâmicos por módulo.
  const synthesisConfig = getModuleSynthesisConfig(moduleId);
  onProgress?.(
    `🔄 [Opus] Compilando relatório unificado (${synthesisConfig.sections.length} seções, max ${synthesisConfig.maxOutputTokens} tokens)...`
  );
  const synthesized = await synthesizeResults(
    blockResults,
    moduleId,
    synthesisModelId,
    synthesisConfig.synthesisTimeoutMs,
    synthesisConfig.maxOutputTokens
  );
  totalTokens += synthesized.tokensUsed;

  // 5. Validação de referências de página (local, sem LLM)
  const pageRefErrors = validatePageReferences(synthesized.report);

  // 6. Chamada de validação cruzada T001/F001/C001/A001/E001 (Sonnet — custo controlado)
  //    Prompt dinâmico por módulo (campos obrigatórios variam).
  onProgress?.(
    "🔍 [Sonnet] Validação cruzada T001/F001/C001/A001/E001 + score de completude..."
  );
  const validationScore = await runCrossValidation(
    synthesized.report,
    blockResults,
    validationModelId,
    VALIDATION_CALL_TIMEOUT_MS,
    blocks.map((b) => ({ label: b.label, primaryPhase: b.primaryPhase })),
    moduleId
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
  timeoutMs: number,
  maxOutputTokens?: number
): Promise<BlockResult> {
  // Sub-blocos já garantem que o texto está dentro do limite.
  // Segurança extra: truncar com aviso se ainda exceder (não deveria acontecer).
  const blockText =
    block.text.length > MAX_BLOCK_CHARS
      ? `${block.text.slice(0, MAX_BLOCK_CHARS)}\n\n[... bloco truncado por segurança ...]`
      : block.text;

  // Budget adaptativo: blocos críticos (Sentença, Acórdão, Cálculos…) ficam com
  // 4096 tokens; restantes usam 2048 — reduz o tempo de geração por bloco ~30%.
  const effectiveMaxTokens =
    maxOutputTokens ??
    (CRITICAL_BLOCK_LABELS.test(block.label)
      ? BLOCK_MAX_OUTPUT_TOKENS_CRITICAL
      : BLOCK_MAX_OUTPUT_TOKENS_DEFAULT);

  const { text, usage } = await generateText({
    model: getLanguageModel(modelId),
    temperature: 0.1,
    maxOutputTokens: effectiveMaxTokens,
    abortSignal: AbortSignal.timeout(timeoutMs),
    system: getBlockExtractionPrompt(block.label, block.primaryPhase),
    prompt: `Analise o seguinte trecho do processo (páginas ${block.pageRange[0]} a ${block.pageRange[1]}):\n\n${blockText}`,
  });

  // Parse JSON da resposta (parser robusto com fallback em camadas)
  let extractedFields: Record<string, string> = {};
  let rawAnalysis = text;

  const parsed = extractJsonObject(text) as {
    fields?: Record<string, string>;
    analysis?: string;
  } | null;

  if (parsed?.fields) {
    extractedFields = parsed.fields;
    rawAnalysis = parsed.analysis ?? text;
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
// Retry para blocos críticos
// ---------------------------------------------------------------------------

async function processBlockWithRetry(
  block: ProcessoBlock,
  modelId: string,
  timeoutMs: number,
  maxRetries: number,
  onProgress?: (message: string) => void
): Promise<BlockResult> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const effectiveTimeout =
        attempt === 0 ? timeoutMs : Math.round(timeoutMs * 1.5);
      return await processBlock(block, modelId, effectiveTimeout);
    } catch (error) {
      lastError = error;
      if (attempt < maxRetries) {
        const waitMs = 2000 * (attempt + 1);
        onProgress?.(
          `🔄 Retentando bloco crítico: ${block.label} (tentativa ${attempt + 2}/${maxRetries + 1}, aguardando ${waitMs / 1000}s)...`
        );
        await new Promise((resolve) => setTimeout(resolve, waitMs));
      }
    }
  }

  // Todas as tentativas falharam
  throw lastError;
}

// ---------------------------------------------------------------------------
// Divisão de blocos grandes em sub-blocos
// ---------------------------------------------------------------------------

function splitBlockIntoSubBlocks(
  block: ProcessoBlock,
  maxChars: number
): ProcessoBlock[] {
  const text = block.text;
  const subBlocks: ProcessoBlock[] = [];

  // Encontrar todos os marcadores [Pag. N] com suas posições
  const pageMarkers: Array<{ offset: number; page: number }> = [];
  const PAGE_RE = /\[Pag\.\s*(\d+)\]/g;
  for (const match of text.matchAll(PAGE_RE)) {
    pageMarkers.push({
      offset: match.index,
      page: Number.parseInt(match[1], 10),
    });
  }

  // Se poucos marcadores, dividir pela metade do texto
  if (pageMarkers.length < 2) {
    const mid = Math.floor(text.length / 2);
    subBlocks.push({
      label: block.label,
      sections: block.sections,
      text: text.slice(0, mid),
      pageRange: [block.pageRange[0], block.pageRange[0]],
      primaryPhase: block.primaryPhase,
    });
    subBlocks.push({
      label: block.label,
      sections: block.sections,
      text: text.slice(mid),
      pageRange: [block.pageRange[0], block.pageRange[1]],
      primaryPhase: block.primaryPhase,
    });
    return subBlocks;
  }

  // Dividir nos marcadores mais próximos dos limites de maxChars
  let startOffset = 0;
  let startPage = block.pageRange[0];

  while (startOffset < text.length) {
    const endTarget = startOffset + maxChars;

    if (endTarget >= text.length) {
      // Último sub-bloco
      subBlocks.push({
        label: block.label,
        sections: block.sections,
        text: text.slice(startOffset),
        pageRange: [startPage, block.pageRange[1]],
        primaryPhase: block.primaryPhase,
      });
      break;
    }

    // Encontrar o marcador [Pag. N] mais próximo (antes) do endTarget
    let bestMarker = pageMarkers.find((m) => m.offset >= endTarget);
    if (!bestMarker) {
      // Sem marcador após endTarget, usar o último disponível antes
      bestMarker = [...pageMarkers]
        .reverse()
        .find((m) => m.offset > startOffset && m.offset <= endTarget);
    }

    const splitAt = bestMarker?.offset ?? endTarget;
    const endPage = bestMarker?.page ?? startPage;

    subBlocks.push({
      label: block.label,
      sections: block.sections,
      text: text.slice(startOffset, splitAt),
      pageRange: [startPage, endPage],
      primaryPhase: block.primaryPhase,
    });

    startOffset = splitAt;
    startPage = endPage;
  }

  return subBlocks;
}

// ---------------------------------------------------------------------------
// Síntese dos resultados
// ---------------------------------------------------------------------------

async function synthesizeResults(
  blockResults: BlockResult[],
  moduleId: string,
  modelId: string,
  timeoutMs: number,
  maxTokens?: number
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
    maxOutputTokens: maxTokens ?? 16_384,
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
// Prompt dinâmico por módulo — importado de validation-prompts.ts
// ---------------------------------------------------------------------------

async function runCrossValidation(
  report: string,
  _blockResults: BlockResult[],
  modelId: string,
  timeoutMs: number,
  blockMeta?: Array<{ label: string; primaryPhase?: PhaseType }>,
  moduleId?: string
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
      system: getValidationPrompt(moduleId ?? "DEFAULT"),
      prompt: `Relatório para validação:\n\n${report.slice(0, 80_000)}${metaSection}`,
    });

    // Parse JSON (parser robusto)
    const jsonResult = extractJsonObject(text);
    if (jsonResult) {
      const parsed = jsonResult as {
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
