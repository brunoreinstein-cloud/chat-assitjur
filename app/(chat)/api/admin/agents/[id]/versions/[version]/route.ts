import { NextResponse } from "next/server";
import { AGENT_IDS, type AgentId } from "@/lib/ai/agents-registry";
import { getPromptVersion } from "@/lib/db/queries";

const ADMIN_SECRET = process.env.ADMIN_CREDITS_SECRET;

function isAdminRequest(request: Request): boolean {
  if (!ADMIN_SECRET?.length) {
    return false;
  }
  return request.headers.get("x-admin-key") === ADMIN_SECRET;
}

/** GET: detalhes de uma versão específica (inclui content). */
export async function GET(
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

  const version = await getPromptVersion(agentId, versionNum);
  if (!version) {
    return NextResponse.json({ error: "Version not found" }, { status: 404 });
  }

  return NextResponse.json(version);
}
