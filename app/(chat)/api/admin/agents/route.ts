import { NextResponse } from "next/server";
import { getDefaultModelForAgent } from "@/lib/ai/agent-models";
import {
  AGENT_IDS,
  getAgentConfig,
  getAgentConfigWithOverrides,
} from "@/lib/ai/agents-registry";
import { getBuiltInAgentOverrides } from "@/lib/db/queries";

const ADMIN_SECRET = process.env.ADMIN_CREDITS_SECRET;

function isAdminRequest(request: Request): boolean {
  if (!ADMIN_SECRET?.length) {
    return false;
  }
  return request.headers.get("x-admin-key") === ADMIN_SECRET;
}

/** GET: listar agentes built-in com config efetiva (código + overrides da BD). */
export async function GET(request: Request) {
  if (!isAdminRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const overrides = await getBuiltInAgentOverrides();
    const list = AGENT_IDS.map((id) => {
      const config = getAgentConfigWithOverrides(id, overrides);
      const base = getAgentConfig(id); // config pura do código, sem overrides DB
      const over = overrides[id];
      const hasOverride =
        over != null &&
        (over.instructions != null ||
          (over.label != null && over.label !== "") ||
          (over.defaultModelId != null && over.defaultModelId !== "") ||
          over.toolFlags != null);

      const toFlags = (c: typeof config) => ({
        useRevisorDefesaTools: c.useRevisorDefesaTools,
        useRedatorContestacaoTool: c.useRedatorContestacaoTool,
        useMemoryTools: c.useMemoryTools ?? true,
        useApprovalTool: c.useApprovalTool ?? false,
        usePipelineTool: c.usePipelineTool ?? false,
        useMasterDocumentsTool: c.useMasterDocumentsTool ?? false,
      });

      return {
        id: config.id,
        label: config.label,
        instructions: config.instructions,
        hasOverride,
        /** Modelo padrão efectivo (override ou null = usa global). */
        defaultModelId: config.defaultModelId ?? null,
        /** Modelo que seria usado sem qualquer override (primeiro da lista permitida). */
        codeDefaultModelId: getDefaultModelForAgent(id),
        /** IDs dos modelos permitidos para este agente (null = todos). */
        allowedModelIds: config.allowedModelIds ?? null,
        /** Capacidades efectivas (código + override DB). */
        toolFlags: toFlags(config),
        /** Capacidades puras do código (sem override DB) — para reset individual. */
        codeToolFlags: toFlags(base),
      };
    });
    return NextResponse.json(list);
  } catch {
    return NextResponse.json(
      { error: "Failed to list built-in agents" },
      { status: 500 }
    );
  }
}
