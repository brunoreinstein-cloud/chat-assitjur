import { defineConfig, devices } from "@playwright/test";

/**
 * Read environment variables from file.
 * https://github.com/motdotla/dotenv
 */
import { config } from "dotenv";

config({
  path: ".env.local",
});

/* Port for E2E: 3301 to avoid conflict with `pnpm dev` (3300). Se 3301 estiver em uso, use PORT=3302 pnpm test. */
const PORT = Number(process.env.PORT) || 3301;

/**
 * Se PLAYWRIGHT_TEST_BASE_URL estiver definido, usa esse servidor (ex.: pnpm dev já a correr em 3300).
 * Evita "Unable to acquire lock" quando há outro next dev ativo. Caso contrário, o webServer inicia dev:test na porta 3301.
 */
/** Quando true (ex.: script `pnpm test`), o Playwright arranca sempre o servidor; ignora PLAYWRIGHT_TEST_BASE_URL de .env.local. */
const useWebServer = process.env.PLAYWRIGHT_USE_WEB_SERVER === "1";
const baseURLFromEnv = process.env.PLAYWRIGHT_TEST_BASE_URL?.trim();
/** Usar 127.0.0.1 em vez de localhost para evitar IPv6 (::1) no Windows quando o servidor escuta só em IPv4. */
const defaultBaseURL = `http://127.0.0.1:${PORT}`;
const baseURL = baseURLFromEnv || defaultBaseURL;
const useExistingServer = !useWebServer && Boolean(baseURLFromEnv);

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  globalSetup: "./tests/global-setup.ts",
  testDir: "./tests",
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: 0,
  /* Limit workers to prevent browser crashes */
  workers: 2,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: "html",
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL,

    /* Fail navigation sooner if server is down (e.g. test:with-dev without pnpm dev). */
    navigationTimeout: 60_000,

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: "retain-on-failure",
  },

  /* Configure global timeout for each test */
  timeout: 240 * 1000, // 120 seconds
  expect: {
    timeout: 240 * 1000,
  },

  /* Configure projects */
  projects: [
    {
      name: "e2e",
      testMatch: /e2e\/(chat|api|model-selector)\.test\.ts/,
      use: { ...devices["Desktop Chrome"] },
      retries: 1,
    },
    {
      name: "e2e-auth",
      testMatch: /e2e\/auth\.test\.ts/,
      use: { ...devices["Desktop Chrome"] },
      retries: 1,
    },
  ],

  /* Run your local dev server before starting the tests (port 3301). Se PLAYWRIGHT_TEST_BASE_URL estiver definido, não inicia servidor (usa o que já está a correr). */
  ...(useExistingServer
    ? {}
    : {
        webServer: {
          command: "pnpm run dev:test",
          url: `${baseURL}/api/health/db`,
          timeout: 300 * 1000, // 5 min — Next.js dev pode demorar no primeiro arranque
          reuseExistingServer: !process.env.CI,
          env: {
            ...process.env,
            PORT: String(PORT),
            AUTH_URL: defaultBaseURL,
            NEXT_PUBLIC_APP_URL: defaultBaseURL,
            /** Garante que GET /api/credits usa timeouts curtos (E2E) mesmo quando se corre `pnpm exec playwright test` sem `pnpm test`. */
            PLAYWRIGHT: "True",
          },
        },
      }),
});
