import { NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { signIn } from "@/app/(auth)/auth";
import { isDevelopmentEnvironment } from "@/lib/constants";

function isCredentialsSignin(error: unknown): boolean {
  const e = error as { type?: string; code?: string };
  return e?.type === "CredentialsSignin" || e?.code === "credentials";
}

export async function GET(request: Request) {
  if (!process.env.AUTH_SECRET) {
    return NextResponse.json(
      {
        error: "Server misconfiguration",
        message: "AUTH_SECRET is not set. Add it to your .env file.",
      },
      { status: 503 }
    );
  }

  if (!process.env.POSTGRES_URL) {
    return NextResponse.json(
      {
        error: "Server misconfiguration",
        message:
          "POSTGRES_URL is not set. Add it to your .env file and ensure the database is running.",
      },
      { status: 503 }
    );
  }

  const { searchParams } = new URL(request.url);
  const redirectUrl = searchParams.get("redirectUrl") || "/chat";

  try {
    const token = await getToken({
      req: request,
      secret: process.env.AUTH_SECRET,
      secureCookie: !isDevelopmentEnvironment,
    });

    if (token) {
      return NextResponse.redirect(new URL(redirectUrl, request.url));
    }

    return signIn("guest", { redirect: true, redirectTo: redirectUrl });
  } catch (error) {
    if (isCredentialsSignin(error)) {
      return NextResponse.json(
        {
          error: "GuestSignInFailed",
          message:
            "Não foi possível criar sessão de visitante. Verifica na Vercel: POSTGRES_URL com porta 6543 (Supabase), migrações aplicadas (pnpm run db:migrate) e base de dados acessível.",
        },
        { status: 503 }
      );
    }
    return NextResponse.json(
      {
        error: "Guest sign-in failed",
        message: "Something went wrong. Please try again later.",
      },
      { status: 500 }
    );
  }
}
