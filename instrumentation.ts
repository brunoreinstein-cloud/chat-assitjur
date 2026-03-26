import { registerOTel } from "@vercel/otel";

/** Interface mínima compatível com OTel SpanExporter (evita dependência de sdk-trace-base). */
interface OtelSpanExporter {
  export(
    spans: unknown[],
    resultCallback: (result: { code: number }) => void
  ): void;
  shutdown(): Promise<void>;
}

export async function register() {
  // Langfuse OTel exporter — activo quando LANGFUSE_PUBLIC_KEY está configurada.
  // Requer pnpm add langfuse-vercel. Se o pacote não estiver instalado, é ignorado silenciosamente.
  let traceExporter: OtelSpanExporter | undefined;
  if (
    process.env.NEXT_RUNTIME !== "edge" &&
    process.env.LANGFUSE_PUBLIC_KEY &&
    process.env.LANGFUSE_SECRET_KEY
  ) {
    try {
      // @ts-expect-error — langfuse-vercel is an optional dependency
      const { LangfuseExporter } = (await import(
        /* webpackIgnore: true */ "langfuse-vercel"
      )) as {
        LangfuseExporter: new (opts?: {
          publicKey?: string;
          secretKey?: string;
          baseUrl?: string;
        }) => OtelSpanExporter;
      };
      traceExporter = new LangfuseExporter({
        publicKey: process.env.LANGFUSE_PUBLIC_KEY,
        secretKey: process.env.LANGFUSE_SECRET_KEY,
        baseUrl: process.env.LANGFUSE_HOST,
      });
    } catch {
      // langfuse-vercel não está instalado; continuar sem exporter externo.
    }
  }

  registerOTel({
    serviceName: "chatbot",
    ...(traceExporter ? { traceExporter } : {}),
  });

  // Previne crash do processo Node.js causado por rejeições não tratadas do
  // postgres.js (ex.: statement timeout 57014 em promises "orphaned" no TLS socket).
  // Guarda do Edge Runtime: process.on só existe no runtime Node.js — não chamar no Edge.
  if (
    process.env.NEXT_RUNTIME !== "edge" &&
    typeof process !== "undefined" &&
    typeof process.on === "function"
  ) {
    process.on("unhandledRejection", (reason: unknown) => {
      const code =
        reason !== null && typeof reason === "object" && "code" in reason
          ? (reason as { code: unknown }).code
          : undefined;
      if (code === "57014") {
        // Statement timeout do Postgres — ignorar silenciosamente para não
        // terminar o processo; o erro já é tratado nas queries individuais.
        return;
      }
      // Outros erros: registar mas não terminar o processo (Next.js gere o ciclo de vida).
      console.error(
        "[server] unhandledRejection:",
        reason instanceof Error ? reason.message : reason
      );
    });
  }
}
