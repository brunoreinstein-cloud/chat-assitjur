"use client";

import { BriefcaseIcon, PlusIcon, XIcon } from "lucide-react";
import { useCallback, useState, useTransition } from "react";
import useSWR, { useSWRConfig } from "swr";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RISCO_DOT } from "@/lib/constants/processo";
import type { ProcessoComVerbas } from "@/lib/db/queries";
import { fetcher } from "@/lib/utils";

// ─── CNJ mask ────────────────────────────────────────────────────────────────

const CNJ_REGEX = /^\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}$/;

function applyCNJMask(raw: string): string {
  const d = raw.replace(/\D/g, "").slice(0, 20);
  if (d.length <= 7) {
    return d;
  }
  if (d.length <= 9) {
    return `${d.slice(0, 7)}-${d.slice(7)}`;
  }
  if (d.length <= 13) {
    return `${d.slice(0, 7)}-${d.slice(7, 9)}.${d.slice(9)}`;
  }
  if (d.length <= 14) {
    return `${d.slice(0, 7)}-${d.slice(7, 9)}.${d.slice(9, 13)}.${d.slice(13)}`;
  }
  if (d.length <= 16) {
    return `${d.slice(0, 7)}-${d.slice(7, 9)}.${d.slice(9, 13)}.${d.slice(13, 14)}.${d.slice(14)}`;
  }
  return `${d.slice(0, 7)}-${d.slice(7, 9)}.${d.slice(9, 13)}.${d.slice(13, 14)}.${d.slice(14, 16)}.${d.slice(16)}`;
}

// ─── Props ───────────────────────────────────────────────────────────────────

interface ProcessoSelectorProps {
  /** ID do processo atualmente vinculado (null = sem processo). */
  readonly processoId: string | null;
  /** Callback chamado quando o utilizador seleciona, cria ou limpa o processo. */
  readonly onProcessoChange: (processoId: string | null) => Promise<void>;
  readonly disabled?: boolean;
}

const MAX_AUTOS_LEN = 22;

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

// ─── Formulário de criação rápida ─────────────────────────────────────────────

interface NovoProcessoForm {
  numeroAutos: string;
  reclamante: string;
  reclamada: string;
  vara: string;
}

const EMPTY_FORM: NovoProcessoForm = {
  numeroAutos: "",
  reclamante: "",
  reclamada: "",
  vara: "",
};

// ─── Componente ──────────────────────────────────────────────────────────────

export function ProcessoSelector({
  processoId,
  onProcessoChange,
  disabled,
}: ProcessoSelectorProps) {
  const [isPending, startTransition] = useTransition();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<NovoProcessoForm>(EMPTY_FORM);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const { mutate } = useSWRConfig();

  // Reutiliza o mesmo cache da sidebar — zero round-trips extras.
  const { data: processos = [] } = useSWR<ProcessoComVerbas[]>(
    "/api/processos",
    fetcher,
    { revalidateOnFocus: false }
  );

  const currentProcesso = processoId
    ? (processos.find((p) => p.id === processoId) ?? null)
    : null;

  const handleSelect = useCallback(
    (id: string | null) => {
      if (id === processoId) {
        return;
      }
      startTransition(async () => {
        await onProcessoChange(id);
      });
    },
    [processoId, onProcessoChange]
  );

  const handleOpenDialog = useCallback(() => {
    setForm(EMPTY_FORM);
    setCreateError(null);
    setDialogOpen(true);
  }, []);

  const handleCreate = useCallback(async () => {
    const autos = form.numeroAutos.trim();
    const reclamante = form.reclamante.trim();
    const reclamada = form.reclamada.trim();
    if (!(autos && reclamante && reclamada)) {
      setCreateError("Preencha os campos obrigatórios (*).");
      return;
    }
    if (!CNJ_REGEX.test(autos)) {
      setCreateError("Número CNJ inválido. Formato: 0000000-00.0000.0.00.0000");
      return;
    }
    setCreating(true);
    setCreateError(null);
    try {
      const res = await fetch("/api/processos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          numeroAutos: autos,
          reclamante,
          reclamada,
          vara: form.vara.trim() || undefined,
          fase: "recebimento",
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(
          (data as { error?: string }).error ?? `Erro ${res.status}`
        );
      }
      const created = (await res.json()) as { id: string };
      // Atualiza a cache SWR antes de selecionar o novo processo.
      await mutate("/api/processos");
      setDialogOpen(false);
      startTransition(async () => {
        await onProcessoChange(created.id);
      });
    } catch (err) {
      setCreateError(
        err instanceof Error ? err.message : "Erro ao criar processo."
      );
    } finally {
      setCreating(false);
    }
  }, [form, mutate, onProcessoChange]);

  // ── Render ──────────────────────────────────────────────────────────────────

  const triggerLabel = currentProcesso
    ? `${truncate(currentProcesso.numeroAutos, MAX_AUTOS_LEN)} · ${currentProcesso.reclamante.split(" ")[0]}`
    : "Processo";

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            aria-label={
              currentProcesso
                ? `Processo: ${triggerLabel}`
                : "Vincular processo"
            }
            className={`flex items-center gap-1.5 rounded-md border border-border bg-muted px-2.5 py-1.5 font-mono text-[11px] transition-colors hover:bg-muted/80 ${
              isPending ? "opacity-60" : ""
            } ${disabled ? "pointer-events-none opacity-50" : ""}`}
            disabled={disabled || isPending}
            type="button"
          >
            {currentProcesso ? (
              <>
                <span
                  aria-hidden
                  className={`h-2 w-2 shrink-0 rounded-full ${RISCO_DOT[currentProcesso.riscoGlobal ?? ""] ?? "bg-muted-foreground/40"}`}
                />
                <span className="text-muted-foreground">
                  {truncate(currentProcesso.numeroAutos, MAX_AUTOS_LEN)}
                </span>
                <span className="text-muted-foreground/40">
                  ·
                </span>
                <span className="text-foreground dark:text-white/80">
                  {currentProcesso.reclamante.split(" ")[0]}
                </span>
              </>
            ) : (
              <>
                <BriefcaseIcon
                  aria-hidden
                  className="h-3 w-3 text-muted-foreground"
                />
                <span className="text-muted-foreground">
                  Processo
                </span>
              </>
            )}
            <svg
              aria-hidden
              className="h-2.5 w-2.5 text-muted-foreground"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              viewBox="0 0 24 24"
            >
              <title>Seta</title>
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>
        </DropdownMenuTrigger>

        <DropdownMenuContent
          align="start"
          className="max-h-72 w-80 overflow-y-auto"
        >
          <DropdownMenuLabel className="text-muted-foreground text-xs">
            Vincular processo ao chat
          </DropdownMenuLabel>
          <DropdownMenuSeparator />

          {processos.length === 0 && (
            <div className="px-3 py-3 text-center text-muted-foreground text-xs">
              Nenhum processo encontrado.
            </div>
          )}

          {processos.map((p) => {
            const isSelected = p.id === processoId;
            return (
              <DropdownMenuItem
                className="flex cursor-pointer items-center gap-2"
                key={p.id}
                onSelect={() => handleSelect(p.id)}
              >
                <span
                  aria-hidden
                  className={`h-2 w-2 shrink-0 rounded-full ${RISCO_DOT[p.riscoGlobal ?? ""] ?? "bg-muted-foreground/30"}`}
                />
                <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-muted-foreground">
                  {truncate(p.numeroAutos, 28)}
                </span>
                <span className="shrink-0 text-[11px] text-foreground">
                  {p.reclamante.split(" ")[0]}
                </span>
                {isSelected && (
                  <span className="shrink-0 font-semibold text-[10px] text-assistjur-gold">
                    ✓
                  </span>
                )}
              </DropdownMenuItem>
            );
          })}

          <DropdownMenuSeparator />

          {/* Criar novo processo inline */}
          <DropdownMenuItem
            className="flex cursor-pointer items-center gap-2 text-foreground"
            onSelect={handleOpenDialog}
          >
            <PlusIcon aria-hidden className="h-3 w-3" />
            <span className="text-xs">Novo processo</span>
          </DropdownMenuItem>

          {processoId && (
            <DropdownMenuItem
              className="flex cursor-pointer items-center gap-2 text-muted-foreground"
              onSelect={() => handleSelect(null)}
            >
              <XIcon aria-hidden className="h-3 w-3" />
              <span className="text-xs">Remover processo</span>
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Dialog de criação rápida — fora do DropdownMenu para não conflituar com o Portal */}
      <Dialog onOpenChange={setDialogOpen} open={dialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Novo processo</DialogTitle>
            <DialogDescription>
              Preencha os campos obrigatórios para criar o processo e vinculá-lo
              ao chat.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-3 py-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="psel-autos">
                Número CNJ{" "}
                <span aria-hidden className="text-destructive">
                  *
                </span>
              </Label>
              <Input
                autoFocus
                id="psel-autos"
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    numeroAutos: applyCNJMask(e.target.value),
                  }))
                }
                placeholder="0000000-00.0000.5.00.0000"
                value={form.numeroAutos}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="psel-reclamante">
                Reclamante{" "}
                <span aria-hidden className="text-destructive">
                  *
                </span>
              </Label>
              <Input
                id="psel-reclamante"
                onChange={(e) =>
                  setForm((f) => ({ ...f, reclamante: e.target.value }))
                }
                placeholder="Nome do reclamante"
                value={form.reclamante}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="psel-reclamada">
                Reclamada{" "}
                <span aria-hidden className="text-destructive">
                  *
                </span>
              </Label>
              <Input
                id="psel-reclamada"
                onChange={(e) =>
                  setForm((f) => ({ ...f, reclamada: e.target.value }))
                }
                placeholder="Nome da empresa reclamada"
                value={form.reclamada}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="psel-vara">Vara (opcional)</Label>
              <Input
                id="psel-vara"
                onChange={(e) =>
                  setForm((f) => ({ ...f, vara: e.target.value }))
                }
                placeholder="Ex: 3ª Vara do Trabalho de São Paulo"
                value={form.vara}
              />
            </div>

            {createError && (
              <p className="text-destructive text-xs">{createError}</p>
            )}
          </div>

          <DialogFooter>
            <Button
              disabled={creating}
              onClick={() => setDialogOpen(false)}
              type="button"
              variant="outline"
            >
              Cancelar
            </Button>
            <Button disabled={creating} onClick={handleCreate} type="button">
              {creating ? "A criar…" : "Criar e vincular"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
