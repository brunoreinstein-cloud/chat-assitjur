/**
 * Configuração de prompt caching (Anthropic) a partir de variáveis de ambiente.
 * Ver: https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching
 */

const ENV_ENABLED = "PROMPT_CACHING_ENABLED";
const ENV_TTL = "PROMPT_CACHING_TTL";

/** Valor por omissão: caching ativo. */
const DEFAULT_ENABLED = true;

/** TTL por omissão: 5 minutos (custo de escrita +25%; leitura 10%). TTL 1h: escrita 2×. */
const DEFAULT_TTL = "5m" as const;

export type PromptCachingTtl = "5m" | "1h";

function parseEnabled(): boolean {
  const v = process.env[ENV_ENABLED]?.toLowerCase().trim();
  if (v === "false" || v === "0" || v === "no" || v === "off") {
    return false;
  }
  return DEFAULT_ENABLED;
}

function parseTtl(): PromptCachingTtl {
  const v = process.env[ENV_TTL]?.toLowerCase().trim();
  if (v === "1h" || v === "1hour" || v === "3600") {
    return "1h";
  }
  return DEFAULT_TTL;
}

let cachedEnabled: boolean | undefined;
let cachedTtl: PromptCachingTtl | undefined;

/** Indica se o prompt caching está ativo para modelos Anthropic. */
export function isPromptCachingEnabled(): boolean {
  cachedEnabled ??= parseEnabled();
  return cachedEnabled;
}

/** TTL do cache: "5m" (padrão) ou "1h" (mais caro na escrita, útil para pausas longas). */
export function getPromptCachingTtl(): PromptCachingTtl {
  cachedTtl ??= parseTtl();
  return cachedTtl;
}

/**
 * Objeto cache_control para passar ao provider Anthropic.
 * Retorna null se o caching estiver desativado.
 */
export function getPromptCachingCacheControl(): {
  type: "ephemeral";
  ttl?: "1h";
} | null {
  if (!isPromptCachingEnabled()) {
    return null;
  }
  const ttl = getPromptCachingTtl();
  return ttl === "1h"
    ? { type: "ephemeral" as const, ttl: "1h" as const }
    : { type: "ephemeral" as const };
}
