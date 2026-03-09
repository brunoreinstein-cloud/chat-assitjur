import type { Page } from "@playwright/test";
import { generateId } from "ai";
import { getUnixTime } from "date-fns";

/** Mensagem de diagnóstico quando o servidor não está acessível (para E2E). */
export const SERVER_DOWN_MSG =
  "Solução: num terminal corre `pnpm run dev:test` e espera aparecer 'Ready'; noutro corre `pnpm run test:with-dev-3301`. " +
  "Ou usa `pnpm test` (Playwright arranca o servidor automaticamente; se falhar, confirma que a porta 3301 está livre).";

function isConnectionError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return (
    msg.includes("ERR_CONNECTION_REFUSED") ||
    msg.includes("NS_ERROR_CONNECTION_REFUSED") ||
    msg.includes("net::ERR_")
  );
}

/**
 * Abre /chat quando a sessão de visitante já está nos cookies (ex.: storageState).
 * Use nos testes do projeto e2e-guest. Para login completo use ensureChatPageWithGuest.
 */
export async function gotoChatPage(
  page: Page,
  timeout = 60_000
): Promise<void> {
  // Timeout de navegação maior quando a BD está lenta (E2E)
  await page.goto("/chat", { waitUntil: "load", timeout: 35_000 });
  const input = page.getByTestId("multimodal-input");
  await input.waitFor({ state: "visible", timeout });
}

/** Abre /chat com sessão visitante. Usa GET /api/auth/guest?redirectUrl=/chat (auto-POST + redirect) para ser fiável em E2E/produção. */
export async function ensureChatPageWithGuest(
  page: Page,
  timeout = 60_000
): Promise<void> {
  const settleTimeout = 15_000;
  try {
    // "load" garante que falhas de rede (ex.: servidor em baixo) falham no goto em vez de no waitForURL
    await page.goto("/api/auth/guest?redirectUrl=%2Fchat", {
      waitUntil: "load",
      timeout: 15_000,
    });
    // Se já estamos numa página de erro, falhar de imediato sem chamar waitForURL (evita ERR_CONNECTION_REFUSED no waitForURL).
    const urlAfterGoto = page.url();
    const isErrorAlready =
      urlAfterGoto.startsWith("chrome-error:") ||
      urlAfterGoto.startsWith("edge-error:") ||
      urlAfterGoto === "about:blank";
    if (isErrorAlready) {
      throw new Error(
        `Não foi possível carregar a app (URL: ${urlAfterGoto}). O servidor não está a correr. ${SERVER_DOWN_MSG}`
      );
    }
    // Esperar que a URL estabilize: ou /chat (sucesso) ou página de erro (servidor em baixo).
    await page.waitForURL(
      (url) => {
        const path = url.pathname;
        const isChat = /^\/chat(\/|$)/.test(path);
        const isError =
          url.href.startsWith("chrome-error:") ||
          url.href.startsWith("edge-error:") ||
          url.href === "about:blank";
        return isChat || isError;
      },
      { timeout: settleTimeout }
    );
  } catch (e) {
    if (isConnectionError(e)) {
      throw new Error(
        `Servidor inacessível (conexão recusada). ${SERVER_DOWN_MSG}`
      );
    }
    throw e;
  }
  const currentUrl = page.url();
  const isErrorPage =
    currentUrl.startsWith("chrome-error:") ||
    currentUrl.startsWith("edge-error:") ||
    currentUrl.startsWith("about:blank");
  if (isErrorPage) {
    throw new Error(
      `Não foi possível carregar a app (URL: ${currentUrl}). O servidor não está a correr. ${SERVER_DOWN_MSG}`
    );
  }
  const input = page.getByTestId("multimodal-input");
  await input.waitFor({ state: "visible", timeout });
}

export function generateRandomTestUser() {
  const email = `test-${getUnixTime(new Date())}@playwright.com`;
  const password = generateId();

  return {
    email,
    password,
  };
}

export function generateTestMessage() {
  return `Test message ${Date.now()}`;
}
