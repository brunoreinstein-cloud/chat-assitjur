/**
 * Conversão tokens → créditos e constantes para o modelo de créditos por consumo de LLM.
 * Ver docs/SPEC-CREDITOS-LLM.md.
 */

/** 1 crédito = N tokens (input + output somados). */
export const CREDITS_PER_1000_TOKENS = 1;

/**
 * Calcula créditos consumidos a partir de tokens.
 * Fórmula: ceil((promptTokens + completionTokens) / 1000).
 */
export function tokensToCredits(
  promptTokens: number,
  completionTokens: number
): number {
  const total = promptTokens + completionTokens;
  return Math.max(1, Math.ceil(total / 1000) * CREDITS_PER_1000_TOKENS);
}

/** Créditos mínimos necessários para aceitar um pedido de chat (estimativa conservadora). */
export const MIN_CREDITS_TO_START_CHAT = 1;
