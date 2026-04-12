/**
 * Rate limiter usando Redis (sliding window counter).
 * Activa-se automaticamente quando REDIS_URL estiver definido.
 * Sem Redis, permite todas as requests (falha aberta) — suficiente para dev
 * e para produção sem Redis configurado; para brute-force severo recomenda-se Redis.
 *
 * Algoritmo: INCR + EXPIRE (contador por janela de tempo).
 * Não é um sliding window perfeito mas é O(1) e adequado para auth.
 */
import "server-only";

import { createClient } from "redis";

/** Cliente Redis reutilizado entre invocações (lazy init). */
let redisClient: ReturnType<typeof createClient> | null = null;
let redisReady = false;

async function getRedis(): Promise<ReturnType<typeof createClient> | null> {
  if (!process.env.REDIS_URL) {
    return null;
  }
  if (redisClient && redisReady) {
    return redisClient;
  }
  try {
    redisClient = createClient({ url: process.env.REDIS_URL });
    redisClient.on("error", () => {
      redisReady = false;
    });
    await redisClient.connect();
    redisReady = true;
    return redisClient;
  } catch {
    redisReady = false;
    return null;
  }
}

export interface RateLimitResult {
  allowed: boolean;
  /** Tentativas restantes na janela actual. */
  remaining: number;
  /** Segundos até ao reset da janela. */
  resetInSeconds: number;
}

/**
 * Verifica e incrementa o contador de rate limit.
 *
 * @param key           Chave única (ex: "auth:login:192.168.1.1" ou "auth:email:user@x.com").
 * @param maxAttempts   Limite de tentativas por janela.
 * @param windowSeconds Duração da janela em segundos.
 * @returns `allowed: true` se dentro do limite, `false` se excedido.
 *          Sem Redis configurado, retorna sempre `allowed: true`.
 */
export async function checkRateLimit(
  key: string,
  maxAttempts: number,
  windowSeconds: number
): Promise<RateLimitResult> {
  const redis = await getRedis();

  if (!redis) {
    return {
      allowed: true,
      remaining: maxAttempts - 1,
      resetInSeconds: windowSeconds,
    };
  }

  const redisKey = `rl:${key}`;
  try {
    const count = await redis.incr(redisKey);
    if (count === 1) {
      await redis.expire(redisKey, windowSeconds);
    }
    const ttl = await redis.ttl(redisKey);
    const remaining = Math.max(0, maxAttempts - count);
    return {
      allowed: count <= maxAttempts,
      remaining,
      resetInSeconds: ttl > 0 ? ttl : windowSeconds,
    };
  } catch {
    // Erro Redis: falha aberta (permite a request para não bloquear utilizadores legítimos)
    return {
      allowed: true,
      remaining: maxAttempts - 1,
      resetInSeconds: windowSeconds,
    };
  }
}
