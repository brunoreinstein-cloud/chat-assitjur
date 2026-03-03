import { generateText } from "ai";
import { NextResponse } from "next/server";
import { getTitleModel } from "@/lib/ai/providers";

const HEALTH_PROMPT = "Reply with exactly: OK";
const HEALTH_MAX_TOKENS = 5;

/**
 * GET /api/health/ai — Healthcheck da conexão ao modelo (AI Gateway / fornecedor).
 * Faz uma chamada mínima ao getTitleModel() (Gemini 2.5 Flash Lite) para validar
 * que a API key e o gateway respondem. Não exige autenticação (para monitors).
 *
 * Respostas:
 * - 200: { ok: true, model, latencyMs } — conexão OK
 * - 503: { ok: false, error } — falha (API key, rede, quota)
 */
export async function GET() {
  const start = Date.now();
  try {
    const model = getTitleModel();
    const { text } = await generateText({
      model,
      prompt: HEALTH_PROMPT,
      maxTokens: HEALTH_MAX_TOKENS,
    });
    const latencyMs = Date.now() - start;
    const trimmed = text?.trim().toUpperCase();
    if (trimmed !== "OK") {
      return NextResponse.json(
        {
          ok: false,
          error: `Unexpected response: ${trimmed ?? "(empty)"}`,
          latencyMs,
        },
        { status: 503 }
      );
    }
    return NextResponse.json(
      {
        ok: true,
        model: "google/gemini-2.5-flash-lite",
        latencyMs,
      },
      { status: 200 }
    );
  } catch (err) {
    const latencyMs = Date.now() - start;
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      {
        ok: false,
        error: message,
        latencyMs,
      },
      { status: 503 }
    );
  }
}
