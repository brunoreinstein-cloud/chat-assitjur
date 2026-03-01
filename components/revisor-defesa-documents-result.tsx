"use client";

import { DocumentToolResult } from "./document";

export interface RevisorDefesaDocumentsOutput {
  ids?: string[];
  titles?: string[];
  error?: unknown;
}

interface RevisorDefesaDocumentsResultProps {
  output: RevisorDefesaDocumentsOutput | undefined;
  isReadonly: boolean;
}

/**
 * Renderiza o resultado da tool createRevisorDefesaDocuments: erro, estado "a criar…" ou lista dos 3 documentos (Avaliação, Roteiro Advogado, Roteiro Preposto).
 */
export function RevisorDefesaDocumentsResult({
  output,
  isReadonly,
}: Readonly<RevisorDefesaDocumentsResultProps>) {
  if (
    output &&
    typeof output === "object" &&
    "error" in output
  ) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-500 dark:bg-red-950/50">
        Erro ao criar os 3 documentos: {String(output.error)}
      </div>
    );
  }

  const ids = output?.ids ?? [];
  const titles = output?.titles ?? [];

  if (ids.length === 0) {
    return (
      <div className="rounded-xl border bg-muted/50 px-3 py-2 text-muted-foreground text-sm">
        A criar os 3 documentos (Avaliação, Roteiro Advogado, Roteiro
        Preposto)…
      </div>
    );
  }

  return (
    <ul
      aria-label="Documentos criados: Avaliação, Roteiro Advogado, Roteiro Preposto"
      className="flex flex-col gap-2 list-none p-0 m-0"
    >
      {ids.map((id, index) => (
        <li key={id}>
          <DocumentToolResult
            isReadonly={isReadonly}
            result={{
              id,
              kind: "text",
              title: titles[index] ?? `Documento ${index + 1}`,
            }}
            type="create"
          />
        </li>
      ))}
    </ul>
  );
}
