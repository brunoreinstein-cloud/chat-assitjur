import { NextResponse } from "next/server";
import {
  AGENT_IDS,
  type AgentId,
  type AgentToolFlags,
  getAgentConfig,
} from "@/lib/ai/agents-registry";
import { chatModels } from "@/lib/ai/models";
import { invalidateAgentOverridesCache } from "@/lib/cache/agent-overrides-cache";
import { upsertBuiltInAgentOverride } from "@/lib/db/queries";

const ADMIN_SECRET = process.env.ADMIN_CREDITS_SECRET;

function isAdminRequest(request: Request): boolean {
  if (!ADMIN_SECRET?.length) {
    return false;
  }
  return request.headers.get("x-admin-key") === ADMIN_SECRET;
}

const MAX_INSTRUCTIONS_LENGTH = 50_000;
const MAX_LABEL_LENGTH = 256;
const MAX_MODEL_ID_LENGTH = 128;

/** Keys válidas de toolFlags — derivadas do tipo AgentToolFlags. */
const VALID_TOOL_FLAG_KEYS: ReadonlyArray<keyof AgentToolFlags> = [
  "useRevisorDefesaTools",
  "useRedatorContestacaoTool",
  "useMemoryTools",
  "useApprovalTool",
  "usePipelineTool",
  "useMasterDocumentsTool",
];

const VALID_MODEL_IDS = new Set(chatModels.map((m) => m.id));

/** PATCH: atualizar override de um agente built-in (parcial — só actualiza campos fornecidos). */
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
          "Invalid agent id. Must be one of: assistente-geral, revisor-defesas, redator-contestacao, assistjur-master",
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

  // --- instructions ---
  // String vazia ou só espaços → null (reset ao default do código).
  let instructions: string | null | undefined;
  if (typeof obj?.instructions === "string") {
    const trimmed = obj.instructions.trim();
    instructions = trimmed.length > 0 ? trimmed : null;
    if (trimmed.length > MAX_INSTRUCTIONS_LENGTH) {
      return NextResponse.json(
        {
          error: `instructions must be at most ${MAX_INSTRUCTIONS_LENGTH} characters`,
        },
        { status: 400 }
      );
    }
  }

  // --- label ---
  // String vazia → null (reset).
  let label: string | null | undefined;
  if (typeof obj?.label === "string") {
    const trimmed = obj.label.trim();
    label = trimmed.length > 0 ? trimmed : null;
    if (trimmed.length > MAX_LABEL_LENGTH) {
      return NextResponse.json(
        { error: `label must be at most ${MAX_LABEL_LENGTH} characters` },
        { status: 400 }
      );
    }
  }

  // --- defaultModelId ---
  // String vazia → null (reset). null explícito → null (reset).
  let defaultModelId: string | null | undefined;
  if ("defaultModelId" in obj) {
    const raw = obj.defaultModelId;
    if (raw === null || raw === "") {
      defaultModelId = null; // reset explícito
    } else if (typeof raw === "string") {
      const trimmed = raw.trim();
      if (trimmed.length > MAX_MODEL_ID_LENGTH) {
        return NextResponse.json(
          {
            error: `defaultModelId must be at most ${MAX_MODEL_ID_LENGTH} characters`,
          },
          { status: 400 }
        );
      }
      if (!VALID_MODEL_IDS.has(trimmed)) {
        return NextResponse.json(
          { error: `defaultModelId "${trimmed}" is not a valid model id` },
          { status: 400 }
        );
      }
      // Validar contra allowedModelIds do agente (evitar override silenciosamente ignorado)
      const agentCodeConfig = getAgentConfig(agentId);
      const allowed = agentCodeConfig.allowedModelIds;
      if (allowed != null && allowed.length > 0 && !allowed.includes(trimmed)) {
        return NextResponse.json(
          {
            error: `Model "${trimmed}" is not allowed for this agent. Allowed models: ${allowed.join(", ")}`,
          },
          { status: 400 }
        );
      }
      defaultModelId = trimmed;
    } else {
      return NextResponse.json(
        { error: "defaultModelId must be a string or null" },
        { status: 400 }
      );
    }
  }

  // --- toolFlags ---
  // null explícito → null (reset de todas as flags ao código).
  // Objecto → validar e aplicar só as chaves conhecidas.
  let toolFlags: Record<string, boolean> | null | undefined;
  if ("toolFlags" in obj) {
    const raw = obj.toolFlags;
    if (raw === null) {
      toolFlags = null; // reset explícito ao código
    } else if (raw != null && typeof raw === "object" && !Array.isArray(raw)) {
      const incoming = raw as Record<string, unknown>;
      const sanitized: Record<string, boolean> = {};
      for (const key of VALID_TOOL_FLAG_KEYS) {
        if (key in incoming) {
          if (typeof incoming[key] !== "boolean") {
            return NextResponse.json(
              { error: `toolFlags.${key} must be a boolean` },
              { status: 400 }
            );
          }
          sanitized[key] = incoming[key] as boolean;
        }
      }
      toolFlags = sanitized;
    } else {
      return NextResponse.json(
        { error: "toolFlags must be an object or null" },
        { status: 400 }
      );
    }
  }

  if (
    instructions === undefined &&
    label === undefined &&
    defaultModelId === undefined &&
    toolFlags === undefined
  ) {
    return NextResponse.json(
      {
        error:
          "Body must contain at least one of: instructions, label, defaultModelId, toolFlags",
      },
      { status: 400 }
    );
  }

  try {
    await upsertBuiltInAgentOverride({
      agentId,
      instructions,
      label,
      defaultModelId,
      toolFlags,
    });
    invalidateAgentOverridesCache();
    return NextResponse.json({ ok: true, agentId });
  } catch {
    return NextResponse.json(
      { error: "Failed to update built-in agent override" },
      { status: 500 }
    );
  }
}
