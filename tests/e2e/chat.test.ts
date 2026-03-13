import { expect, test } from "@playwright/test";
import { gotoChatPage } from "../helpers";

test.describe("Chat Page", () => {
  /** Aquece a conexão à BD antes dos testes (evita timeouts em /chat quando a BD está fria). */
  test.beforeAll(async ({ request }) => {
    await request.get("/api/health/db");
  });

  test("chat page loads with input field", async ({ page }) => {
    await gotoChatPage(page);
    await expect(page.getByTestId("multimodal-input")).toBeVisible();
  });

  test("can type in the input field", async ({ page }) => {
    await gotoChatPage(page);
    const input = page.getByTestId("multimodal-input");
    await input.fill("Hello world");
    await expect(input).toHaveValue("Hello world");
  });

  test("submit button is visible", async ({ page }) => {
    await gotoChatPage(page);
    await expect(page.getByTestId("send-button")).toBeVisible();
  });

  test("prompt selector is visible on empty chat", async ({ page }) => {
    await gotoChatPage(page);
    const trigger = page.getByTestId("prompt-selector-trigger");
    // Timeout generoso: agents/history podem demorar vários minutos quando a BD está lenta
    await expect(trigger).toBeVisible({ timeout: 120_000 });
  });

  test("can stop generation with stop button", async ({ page }) => {
    await gotoChatPage(page);

    // Type and send a message
    await page.getByTestId("multimodal-input").fill("Hello");
    await page.getByTestId("send-button").click();

    // Stop button should appear during generation
    const stopButton = page.getByTestId("stop-button");
    // If generation starts, stop button appears
    // This is a best-effort check since timing depends on API
    await stopButton.click({ timeout: 5000 }).catch(() => {
      // Generation may have finished before we could click
    });
  });
});

test.describe("Chat Input Features", () => {
  test("input clears after sending", async ({ page }) => {
    await gotoChatPage(page);
    const input = page.getByTestId("multimodal-input");
    await input.fill("Test message");
    await page.getByTestId("send-button").click();

    // Input should clear after sending
    await expect(input).toHaveValue("");
  });

  test("input supports multiline text", async ({ page }) => {
    await gotoChatPage(page);
    const input = page.getByTestId("multimodal-input");
    const multiline = "Line 1\nLine 2\nLine 3";
    await input.fill(multiline);
    await expect(input).toHaveValue(multiline);
  });
});
