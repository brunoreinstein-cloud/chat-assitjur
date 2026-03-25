/**
 * Guardrails Middleware — limites de tema e conteúdo para o AssistJur.
 *
 * Valida mensagens do utilizador antes de enviar ao LLM para:
 * 1. Garantir que o tema é jurídico/trabalhista (quando agente exige)
 * 2. Rejeitar conteúdo potencialmente perigoso (prompt injection patterns)
 * 3. Limitar tamanho de input para controlo de custos
 *
 * Retorna null se a mensagem passa todas as validações.
 * Retorna uma string de erro se deve ser bloqueada.
 */

/** Tamanho máximo de uma mensagem do utilizador (caracteres). */
const MAX_USER_MESSAGE_CHARS = 100_000;

/**
 * Patterns que indicam tentativa de prompt injection.
 * Verificação básica — não substitui guardrails do provider.
 */
const INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?previous\s+instructions/i,
  /you\s+are\s+now\s+(a|an)\s+/i,
  /system\s*:\s*you\s+are/i,
  /\[INST\]/i,
  /<\|system\|>/i,
] as const;

export interface GuardrailResult {
  blocked: boolean;
  reason?: string;
}

/**
 * Valida uma mensagem do utilizador contra guardrails básicos.
 *
 * @param userMessage - Texto da mensagem do utilizador
 * @param options.requireLegalTopic - Se true, rejeita mensagens claramente fora do tema jurídico (futuro)
 * @returns `{ blocked: false }` se passa, `{ blocked: true, reason }` se deve ser bloqueada
 */
export function validateUserMessage(
  userMessage: string,
  _options: { requireLegalTopic?: boolean } = {}
): GuardrailResult {
  // 1. Tamanho
  if (userMessage.length > MAX_USER_MESSAGE_CHARS) {
    return {
      blocked: true,
      reason: `Mensagem excede o limite de ${MAX_USER_MESSAGE_CHARS.toLocaleString("pt-BR")} caracteres.`,
    };
  }

  // 2. Prompt injection patterns
  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(userMessage)) {
      return {
        blocked: true,
        reason:
          "Mensagem contém padrões não permitidos. Por favor, reformule o seu pedido.",
      };
    }
  }

  // 3. Topic filtering (placeholder — ativar quando agente exigir)
  // if (options.requireLegalTopic) {
  //   // Classificação simples por keywords. Para produção, usar LLM guard.
  // }

  return { blocked: false };
}
