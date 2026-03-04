import { NextResponse } from "next/server";

/**
 * GET /api/ping — Diagnóstico: confirma que as rotas da API estão a ser servidas.
 * Se devolver 200, o App Router está a resolver rotas em app/api/.
 */
export function GET() {
  return NextResponse.json({ ok: true, pong: Date.now() }, { status: 200 });
}
