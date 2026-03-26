"use client";

import { ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// ——— Tipos ——————————————————————————————————————————————————————————

export interface FlowCardProps {
  /** Verbo de ação: "Revisar defesa", "Redigir contestação" */
  title: string;
  /** 1–2 linhas descritivas */
  description: string;
  /** Documentos necessários: ["petição inicial", "defesa"] */
  inputs?: string[];
  /** O que o fluxo gera: "relatório de revisão" */
  output?: string;
  /** Área jurídica: "Trabalhista", "Cível" */
  area?: string;
  /** Texto do CTA — default: "Iniciar" */
  ctaLabel?: string;
  onStart?: () => void;
  disabled?: boolean;
  className?: string;
}

// ——— Componente ——————————————————————————————————————————————————————

export function FlowCard({
  title,
  description,
  inputs,
  output,
  area,
  ctaLabel = "Iniciar",
  onStart,
  disabled,
  className,
}: FlowCardProps) {
  return (
    <div
      className={cn(
        "group flex flex-col gap-3 rounded-lg border bg-card p-4 shadow-sm",
        "min-w-[220px] max-w-[300px]",
        "transition-all hover:-translate-y-px hover:shadow-md",
        disabled && "opacity-60",
        className
      )}
    >
      {/* Título + área */}
      <div className="flex items-start justify-between gap-2">
        <h4 className="font-semibold text-foreground text-lg leading-snug">
          {title}
        </h4>
        {area && <Badge variant="outline">{area}</Badge>}
      </div>

      {/* Descrição */}
      <p className="text-muted-foreground text-sm leading-relaxed">
        {description}
      </p>

      {/* Meta (inputs / output) */}
      {(inputs || output) && (
        <div className="flex flex-col gap-1 rounded-md bg-muted/50 px-3 py-2 text-xs">
          {inputs && inputs.length > 0 && (
            <span className="text-muted-foreground">
              <span className="font-medium text-foreground/70">Requer: </span>
              {inputs.join(", ")}
            </span>
          )}
          {output && (
            <span className="text-muted-foreground">
              <span className="font-medium text-foreground/70">
                Resultado:{" "}
              </span>
              {output}
            </span>
          )}
        </div>
      )}

      {/* CTA */}
      <Button
        className="mt-auto w-full"
        disabled={disabled}
        onClick={onStart}
        size="sm"
        variant="outline"
      >
        {ctaLabel}
        <ArrowRight className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
