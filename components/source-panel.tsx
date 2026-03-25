"use client";

import { FileText, Gavel, ScrollText, X } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

// ——— Tipos ——————————————————————————————————————————————————————————

export type SourceType = "document" | "jurisprudencia" | "legislacao";
export type ConfidenceLevel = "source" | "inference" | "needs-review" | "verified";

export interface SourceItem {
  id: string;
  type: SourceType;
  title: string;
  /** Ex: "p. 47, §3" */
  page?: string;
  confidence: ConfidenceLevel;
  /** Trecho relevante — max 3 linhas */
  excerpt?: string;
  onClick?: () => void;
}

export interface SourcePanelProps {
  sources: SourceItem[];
  onClose?: () => void;
  className?: string;
}

// ——— Helpers ——————————————————————————————————————————————————————

const CONFIDENCE_LABEL: Record<ConfidenceLevel, string> = {
  source: "Fonte",
  inference: "Inferência",
  "needs-review": "Revisar",
  verified: "Verificado",
};

const TYPE_ICON: Record<SourceType, React.ReactNode> = {
  document: <FileText className="h-4 w-4" />,
  jurisprudencia: <Gavel className="h-4 w-4" />,
  legislacao: <ScrollText className="h-4 w-4" />,
};

// ——— Componente ——————————————————————————————————————————————————————

export function SourcePanel({ sources, onClose, className }: SourcePanelProps) {
  const [activeTab, setActiveTab] = useState<SourceType>("document");

  const byType = (type: SourceType) => sources.filter((s) => s.type === type);

  const totalSources = sources.filter((s) => s.confidence === "source" || s.confidence === "verified").length;
  const totalInferences = sources.filter((s) => s.confidence === "inference").length;
  const totalAlerts = sources.filter((s) => s.confidence === "needs-review").length;

  return (
    <div
      className={cn(
        "flex w-80 flex-col border-l bg-card",
        className,
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h4 className="font-semibold text-foreground text-sm">
          Fontes e Evidências
        </h4>
        {onClose && (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onClose}
            aria-label="Fechar painel"
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Tabs */}
      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as SourceType)}
        className="flex flex-1 flex-col overflow-hidden"
      >
        <TabsList className="grid w-full grid-cols-3 rounded-none border-b bg-transparent px-2 py-1.5">
          <TabsTrigger value="document" className="text-xs">
            Documentos
            {byType("document").length > 0 && (
              <span className="ml-1 rounded-full bg-muted px-1 text-[10px] text-muted-foreground">
                {byType("document").length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="jurisprudencia" className="text-xs">
            Jurisp.
            {byType("jurisprudencia").length > 0 && (
              <span className="ml-1 rounded-full bg-muted px-1 text-[10px] text-muted-foreground">
                {byType("jurisprudencia").length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="legislacao" className="text-xs">
            Legislação
            {byType("legislacao").length > 0 && (
              <span className="ml-1 rounded-full bg-muted px-1 text-[10px] text-muted-foreground">
                {byType("legislacao").length}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        {(["document", "jurisprudencia", "legislacao"] as SourceType[]).map(
          (type) => (
            <TabsContent
              key={type}
              value={type}
              className="mt-0 flex-1 overflow-y-auto"
            >
              <SourceList items={byType(type)} />
            </TabsContent>
          ),
        )}
      </Tabs>

      {/* Footer */}
      <div className="border-t px-4 py-2.5">
        <p className="text-muted-foreground text-xs">
          {totalSources > 0 && (
            <span>{totalSources} fonte{totalSources !== 1 ? "s" : ""}</span>
          )}
          {totalInferences > 0 && (
            <span> · {totalInferences} inferência{totalInferences !== 1 ? "s" : ""}</span>
          )}
          {totalAlerts > 0 && (
            <span className="text-confidence-alert"> · {totalAlerts} alerta{totalAlerts !== 1 ? "s" : ""}</span>
          )}
          {sources.length === 0 && "Nenhuma fonte ainda"}
        </p>
      </div>
    </div>
  );
}

// ——— Sub-componente: lista de fontes ————————————————————————————————

function SourceList({ items }: { items: SourceItem[] }) {
  if (items.length === 0) {
    return (
      <div className="flex h-24 items-center justify-center text-muted-foreground text-xs">
        Nenhuma fonte nesta categoria
      </div>
    );
  }

  return (
    <ul className="divide-y">
      {items.map((item) => (
        <li key={item.id}>
          <button
            type="button"
            onClick={item.onClick}
            disabled={!item.onClick}
            className={cn(
              "flex w-full flex-col gap-1.5 px-4 py-3 text-left",
              "transition-colors",
              item.onClick
                ? "hover:bg-muted/60 cursor-pointer"
                : "cursor-default",
            )}
          >
            {/* Tipo + título + página */}
            <div className="flex items-start gap-2">
              <span className="mt-0.5 shrink-0 text-muted-foreground">
                {TYPE_ICON[item.type]}
              </span>
              <div className="min-w-0 flex-1">
                <span className="block truncate font-medium text-foreground text-xs leading-tight">
                  {item.title}
                </span>
                {item.page && (
                  <span className="font-mono text-muted-foreground text-[10px]">
                    {item.page}
                  </span>
                )}
              </div>
              <Badge
                variant={item.confidence}
                className="shrink-0 text-[10px]"
              >
                {CONFIDENCE_LABEL[item.confidence]}
              </Badge>
            </div>

            {/* Trecho */}
            {item.excerpt && (
              <p className="line-clamp-3 pl-6 text-muted-foreground text-[11px] leading-relaxed">
                {item.excerpt}
              </p>
            )}
          </button>
        </li>
      ))}
    </ul>
  );
}
