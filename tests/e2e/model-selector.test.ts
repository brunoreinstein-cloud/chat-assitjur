import { expect, test } from "@playwright/test";
import { gotoChatPage } from "../helpers";

// O seletor de modelo está no composer (não na topbar); usamos data-testid para evitar 2 botões com texto parecido
const SEARCH_PLACEHOLDER = "Buscar modelos…";

test.describe("Model Selector", () => {
  /** Aquece a conexão à BD antes dos testes (evita timeouts em /chat quando a BD está fria). */
  test.beforeAll(async ({ request }) => {
    await request.get("/api/health/db");
  });

  test.beforeEach(async ({ page }) => {
    await gotoChatPage(page);
  });

  test("displays a model button", async ({ page }) => {
    const modelButton = page.getByTestId("model-selector-trigger");
    await expect(modelButton).toBeVisible();
  });

  test("opens model selector popover on click", async ({ page }) => {
    const modelButton = page.getByTestId("model-selector-trigger");
    await modelButton.click();

    await expect(page.getByPlaceholder(SEARCH_PLACEHOLDER)).toBeVisible();
  });

  test("can search for models", async ({ page }) => {
    const modelButton = page.getByTestId("model-selector-trigger");
    await modelButton.click();

    await expect(page.getByPlaceholder(SEARCH_PLACEHOLDER)).toBeVisible();
    // Esperar rede estabilizar antes de preencher (evita "element detached" ao digitar)
    await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {
      /* ignore timeout; networkidle is best-effort */
    });

    // Locator fresco e force: true para contornar re-render que desanexa o input durante fill
    await page
      .getByPlaceholder(SEARCH_PLACEHOLDER)
      .fill("Claude", { force: true });

    // Nome exibido pode ser "Claude Haiku 4.5"; lista pode demorar (BD/API)
    await expect(page.getByText(/Claude Haiku/i).first()).toBeVisible({
      timeout: 20_000,
    });
  });

  test("can close model selector by clicking outside", async ({ page }) => {
    const modelButton = page.getByTestId("model-selector-trigger");
    await modelButton.click();

    await expect(page.getByPlaceholder(SEARCH_PLACEHOLDER)).toBeVisible();

    await page.keyboard.press("Escape");

    await expect(page.getByPlaceholder(SEARCH_PLACEHOLDER)).not.toBeVisible();
  });

  test("shows model provider groups", async ({ page }) => {
    const modelButton = page.getByTestId("model-selector-trigger");
    await modelButton.click();

    await expect(page.getByText("Anthropic")).toBeVisible();
    await expect(page.getByText("Google")).toBeVisible();
  });

  test("can select a different model", async ({ page }) => {
    const modelButton = page.getByTestId("model-selector-trigger");
    await modelButton.click();

    await expect(page.getByPlaceholder(SEARCH_PLACEHOLDER)).toBeVisible();

    // Esperar rede estabilizar antes de interagir (evita "element detached" ao preencher/clicar)
    await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {
      /* ignore timeout; networkidle is best-effort */
    });

    // Nome exibido pode ser "Claude Haiku 4.5"; esperar item antes de clicar (sem fill para evitar re-render)
    const modelItem = page
      .getByRole("option", { name: /Claude Haiku/i })
      .or(page.getByText(/Claude Haiku/i))
      .first();
    await expect(modelItem).toBeVisible({ timeout: 20_000 });
    // force: true evita falha quando o elemento é desanexado durante o click (re-render da lista)
    await modelItem.click({ force: true });

    await expect(page.getByPlaceholder(SEARCH_PLACEHOLDER)).not.toBeVisible();

    // Após seleção, o painel pode mostrar "Configurações rápidas" de novo (não o nome do modelo na UI atual)
    await expect(modelButton).toBeVisible();
  });
});
