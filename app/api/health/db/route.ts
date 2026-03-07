import { NextResponse } from "next/server";
import { pingDatabase } from "@/lib/db/queries";

/**
 * GET /api/health/db — Healthcheck da base de dados no mesmo processo que serve o chat.
 * Valida POSTGRES_URL e que a BD responde (SELECT 1). Não exige autenticação (para monitores).
 *
 * - 200: { ok: true, latencyMs } — BD acessível
 * - 503: { ok: false, error, latencyMs } — POSTGRES_URL em falta ou BD inacessível
 */
export async function GET() {
  const result = await pingDatabase();
  if (result.ok) {
    return NextResponse.json(
      { ok: true, latencyMs: result.latencyMs },
      { status: 200 }
    );
  }
  return NextResponse.json(
    {
      ok: false,
      error: result.error,
      latencyMs: result.latencyMs,
    },
    { status: 503 }
  );
}
