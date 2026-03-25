/**
 * Cache em memória para GET /api/credits (saldo + uso recente).
 * Reduz carga na BD em refreshes frequentes. 90s equilibra frescura e carga:
 * créditos mudam apenas após envio de mensagem (dedução), e a rota invalida
 * o cache explicitamente nesse momento.
 * Em serverless (Vercel) o cache é por instância. LRU com max 500 entradas.
 */
import { LruTtlMap } from "./lru-ttl-map";

const TTL_MS = 90_000;

interface CachedCredits {
  balance: number;
  recentUsage: Array<{
    id: string;
    chatId: string | null;
    promptTokens: number;
    completionTokens: number;
    model: string | null;
    creditsConsumed: number;
    createdAt: Date;
  }>;
  lowBalanceThreshold: number;
}

const store = new LruTtlMap<CachedCredits>(500);

function cacheKey(userId: string, limit: number): string {
  return `credits:${userId}:${limit}`;
}

export const creditsCache = {
  get(userId: string, limit: number): CachedCredits | undefined {
    return store.get(cacheKey(userId, limit));
  },

  set(
    userId: string,
    limit: number,
    value: CachedCredits,
    ttlMs = TTL_MS
  ): void {
    store.set(cacheKey(userId, limit), value, ttlMs);
  },

  /** Invalida cache do utilizador (ex.: após dedução ou admin adicionar créditos). */
  delete(userId: string): void {
    store.deleteByPrefix(`credits:${userId}:`);
  },
};
