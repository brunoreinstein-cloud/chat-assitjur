import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { test } from "@playwright/test";
import { ensureChatPageWithGuest } from "../helpers";

const GUEST_STATE_PATH = join(process.cwd(), ".auth", "guest.json");

/**
 * Único teste do projeto guest-setup: faz login como visitante uma vez,
 * grava cookies/localStorage em .auth/guest.json para os projetos e2e-guest
 * reutilizarem (menos pedidos a /api/auth/guest).
 */
test("save guest session state for reuse", async ({ page }) => {
  mkdirSync(join(process.cwd(), ".auth"), { recursive: true });
  await ensureChatPageWithGuest(page);
  await page.context().storageState({ path: GUEST_STATE_PATH });
});
