"use client";

import { ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// ——— Tipos ——————————————————————————————————————————————————————————

export interface AgentCardProps {
  /** Ícone/avatar do agente — emoji ou componente (48×48) */
  avatar: React.ReactNode;
  /** Nome do agente */
  name: string;
  /** Descrição curta: "Analisa PDFs extensos" */
  role: string;
  /** Chips de capacidade: ["Revisão", "Extração", "Redação"] */
  capabilities?: string[];
  /** Texto do CTA — default: "Usar agente" */
  ctaLabel?: string;
  /** Se true, usa variante ghost em vez de outline-brand */
  ctaVariant?: "outline-brand" | "ghost";
  onSelect?: () => void;
  isActive?: boolean;
  className?: string;
}

// ——— Componente ——————————————————————————————————————————————————————

export function AgentCard({
  avatar,
  name,
  role,
  capabilities,
  ctaLabel = "Usar agente",
  ctaVariant = "outline-brand",
  onSelect,
  isActive,
  className,
}: AgentCardProps) {
  return (
    <div
      className={cn(
        "group flex flex-col gap-3 rounded-lg border bg-card p-4 shadow-sm",
        "transition-all hover:-translate-y-px hover:border-primary/30 hover:shadow-md",
        isActive && "border-primary/40 bg-primary/5 ring-1 ring-primary/20",
        className,
      )}
    >
      {/* Avatar + nome */}
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-2xl">
          {avatar}
        </div>
        <div className="min-w-0">
          <h3 className="truncate font-semibold text-foreground text-sm leading-tight">
            {name}
          </h3>
          <p className="mt-0.5 line-clamp-2 text-muted-foreground text-xs leading-relaxed">
            {role}
          </p>
        </div>
      </div>

      {/* Capability chips */}
      {capabilities && capabilities.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {capabilities.map((cap) => (
            <Badge key={cap} variant="secondary" className="text-xs">
              {cap}
            </Badge>
          ))}
        </div>
      )}

      {/* CTA */}
      <Button
        variant={ctaVariant}
        size="sm"
        className="mt-auto w-full"
        onClick={onSelect}
      >
        {ctaLabel}
        <ArrowRight className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
