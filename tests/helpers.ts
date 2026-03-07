import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";
import { generateId } from "ai";
import { getUnixTime } from "date-fns";

/** Abre /chat com sessão visitante. Usa GET /api/auth/guest?redirectUrl=/chat (auto-POST + redirect) para ser fiável em E2E/produção. */
export async function ensureChatPageWithGuest(
  page: Page,
  timeout = 60_000
): Promise<void> {
  // "commit" resolve quando a resposta do GET chega; o form auto-submit e redirect para /chat correm em seguida
  await page.goto("/api/auth/guest?redirectUrl=%2Fchat", {
    waitUntil: "commit",
    timeout: 15_000,
  });
  // Esperar redirect para /chat (sem esperar evento "load", que pode nunca disparar se a página tiver recursos pendentes)
  const urlTimeout = Math.min(timeout - 5000, 55_000);
  await expect(page).toHaveURL(/\/chat(\/|$)/, { timeout: urlTimeout });
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
