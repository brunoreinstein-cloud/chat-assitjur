import { NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { signIn } from "@/app/(auth)/auth";
import { isDevelopmentEnvironment } from "@/lib/constants";
import { pingDatabase } from "@/lib/db/queries";

/** Timeout por tentativa de warmup (ms). */
const WARMUP_ATTEMPT_TIMEOUT_MS = 8000;
/** Número máximo de tentativas de warmup antes do sign-in. */
const WARMUP_MAX_ATTEMPTS = 3;
/** Pausa entre tentativas (ms). */
const WARMUP_DELAY_BETWEEN_MS = 1000;

/**
 * Aquece a BD com retry antes do sign-in guest, para estabilizar o pool no mesmo
 * processo (evita race em que o GET warmup não chega antes do POST).
 * Não falha o pedido se o warmup falhar — o sign-in segue e pode falhar por si.
 */
async function warmupDatabaseWithRetry(): Promise<void> {
  for (let attempt = 1; attempt <= WARMUP_MAX_ATTEMPTS; attempt++) {
    const result = await Promise.race([
      pingDatabase(),
      new Promise<{ ok: false; error: string; latencyMs: number }>((resolve) =>
        setTimeout(
          () =>
            resolve({
              ok: false,
              error: "Warmup timed out",
              latencyMs: WARMUP_ATTEMPT_TIMEOUT_MS,
            }),
          WARMUP_ATTEMPT_TIMEOUT_MS
        )
      ),
    ]);
    if (result.ok) {
      if (isDevelopmentEnvironment && attempt > 1) {
        console.info(
          `[guest] DB warmup OK após ${attempt} tentativa(s), ${result.latencyMs}ms`
        );
      }
      return;
    }
    if (attempt < WARMUP_MAX_ATTEMPTS) {
      await new Promise((r) => setTimeout(r, WARMUP_DELAY_BETWEEN_MS));
    }
  }
}

/** Em E2E (Playwright), timeout para o sign-in guest; se a BD estiver lenta, devolve 503 em vez de bloquear ~50s. */
const isE2E =
  process.env.PLAYWRIGHT === "true" || process.env.PLAYWRIGHT === "True";
const GUEST_SIGNIN_TIMEOUT_MS = isE2E ? 30_000 : 0; // 0 = sem timeout

async function signInGuestWithOptionalTimeout(
  redirectUrl: string
): Promise<NextResponse | Response> {
  const doSignIn = () =>
    signIn("guest", { redirect: true, redirectTo: redirectUrl });

  if (GUEST_SIGNIN_TIMEOUT_MS <= 0) {
    return doSignIn();
  }

  try {
    await Promise.race([
      doSignIn(),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error("GUEST_SIGNIN_TIMEOUT")),
          GUEST_SIGNIN_TIMEOUT_MS
        )
      ),
    ]);
  } catch (e) {
    if (e instanceof Error && e.message === "GUEST_SIGNIN_TIMEOUT") {
      return NextResponse.json(
        {
          error: "GuestSignInTimeout",
          message:
            "Base de dados lenta no teste E2E; o sign-in guest excedeu o tempo limite. Tenta novamente ou verifica POSTGRES_URL (pooler).",
        },
        { status: 503 }
      );
    }
    if (e instanceof Response && e.status >= 300 && e.status < 400) {
      return e;
    }
    throw e;
  }

  return doSignIn();
}

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

    await warmupDatabaseWithRetry();
    return signInGuestWithOptionalTimeout(redirectUrl);
  } catch (error) {
    if (isDevelopmentEnvironment) {
      const err = error as Error | undefined;
      const msg = err?.message ?? String(error);
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
  <script>
    (function(){
      const form = document.getElementById("f");
      const warmupMs = 3000;
      const warmup = fetch("/api/health/db", { method: "GET", credentials: "omit" }).catch(function(){});
      const timeout = new Promise(function(r){ setTimeout(r, warmupMs); });
      Promise.race([warmup, timeout]).then(function(){ form.submit(); });
    })();
  </script>
</body>
</html>`;

  return new NextResponse(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
