/**
 * Cache em memória para overrides de agentes built-in (painel admin).
 * Reduz consultas à BD no /api/chat; TTL 5 min — alterações no admin
 * são imediatas (invalidateAgentOverridesCache é chamado no PATCH).
 * Em serverless (Vercel) o cache é por instância.
 */

import { getBuiltInAgentOverrides } from "@/lib/db/queries";

const TTL_MS = 5 * 60_000; // 5 minutos

type OverridesMap = Awaited<ReturnType<typeof getBuiltInAgentOverrides>>;

let cached: { value: OverridesMap; expiresAt: number } | null = null;

function isExpired(expiresAt: number): boolean {
  return Date.now() >= expiresAt;
}

/** Devolve overrides com cache de 60s. Em caso de erro na BD devolve objeto vazio (como no route). */
export async function getCachedBuiltInAgentOverrides(): Promise<OverridesMap> {
  if (cached !== null && !isExpired(cached.expiresAt)) {
    return cached.value;
  }
  try {
    const value = await getBuiltInAgentOverrides();
    cached = { value, expiresAt: Date.now() + TTL_MS };
    return value;
  } catch {
    cached = { value: {}, expiresAt: Date.now() + TTL_MS };
    return {};
  }
}

/** Invalida o cache (chamar após upsert no painel admin, opcional). */
export function invalidateAgentOverridesCache(): void {
  cached = null;
}
