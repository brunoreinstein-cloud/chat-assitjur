import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: [
      "tests/agente-trabalhista/**/*.test.ts",
      "tests/lib/**/*.test.ts",
      "tests/api/**/*.test.ts",
    ],
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./"),
    },
  },
});
