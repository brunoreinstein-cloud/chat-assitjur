/**
 * Pipeline multi-chamadas para processar PDFs grandes (>500 pgs) de processos trabalhistas.
 * Divide o texto em blocos temáticos e faz chamadas Claude API sequenciais,
 * seguidas de uma chamada de síntese para gerar o relatório unificado.
 */

import { generateText } from "ai";

import { getLanguageModel } from "@/lib/ai/providers";

import {
  splitIntoSections,
  mergeSectionsIntoBlocks,
  type ProcessoBlock,
} from "./split-processo-sections";

// ---------------------------------------------------------------------------
// Tipos públicos
// ---------------------------------------------------------------------------

export interface PipelineConfig {
  /** Texto completo extraído com marcadores [Pag. N] */
  fullText: string;
  /** Número total de páginas do PDF */
  pageCount: number;
  /** ID do modelo AI SDK (ex: "anthropic/claude-sonnet-4.6") */
  modelId: string;
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

export interface PipelineResult {
  /** Resultados por bloco */
  blocks: BlockResult[];
  /** Relatório final sintetizado (markdown) */
  synthesizedReport: string;
  /** Erros de validação (campos sem fl.) */
  validationErrors: string[];
  /** Total de tokens consumidos */
  totalTokens: number;
}

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

/** Timeout por chamada de bloco (ms) */
const BLOCK_CALL_TIMEOUT_MS = 45_000;
/** Timeout para chamada de síntese (ms) */
const SYNTHESIS_CALL_TIMEOUT_MS = 60_000;
/** Máximo de caracteres por bloco para enviar ao modelo */
const MAX_BLOCK_CHARS = 120_000;

// ---------------------------------------------------------------------------
// Prompts por tipo de secção
// ---------------------------------------------------------------------------

function getBlockExtractionPrompt(blockLabel: string): string {
  const base = `Você é um extrator jurídico especializado em processos trabalhistas brasileiros.
REGRAS INVIOLÁVEIS:
- Para CADA valor extraído, inclua a referência "(fl. XXX)" baseada nos marcadores [Pag. N] do texto.
- Se não encontrar um campo, escreva "Não localizado nos autos".
- NUNCA invente, deduza ou estime valores. Melhor vazio que errado.
- Datas em DD/MM/AAAA. Valores em R$ 0.000,00.
- Extraia LITERALMENTE do texto, sem parafrasear.

Responda em JSON com a estrutura: { "fields": { "campo": "valor (fl. XX)" }, "analysis": "resumo em markdown" }`;

  const lowerLabel = blockLabel.toLowerCase();

  if (lowerLabel.includes("petição inicial") || lowerLabel.includes("reclamat")) {
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

  if (lowerLabel.includes("sentença") || lowerLabel.includes("decisão") || lowerLabel.includes("vistos")) {
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

  if (lowerLabel.includes("cálculo") || lowerLabel.includes("liquidação") || lowerLabel.includes("planilha")) {
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
## 6. Instrução Probatória
## 7. Sentença
## 8. Recursos e Acórdão
## 9. Cálculos e Liquidação
## 10. Trânsito em Julgado / Acordo
## 11. Riscos e Alertas
## 12. Observações

Para cada campo, inclua a referência de folha. Ex: **Reclamante:** João da Silva (fl. 1)`;
}

// ---------------------------------------------------------------------------
// Pipeline principal
// ---------------------------------------------------------------------------

export async function runMultiCallPipeline(
  config: PipelineConfig
): Promise<PipelineResult> {
  const { fullText, pageCount, modelId, moduleId, onProgress } = config;

  onProgress?.(`📄 Documento com ${pageCount} páginas detectado. Iniciando pipeline multi-passagem...`);

  // 1. Dividir em secções temáticas
  const sections = splitIntoSections(fullText);
  onProgress?.(`🔍 ${sections.length} secções processuais identificadas.`);

  // 2. Agrupar em blocos (target 5-7)
  const blocks = mergeSectionsIntoBlocks(sections, 6);
  onProgress?.(`📦 ${blocks.length} blocos para análise: ${blocks.map((b) => b.label).join(", ")}`);

  // 3. Processar cada bloco sequencialmente
  const blockResults: BlockResult[] = [];
  let totalTokens = 0;

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    onProgress?.(
      `⏳ Analisando bloco ${i + 1}/${blocks.length}: ${block.label} (pp. ${block.pageRange[0]}–${block.pageRange[1]})...`
    );

    try {
      const result = await processBlock(block, modelId, BLOCK_CALL_TIMEOUT_MS);
      blockResults.push(result);
      totalTokens += result.tokensUsed;
      onProgress?.(
        `✅ Bloco ${i + 1} concluído: ${Object.keys(result.extractedFields).length} campos extraídos.`
      );
    } catch (error) {
      // Bloco falhou — registar mas continuar
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

  // 4. Chamada de síntese
  onProgress?.("🔄 Sintetizando relatório unificado...");
  const synthesized = await synthesizeResults(
    blockResults,
    moduleId,
    modelId,
    SYNTHESIS_CALL_TIMEOUT_MS
  );
  totalTokens += synthesized.tokensUsed;

  // 5. Validação de referências de página
  const validationErrors = validatePageReferences(synthesized.report);
  if (validationErrors.length > 0) {
    onProgress?.(
      `⚠️ ${validationErrors.length} campo(s) sem referência de página detectados.`
    );
  }

  onProgress?.(
    `✅ Pipeline concluído: ${blockResults.length} blocos, ${totalTokens} tokens totais.`
  );

  return {
    blocks: blockResults,
    synthesizedReport: synthesized.report,
    validationErrors,
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
    system: getBlockExtractionPrompt(block.label),
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
    tokensUsed: (usage?.totalTokens ?? 0),
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
    maxOutputTokens: 8192,
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
// Validação de referências de página
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
  let match: RegExpExecArray | null;
  while ((match = fieldPattern.exec(report)) !== null) {
    const fieldName = match[1].trim();
    const value = match[2].trim();
    // Ignorar campos sem valor real
    if (value.length < 3) continue;
    // Verificar se contém referência de folha
    if (!/\(?\s*fl\.\s*\d+/i.test(value) && !/\[Pag\.\s*\d+\]/i.test(value)) {
      errors.push(`Campo "${fieldName}" sem referência de página: "${value.slice(0, 60)}..."`);
    }
  }
  return errors;
}
