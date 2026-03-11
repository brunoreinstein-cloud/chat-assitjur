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
    if (process.env.NODE_ENV === "production") {
      // Enviar para serviço de logging (ex.: Sentry.captureException(error))
    }
  }, []);

  const isDev = process.env.NODE_ENV === "development";

  return (
    <div
      aria-live="assertive"
      className="flex min-h-[50vh] flex-col items-center justify-center gap-4 p-6"
      role="alert"
    >
      <h2 className="font-semibold text-lg">Algo deu errado</h2>
      <p className="text-center text-muted-foreground text-sm">
        Ocorreu um erro inesperado. Se o problema persistir, consulte os logs da
        função no dashboard da Vercel.
      </p>
      {isDev && (
        <pre className="max-w-full overflow-auto rounded-md bg-muted p-4 text-left text-sm">
          {error.digest ? `[${error.digest}] ` : ""}
          {error.message}
        </pre>
      )}
      {!isDev && error.digest && (
        <p className="text-center text-muted-foreground text-xs">
          Código: {error.digest}
        </p>
      )}
      <button
        className="rounded-md bg-primary px-4 py-2 text-primary-foreground hover:opacity-90"
        onClick={() => reset()}
        type="button"
      >
        Tentar novamente
      </button>
    </div>
  );
}
