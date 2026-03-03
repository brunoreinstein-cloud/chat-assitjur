/**
 * Faz um pedido a /api/auth/session e /chat para aquecer a cache do Turbopack.
 * Correr após pnpm dev estar ativo (ex.: noutro terminal: pnpm run dev:warmup).
 * O primeiro carregamento no browser fica mais rápido.
 */
const base = process.env.WARMUP_URL ?? "http://localhost:3300";
const paths = ["/api/auth/session", "/chat"];

for (const path of paths) {
  const url = base + path;
  const req = require("node:http").request(url, { method: "GET" }, () => {
    // Ignore response body (warmup only)
  });
  req.on("error", () => {
    // Ignore connection errors when dev server is not ready
  });
  req.end();
}
