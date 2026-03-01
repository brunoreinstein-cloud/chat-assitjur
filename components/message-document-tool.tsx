"use client";

import { DocumentPreview } from "./document-preview";

type DocumentToolOutput = {
  id?: string;
  kind?: string;
  title?: string;
  error?: unknown;
} & Record<string, unknown>;

interface MessageDocumentToolProps {
  toolCallId: string;
  type: "create" | "update";
  output: DocumentToolOutput | undefined;
  isReadonly: boolean;
}

/**
 * Renderiza o resultado da tool createDocument ou updateDocument na mensagem.
 */
export function MessageDocumentTool({
  toolCallId,
  type,
  output,
  isReadonly,
}: Readonly<MessageDocumentToolProps>) {
  const hasError = output && typeof output === "object" && "error" in output;

  if (hasError) {
    const message =
      type === "create" ? "Error creating document" : "Error updating document";
    return (
      <div
        className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-500 dark:bg-red-950/50"
        key={toolCallId}
      >
        {message}: {String(output.error)}
      </div>
    );
  }

  if (type === "update") {
    return (
      <div className="relative" key={toolCallId}>
        <DocumentPreview
          args={{
            ...(output as Record<string, unknown>),
            isUpdate: true,
          }}
          isReadonly={isReadonly}
          result={output}
        />
      </div>
    );
  }

  return (
    <DocumentPreview isReadonly={isReadonly} key={toolCallId} result={output} />
  );
}
