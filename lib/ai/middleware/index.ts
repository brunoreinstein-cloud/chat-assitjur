/**
 * AI Middleware Layer — barrel export.
 *
 * Centraliza middlewares composáveis para o pipeline de LLM:
 * - prompt-caching: cache de prefixo Anthropic (economia de ~90% em tokens repetidos)
 * - logging: token usage e latência por step/request
 * - guardrails: validação de input (tamanho, injection, tema)
 *
 * O LLM response cache (Redis, para chamadas não-streaming como generateTitle)
 * permanece em `lib/cache/llm-response-cache.ts` por ser uma camada diferente
 * (cache de resultado vs. cache de prefixo).
 *
 * Uso:
 * ```ts
 * import { withPromptCaching, validateUserMessage, logRequestUsage } from "@/lib/ai/middleware";
 * ```
 */

export {
  type GuardrailResult,
  validateUserMessage,
} from "./guardrails";

export {
  logRequestUsage,
  logStepUsage,
  type RequestUsageInfo,
  type StepUsageInfo,
} from "./logging";
export {
  isAnthropicModel,
  withPromptCaching,
} from "./prompt-caching";
