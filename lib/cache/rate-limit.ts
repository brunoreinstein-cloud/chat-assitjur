/**
 * Rate limiter com Redis (primário) e fallback in-memory (por instância).
 *
 * Redis: INCR + EXPIRE (contador por janela de tempo). O(1).
 * In-memory: Map com expiração por janela. Protege contra brute-force
 * mesmo sem Redis, embora cada instância do servidor tenha contadores
 * independentes (aceitável para auth com poucas instâncias).
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
    redisClient = null;
    redisReady = false;
    return null;
  }
}

// ── In-memory fallback ────────────────────────────────────────────────────────

interface MemoryEntry {
  count: number;
  expiresAt: number;
}

const memoryStore = new Map<string, MemoryEntry>();

const MEMORY_CLEANUP_INTERVAL_MS = 60_000;
let lastCleanup = Date.now();

function memoryCleanup() {
  const now = Date.now();
  if (now - lastCleanup < MEMORY_CLEANUP_INTERVAL_MS) {
    return;
  }
  lastCleanup = now;
  for (const [k, v] of memoryStore) {
    if (v.expiresAt <= now) {
      memoryStore.delete(k);
    }
  }
}

function checkMemoryRateLimit(
  key: string,
  maxAttempts: number,
  windowSeconds: number
): RateLimitResult {
  memoryCleanup();
  const now = Date.now();
  const existing = memoryStore.get(key);

  if (!existing || existing.expiresAt <= now) {
    memoryStore.set(key, { count: 1, expiresAt: now + windowSeconds * 1000 });
    return {
      allowed: true,
      remaining: maxAttempts - 1,
      resetInSeconds: windowSeconds,
    };
  }

  existing.count += 1;
  const remaining = Math.max(0, maxAttempts - existing.count);
  const resetInSeconds = Math.max(
    1,
    Math.ceil((existing.expiresAt - now) / 1000)
  );

  return {
    allowed: existing.count <= maxAttempts,
    remaining,
    resetInSeconds,
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

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
 * Prioridade: Redis → in-memory fallback (por instância).
 * Sem Redis configurado ou em erro, usa contadores locais em memória.
 */
export async function checkRateLimit(
  key: string,
  maxAttempts: number,
  windowSeconds: number
): Promise<RateLimitResult> {
  const redis = await getRedis();

  if (!redis) {
    return checkMemoryRateLimit(key, maxAttempts, windowSeconds);
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
    return checkMemoryRateLimit(key, maxAttempts, windowSeconds);
  }
}
