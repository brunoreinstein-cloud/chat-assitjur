/**
 * Redis Caching Middleware para chamadas LLM não-streaming.
 * Padrão: Anthropic Cookbook — "Caching Middleware".
 *
 * Objectivo: evitar chamadas LLM repetidas para o mesmo input determinístico,
 * reduzindo custo e latência em operações como:
 *  - generateTitle (título do chat a partir da primeira mensagem)
 *  - extractMetadata (metadados de documentos já processados)
 *
 * Funcionamento:
 *  1. Calcula SHA-256(modelo + mensagens) como chave de cache
 *  2. Consulta Redis — se HIT, retorna resposta cached
 *  3. Se MISS, chama o LLM, guarda em Redis com TTL e retorna
 *
 * Activação: requer REDIS_URL no ambiente. Se ausente, o middleware é transparente
 * (passa directo para o LLM sem cache).
 *
 * Não usar para chat streaming (cada sessão é única).
 */

import { createHash } from "node:crypto";
import type { LanguageModelV3 } from "@ai-sdk/provider";
import type { LanguageModel } from "ai";
import { wrapLanguageModel } from "ai";
import { createClient } from "redis";

/** TTL padrão do cache em segundos: 1 hora para títulos, 24h para metadados. */
const DEFAULT_TTL_SECONDS = 3600;

/** Prefixo de todas as chaves Redis do LLM cache. */
const CACHE_KEY_PREFIX = "llm:cache:";

/** Cliente Redis lazy — criado na primeira chamada, reutilizado depois. */
let redisClient: ReturnType<typeof createClient> | null = null;
let redisConnecting = false;
let redisAvailable = false;

async function getRedis() {
  if (!process.env.REDIS_URL) {
    return null;
  }
  if (redisClient && redisAvailable) {
    return redisClient;
  }
  if (redisConnecting) {
    return null; // Evita conexões paralelas durante startup
  }
  try {
    redisConnecting = true;
    redisClient = createClient({ url: process.env.REDIS_URL });
    redisClient.on("error", () => {
      redisAvailable = false;
    });
    await redisClient.connect();
    redisAvailable = true;
    return redisClient;
  } catch {
    redisAvailable = false;
    return null;
  } finally {
    redisConnecting = false;
  }
}

/** Calcula a chave de cache a partir do modelo e do prompt (SHA-256). */
function computeCacheKey(
  modelId: string,
  prompt: unknown,
  namespace = "default"
): string {
  const hash = createHash("sha256")
    .update(JSON.stringify({ modelId, prompt, namespace }))
    .digest("hex");
  return `${CACHE_KEY_PREFIX}${namespace}:${hash}`;
}

/**
 * Envolve um LanguageModel com middleware de cache Redis para chamadas
 * `generateText` / `generateObject` (não-streaming).
 *
 * @param model     Modelo a envolver (ex.: getTitleModel()).
 * @param namespace Namespace de cache para separar casos de uso (ex.: "title", "metadata").
 * @param ttl       TTL do cache em segundos (default: 3600 = 1 hora).
 *
 * @example
 * const cachedTitleModel = withLlmCache(getTitleModel(), "title", 3600);
 * const { text } = await generateText({ model: cachedTitleModel, prompt: "..." });
 */
export function withLlmCache(
  model: LanguageModel,
  namespace = "default",
  ttl = DEFAULT_TTL_SECONDS
): LanguageModel {
  // Narrowing: wrapLanguageModel requer LanguageModelV3
  const modelV3 = model as unknown as LanguageModelV3;
  if (!process.env.REDIS_URL) {
    // Redis não configurado: retorna o modelo sem cache (transparente)
    return model;
  }

  return wrapLanguageModel({
    model: modelV3,
    middleware: {
      specificationVersion: "v3",

      wrapGenerate: async ({ doGenerate, params }) => {
        const redis = await getRedis();
        if (!redis) {
          return doGenerate();
        }

        const cacheKey = computeCacheKey(
          // biome-ignore lint/suspicious/noExplicitAny: aceder ao modelId interno
          (model as any).modelId ?? "unknown",
          params,
          namespace
        );

        try {
          const cached = await redis.get(cacheKey);
          if (cached) {
            return JSON.parse(cached);
          }
        } catch {
          // Falha de leitura Redis: prosseguir sem cache
        }

        const result = await doGenerate();

        try {
          await redis.setEx(cacheKey, ttl, JSON.stringify(result));
        } catch {
          // Falha de escrita Redis: ignorar (resultado já foi obtido)
        }

        return result;
      },

      // Streaming não é cacheado — delega directamente
      wrapStream: ({ doStream }) => doStream(),
    },
  });
}
