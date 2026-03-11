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
 * Nota: em serverless (ex.: Vercel), o sign-in do Auth.js pode disparar uma sub-requisição
 * noutra instância; o pool aquecido aqui não garante que essa instância esteja quente.
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
  console.warn(
    `[guest] DB warmup falhou após ${WARMUP_MAX_ATTEMPTS} tentativas`
  );
}

/** Timeout para sign-in guest em E2E (avaliado por request para não ficar frozen no cold start). */
function getGuestSignInTimeoutMs(): number {
  const isE2E =
    process.env.PLAYWRIGHT === "true" || process.env.PLAYWRIGHT === "True";
  return isE2E ? 30_000 : 0; // 0 = sem timeout
}

/** Resultado possível de signIn(..., { redirect: false }). */
type SignInResult = { ok?: boolean; url?: string | null } | string | undefined;

async function signInGuestWithOptionalTimeout(
  redirectUrl: string,
  request: Request
): Promise<NextResponse | Response> {
  const timeoutMs = getGuestSignInTimeoutMs();

  const doSignIn = (): Promise<SignInResult> =>
    signIn("guest", {
      redirect: false,
      redirectTo: redirectUrl,
    }) as Promise<SignInResult>;

  if (timeoutMs <= 0) {
    const result = await doSignIn();
    return redirectFromSignInResult(result, redirectUrl, request);
  }

  try {
    const result = await Promise.race([
      doSignIn(),
      new Promise<SignInResult>((_, reject) =>
        setTimeout(() => reject(new Error("GUEST_SIGNIN_TIMEOUT")), timeoutMs)
      ),
    ]);
    return redirectFromSignInResult(result, redirectUrl, request);
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
}

function redirectFromSignInResult(
  result: SignInResult,
  redirectUrl: string,
  request: Request
): NextResponse {
  const raw =
    typeof result === "string"
      ? result
      : (result as { url?: string | null } | undefined)?.url;
  const base = new URL(request.url);
  const fallback = new URL(redirectUrl, request.url);
  if (!raw) {
    return NextResponse.redirect(fallback);
  }
  try {
    const resolved = raw.startsWith("/")
      ? new URL(raw, request.url)
      : new URL(raw);
    if (resolved.origin !== base.origin) {
      return NextResponse.redirect(fallback);
    }
    return NextResponse.redirect(resolved);
  } catch {
    return NextResponse.redirect(fallback);
  }
}

function isCredentialsSignin(error: unknown): boolean {
  const e = error as { type?: string; code?: string };
  return e?.type === "CredentialsSignin" || e?.code === "credentials";
}

let envChecked: boolean | null = null;

/** Verifica env uma vez por processo; evita overhead em cada request. */
function checkEnv(): NextResponse | null {
  if (envChecked === true) {
    return null;
  }
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
  envChecked = true;
  return null;
}

/** Extrai e valida redirectUrl (apenas same-origin) para evitar open redirect (ex.: //evil.com, javascript:). */
function parseRedirectUrl(request: Request): string {
  const { searchParams } = new URL(request.url);
  const raw = searchParams.get("redirectUrl") ?? "/chat";
  try {
    const url = new URL(raw, request.url);
    if (url.origin !== new URL(request.url).origin) {
      return "/chat";
    }
    const path = url.pathname + url.search;
    return path === "/" ? "/chat" : path;
  } catch {
    return "/chat";
  }
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
    return signInGuestWithOptionalTimeout(redirectUrl, request);
  } catch (error) {
    if (isDevelopmentEnvironment) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error("[guest] sign-in failed:", msg);
    }
    const isKnown = isCredentialsSignin(error);
    const message = isKnown
      ? "Não foi possível criar sessão de visitante. A base de dados pode estar indisponível."
      : "Não foi possível iniciar sessão. Tenta novamente.";
    return NextResponse.json(
      { error: "GuestSignInFailed", message },
      { status: 503 }
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

  const postUrl = `/api/auth/guest?redirectUrl=${redirectEnc}`;

  const html = `<!DOCTYPE html>
<html lang="pt">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Visitante</title>
</head>
<body>
  <p id="status">A iniciar sessão como visitante…</p>
  <form id="f" method="post" action="${postUrl}">
    <button id="retry-btn" type="submit">Continuar</button>
  </form>
  <script>
    (function(){
      var statusEl = document.getElementById("status");
      var retryBtn = document.getElementById("retry-btn");
      var fallback = decodeURIComponent("${redirectEnc}") || "/chat";

      function setStatus(msg) { statusEl.textContent = msg; }
      function showRetry() { retryBtn.style.display = ""; }
      function hideRetry() { retryBtn.style.display = "none"; }

      function attempt() {
        hideRetry();
        setStatus("A iniciar sessão como visitante…");
        fetch("${postUrl}", { method: "POST", credentials: "same-origin", redirect: "follow" })
          .then(function(res) {
            if (!res.ok && !res.redirected) {
              setStatus("Não foi possível iniciar sessão. Tenta novamente.");
              showRetry();
              return;
            }
            window.location.replace(res.redirected ? res.url : fallback);
          })
          .catch(function() {
            setStatus("Não foi possível iniciar sessão. Verifica a ligação e tenta novamente.");
            showRetry();
          });
      }

      retryBtn.addEventListener("click", function(e) {
        e.preventDefault();
        attempt();
      });

      hideRetry();
      var warmup = fetch("/api/health/db", { method: "GET", credentials: "omit" }).catch(function(){});
      var timeout = new Promise(function(r){ setTimeout(r, 3000); });
      Promise.race([warmup, timeout]).then(attempt);
    })();
  </script>
</body>
</html>`;

  return new NextResponse(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
