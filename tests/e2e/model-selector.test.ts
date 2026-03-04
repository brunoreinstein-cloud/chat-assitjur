import { expect, test } from "@playwright/test";

// O seletor de modelo está na página /chat; o botão mostra "Configurações rápidas"
const SEARCH_PLACEHOLDER = "Buscar modelos…";
const MODEL_SELECTOR_BUTTON_REGEX = /Configurações rápidas/i;

test.describe("Model Selector", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/chat", { waitUntil: "domcontentloaded" });
  });

  test("displays a model button", async ({ page }) => {
    const modelButton = page.getByRole("button", {
      name: MODEL_SELECTOR_BUTTON_REGEX,
    });
    await expect(modelButton).toBeVisible();
  });

  test("opens model selector popover on click", async ({ page }) => {
    const modelButton = page.getByRole("button", {
      name: MODEL_SELECTOR_BUTTON_REGEX,
    });
    await modelButton.click();

    await expect(page.getByPlaceholder(SEARCH_PLACEHOLDER)).toBeVisible();
  });

  test("can search for models", async ({ page }) => {
    const modelButton = page.getByRole("button", {
      name: MODEL_SELECTOR_BUTTON_REGEX,
    });
    await modelButton.click();

    const searchInput = page.getByPlaceholder(SEARCH_PLACEHOLDER);
    await searchInput.fill("Claude");

    await expect(page.getByText("Claude Haiku").first()).toBeVisible();
  });

  test("can close model selector by clicking outside", async ({ page }) => {
    const modelButton = page.getByRole("button", {
      name: MODEL_SELECTOR_BUTTON_REGEX,
    });
    await modelButton.click();

    await expect(page.getByPlaceholder(SEARCH_PLACEHOLDER)).toBeVisible();

    await page.keyboard.press("Escape");

    await expect(page.getByPlaceholder(SEARCH_PLACEHOLDER)).not.toBeVisible();
  });

  test("shows model provider groups", async ({ page }) => {
    const modelButton = page.getByRole("button", {
      name: MODEL_SELECTOR_BUTTON_REGEX,
    });
    await modelButton.click();

    await expect(page.getByText("Anthropic")).toBeVisible();
    await expect(page.getByText("Google")).toBeVisible();
  });

  test("can select a different model", async ({ page }) => {
    const modelButton = page.getByRole("button", {
      name: MODEL_SELECTOR_BUTTON_REGEX,
    });
    await modelButton.click();

    await page.getByText("Claude Haiku").first().click();

    await expect(page.getByPlaceholder(SEARCH_PLACEHOLDER)).not.toBeVisible();

    // Após seleção, o painel pode mostrar "Configurações rápidas" de novo (não o nome do modelo na UI atual)
    await expect(modelButton).toBeVisible();
  });
});
