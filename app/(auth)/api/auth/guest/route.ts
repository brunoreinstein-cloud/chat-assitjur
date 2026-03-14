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
    // Páginas de autenticação não são destinos válidos para um guest — evita loop.
    const AUTH_PAGES = ["/login", "/register", "/api/auth"];
    if (path === "/" || AUTH_PAGES.some((p) => path.startsWith(p))) {
      return "/chat";
    }
    return path;
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
  <title>AssistJur.IA — Entrando</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      min-height: 100dvh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #130d2e;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      color: #e2e0f0;
      padding: 1rem;
    }

    .card {
      width: 100%;
      max-width: 380px;
      background: #1c1442;
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 16px;
      padding: 2.5rem 2rem;
      text-align: center;
      box-shadow: 0 24px 64px rgba(0,0,0,0.5);
    }

    /* Logo */
    .logo {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 2rem;
      text-decoration: none;
    }
    .logo-icon {
      width: 32px; height: 32px;
      color: #f0a500;
    }
    .logo-text { font-size: 1.2rem; font-weight: 700; letter-spacing: -0.3px; }
    .logo-assist { color: #e2d9ff; }
    .logo-jur    { color: #f0a500; }
    .logo-ia     { color: #9b7fe8; }

    /* Spinner */
    .spinner-wrap {
      display: flex;
      align-items: center;
      justify-content: center;
      margin-bottom: 1.25rem;
      height: 48px;
    }
    .spinner {
      width: 36px; height: 36px;
      border: 3px solid rgba(240,165,0,0.2);
      border-top-color: #f0a500;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }

    /* Error icon */
    .error-icon {
      display: none;
      width: 40px; height: 40px;
      border-radius: 50%;
      background: rgba(239,68,68,0.15);
      border: 1px solid rgba(239,68,68,0.3);
      align-items: center;
      justify-content: center;
      margin: 0 auto 1.25rem;
      font-size: 1.1rem;
    }

    #status {
      font-size: 0.875rem;
      color: #b3aed6;
      line-height: 1.5;
      min-height: 2.5em;
      margin-bottom: 1.5rem;
    }
    #status.error-text { color: #fca5a5; }

    /* Button */
    #retry-btn {
      display: none;
      width: 100%;
      padding: 0.65rem 1.5rem;
      background: #f0a500;
      color: #130d2e;
      border: none;
      border-radius: 8px;
      font-size: 0.875rem;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.15s, transform 0.1s;
    }
    #retry-btn:hover  { background: #f8b920; }
    #retry-btn:active { transform: scale(0.98); }

    .login-link {
      display: block;
      margin-top: 1.25rem;
      font-size: 0.78rem;
      color: #7c6faa;
      text-decoration: none;
    }
    .login-link:hover { color: #b3aed6; }
    .login-link span { color: #f0a500; }
  </style>
</head>
<body>
  <div class="card">
    <a class="logo" href="/">
      <svg class="logo-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="3"/>
        <line x1="12" y1="2" x2="12" y2="5"/><line x1="12" y1="19" x2="12" y2="22"/>
        <line x1="4.22" y1="4.22" x2="6.34" y2="6.34"/><line x1="17.66" y1="17.66" x2="19.78" y2="19.78"/>
        <line x1="2" y1="12" x2="5" y2="12"/><line x1="19" y1="12" x2="22" y2="12"/>
        <line x1="4.22" y1="19.78" x2="6.34" y2="17.66"/><line x1="17.66" y1="6.34" x2="19.78" y2="4.22"/>
      </svg>
      <span class="logo-text">
        <span class="logo-assist">Assist</span><span class="logo-jur">Jur.</span><span class="logo-ia">IA</span>
      </span>
    </a>

    <div class="spinner-wrap">
      <div id="spinner" class="spinner"></div>
      <div id="error-icon" class="error-icon">✕</div>
    </div>

    <p id="status">A iniciar sessão como visitante…</p>

    <form id="f" method="post" action="${postUrl}">
      <button id="retry-btn" type="button">Tentar novamente</button>
    </form>

    <a class="login-link" href="/login">
      Tem uma conta? <span>Entrar com e-mail →</span>
    </a>
  </div>

  <script>
    (function(){
      var statusEl  = document.getElementById("status");
      var retryBtn  = document.getElementById("retry-btn");
      var spinner   = document.getElementById("spinner");
      var errorIcon = document.getElementById("error-icon");
      var fallback  = decodeURIComponent("${redirectEnc}") || "/chat";

      function setLoading() {
        spinner.style.display = "";
        errorIcon.style.display = "none";
        statusEl.textContent = "A iniciar sessão como visitante…";
        statusEl.className = "";
        retryBtn.style.display = "none";
      }

      function setError(msg) {
        spinner.style.display = "none";
        errorIcon.style.display = "flex";
        statusEl.textContent = msg;
        statusEl.className = "error-text";
        retryBtn.style.display = "block";
      }

      function attempt() {
        setLoading();
        // redirect:"manual" impede que o fetch siga o 307 como POST,
        // evitando o loop POST→307→POST→/login→307→...
        fetch("${postUrl}", { method: "POST", credentials: "same-origin", redirect: "manual" })
          .then(function(res) {
            // opaqueredirect = redireccionamento bem-sucedido (3xx com redirect:manual)
            if (res.type === "opaqueredirect" || (res.status >= 300 && res.status < 400)) {
              window.location.replace(fallback);
              return;
            }
            if (!res.ok) {
              setError("Não foi possível iniciar sessão. Tenta novamente.");
              return;
            }
            window.location.replace(fallback);
          })
          .catch(function() {
            setError("Sem ligação ao servidor. Verifica a tua ligação e tenta novamente.");
          });
      }

      retryBtn.addEventListener("click", function(e) { e.preventDefault(); attempt(); });

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
