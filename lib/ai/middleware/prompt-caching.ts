/**
 * Prompt Caching Middleware para modelos Anthropic.
 *
 * Adiciona `cache_control` à última mensagem de cada request para que
 * o prefixo de conversa (system prompt + histórico) fique em cache no
 * servidor da Anthropic. Tokens cacheados custam ~10% do preço normal.
 *
 * Extraído de `app/(chat)/api/chat/route.ts` para reutilização em
 * qualquer ponto que chame o LLM (agentes, background jobs, etc.).
 *
 * @see https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching
 */

import { getPromptCachingCacheControl } from "../prompt-caching-config";

/** Verifica se o modelId é de um modelo Anthropic (Claude). */
export function isAnthropicModel(modelId: string): boolean {
  return modelId.includes("anthropic") || modelId.includes("claude");
}

/**
 * Adiciona cache_control à última mensagem para modelos Anthropic.
 * Reduz custo e latência em conversas multi-turn ao reutilizar o prefixo em cache.
 * Respeita PROMPT_CACHING_ENABLED e PROMPT_CACHING_TTL (env vars).
 *
 * Uso:
 * ```ts
 * const msgs = withPromptCaching(effectiveModelId, coreMessages);
 * ```
 */
export function withPromptCaching<T extends { providerOptions?: unknown }>(
  modelId: string,
  messages: T[]
): T[] {
  const cacheControl = getPromptCachingCacheControl();
  if (
    messages.length === 0 ||
    !isAnthropicModel(modelId) ||
    cacheControl === null
  ) {
    return messages;
  }
  const lastIndex = messages.length - 1;
  const last = messages[lastIndex];
  const baseOptions =
    typeof last.providerOptions === "object" && last.providerOptions !== null
      ? last.providerOptions
      : {};
  const augmented: T = {
    ...last,
    providerOptions: {
      ...baseOptions,
      anthropic: { cacheControl },
    },
  };
  return [...messages.slice(0, lastIndex), augmented];
}
