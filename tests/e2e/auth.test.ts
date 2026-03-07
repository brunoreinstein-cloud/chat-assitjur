import { expect, test } from "@playwright/test";

test.describe("Authentication Pages", () => {
  test("login page renders correctly", async ({ page }) => {
    await page.goto("/login", { waitUntil: "commit" });
    await expect(page.getByLabel("E-mail")).toBeVisible();
    await expect(page.getByLabel("Senha")).toBeVisible();
    await expect(page.getByRole("button", { name: "Entrar" })).toBeVisible();
    await expect(page.getByText("Não tem uma conta?")).toBeVisible();
  });

  test("register page renders correctly", async ({ page }) => {
    await page.goto("/register", { waitUntil: "commit" });
    await expect(page.getByLabel("E-mail")).toBeVisible();
    await expect(page.getByLabel("Senha")).toBeVisible();
    await expect(page.getByRole("button", { name: "Cadastrar" })).toBeVisible();
    await expect(page.getByText("Já tem uma conta?")).toBeVisible();
  });

  test("can navigate from login to register", async ({ page }) => {
    await page.goto("/login", { waitUntil: "commit" });
    await page.getByRole("link", { name: "Cadastre-se" }).click();
    await expect(page).toHaveURL("/register");
  });

  test("can navigate from register to login", async ({ page }) => {
    await page.goto("/register", { waitUntil: "commit" });
    await page.getByRole("link", { name: "Entrar" }).click();
    await expect(page).toHaveURL("/login");
  });
});
