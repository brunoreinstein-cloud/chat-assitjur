"use client";

import { useEffect } from "react";

export default function ErrorBoundary({
  error,
  reset,
}: Readonly<{
  error: Error & { digest?: string };
  reset: () => void;
}>) {
  useEffect(() => {
    // Opcional: enviar para serviço de logging
  }, [error]);

  const isConfigError =
    error.message.includes("POSTGRES_URL") ||
    error.message.includes("AUTH_SECRET");

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 p-6">
      <h2 className="text-lg font-semibold">Algo correu mal</h2>
      <p className="text-muted-foreground text-center text-sm">
        Ocorreu um erro. Se estiver em produção na Vercel, confira as variáveis
        de ambiente (POSTGRES_URL, AUTH_SECRET).
      </p>
      {isConfigError && (
        <pre className="max-w-full overflow-auto rounded-md bg-muted p-4 text-left text-sm">
          {error.message}
        </pre>
      )}
      <button
        type="button"
        onClick={() => reset()}
        className="rounded-md bg-primary px-4 py-2 text-primary-foreground hover:opacity-90"
      >
        Tentar novamente
      </button>
    </div>
  );
}
