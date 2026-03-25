"use client";

import { useCallback, useRef, useState } from "react";
import useSWR from "swr";
import {
  FASE_LABEL,
  RISCO_CLASSES,
  RISCO_DOT,
  RISCO_LABEL,
} from "@/lib/constants/processo";
import type { ProcessoComVerbas } from "@/lib/db/queries";
import type { KnowledgeDocument } from "@/lib/db/schema";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface ProcessoCardProps {
  readonly processo: ProcessoComVerbas;
  readonly isActive: boolean;
  readonly onClick: () => void;
  readonly onMutate?: () => void;
}

export function ProcessoCard({
  processo,
  isActive,
  onClick,
  onMutate,
}: ProcessoCardProps) {
  const [docsOpen, setDocsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const linkedIds: string[] = Array.isArray(processo.knowledgeDocumentIds)
    ? (processo.knowledgeDocumentIds as string[])
    : [];

  // Fetch KB docs only when picker is open
  const { data: allDocs } = useSWR<KnowledgeDocument[]>(
    docsOpen ? "/api/knowledge" : null,
    fetcher
  );

  const risco = processo.riscoGlobal ?? null;
  const riscoClass = risco ? (RISCO_CLASSES[risco] ?? "") : "";
  const riscoDot = risco ? (RISCO_DOT[risco] ?? "bg-muted-foreground/40") : "";

  const prazoDate = processo.prazoFatal
    ? new Date(processo.prazoFatal).toLocaleDateString("pt-BR")
    : null;

  const primeiroNomeReclamante = processo.reclamante.split(" ")[0];
  const primeiroNomeReclamada = processo.reclamada.split(" ")[0];

  const patchKnowledgeIds = useCallback(
    async (ids: string[]) => {
      setSaving(true);
      try {
        await fetch(`/api/processos/${processo.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ knowledgeDocumentIds: ids }),
        });
        onMutate?.();
      } finally {
        setSaving(false);
      }
    },
    [processo.id, onMutate]
  );

  const handleToggleDoc = useCallback(
    (docId: string, linked: boolean) => {
      const next = linked
        ? linkedIds.filter((x) => x !== docId)
        : [...linkedIds, docId];
      patchKnowledgeIds(next);
    },
    [linkedIds, patchKnowledgeIds]
  );

  const filteredDocs = allDocs?.filter((d) =>
    d.title.toLowerCase().includes(search.toLowerCase())
  );

  const linkedDocs = allDocs?.filter((d) => linkedIds.includes(d.id));

  const borderClass = isActive
    ? "border-assistjur-gold/30 bg-assistjur-gold/8"
    : "border-border/60 bg-transparent dark:border-white/6";

  return (
    <div className={`w-full rounded-md border ${borderClass} overflow-hidden`}>
      {/* Card principal — clicável para navegar */}
      <button
        className={`w-full px-2.5 py-2 text-left transition-colors ${
          isActive
            ? ""
            : "hover:border-border hover:bg-muted/50 dark:hover:border-white/12 dark:hover:bg-white/5"
        }`}
        onClick={onClick}
        type="button"
      >
        {/* Linha 1: número + risco badge */}
        <div className="mb-1 flex items-center justify-between gap-2">
          <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-muted-foreground">
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
          <span className="text-muted-foreground">
            ×
          </span>{" "}
          {primeiroNomeReclamada}
        </div>

        {/* Linha 3: fase + prazo */}
        <div className="flex items-center justify-between">
          {processo.fase && (
            <span className="text-[10px] text-muted-foreground">
              {FASE_LABEL[processo.fase] ?? processo.fase}
            </span>
          )}
          {prazoDate && (
            <span className="text-[10px] text-muted-foreground">
              ⏰ {prazoDate}
            </span>
          )}
        </div>
      </button>

      {/* Linha de documentos */}
      <div className="border-border/40 border-t dark:border-white/6">
        <button
          className="flex w-full items-center gap-1 px-2.5 py-1.5 text-left text-[10px] text-muted-foreground transition-colors hover:bg-muted/40 dark:hover:bg-white/4"
          onClick={(e) => {
            e.stopPropagation();
            setDocsOpen((v) => !v);
            if (!docsOpen) {
              setTimeout(() => searchRef.current?.focus(), 50);
            }
          }}
          type="button"
        >
          <span>📎</span>
          <span>
            {linkedIds.length > 0
              ? `${linkedIds.length} doc${linkedIds.length > 1 ? "s" : ""}`
              : "Documentos"}
          </span>
          <span className="ml-auto">{docsOpen ? "▲" : "▼"}</span>
        </button>

        {docsOpen && (
          <div className="px-2.5 pb-2">
            {/* Docs vinculados */}
            {linkedDocs && linkedDocs.length > 0 && (
              <div className="mb-1.5 flex flex-col gap-0.5">
                {linkedDocs.map((doc) => (
                  <div
                    className="flex items-center gap-1 rounded px-1 py-0.5 text-[10px] text-foreground dark:text-white/80"
                    key={doc.id}
                  >
                    <span className="min-w-0 flex-1 truncate">{doc.title}</span>
                    <button
                      aria-label={`Remover ${doc.title}`}
                      className="shrink-0 text-muted-foreground hover:text-destructive disabled:opacity-40"
                      disabled={saving}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleToggleDoc(doc.id, true);
                      }}
                      type="button"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Buscador */}
            <input
              className="mb-1.5 w-full rounded border border-border/60 bg-background px-2 py-1 text-[10px] text-foreground outline-none placeholder:text-muted-foreground/60 focus:border-assistjur-gold/50 dark:border-white/10 dark:bg-white/4"
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar no KB…"
              ref={searchRef}
              type="text"
              value={search}
            />

            {/* Lista de docs disponíveis */}
            <div className="max-h-36 overflow-y-auto">
              {!allDocs && (
                <p className="py-1 text-center text-[10px] text-muted-foreground">
                  A carregar…
                </p>
              )}
              {filteredDocs?.length === 0 && (
                <p className="py-1 text-center text-[10px] text-muted-foreground">
                  Sem resultados
                </p>
              )}
              {filteredDocs?.map((doc) => {
                const linked = linkedIds.includes(doc.id);
                return (
                  <button
                    className={`flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-left text-[10px] transition-colors ${
                      linked
                        ? "bg-assistjur-gold/10 text-foreground dark:text-white/90"
                        : "text-muted-foreground hover:bg-muted/50 dark:hover:bg-white/5"
                    } disabled:opacity-40`}
                    disabled={saving}
                    key={doc.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleToggleDoc(doc.id, linked);
                    }}
                    type="button"
                  >
                    <span className="shrink-0">{linked ? "✓" : "+"}</span>
                    <span className="min-w-0 flex-1 truncate">{doc.title}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
