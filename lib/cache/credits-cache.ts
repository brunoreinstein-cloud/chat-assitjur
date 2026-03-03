/**
 * Cache em memória para GET /api/credits (saldo + uso recente).
 * Reduz carga na BD em refreshes frequentes; TTL curto para transparência.
 * Em serverless (Vercel) o cache é por instância.
 */
const TTL_MS = 30_000;

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

const store = new Map<string, { value: CachedCredits; expiresAt: number }>();

function key(userId: string, limit: number): string {
  return `credits:${userId}:${limit}`;
}

function isExpired(expiresAt: number): boolean {
  return Date.now() >= expiresAt;
}

export const creditsCache = {
  get(userId: string, limit: number): CachedCredits | undefined {
    const k = key(userId, limit);
    const entry = store.get(k);
    if (!entry || isExpired(entry.expiresAt)) {
      if (entry) {
        store.delete(k);
      }
      return undefined;
    }
    return entry.value;
  },

  set(
    userId: string,
    limit: number,
    value: CachedCredits,
    ttlMs = TTL_MS
  ): void {
    store.set(key(userId, limit), {
      value,
      expiresAt: Date.now() + ttlMs,
    });
  },

  /** Invalida cache do utilizador (ex.: após dedução ou admin adicionar créditos). */
  delete(userId: string): void {
    for (const k of store.keys()) {
      if (k.startsWith(`credits:${userId}:`)) {
        store.delete(k);
      }
    }
  },
};
