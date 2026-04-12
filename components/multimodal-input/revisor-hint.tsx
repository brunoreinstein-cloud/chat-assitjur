"use client";

import { Button } from "@/components/ui/button";

interface RevisorHintProps {
  pendingPreferredTypeRef: React.RefObject<"pi" | "contestacao" | null>;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
}

export function RevisorHint({
  pendingPreferredTypeRef,
  fileInputRef,
}: Readonly<RevisorHintProps>) {
  return (
    <section
      aria-label="Dicas para começar a revisão"
      className="mb-2 flex flex-wrap items-center gap-2 rounded-lg bg-muted/30 px-3 py-2"
    >
      <span className="text-muted-foreground text-xs">
        Para revisar defesas, anexe PI e Contestação
        (PDF/DOC/DOCX/Excel/CSV/TXT/ODT) ou cole o texto.
      </span>
      <div className="flex gap-1.5">
        <Button
          aria-label="Adicionar Petição Inicial"
          className="h-7 text-xs"
          onClick={() => {
            pendingPreferredTypeRef.current = "pi";
            fileInputRef.current?.click();
          }}
          size="sm"
          type="button"
          variant="outline"
        >
          Adicionar PI
        </Button>
        <Button
          aria-label="Adicionar Contestação"
          className="h-7 text-xs"
          onClick={() => {
            pendingPreferredTypeRef.current = "contestacao";
            fileInputRef.current?.click();
          }}
          size="sm"
          type="button"
          variant="outline"
        >
          Adicionar Contestação
        </Button>
      </div>
    </section>
  );
}
