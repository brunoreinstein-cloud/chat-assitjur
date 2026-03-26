import { NextResponse } from "next/server";
import { AGENT_IDS, type AgentId } from "@/lib/ai/agents-registry";
import { getPromptVersions } from "@/lib/db/queries";

const ADMIN_SECRET = process.env.ADMIN_CREDITS_SECRET;

function isAdminRequest(request: Request): boolean {
  if (!ADMIN_SECRET?.length) {
    return false;
  }
  return request.headers.get("x-admin-key") === ADMIN_SECRET;
}

/** GET: lista versões de um agente (metadata apenas, sem content). */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  if (!isAdminRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: agentId } = await context.params;
  if (!AGENT_IDS.includes(agentId as AgentId)) {
    return NextResponse.json({ error: "Invalid agent id" }, { status: 400 });
  }

  const versions = await getPromptVersions(agentId);
  return NextResponse.json({ agentId, versions });
}
