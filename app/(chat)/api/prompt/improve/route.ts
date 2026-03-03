import { NextResponse } from "next/server";
import { improvePrompt } from "@/lib/ai/improve-prompt";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { prompt?: string };
    const raw = typeof body.prompt === "string" ? body.prompt.trim() : "";
    if (raw.length === 0) {
      return NextResponse.json(
        { error: "Campo 'prompt' é obrigatório e não pode estar vazio." },
        { status: 400 }
      );
    }

    const result = await improvePrompt(raw);
    return NextResponse.json(result);
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : "Não foi possível melhorar o prompt.";
    if (
      message.includes("obrigatório") ||
      message.includes("não pode") ||
      message.includes("exceder")
    ) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    return NextResponse.json(
      { error: "Não foi possível melhorar o prompt. Tente novamente." },
      { status: 500 }
    );
  }
}
