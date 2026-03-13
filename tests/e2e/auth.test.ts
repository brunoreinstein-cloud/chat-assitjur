import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import { SERVER_DOWN_MSG } from "../helpers";

/** Mensagem exibida quando POST /api/auth/guest devolve 503 por timeout (BD lenta em E2E). */
const GUEST_SIGNIN_TIMEOUT_MARKER = "GuestSignInTimeout";

/** Falha rápido se a página não carregou (servidor em baixo), em vez de esperar timeout. */
function assertPageLoaded(page: { url: () => string }, path: string) {
  const url = page.url();
  const isErrorPage =
    url.startsWith("chrome-error:") ||
    url.startsWith("edge-error:") ||
    url === "about:blank";
  if (isErrorPage) {
    throw new Error(
      `Não foi possível carregar ${path} (URL: ${url}). O servidor não está a correr. ${SERVER_DOWN_MSG}`
    );
  }
}

/**
 * Navega para /login ou /register com retry quando o servidor devolve 503 GuestSignInTimeout
 * (BD lenta em E2E). Faz até maxRetries tentativas com delay entre elas.
 */
async function gotoAuthPageWithRetry(
  page: Page,
  path: string,
  options: { timeout?: number; maxRetries?: number; delayMs?: number } = {}
) {
  const { timeout = 60_000, maxRetries = 5, delayMs = 2000 } = options;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    await page.goto(path, { waitUntil: "load", timeout });
    assertPageLoaded(page, path);

    const body = await page.textContent("body").catch(() => "");
    const is503GuestTimeout =
      body?.includes(GUEST_SIGNIN_TIMEOUT_MARKER) ?? false;

    if (!is503GuestTimeout) {
      return;
    }

    lastError = new Error(
      `[tentativa ${attempt}/${maxRetries}] POST /api/auth/guest devolveu 503 (GuestSignInTimeout). BD lenta.`
    );
    if (attempt < maxRetries) {
      await page.waitForTimeout(delayMs);
    }
  }

  throw (
    lastError ?? new Error("gotoAuthPageWithRetry falhou sem erro guardado.")
  );
}

test.describe("Authentication Pages", () => {
  /** Aquece a conexão à BD antes dos testes para evitar timeouts no primeiro request (guest/credits). */
  test.beforeAll(async ({ request }) => {
    await request.get("/api/health/db");
  });

  test("login page renders correctly", async ({ page }) => {
    await page.goto("/login", { waitUntil: "load", timeout: 15_000 });
    assertPageLoaded(page, "/login");
    await expect(page.getByLabel("E-mail")).toBeVisible();
    await expect(page.getByLabel("Senha")).toBeVisible();
    await expect(page.getByRole("button", { name: "Entrar" })).toBeVisible();
    await expect(page.getByText("Não tem uma conta?")).toBeVisible();
  });

  test("register page renders correctly", async ({ page }) => {
    await page.goto("/register", { waitUntil: "load", timeout: 15_000 });
    assertPageLoaded(page, "/register");
    await expect(page.getByLabel("E-mail")).toBeVisible();
    await expect(page.getByLabel("Senha")).toBeVisible();
    await expect(page.getByRole("button", { name: "Cadastrar" })).toBeVisible();
    await expect(page.getByText("Já tem uma conta?")).toBeVisible();
  });

  test("can navigate from login to register", async ({ page }) => {
    await gotoAuthPageWithRetry(page, "/login");
    await page.getByRole("link", { name: "Cadastre-se" }).click();
    await expect(page).toHaveURL("/register");
  });

  test("can navigate from register to login", async ({ page }) => {
    await gotoAuthPageWithRetry(page, "/register");
    await page.getByRole("link", { name: "Entrar" }).click();
    await expect(page).toHaveURL("/login");
  });
});
