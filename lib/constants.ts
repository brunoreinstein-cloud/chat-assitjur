import { generateDummyPassword } from "./db/utils";

export const isProductionEnvironment = process.env.NODE_ENV === "production";
export const isDevelopmentEnvironment = process.env.NODE_ENV === "development";
export const isTestEnvironment = Boolean(
  process.env.PLAYWRIGHT_TEST_BASE_URL ||
    process.env.PLAYWRIGHT ||
    process.env.CI_PLAYWRIGHT
);

/** N.º máximo de mensagens carregadas ao abrir uma conversa (evita statement timeout). */
export const CHAT_PAGE_MESSAGES_LIMIT = 300;

export const DUMMY_PASSWORD = generateDummyPassword();
