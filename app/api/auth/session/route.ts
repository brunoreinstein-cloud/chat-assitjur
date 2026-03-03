import { NextResponse } from "next/server";
import { auth } from "@/app/(auth)/auth";

const SESSION_JSON_HEADERS: HeadersInit = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store, max-age=0",
  "X-Auth-Session": "1",
};

/**
 * Rota explícita para GET /api/auth/session.
 * Garante resposta sempre em JSON (evita ClientFetchError "Unexpected token '<', \"<!DOCTYPE \"..."
 * quando o catch-all [...nextauth] não é resolvido corretamente pelo Turbopack/Next 16).
 */
export async function GET() {
  try {
    const session = await auth();
    const body =
      session && typeof session === "object"
        ? { user: session.user, expires: session.expires }
        : {};
    const json =
      body && typeof body === "object" && Object.keys(body).length > 0
        ? JSON.stringify(body)
        : "{}";
    return new NextResponse(json, {
      status: 200,
      headers: { ...SESSION_JSON_HEADERS },
    });
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      const err = error instanceof Error ? error : new Error(String(error));
      console.error("[auth] GET /api/auth/session failed:", err.message);
    }
    return new NextResponse("{}", {
      status: 200,
      headers: { ...SESSION_JSON_HEADERS },
    });
  }
}
