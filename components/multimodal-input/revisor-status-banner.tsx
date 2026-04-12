"use client";

import { CheckIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

interface RevisorStatusBannerProps {
  hasPi: boolean;
  hasContestacao: boolean;
  hasPiAndContestacao: boolean;
  pendingPreferredTypeRef: React.RefObject<"pi" | "contestacao" | null>;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
}

export function RevisorStatusBanner({
  hasPi,
  hasContestacao,
  hasPiAndContestacao,
  pendingPreferredTypeRef,
  fileInputRef,
}: Readonly<RevisorStatusBannerProps>) {
  if (hasPiAndContestacao) {
    return (
      <div
        aria-live="polite"
        className="mb-2 flex items-center gap-2 rounded-lg border border-green-500/30 bg-green-500/5 px-3 py-1.5 text-green-800 dark:text-green-200"
      >
        <CheckIcon aria-hidden className="size-4 shrink-0" />
        <span className="font-medium text-sm">Pronto para enviar</span>
      </div>
    );
  }

  const missingLabel = (() => {
    if (hasPi) {
      return "Contestação";
    }
    if (hasContestacao) {
      return "Petição Inicial";
    }
    return "PI e Contestação";
  })();

  return (
    <div className="mb-2 flex flex-wrap items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-1.5">
      <span className="text-amber-800 text-sm dark:text-amber-200">
        Falta anexar: {missingLabel}
      </span>
      {!hasPi && (
        <Button
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
      )}
      {!hasContestacao && (
        <Button
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
      )}
    </div>
  );
}
