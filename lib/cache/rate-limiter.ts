/**
 * Rate Limiter para /api/chat — sliding window de 60 segundos.
 *
 * Estratégia:
 *  1. Redis disponível → sorted set por userId (ZREMRANGEBYSCORE + ZADD + ZCARD).
 *     Sliding window exacta sem necessidade de `@upstash/ratelimit`.
 *  2. Redis indisponível → fallback in-memory (Map de timestamps por userId).
 *     Adequado para dev local e para absorver falhas temporárias de Redis.
 *
 * Limites (configuráveis via env):
 *  - RATE_LIMIT_AUTHED   (default 20): req/min para utilizadores autenticados.
 *  - RATE_LIMIT_GUEST    (default 5):  req/min para guests/não-autenticados.
 *
 * Activação: presente sempre. O fallback in-memory garante protecção mesmo sem Redis.
 */

import { createClient } from "redis";

const WINDOW_MS = 60_000; // 1 minuto
const WINDOW_S = 60;

const LIMIT_AUTHED = Number(process.env.RATE_LIMIT_AUTHED ?? "20");
const LIMIT_GUEST = Number(process.env.RATE_LIMIT_GUEST ?? "5");

/** Chave Redis: prefixo + userId */
const RL_PREFIX = "rl:chat:";

// ---------------------------------------------------------------------------
// Redis client (reutiliza o padrão lazy do projecto)
// ---------------------------------------------------------------------------

let redisClient: ReturnType<typeof createClient> | null = null;
let redisAvailable = false;
let redisConnecting = false;

async function getRedis() {
  if (!process.env.REDIS_URL) return null;
  if (redisClient && redisAvailable) return redisClient;
  if (redisConnecting) return null;
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

// ---------------------------------------------------------------------------
// Fallback in-memory (sorted list of timestamps per userId)
// ---------------------------------------------------------------------------

/** Map: userId → sorted array of timestamps (ms). Max 200 entradas para limitar memória. */
const memoryStore = new Map<string, number[]>();
const MEMORY_MAX_USERS = 200;

function memoryCheck(userId: string, limit: number): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const cutoff = now - WINDOW_MS;

  let timestamps = memoryStore.get(userId) ?? [];
  // Remover timestamps fora da janela
  timestamps = timestamps.filter((t) => t > cutoff);

  if (timestamps.length >= limit) {
    return { allowed: false, remaining: 0 };
  }

  timestamps.push(now);

  // Evicção: se atingiu max de utilizadores, apagar o mais antigo
  if (!memoryStore.has(userId) && memoryStore.size >= MEMORY_MAX_USERS) {
    const firstKey = memoryStore.keys().next().value;
    if (firstKey !== undefined) memoryStore.delete(firstKey);
  }
  memoryStore.set(userId, timestamps);

  return { allowed: true, remaining: limit - timestamps.length };
}

// ---------------------------------------------------------------------------
// Redis sliding window (sorted set)
// ---------------------------------------------------------------------------

async function redisCheck(
  redis: NonNullable<Awaited<ReturnType<typeof getRedis>>>,
  userId: string,
  limit: number
): Promise<{ allowed: boolean; remaining: number }> {
  const key = `${RL_PREFIX}${userId}`;
  const now = Date.now();
  const cutoff = now - WINDOW_MS;

  try {
    // Pipeline: remove expirados → add current → count → set TTL
    const pipeline = redis.multi();
    pipeline.zRemRangeByScore(key, 0, cutoff);
    pipeline.zAdd(key, { score: now, value: String(now) });
    pipeline.zCard(key);
    pipeline.expire(key, WINDOW_S * 2); // TTL generoso para limpeza automática
    const results = await pipeline.exec();

    const count = (results?.[2] as number | null) ?? limit + 1;

    if (count > limit) {
      // Reverter o ZADD (não contar este request)
      await redis.zRem(key, String(now));
      return { allowed: false, remaining: 0 };
    }

    return { allowed: true, remaining: limit - count };
  } catch {
    redisAvailable = false;
    // Fallback to memory on Redis error
    return memoryCheck(userId, limit);
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface RateLimitResult {
  /** true se o request deve ser permitido */
  allowed: boolean;
  /** Requisições restantes na janela actual */
  remaining: number;
  /** Limite total configurado */
  limit: number;
}

/**
 * Verifica o rate limit para um utilizador.
 *
 * @param userId   Identificador único do utilizador (session.user.id).
 * @param isGuest  true para utilizadores guest (limite mais baixo).
 */
export async function checkRateLimit(
  userId: string,
  isGuest: boolean
): Promise<RateLimitResult> {
  const limit = isGuest ? LIMIT_GUEST : LIMIT_AUTHED;

  const redis = await getRedis();
  const { allowed, remaining } = redis
    ? await redisCheck(redis, userId, limit)
    : memoryCheck(userId, limit);

  return { allowed, remaining, limit };
}
