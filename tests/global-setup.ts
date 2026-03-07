/**
 * Quando PLAYWRIGHT_TEST_BASE_URL está definido (ex.: pnpm run test:with-dev),
 * verifica que o servidor está a responder antes de correr os testes.
 * Evita timeouts genéricos de navegação quando o dev server não está a correr.
 */
async function waitForServer(
  baseURL: string,
  timeoutMs = 30_000,
  pollIntervalMs = 1000
): Promise<void> {
  const start = Date.now();
  const url = `${baseURL.replace(/\/$/, "")}/api/health/db`;
  while (Date.now() - start < timeoutMs) {
    try {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), 8000);
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(id);
      // 200 (BD ok) ou 503 (BD em baixo) = servidor Next.js a responder
      if (res.ok || res.status === 503) {
        return;
      }
    } catch {
      // conexão recusada ou timeout; continuar a tentar
    }
    await new Promise((r) => setTimeout(r, pollIntervalMs));
  }
  throw new Error(
    `Servidor em ${baseURL} não respondeu em ${timeoutMs}ms. Inicia com: pnpm dev`
  );
}

export default async function globalSetup(): Promise<void> {
  const baseURL = process.env.PLAYWRIGHT_TEST_BASE_URL;
  if (baseURL) {
    await waitForServer(baseURL);
  }
}
