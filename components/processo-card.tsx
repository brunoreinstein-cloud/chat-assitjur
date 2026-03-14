"use client";

import {
  FASE_LABEL,
  RISCO_CLASSES,
  RISCO_DOT,
  RISCO_LABEL,
} from "@/lib/constants/processo";
import type { ProcessoComVerbas } from "@/lib/db/queries";

interface ProcessoCardProps {
  readonly processo: ProcessoComVerbas;
  readonly isActive: boolean;
  readonly onClick: () => void;
}

export function ProcessoCard({
  processo,
  isActive,
  onClick,
}: ProcessoCardProps) {
  const risco = processo.riscoGlobal ?? null;
  const riscoClass = risco ? (RISCO_CLASSES[risco] ?? "") : "";
  const riscoDot = risco ? (RISCO_DOT[risco] ?? "bg-muted-foreground/40") : "";

  const prazoDate = processo.prazoFatal
    ? new Date(processo.prazoFatal).toLocaleDateString("pt-BR")
    : null;

  const primeiroNomeReclamante = processo.reclamante.split(" ")[0];
  const primeiroNomeReclamada = processo.reclamada.split(" ")[0];

  return (
    <button
      className={`w-full rounded-md border px-2.5 py-2 text-left transition-colors ${
        isActive
          ? "border-assistjur-gold/30 bg-assistjur-gold/8"
          : "border-border/60 bg-transparent hover:border-border hover:bg-muted/50 dark:border-white/6 dark:hover:border-white/12 dark:hover:bg-white/5"
      }`}
      onClick={onClick}
      type="button"
    >
      {/* Linha 1: número + risco badge */}
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-muted-foreground dark:text-assistjur-gray-light">
          {processo.numeroAutos.length > 22
            ? `${processo.numeroAutos.slice(0, 22)}…`
            : processo.numeroAutos}
        </span>
        {risco && (
          <span
            className={`flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-0.5 text-[9px] uppercase tracking-wide ${riscoClass}`}
          >
            <span
              aria-hidden
              className={`h-1.5 w-1.5 rounded-full ${riscoDot}`}
            />
            {RISCO_LABEL[risco]}
          </span>
        )}
      </div>

      {/* Linha 2: partes */}
      <div className="mb-1.5 truncate text-[11.5px] text-foreground dark:text-white/80">
        {primeiroNomeReclamante}{" "}
        <span className="text-muted-foreground dark:text-assistjur-gray">
          ×
        </span>{" "}
        {primeiroNomeReclamada}
      </div>

      {/* Linha 3: fase + prazo */}
      <div className="flex items-center justify-between">
        {processo.fase && (
          <span className="text-[10px] text-muted-foreground dark:text-assistjur-gray">
            {FASE_LABEL[processo.fase] ?? processo.fase}
          </span>
        )}
        {prazoDate && (
          <span className="text-[10px] text-muted-foreground dark:text-assistjur-gray">
            ⏰ {prazoDate}
          </span>
        )}
      </div>
    </button>
  );
}
