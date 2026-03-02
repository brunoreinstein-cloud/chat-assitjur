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

const sessionJsonHeaders = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store, max-age=0",
} as const;

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ nextauth: string[] }> }
) {
  const { nextauth } = await context.params;
  if (nextauth?.at(0) === "session") {
    try {
      const session = await auth();
      const body =
        session && typeof session === "object"
          ? { user: session.user, expires: session.expires }
          : {};
      return new NextResponse(JSON.stringify(body), {
        status: 200,
        headers: sessionJsonHeaders,
      });
    } catch (error) {
      // Devolver sessão vazia em vez de 500 para evitar ClientFetchError no cliente.
      // O utilizador fica "não autenticado" e a app continua a carregar.
      if (process.env.NODE_ENV === "development") {
        const err = error instanceof Error ? error : new Error(String(error));
        console.error("[auth] GET /api/auth/session failed:", err.message);
      }
      return new NextResponse(JSON.stringify({}), {
        status: 200,
        headers: sessionJsonHeaders,
      });
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
