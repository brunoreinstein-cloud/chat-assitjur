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
// Helpers de cancelamento
// ---------------------------------------------------------------------------

/**
 * Combina um AbortSignal de timeout com um sinal externo opcional.
 * Quando o stream principal é cancelado (utilizador fecha o browser ou maxDuration
 * é atingido), o pipeline para imediatamente em vez de esperar cada timeout
 * individual (até 45s por bloco).
 *
 * AbortSignal.any() disponível desde Node.js 20 / Chrome 116 (Vercel ≥ Node 20 ✓).
 */
function makeAbortSignal(timeoutMs: number, outer?: AbortSignal): AbortSignal {
  const ts = AbortSignal.timeout(timeoutMs);
  return outer ? AbortSignal.any([ts, outer]) : ts;
}

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

/**
 * Converte um label técnico de bloco em linguagem natural para o advogado.
 * Ex: "Sentença" → "a sentença", "Cálculos/Liquidação" → "os cálculos"
 */
function humanizeBlockLabel(label: string): string {
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
    abortSignal,
  } = config;

  // Estimativa de tempo baseada no nº de páginas (referência para o advogado)
  const estimatedMinutes =
    pageCount <= 100 ? "1–2" : pageCount <= 300 ? "2–3" : "3–5";
  onProgress?.(
    `📋 Processo de **${pageCount} páginas** recebido. Estimativa: **${estimatedMinutes} minutos**. Pode continuar navegando — avisaremos quando estiver pronto.`
  );

  // 1. Dividir em secções temáticas
  const sections = splitIntoSections(fullText);

  // 2. Agrupar em blocos (target 5-7)
  const blocks = mergeSectionsIntoBlocks(sections, 6);
  const blockNames = blocks.map((b) => humanizeBlockLabel(b.label)).join(", ");
  onProgress?.(`📖 Estrutura identificada. Seções a analisar: ${blockNames}.`);

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
    blocks.map((block, _i) =>
      sem(async () => {
        // Sub-blocos: dividir se excede MAX_BLOCK_CHARS
        const subBlocks =
          block.text.length > MAX_BLOCK_CHARS
            ? splitBlockIntoSubBlocks(block, MAX_BLOCK_CHARS)
            : [block];

        // Sub-blocos de documentos muito extensos — mensagem omitida ao utilizador
        // (detalhe interno irrelevante para o advogado)

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
            `📄 Lendo ${humanizeBlockLabel(subLabel)} (páginas ${sub.pageRange[0]}–${sub.pageRange[1]})...`
          );

          try {
            const result = await processBlockWithRetry(
              sub,
              extractionModelId,
              BLOCK_CALL_TIMEOUT_MS,
              CRITICAL_BLOCK_LABELS.test(sub.label) ? 1 : 0,
              onProgress,
              abortSignal
            );
            // Merge fields: valores posteriores sobrescrevem, salvo divergência
            for (const [key, value] of Object.entries(result.extractedFields)) {
              if (mergedFields[key] && mergedFields[key] !== value) {
                mergedFields[key] =
                  `DIVERGÊNCIA: ${mergedFields[key]} | ${value}`;
              } else {
                mergedFields[key] = value;
              }
            }
            mergedAnalysisParts.push(result.rawAnalysis);
            mergedTokens += result.tokensUsed;
            anySuccess = true;
            onProgress?.(
              `✓ ${humanizeBlockLabel(subLabel)} analisado — ${Object.keys(result.extractedFields).length} informações extraídas.`
            );
          } catch {
            // Falha interna — não expor detalhes técnicos ao advogado
            mergedAnalysisParts.push(
              `⚠️ Seção com leitura incompleta: ${subLabel}`
            );
            onProgress?.(
              `⚠️ ${humanizeBlockLabel(subLabel)}: leitura parcial — continuando com as demais seções.`
            );
          }
        }

        if (!anySuccess) {
          onProgress?.(
            `⚠️ ${humanizeBlockLabel(block.label)}: não foi possível ler esta seção — o restante do processo será analisado normalmente.`
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

  // ─────────────────────────────────────────────────────────────────────────
  // PADRÃO C — Validar ANTES de sintetizar
  //
  //  4. [Sonnet Validator] Pré-validação cruzada T001/F001/C001/A001/E001
  //     Usa o contexto compacto dos blocos (campos extraídos), não o relatório
  //     final (que ainda não existe). O Opus Redactor receberá estes alertas.
  //
  //  5. [Opus Redactor]   Síntese/redação com contexto validado
  //     O Opus conhece os problemas antes de escrever — pode resolver conflitos
  //     inline e produzir um relatório mais preciso.
  //
  //  6. Validação de referências de página (local, sem LLM) — pós-síntese
  // ─────────────────────────────────────────────────────────────────────────

  // 4. Pré-validação cruzada (Sonnet Validator) — ANTES do Opus
  onProgress?.("🔎 Verificando consistência dos dados extraídos...");
  const compactContext = buildCompactValidationContext(blockResults);
  const preValidation = await runCrossValidation(
    compactContext,
    validationModelId,
    VALIDATION_CALL_TIMEOUT_MS,
    blocks.map((b) => ({ label: b.label, primaryPhase: b.primaryPhase })),
    moduleId,
    abortSignal
  );
  totalTokens += preValidation.tokensUsed;

  // Construir o resumo de alertas a passar ao Opus (só quando há erros)
  const validationAlertsForOpus =
    preValidation.errors.length > 0
      ? preValidation.errors.join("\n")
      : undefined;

  if (preValidation.errors.length > 0) {
    onProgress?.(
      `⚠️ ${preValidation.errors.length} inconsistência(s) detectada(s) nos dados — serão sinalizadas no relatório.`
    );
  } else {
    onProgress?.("✓ Dados verificados e consistentes.");
  }

  // 5. Compilação/síntese (Opus Redactor) — recebe alertas do Validator
  const synthesisConfig = getModuleSynthesisConfig(moduleId);
  onProgress?.(
    `✍️ Redigindo o relatório completo (${synthesisConfig.sections.length} seções). Esta é a etapa mais longa — mais 1–2 minutos...`
  );
  // Síntese com fallback garantido: se o Opus falhar (timeout, erro de API),
  // o advogado recebe um relatório parcial estruturado em vez de erro em branco.
  let synthesizedReport: string;
  let synthesisTokens = 0;

  try {
    const synthesized = await synthesizeResults(
      blockResults,
      moduleId,
      synthesisModelId,
      synthesisConfig.synthesisTimeoutMs,
      synthesisConfig.maxOutputTokens,
      validationAlertsForOpus,
      abortSignal
    );
    synthesizedReport = synthesized.report;
    synthesisTokens = synthesized.tokensUsed;
  } catch {
    // Fallback: síntese falhou → entregar campos extraídos formatados.
    // O advogado recebe dados reais, sinalizados como relatório parcial.
    onProgress?.(
      "⚠️ A redação do relatório completo encontrou uma instabilidade. Entregando relatório parcial com os dados extraídos..."
    );
    synthesizedReport = buildFallbackReport(blockResults, moduleId);
  }

  totalTokens += synthesisTokens;

  // 6. Validação de referências de página (local, sem LLM) — pós-síntese
  const pageRefErrors = validatePageReferences(synthesizedReport);
  const allErrors = [...pageRefErrors, ...preValidation.errors];

  onProgress?.(
    `✅ Análise concluída com **${preValidation.score.completude}% de completude**. Gerando documento...`
  );

  return {
    blocks: blockResults,
    synthesizedReport,
    validationErrors: allErrors,
    validationScore: preValidation.score,
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
  maxOutputTokens?: number,
  signal?: AbortSignal
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
    abortSignal: makeAbortSignal(timeoutMs, signal),
    system: getBlockExtractionPrompt(block.label, block.primaryPhase),
    prompt: `Analise o seguinte trecho do processo (páginas ${block.pageRange[0]} a ${block.pageRange[1]}):\n\n${blockText}`,
    providerOptions: {
      gateway: {
        // Prompt caching automático: Anthropic cacheia o system-prompt estático
        // (mesmo prompt por tipo de bloco) → desconto ~90% nos input tokens.
        caching: "auto",
        // Provider routing: se Anthropic direct atingir rate limit (429),
        // o Gateway faz fallback automático para Bedrock → Vertex.
        // Requer BYOK configurado no dashboard Vercel para cada provider.
        order: ["anthropic", "bedrock", "vertex"],
      },
    },
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
  onProgress?: (message: string) => void,
  signal?: AbortSignal
): Promise<BlockResult> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const effectiveTimeout =
        attempt === 0 ? timeoutMs : Math.round(timeoutMs * 1.5);
      return await processBlock(
        block,
        modelId,
        effectiveTimeout,
        undefined,
        signal
      );
    } catch (error) {
      lastError = error;
      // Se o sinal externo foi abortado (utilizador cancelou / maxDuration atingido),
      // não tentar novamente — propagar o cancelamento imediatamente.
      if (signal?.aborted) {
        break;
      }
      if (attempt < maxRetries) {
        const waitMs = 2000 * (attempt + 1);
        // Retry transparente — o advogado não precisa saber dos detalhes internos
        onProgress?.(
          `🔄 Relendo ${humanizeBlockLabel(block.label)} (aguardando ${waitMs / 1000}s)...`
        );
        await new Promise((resolve) => setTimeout(resolve, waitMs));
      }
    }
  }

  // Todas as tentativas falharam (ou operação cancelada)
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
// Contexto compacto para pré-validação (Padrão C)
// ---------------------------------------------------------------------------

/**
 * Constrói um resumo compacto dos campos extraídos de todos os blocos.
 * Usado como input do Sonnet Validator ANTES da síntese pelo Opus,
 * permitindo detectar T001/F001/C001/A001/E001 sobre os dados brutos.
 */
function buildCompactValidationContext(blockResults: BlockResult[]): string {
  return blockResults
    .map((br) => {
      const fieldsStr = Object.entries(br.extractedFields)
        .map(([k, v]) => `  ${k}: ${v}`)
        .join("\n");
      // Inclui rawAnalysis (texto livre do Sonnet Extractor) para que o Validator
      // tenha contexto suficiente para detectar T001/F001 — e.g., datas fora de
      // sequência que só são visíveis na narrativa, não nos campos isolados.
      const analysis = br.rawAnalysis?.trim()
        ? `\nAnálise:\n${br.rawAnalysis.slice(0, 2000)}` // cap 2K chars por bloco
        : "";
      return `### ${br.blockLabel} (pp. ${br.pageRange[0]}–${br.pageRange[1]})\n${fieldsStr || "  (sem campos extraídos)"}${analysis}`;
    })
    .join("\n\n");
}

// ---------------------------------------------------------------------------
// Relatório de fallback (quando a síntese Opus falha)
// ---------------------------------------------------------------------------

/**
 * Gera um relatório parcial estruturado a partir dos campos extraídos pelos blocos.
 * Usado como fallback quando a chamada de síntese do Opus falha ou excede o timeout.
 * O advogado recebe dados reais em vez de uma mensagem de erro em branco.
 */
function buildFallbackReport(
  blockResults: BlockResult[],
  moduleId: string
): string {
  const header = `# ⚠️ RELATÓRIO PARCIAL — ANÁLISE INCOMPLETA

> **Atenção:** A redação automática completa não foi concluída devido a uma instabilidade técnica.
> As informações abaixo foram extraídas diretamente do processo e são precisas,
> mas estão apresentadas de forma simplificada, sem a formatação completa do relatório ${moduleId}.
> Recomenda-se re-executar a análise para obter o relatório completo.

---
`;

  const sections = blockResults
    .map((br) => {
      if (Object.keys(br.extractedFields).length === 0) {
        return null;
      }
      const fields = Object.entries(br.extractedFields)
        .filter(([, v]) => v && !v.includes("Não localizado"))
        .map(([k, v]) => `**${k}:** ${v}`)
        .join("\n\n");
      return fields
        ? `## ${br.blockLabel} (fl. ${br.pageRange[0]}–${br.pageRange[1]})\n\n${fields}`
        : null;
    })
    .filter(Boolean)
    .join("\n\n---\n\n");

  return `${header}${sections || "Nenhum campo extraído com sucesso."}`;
}

// ---------------------------------------------------------------------------
// Síntese dos resultados
// ---------------------------------------------------------------------------

/**
 * Sintetiza os resultados dos blocos num relatório unificado (Opus Redactor).
 *
 * Padrão C: aceita `validationAlerts` do Sonnet Validator para que o Opus
 * possa resolver conflitos inline antes de redigir cada secção.
 */
async function synthesizeResults(
  blockResults: BlockResult[],
  moduleId: string,
  modelId: string,
  timeoutMs: number,
  maxTokens?: number,
  /** Alertas T001/F001/C001/A001/E001 gerados pelo Sonnet Validator (pré-síntese). */
  validationAlerts?: string,
  signal?: AbortSignal
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
    abortSignal: makeAbortSignal(timeoutMs, signal),
    // getSynthesisPrompt recebe validationAlerts → Opus conhece os problemas antes de redigir
    system: getSynthesisPrompt(moduleId, validationAlerts),
    prompt: `Extrações parciais dos blocos do processo:\n\n${blocksContext}\n\nGere o relatório unificado em Markdown.`,
    providerOptions: {
      gateway: {
        // System-prompt das 20 seções M03 (~3K tokens, estático por módulo):
        // caching 'auto' → desconto ~90% nos input tokens após 1ª chamada.
        caching: "auto",
        // Opus: Bedrock e Vertex também disponibilizam claude-opus.
        // Se Anthropic direct estiver sobrecarregado, fallback transparente.
        order: ["anthropic", "bedrock", "vertex"],
      },
    },
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
  /** Contexto compacto dos blocos: campos extraídos + rawAnalysis (Padrão C — pré-síntese). */
  context: string,
  modelId: string,
  timeoutMs: number,
  blockMeta?: Array<{ label: string; primaryPhase?: PhaseType }>,
  moduleId?: string,
  signal?: AbortSignal
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
      abortSignal: makeAbortSignal(timeoutMs, signal),
      system: getValidationPrompt(moduleId ?? "DEFAULT"),
      prompt: `Campos extraídos dos blocos (dados brutos, pré-síntese):\n\n${context.slice(0, 80_000)}${metaSection}`,
      providerOptions: {
        gateway: {
          caching: "auto",
          order: ["anthropic", "bedrock", "vertex"],
        },
      },
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
