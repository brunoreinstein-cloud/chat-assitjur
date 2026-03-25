"use client";

import { ArrowRight, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// ——— Tipos ——————————————————————————————————————————————————————————

export interface FlowCardProps {
  /** Ícone ou emoji representativo (ex: "🔍", <FileSearch />) */
  icon: React.ReactNode;
  /** Verbo de ação: "Revisar defesa", "Gerar contestação" */
  title: string;
  /** 1–2 linhas descritivas */
  description: string;
  /** Documentos necessários: ["petição inicial", "defesa"] */
  inputs?: string[];
  /** O que o fluxo gera: "relatório de revisão" */
  output?: string;
  /** Estimativa de tempo: "~3 min" */
  estimate?: string;
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
  icon,
  title,
  description,
  inputs,
  output,
  estimate,
  area,
  ctaLabel = "Iniciar",
  onStart,
  disabled,
  className,
}: FlowCardProps) {
  return (
    <div
      className={cn(
        "group flex flex-col gap-3 rounded-lg border bg-card p-5 shadow-sm",
        "min-w-[240px] max-w-[320px]",
        "transition-all hover:-translate-y-px hover:shadow-md",
        disabled && "opacity-60",
        className,
      )}
    >
      {/* Ícone + área */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-lg">
          {icon}
        </div>
        {area && <Badge variant="brand">{area}</Badge>}
      </div>

      {/* Título + descrição */}
      <div className="flex flex-col gap-1">
        <h4 className="font-semibold text-foreground text-base leading-snug">
          {title}
        </h4>
        <p className="text-muted-foreground text-sm leading-relaxed">
          {description}
        </p>
      </div>

      {/* Meta (inputs / output / estimativa) */}
      {(inputs || output || estimate) && (
        <div className="flex flex-col gap-1 rounded-md bg-muted/50 px-3 py-2 text-xs">
          {inputs && inputs.length > 0 && (
            <span className="text-muted-foreground">
              <span className="font-medium text-foreground/70">Requer: </span>
              {inputs.join(", ")}
            </span>
          )}
          {output && (
            <span className="text-muted-foreground">
              <span className="font-medium text-foreground/70">Gera: </span>
              {output}
            </span>
          )}
          {estimate && (
            <span className="flex items-center gap-1 text-muted-foreground">
              <Clock className="h-3 w-3" />
              {estimate}
            </span>
          )}
        </div>
      )}

      {/* CTA */}
      <Button
        variant="outline-brand"
        size="sm"
        className="mt-auto w-full"
        onClick={onStart}
        disabled={disabled}
      >
        {ctaLabel}
        <ArrowRight className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
