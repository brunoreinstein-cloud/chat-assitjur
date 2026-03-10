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
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./"),
    },
  },
});
