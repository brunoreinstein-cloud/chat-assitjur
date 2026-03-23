/**
 * Constantes do pipeline multi-chamadas.
 */

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

/** Timeout por chamada de bloco (ms) */
export const BLOCK_CALL_TIMEOUT_MS = 45_000;
/** Timeout para chamada de validação cruzada (ms) */
export const VALIDATION_CALL_TIMEOUT_MS = 40_000;
/** Máximo de caracteres por bloco para enviar ao modelo */
export const MAX_BLOCK_CHARS = 120_000;
/** Regex para detectar blocos críticos (retry obrigatório em caso de falha) */
export const CRITICAL_BLOCK_LABELS =
  /Senten[çc]a|Ac[óo]rd[ãa]o|C[áa]lculos|Liquida[çc][ãa]o|Embargos/i;
/**
 * Nº máximo de blocos a extrair em paralelo.
 * 3 permite reduzir o tempo de extracção para ~1/3 sem pressionar o rate limit
 * da API Anthropic (cada bloco usa ≤ 120 K chars de input + ≤ 4096 tokens output).
 */
export const BLOCK_EXTRACTION_CONCURRENCY = 3;
/**
 * Budget de tokens de saída por bloco.
 * Blocos não-críticos raramente precisam de mais de 2048 tokens;
 * reservar 4096 apenas para Sentença, Acórdão, Cálculos, etc.
 */
export const BLOCK_MAX_OUTPUT_TOKENS_DEFAULT = 2048;
export const BLOCK_MAX_OUTPUT_TOKENS_CRITICAL = 4096;
