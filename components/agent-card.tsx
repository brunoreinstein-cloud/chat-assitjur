"use client";

import { ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// ——— Tipos ——————————————————————————————————————————————————————————

export interface AgentCardProps {
  /** Nome do assistente */
  name: string;
  /** Descrição curta: "Audita contestações e identifica pontos fracos" */
  description: string;
  /** Chips de capacidade: ["Revisão", "Extração", "Redação"] */
  capabilities?: string[];
  /** Texto do CTA — default: "Selecionar" */
  ctaLabel?: string;
  onSelect?: () => void;
  isActive?: boolean;
  className?: string;
}

// ——— Componente ——————————————————————————————————————————————————————

export function AgentCard({
  name,
  description,
  capabilities,
  ctaLabel = "Selecionar",
  onSelect,
  isActive,
  className,
}: AgentCardProps) {
  // Inicial do nome como avatar
  const initial = name.charAt(0).toUpperCase();

  return (
    <div
      className={cn(
        "group flex flex-col gap-3 rounded-lg border bg-card p-4 shadow-sm",
        "transition-all hover:-translate-y-px hover:border-primary/30 hover:shadow-md",
        isActive && "border-primary/40 bg-primary/5 ring-1 ring-primary/20",
        className
      )}
    >
      {/* Inicial + nome */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 font-semibold text-lg text-primary">
          {initial}
        </div>
        <div className="min-w-0">
          <h3 className="truncate font-semibold text-foreground text-sm leading-tight">
            {name}
          </h3>
          <p className="mt-0.5 line-clamp-2 text-muted-foreground text-xs leading-relaxed">
            {description}
          </p>
        </div>
      </div>

      {/* Capability chips */}
      {capabilities && capabilities.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {capabilities.map((cap) => (
            <Badge className="text-xs" key={cap} variant="secondary">
              {cap}
            </Badge>
          ))}
        </div>
      )}

      {/* CTA */}
      <Button
        className="mt-auto w-full"
        onClick={onSelect}
        size="sm"
        variant="outline"
      >
        {ctaLabel}
        <ArrowRight className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
