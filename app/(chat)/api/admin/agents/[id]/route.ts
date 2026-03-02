import { NextResponse } from "next/server";
import { AGENT_IDS, type AgentId } from "@/lib/ai/agents-registry";
import { upsertBuiltInAgentOverride } from "@/lib/db/queries";

const ADMIN_SECRET = process.env.ADMIN_CREDITS_SECRET;

function isAdminRequest(request: Request): boolean {
  if (!ADMIN_SECRET?.length) {
    return false;
  }
  const key = request.headers.get("x-admin-key");
  return key === ADMIN_SECRET;
}

const MAX_INSTRUCTIONS_LENGTH = 50_000;
const MAX_LABEL_LENGTH = 256;

/** PATCH: atualizar override de um agente built-in (instruções e/ou label). */
export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  if (!isAdminRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: agentId } = await context.params;
  if (!AGENT_IDS.includes(agentId as AgentId)) {
    return NextResponse.json(
      {
        error:
          "Invalid agent id. Must be one of: revisor-defesas, analise-contratos, redator-contestacao",
      },
      { status: 400 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const obj = body as Record<string, unknown>;
  const instructions =
    typeof obj?.instructions === "string" ? obj.instructions : undefined;
  const label = typeof obj?.label === "string" ? obj.label.trim() : undefined;

  if (
    instructions !== undefined &&
    instructions.length > MAX_INSTRUCTIONS_LENGTH
  ) {
    return NextResponse.json(
      {
        error: `instructions must be at most ${MAX_INSTRUCTIONS_LENGTH} characters`,
      },
      { status: 400 }
    );
  }
  if (label !== undefined && label.length > MAX_LABEL_LENGTH) {
    return NextResponse.json(
      { error: `label must be at most ${MAX_LABEL_LENGTH} characters` },
      { status: 400 }
    );
  }

  if (instructions === undefined && label === undefined) {
    return NextResponse.json(
      { error: "Body must contain at least one of: instructions, label" },
      { status: 400 }
    );
  }

  try {
    await upsertBuiltInAgentOverride({
      agentId,
      instructions: instructions ?? null,
      label: label ?? null,
    });
    return NextResponse.json({ ok: true, agentId });
  } catch {
    return NextResponse.json(
      { error: "Failed to update built-in agent override" },
      { status: 500 }
    );
  }
}
