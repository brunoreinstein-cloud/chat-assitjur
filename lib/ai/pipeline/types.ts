/**
 * Tipos públicos do pipeline multi-chamadas.
 */

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
