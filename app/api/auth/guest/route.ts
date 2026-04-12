import { NextResponse } from "next/server";

import { signIn } from "@/app/(auth)/auth";

/**
 * Inicia sessão como visitante (para E2E ou links diretos).
 * GET /api/auth/guest?callbackUrl=/chat
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const callbackUrl = url.searchParams.get("callbackUrl") ?? "/chat";

  try {
    const result = await signIn("credentials", {
      guest: "true",
      redirect: false,
    });
    const failed =
      result &&
      typeof result === "object" &&
      "error" in result &&
      Boolean((result as { error?: string }).error);
    if (failed) {
      return NextResponse.json(
        { error: "GuestSignInTimeout" },
        { status: 503 }
      );
    }
  } catch {
    return NextResponse.json({ error: "GuestSignInTimeout" }, { status: 503 });
  }

  return NextResponse.redirect(new URL(callbackUrl, url.origin));
}
