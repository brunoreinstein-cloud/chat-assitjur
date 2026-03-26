"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { aprovaPecaAction } from "@/app/(chat)/processos/actions";

const STATUS_NEXT: Record<
  string,
  { next: "aprovado" | "protocolado"; label: string } | null
> = {
  rascunho: { next: "aprovado", label: "Aprovar" },
  aprovado: { next: "protocolado", label: "Protocolar" },
  protocolado: null,
};

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  rascunho: {
    label: "Rascunho",
    className: "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400",
  },
  aprovado: {
    label: "Aprovado",
    className: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  },
  protocolado: {
    label: "Protocolado",
    className: "bg-green-500/10 text-green-600 dark:text-green-400",
  },
};

export function PecaStatusBadge({ status }: { status: string }) {
  const cfg = STATUS_BADGE[status] ?? STATUS_BADGE.rascunho;
  return (
    <span
      className={`rounded-full px-2 py-0.5 font-medium text-[10px] ${cfg.className}`}
    >
      {cfg.label}
    </span>
  );
}

export function PecaStatusButton({
  pecaId,
  processoId,
  status,
  canApprove,
}: {
  pecaId: string;
  processoId: string;
  status: string;
  canApprove: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const transition = STATUS_NEXT[status];

  if (!(transition && canApprove)) {
    return null;
  }

  return (
    <button
      className="rounded border border-border/60 px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-muted/50 disabled:opacity-50 dark:border-white/10 dark:hover:bg-white/5"
      disabled={isPending}
      onClick={() => {
        startTransition(async () => {
          const result = await aprovaPecaAction({
            pecaId,
            status: transition.next,
            processoId,
          });
          if (result.success) {
            toast.success(`Peça marcada como ${transition.next}.`);
          } else if (result.error === "forbidden") {
            toast.error("Sem permissão para aprovar peças.");
          } else {
            toast.error("Erro ao atualizar status da peça.");
          }
        });
      }}
      type="button"
    >
      {isPending ? "…" : transition.label}
    </button>
  );
}
