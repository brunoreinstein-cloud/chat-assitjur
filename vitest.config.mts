import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: [
      "tests/agente-trabalhista/**/*.test.ts",
      "tests/lib/**/*.test.ts",
      "tests/api/**/*.test.ts",
      "tests/**/*.test.ts",
    ],
    exclude: ["tests/e2e/**"],
    coverage: {
      provider: "v8",
      include: ["lib/ai/**", "lib/db/**"],
      exclude: [
        "**/*.test.ts",
        "**/migrations/**",
        "lib/ai/tools/**",
        "lib/ai/pipeline/**",
        "lib/db/migrations/**",
      ],
      reporter: ["text", "lcov"],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./"),
      "server-only": path.resolve(import.meta.dirname, "tests/__mocks__/server-only.ts"),
    },
  },
});
