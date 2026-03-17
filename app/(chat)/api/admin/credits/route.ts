import { NextResponse } from "next/server";
import { creditsCache } from "@/lib/cache/credits-cache";
import { addCreditsToUser, getUsersWithCreditBalances } from "@/lib/db/queries";
import { ChatbotError } from "@/lib/errors";

const ADMIN_SECRET = process.env.ADMIN_CREDITS_SECRET;

function isAdminRequest(request: Request): boolean {
  if (!ADMIN_SECRET?.length) {
    return false;
  }
  const key = request.headers.get("x-admin-key");
  return key === ADMIN_SECRET;
}

/** GET: listar utilizadores com saldo (admin). */
export async function GET(request: Request) {
  if (!isAdminRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const list = await getUsersWithCreditBalances();
    return NextResponse.json(list);
  } catch (_error) {
    return NextResponse.json(
      { error: "Failed to list credits" },
      { status: 500 }
    );
  }
}

/** POST: adicionar créditos a um utilizador (admin). Body: { userId: string, delta: number }. */
export async function POST(request: Request) {
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
  const userId = typeof obj?.userId === "string" ? obj.userId : undefined;
  const delta =
    typeof obj?.delta === "number" && Number.isInteger(obj.delta)
      ? obj.delta
      : undefined;

  if (!userId || delta === undefined || delta <= 0) {
    return NextResponse.json(
      {
        error: "Body must contain userId (string) and delta (positive integer)",
      },
      { status: 400 }
    );
  }

  try {
    await addCreditsToUser({ userId, delta });
    creditsCache.delete(userId);
    return NextResponse.json({ ok: true, userId, delta });
  } catch (err) {
    if (err instanceof ChatbotError) {
      // Usa o statusCode já calculado pelo ChatbotError (400, 404, 500, etc.)
      return NextResponse.json(
        { error: err.message },
        { status: err.statusCode }
      );
    }
    return NextResponse.json(
      { error: "Failed to add credits" },
      { status: 500 }
    );
  }
}
