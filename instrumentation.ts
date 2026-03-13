import { registerOTel } from "@vercel/otel";

export function register() {
  registerOTel({ serviceName: "chatbot" });

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
