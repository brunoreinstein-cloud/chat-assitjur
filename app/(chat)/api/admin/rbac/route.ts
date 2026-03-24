import { NextResponse } from "next/server";
import { listUsersForAdmin, updateUserRole } from "@/lib/db/queries";
import { ChatbotError } from "@/lib/errors";
import { ROLES } from "@/lib/rbac/roles";

const ADMIN_SECRET = process.env.ADMIN_CREDITS_SECRET;

function isAdminRequest(request: Request): boolean {
  if (!ADMIN_SECRET?.length) {
    return false;
  }
  return request.headers.get("x-admin-key") === ADMIN_SECRET;
}

/** GET: listar utilizadores com role (admin). */
export async function GET(request: Request) {
  if (!isAdminRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const list = await listUsersForAdmin();
    return NextResponse.json(list);
  } catch (_error) {
    return NextResponse.json(
      { error: "Failed to list users" },
      { status: 500 }
    );
  }
}

/** PATCH: atualizar o role de um utilizador. Body: { userId, role: string | null }. */
export async function PATCH(request: Request) {
  if (!isAdminRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const obj = body as Record<string, unknown>;
  const userId =
    typeof obj?.userId === "string" ? obj.userId.trim() : undefined;
  const role =
    obj?.role === null
      ? null
      : typeof obj?.role === "string" &&
          (ROLES as readonly string[]).includes(obj.role)
        ? obj.role
        : undefined;

  if (!userId || role === undefined) {
    return NextResponse.json(
      {
        error: `Body must contain userId (string) and role (${ROLES.join(" | ")} | null)`,
      },
      { status: 400 }
    );
  }

  try {
    await updateUserRole(userId, role);
    return NextResponse.json({ ok: true, userId, role });
  } catch (err) {
    if (err instanceof ChatbotError) {
      return NextResponse.json(
        { error: err.message },
        { status: err.statusCode }
      );
    }
    return NextResponse.json(
      { error: "Failed to update role" },
      { status: 500 }
    );
  }
}
