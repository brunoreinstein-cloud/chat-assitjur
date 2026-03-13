import { type NextRequest, NextResponse } from "next/server";
import { GET as AuthGET, POST as AuthPOST, auth } from "@/app/(auth)/auth";

function isCredentialsSignin(error: unknown): boolean {
  const e = error as { type?: string };
  return e?.type === "CredentialsSignin";
}

const authErrorResponse = (error: unknown) => {
  if (isCredentialsSignin(error)) {
    return NextResponse.json(
      {
        error: "CredentialsSignin",
        message: "Credenciais inválidas. Verifica o email e a palavra-passe.",
      },
      { status: 401 }
    );
  }
  return NextResponse.json(
    {
      error: "AuthError",
      message: error instanceof Error ? error.message : "Authentication failed",
    },
    { status: 500 }
  );
};

const sessionJsonHeaders: HeadersInit = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store, max-age=0",
  "X-Auth-Session": "1",
};

const EMPTY_SESSION_JSON = "{}";

/** Sempre que o path for o endpoint de sessão (params podem vir errados com Turbopack/Next 16). */
function isSessionRequest(
  nextauth: string[] | undefined,
  pathname: string
): boolean {
  if (nextauth?.at(0) === "session") {
    return true;
  }
  const normalized = pathname.replace(/\/$/, "") || "/";
  return normalized.endsWith("/session");
}

/** Resposta sempre JSON válido para o cliente (evita ClientFetchError por "Unexpected end of JSON input"). */
function sessionResponse(body: {
  user?: unknown;
  expires?: string;
}): NextResponse {
  const json =
    body && typeof body === "object" && Object.keys(body).length > 0
      ? JSON.stringify(body)
      : EMPTY_SESSION_JSON;
  return new NextResponse(json, {
    status: 200,
    headers: { ...sessionJsonHeaders },
  });
}

async function handleSessionGet(): Promise<NextResponse> {
  try {
    const session = await auth();
    const body =
      session && typeof session === "object"
        ? { user: session.user, expires: session.expires }
        : {};
    return sessionResponse(body);
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      const err = error instanceof Error ? error : new Error(String(error));
      console.error("[auth] GET /api/auth/session failed:", err.message);
    }
    return sessionResponse({});
  }
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ nextauth?: string[] }> }
) {
  const pathname = request.nextUrl?.pathname ?? "";
  // Qualquer pedido ao endpoint de sessão deve devolver sempre JSON (evita ClientFetchError "Unexpected token '<', \"<!DOCTYPE \"...").
  const pathIsSession =
    pathname.endsWith("/session") ||
    pathname.endsWith("/session/") ||
    pathname.includes("/session");

  if (pathIsSession) {
    try {
      return await handleSessionGet();
    } catch (error) {
      if (process.env.NODE_ENV === "development") {
        console.error("[auth] GET session unexpected error:", error);
      }
      return sessionResponse({});
    }
  }

  let nextauth: string[] | undefined;
  try {
    nextauth = (await context.params)?.nextauth;
  } catch {
    nextauth = undefined;
  }

  if (isSessionRequest(nextauth, pathname)) {
    try {
      return await handleSessionGet();
    } catch (error) {
      if (process.env.NODE_ENV === "development") {
        console.error("[auth] GET session unexpected error:", error);
      }
      return sessionResponse({});
    }
  }

  try {
    return await AuthGET(request);
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function POST(
  request: NextRequest,
  _context: { params: Promise<{ nextauth: string[] }> }
) {
  try {
    return await AuthPOST(request);
  } catch (error) {
    return authErrorResponse(error);
  }
}
