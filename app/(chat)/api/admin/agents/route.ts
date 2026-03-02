import { NextResponse } from "next/server";
import {
  AGENT_IDS,
  getAgentConfigWithOverrides,
} from "@/lib/ai/agents-registry";
import { getBuiltInAgentOverrides } from "@/lib/db/queries";

const ADMIN_SECRET = process.env.ADMIN_CREDITS_SECRET;

function isAdminRequest(request: Request): boolean {
  if (!ADMIN_SECRET?.length) {
    return false;
  }
  const key = request.headers.get("x-admin-key");
  return key === ADMIN_SECRET;
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
      const hasOverride =
        overrides[id] != null &&
        (overrides[id].instructions != null ||
          (overrides[id].label != null && overrides[id].label !== ""));
      return {
        id: config.id,
        label: config.label,
        instructions: config.instructions,
        hasOverride,
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
