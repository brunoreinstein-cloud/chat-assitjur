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
 * Abre /chat com sessão de visitante (GET /api/auth/guest → redirect).
 */
export async function gotoChatPage(
  page: Page,
  timeout = 60_000
): Promise<void> {
  await page.goto("/api/auth/guest?callbackUrl=/chat", {
    waitUntil: "load",
    timeout: 35_000,
  });
  const input = page.getByTestId("multimodal-input");
  await input.waitFor({ state: "visible", timeout });
}

/**
 * Faz login com credenciais de teste e navega para /chat.
 * Requer que o utilizador de teste exista na BD.
 */
export async function ensureChatPageWithLogin(
  page: Page,
  email: string,
  password: string,
  timeout = 60_000
): Promise<void> {
  try {
    await page.goto("/login", { waitUntil: "load", timeout: 15_000 });

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

    await page.fill('input[name="email"]', email);
    await page.fill('input[name="password"]', password);
    await page.click('button[type="submit"]');

    await page.waitForURL((url) => /^\/chat(\/|$)/.test(url.pathname), {
      timeout: 30_000,
    });
  } catch (e) {
    if (isConnectionError(e)) {
      throw new Error(
        `Servidor inacessível (conexão recusada). ${SERVER_DOWN_MSG}`
      );
    }
    throw e;
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
