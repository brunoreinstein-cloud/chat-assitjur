import { NextResponse } from "next/server";
import { pingDatabase } from "@/lib/db/queries";

/** Timeout máximo do health check (ms). Primeira ligação em dev pode demorar; 15s cobre connect_timeout (10s) + margem. */
const HEALTH_DB_TIMEOUT_MS = 15_000;

/**
 * Timeout máximo do health check (ms).
 * Em produção o cold start da BD (Supabase/Neon) pode levar 10–30s; 30s evita 503 no primeiro pedido.
 * Em dev, 15s cobre connect_timeout (10s) + margem.
 */
const HEALTH_DB_TIMEOUT_MS = process.env.VERCEL === "1" ? 30_000 : 15_000;

/**
 * GET /api/health/db — Healthcheck da base de dados no mesmo processo que serve o chat.
 * Valida POSTGRES_URL e que a BD responde (SELECT 1). Não exige autenticação (para monitores).
 *
 * - 200: { ok: true, latencyMs } — BD acessível
 * - 503: { ok: false, error, latencyMs } — POSTGRES_URL em falta, BD inacessível ou timeout
 */
export async function GET() {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const result = await Promise.race([
    pingDatabase(),
    new Promise<{ ok: false; error: string; latencyMs: number }>((resolve) => {
      timeoutId = setTimeout(
        () =>
          resolve({
            ok: false as const,
            error: "Health check timed out",
            latencyMs: HEALTH_DB_TIMEOUT_MS,
          }),
        HEALTH_DB_TIMEOUT_MS
      );
    }),
  ]);
  if (timeoutId !== undefined) {
    clearTimeout(timeoutId);
  }
  if (result.ok) {
    return NextResponse.json(
      { ok: true, latencyMs: result.latencyMs },
      { status: 200 }
    );
  }
  if (process.env.NODE_ENV === "development") {
    console.warn(
      "[api/health/db] 503:",
      result.error,
      "latencyMs:",
      result.latencyMs
    );
  }
  const body: { ok: false; error: string; latencyMs: number; hint?: string } = {
    ok: false,
    error: result.error,
    latencyMs: result.latencyMs,
  };
  if (
    process.env.VERCEL === "1" &&
    process.env.POSTGRES_URL?.includes(":5432")
  ) {
    body.hint =
      "POSTGRES_URL usa a porta 5432. Em produção (Vercel) usa o pooler: porta 6543. Supabase → Settings → Database → Connection string → Transaction.";
  }

  return NextResponse.json(body, { status: 503 });
}
