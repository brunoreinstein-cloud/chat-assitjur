import { expect, test } from "@playwright/test";
import { gotoChatPage } from "../helpers";

const CHAT_URL_REGEX = /\/chat\/[\w-]+/;
const ERROR_TEXT_REGEX = /error|failed|trouble/i;

/** Aquece a conexão à BD antes dos testes (evita timeouts em /chat quando a BD está fria). */
test.beforeAll(async ({ request }) => {
  await request.get("/api/health/db");
});

test.describe("Chat API Integration", () => {
  test("sends message and receives AI response", async ({ page }) => {
    await gotoChatPage(page);

    const input = page.getByTestId("multimodal-input");
    await expect(input).toBeVisible();
    await input.fill("Hello");
    await page.getByTestId("send-button").click();

    // Wait for assistant response to appear
    const assistantMessage = page.locator("[data-role='assistant']").first();
    await expect(assistantMessage).toBeVisible({ timeout: 30_000 });

    // Verify it has some text content
    const content = await assistantMessage.textContent();
    expect(content?.length).toBeGreaterThan(0);
  });

  test("redirects to /chat/:id after sending message", async ({ page }) => {
    await gotoChatPage(page);

    const input = page.getByTestId("multimodal-input");
    await input.fill("Test redirect");
    await page.getByTestId("send-button").click();

    // URL should change to /chat/:id format
    await expect(page).toHaveURL(CHAT_URL_REGEX, { timeout: 10_000 });
  });

  test("clears input after sending", async ({ page }) => {
    await gotoChatPage(page);

    const input = page.getByTestId("multimodal-input");
    await input.fill("Test message");
    await page.getByTestId("send-button").click();

    // Input should be cleared
    await expect(input).toHaveValue("");
  });

  test("shows stop button during generation", async ({ page }) => {
    await gotoChatPage(page);
    const input = page.getByTestId("multimodal-input");
    await input.fill("Test");
    await page.getByTestId("send-button").click();

    // Stop button should appear during generation
    const stopButton = page.getByTestId("stop-button");
    await expect(stopButton).toBeVisible({ timeout: 5000 });
  });
});

test.describe("Chat Error Handling", () => {
  test("handles API error gracefully", async ({ page }) => {
    await page.route("**/api/chat", async (route) => {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "Internal server error" }),
      });
    });

    await gotoChatPage(page);
    const input = page.getByTestId("multimodal-input");
    await input.fill("Test error");
    await page.getByTestId("send-button").click();

    // Should show error toast or message
    await expect(page.getByText(ERROR_TEXT_REGEX).first()).toBeVisible({
      timeout: 5000,
    });
  });

  test("handles 400 Bad Request with cause and shows validation error", async ({
    page,
  }) => {
    const causeMessage =
      "selectedChatModel: String must contain at least 1 character(s)";
    await page.route("**/api/chat", async (route) => {
      await route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({
          code: "bad_request:api",
          message: "Corpo do pedido inválido.",
          cause: causeMessage,
        }),
      });
    });

    await gotoChatPage(page);
    const input = page.getByTestId("multimodal-input");
    await input.fill("Test validation");
    await page.getByTestId("send-button").click();

    // Toast ou mensagem deve mostrar o cause da resposta 400
    await expect(
      page.getByText(/selectedChatModel|inválido|at least 1/i).first()
    ).toBeVisible({ timeout: 5000 });
  });

  test("handles 503 (database unavailable) and shows error message", async ({
    page,
  }) => {
    await page.route("**/api/chat", async (route) => {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          code: "bad_request:database",
          message: "Base de dados indisponível.",
        }),
      });
    });

    await gotoChatPage(page);
    const input = page.getByTestId("multimodal-input");
    await input.fill("Test 503");
    await page.getByTestId("send-button").click();

    // UI mostra a mensagem da API (ex.: "Base de dados indisponível") ou texto genérico de erro
    await expect(
      page.getByText(/error|failed|trouble|indisponível|Base de dados/i).first()
    ).toBeVisible({ timeout: 15_000 });
  });
});

test.describe("Prompt selector", () => {
  test("prompt selector sends message and redirects", async ({ page }) => {
    await gotoChatPage(page);

    const trigger = page.getByTestId("prompt-selector-trigger");
    // Esperar o trigger aparecer (página/chat pode demorar com agents/history lentos)
    await expect(trigger).toBeVisible({ timeout: 90_000 });
    await trigger.click();

    // Esperar o menuitem estar visível (lista pode demorar com BD lenta)
    const menuItem = page.getByRole("menuitem", {
      name: /Explicar o fluxo do Revisor/i,
    });
    await expect(menuItem).toBeVisible({ timeout: 35_000 });
    await menuItem.click();

    // Timeout generoso quando BD/redirecionamento lentos
    await expect(page).toHaveURL(CHAT_URL_REGEX, { timeout: 50_000 });
  });
});
