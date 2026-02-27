import { NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { signIn } from "@/app/(auth)/auth";
import { isDevelopmentEnvironment } from "@/lib/constants";

function isCredentialsSignin(error: unknown): boolean {
  const e = error as { type?: string; code?: string };
  return e?.type === "CredentialsSignin" || e?.code === "credentials";
}

function checkEnv() {
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
  return null;
}

function parseRedirectUrl(request: Request): string {
  const { searchParams } = new URL(request.url);
  const rawRedirect = searchParams.get("redirectUrl") || "/chat";
  return rawRedirect.startsWith("http")
    ? new URL(rawRedirect).pathname + new URL(rawRedirect).search
    : rawRedirect;
}

/** POST: aciona o sign-in guest e redireciona. O cookie de sessão é definido nesta resposta (fluxo Auth.js). */
export async function POST(request: Request) {
  const envError = checkEnv();
  if (envError) {
    return envError;
  }

  const redirectUrl = parseRedirectUrl(request);

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
    if (isDevelopmentEnvironment) {
      const err = error as Error | undefined;
      const msg = err?.message ?? String(error);
      // biome-ignore lint/suspicious/noConsole: diagnóstico em dev
      console.error("[guest] sign-in failed:", msg, error);
    }
    if (isCredentialsSignin(error)) {
      return NextResponse.json(
        {
          error: "GuestSignInFailed",
          message:
            "Não foi possível criar sessão de visitante. Verifica: POSTGRES_URL (Supabase usa porta 6543), migrações (pnpm db:migrate), AUTH_URL=http://localhost:3300 em .env.local e base de dados acessível.",
        },
        { status: 503 }
      );
    }
    return NextResponse.json(
      {
        error: "Guest sign-in failed",
        message:
          "Something went wrong. Please try again later. In dev, check terminal for [guest] sign-in failed.",
      },
      { status: 500 }
    );
  }
}

/** GET: se já tem sessão redireciona; senão devolve HTML que faz POST para esta rota (para o cookie ser definido no POST). */
export async function GET(request: Request) {
  const envError = checkEnv();
  if (envError) {
    return envError;
  }

  const redirectUrl = parseRedirectUrl(request);
  const redirectEnc = encodeURIComponent(redirectUrl);

  try {
    const token = await getToken({
      req: request,
      secret: process.env.AUTH_SECRET,
      secureCookie: !isDevelopmentEnvironment,
    });

    if (token) {
      return NextResponse.redirect(new URL(redirectUrl, request.url));
    }
  } catch {
    // fallback para página de auto-submit
  }

  const html = `<!DOCTYPE html>
<html lang="pt">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Visitante</title>
</head>
<body>
  <p>A iniciar sessão como visitante…</p>
  <form id="f" method="post" action="/api/auth/guest?redirectUrl=${redirectEnc}">
    <button type="submit">Continuar</button>
  </form>
  <script>document.getElementById("f").submit();</script>
</body>
</html>`;

  return new NextResponse(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
