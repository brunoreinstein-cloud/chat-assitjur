"use client";

import { formatDistanceToNow } from "date-fns";
import { pt } from "date-fns/locale";
import {
  EllipsisVertical,
  EyeIcon,
  FolderInput,
  Loader2,
  Pencil,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import type { KnowledgeDoc, KnowledgeFolderType } from "@/lib/knowledge/types";
import { parseSummaryBadge } from "@/lib/knowledge/utils";
import { cn } from "@/lib/utils";

interface KnowledgeDocRowProps {
  doc: KnowledgeDoc;
  isSelected: boolean;
  folders: KnowledgeFolderType[];
  generatingSummaryIds: Set<string>;
  onToggle: (id: string) => void;
  onView: (doc: { id: string; title: string }) => void;
  onRename: (doc: { id: string; title: string }) => void;
  onGenerateSummary: (id: string) => void;
  onMoveToFolder: (docId: string, folderId: string | null) => void;
  onDeleteRequest: (doc: { id: string; title: string }) => void;
}

export function KnowledgeDocRow({
  doc,
  isSelected,
  folders,
  generatingSummaryIds,
  onToggle,
  onView,
  onRename,
  onGenerateSummary,
  onMoveToFolder,
  onDeleteRequest,
}: Readonly<KnowledgeDocRowProps>) {
  const dateLabel =
    doc.createdAt !== null && doc.createdAt !== undefined
      ? formatDistanceToNow(new Date(doc.createdAt), {
          addSuffix: true,
          locale: pt,
        })
      : null;

  const isGenerating = generatingSummaryIds.has(doc.id);

  return (
    <li
      className={cn(
        "group flex min-w-0 flex-col gap-0.5 rounded-md py-0.5 pr-0.5 transition-colors",
        isSelected && "border-primary border-l-2 bg-primary/5"
      )}
    >
      <div className="flex min-w-0 flex-wrap items-center gap-1 rounded-md px-2 py-1 hover:bg-muted/40">
        <input
          aria-describedby={`kb-${doc.id}-title`}
          checked={isSelected}
          className="shrink-0"
          id={`kb-${doc.id}`}
          onChange={() => onToggle(doc.id)}
          title="Usar no chat, mover ou eliminar"
          type="checkbox"
        />
        <Label
          className="min-w-0 flex-1 cursor-pointer truncate font-normal"
          htmlFor={`kb-${doc.id}`}
          id={`kb-${doc.id}-title`}
          title={doc.title}
        >
          {doc.title}
        </Label>
        {doc.indexingStatus === "pending" && (
          <span
            className="shrink-0 rounded bg-amber-500/20 px-1.5 py-0 text-[10px] text-amber-700 dark:text-amber-400"
            title="Ainda não indexado; use «Indexar pendentes» ou aguarde o job."
          >
            Pendente
          </span>
        )}
        {doc.indexingStatus === "failed" && (
          <span
            className="shrink-0 rounded bg-destructive/20 px-1.5 py-0 text-[10px] text-destructive"
            title="Erro ao vetorizar; pode reindexar depois."
          >
            Erro
          </span>
        )}
        {doc.structuredSummary &&
          (() => {
            const { docType, pedidosCount, isPartial } = parseSummaryBadge(
              doc.structuredSummary
            );
            const label = docType === "pi" ? "PI" : "Cont.";
            const pedidosLabel =
              pedidosCount > 0 ? ` • ${pedidosCount} pedidos` : "";
            const partialLabel = isPartial ? " • ⚠️ parcial" : "";
            const coverageSuffix = isPartial
              ? " — cobertura parcial (documento muito grande)"
              : " — cobertura completa";
            const pedidosSuffix =
              pedidosCount > 0 ? ` (${pedidosCount} pedidos mapeados)` : "";
            const tooltip =
              docType === "pi"
                ? `Petição Inicial — resumo estruturado gerado por IA${pedidosSuffix}${coverageSuffix}`
                : `Contestação — resumo estruturado gerado por IA${coverageSuffix}`;
            const badgeClass = isPartial
              ? "bg-amber-500/20 text-amber-700 dark:text-amber-400"
              : "bg-emerald-500/20 text-emerald-700 dark:text-emerald-400";
            return (
              <span
                className={`shrink-0 rounded px-1.5 py-0 text-[10px] ${badgeClass}`}
                title={tooltip}
              >
                📋 {label}
                {pedidosLabel}
                {partialLabel}
              </span>
            );
          })()}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              aria-label={`Ações do documento «${doc.title}»`}
              className="size-7 shrink-0 opacity-0 transition-opacity focus:opacity-100 group-focus-within:opacity-100 group-hover:opacity-100"
              size="icon"
              type="button"
              variant="ghost"
            >
              <EllipsisVertical aria-hidden className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-[180px]">
            <DropdownMenuItem
              onSelect={(e) => {
                e.preventDefault();
                onView({ id: doc.id, title: doc.title });
              }}
            >
              <EyeIcon aria-hidden className="size-4" />
              Ver
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={(e) => {
                e.preventDefault();
                onRename({ id: doc.id, title: doc.title });
              }}
            >
              <Pencil aria-hidden className="size-4" />
              Renomear
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={isGenerating}
              onSelect={(e) => {
                e.preventDefault();
                onGenerateSummary(doc.id);
              }}
            >
              {isGenerating ? (
                <Loader2 aria-hidden className="size-4 animate-spin" />
              ) : (
                <span aria-hidden className="size-4 text-center leading-none">
                  📋
                </span>
              )}
              {doc.structuredSummary ? "Regenerar resumo" : "Gerar resumo"}
            </DropdownMenuItem>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <FolderInput aria-hidden className="size-4" />
                Mover para pasta
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuItem onSelect={() => onMoveToFolder(doc.id, null)}>
                  Raiz
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {folders.map((folder) => (
                  <DropdownMenuItem
                    key={folder.id}
                    onSelect={() => onMoveToFolder(doc.id, folder.id)}
                  >
                    {folder.name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onSelect={(e) => {
                e.preventDefault();
                onDeleteRequest({ id: doc.id, title: doc.title });
              }}
            >
              <Trash2 aria-hidden className="size-4" />
              Eliminar
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {dateLabel != null && (
        <span
          className="pl-6 text-[11px] text-muted-foreground/80"
          title={
            doc.createdAt !== null && doc.createdAt !== undefined
              ? new Date(doc.createdAt).toLocaleString("pt-PT")
              : undefined
          }
        >
          {dateLabel}
        </span>
      )}
    </li>
  );
}
