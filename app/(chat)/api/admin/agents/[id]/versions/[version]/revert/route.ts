import { NextResponse } from "next/server";
import {
  AGENT_IDS,
  type AgentId,
  getAgentConfig,
} from "@/lib/ai/agents-registry";
import { invalidateAgentOverridesCache } from "@/lib/cache/agent-overrides-cache";
import {
  createPromptVersion,
  getPromptVersion,
  upsertBuiltInAgentOverride,
} from "@/lib/db/queries";

const ADMIN_SECRET = process.env.ADMIN_CREDITS_SECRET;

function isAdminRequest(request: Request): boolean {
  if (!ADMIN_SECRET?.length) {
    return false;
  }
  return request.headers.get("x-admin-key") === ADMIN_SECRET;
}

/** POST: reverte o agente para uma versão anterior. */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string; version: string }> }
) {
  if (!isAdminRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: agentId, version: versionStr } = await context.params;
  if (!AGENT_IDS.includes(agentId as AgentId)) {
    return NextResponse.json({ error: "Invalid agent id" }, { status: 400 });
  }

  const versionNum = Number.parseInt(versionStr, 10);
  if (Number.isNaN(versionNum) || versionNum < 1) {
    return NextResponse.json(
      { error: "Version must be a positive integer" },
      { status: 400 }
    );
  }

  const targetVersion = await getPromptVersion(agentId, versionNum);
  if (!targetVersion) {
    return NextResponse.json({ error: "Version not found" }, { status: 404 });
  }

  // 1. Criar snapshot da configuração ATUAL antes de reverter
  const currentConfig = getAgentConfig(agentId);
  await createPromptVersion({
    agentId,
    content: currentConfig.instructions,
    label: currentConfig.label,
    modelId: currentConfig.defaultModelId ?? null,
    toolFlags: null,
    createdBy: request.headers.get("x-admin-email") ?? "admin",
    changeNote: `Revertido para versão ${versionNum}`,
  }).catch(() => {
    /* snapshot falha silenciosa */
  });

  // 2. Aplicar a versão alvo como override
  await upsertBuiltInAgentOverride({
    agentId,
    instructions: targetVersion.content,
    label: targetVersion.label ?? undefined,
    defaultModelId: targetVersion.modelId ?? undefined,
    toolFlags: targetVersion.toolFlags ?? undefined,
  });
  invalidateAgentOverridesCache();

  return NextResponse.json({
    ok: true,
    agentId,
    revertedToVersion: versionNum,
  });
}
