"use client";

import { PlusIcon } from "lucide-react";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import useSWR from "swr";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface UserCreditRow {
  userId: string;
  email: string | null;
  balance: number;
  updatedAt: string | null;
}

async function fetchCreditsWithKey(url: string, adminKey: string) {
  const res = await fetch(url, {
    headers: { "x-admin-key": adminKey },
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error ?? "Falha ao carregar créditos");
  }
  return res.json() as Promise<UserCreditRow[]>;
}

export default function AdminCreditsPage() {
  const [adminKey, setAdminKey] = useState("");
  const [keyInput, setKeyInput] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  /** Confirmação antes de submeter — mostra utilizador e delta para revisão final. */
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [addUserId, setAddUserId] = useState("");
  const [addDelta, setAddDelta] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const {
    data: users = [],
    error: creditsError,
    isLoading: creditsLoading,
    mutate,
  } = useSWR<UserCreditRow[]>(
    adminKey ? ["/api/admin/credits", adminKey] : null,
    ([url, key]: [string, string]) => fetchCreditsWithKey(url, key),
    { revalidateOnFocus: false }
  );

  const isUnauthorized =
    creditsError?.message?.toLowerCase().includes("unauthorized") ?? false;

  const resetKey = useCallback(() => {
    setAdminKey("");
    setKeyInput("");
  }, []);

  const handleKeySubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const key = keyInput.trim();
      if (key) {
        setAdminKey(key);
      }
    },
    [keyInput]
  );

  /** Valida o formulário e abre o diálogo de confirmação. */
  const requestConfirm = useCallback(() => {
    const userId = addUserId.trim();
    const delta = Number.parseInt(addDelta, 10);
    if (!userId || Number.isNaN(delta) || delta <= 0 || !adminKey) {
      toast.error("Preencha userId e um delta positivo.");
      return;
    }
    setConfirmOpen(true);
  }, [adminKey, addDelta, addUserId]);

  /** Executa o pedido após confirmação explícita. */
  const submitAddCredits = useCallback(async () => {
    const userId = addUserId.trim();
    const delta = Number.parseInt(addDelta, 10);
    setConfirmOpen(false);
    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/credits", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-key": adminKey,
        },
        body: JSON.stringify({ userId, delta }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error ?? "Falha ao adicionar créditos");
      }
      toast.success(`${delta} créditos adicionados.`);
      setAddOpen(false);
      setAddUserId("");
      setAddDelta("");
      await mutate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao adicionar");
    } finally {
      setSubmitting(false);
    }
  }, [adminKey, addDelta, addUserId, mutate]);

  if (!adminKey) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 p-6">
        <h1 className="font-semibold text-xl">Créditos (admin)</h1>
        <p className="text-center text-muted-foreground text-sm">
          Introduza a chave de administrador para listar utilizadores e
          adicionar créditos.
        </p>
        <form
          className="flex w-full max-w-sm flex-col gap-2"
          onSubmit={handleKeySubmit}
        >
          <Label htmlFor="admin-key-credits">Chave de administrador</Label>
          <Input
            autoComplete="off"
            id="admin-key-credits"
            onChange={(e) => setKeyInput(e.target.value)}
            placeholder="Introduza a chave definida em ADMIN_CREDITS_SECRET"
            type="password"
            value={keyInput}
          />
          <Button type="submit">Aceder</Button>
        </form>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-semibold text-xl">Créditos por utilizador</h1>
        <p className="text-muted-foreground text-sm">
          Lista de utilizadores com saldo. Use o botão abaixo para adicionar
          créditos a um utilizador.
        </p>
      </div>

      {creditsError && (
        <div
          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-destructive"
          role="alert"
        >
          <p className="text-sm">
            {isUnauthorized
              ? "Chave de administrador inválida ou em falta no servidor (ADMIN_CREDITS_SECRET). Verifique .env.local e reinicie o servidor se acabou de adicionar."
              : creditsError.message}
          </p>
          <Button onClick={resetKey} type="button" variant="outline">
            Introduzir outra chave
          </Button>
        </div>
      )}

      {creditsLoading && users.length === 0 ? (
        <p className="text-muted-foreground text-sm">A carregar…</p>
      ) : null}

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-muted-foreground text-sm">
            {users.length} utilizador(es)
          </span>
          <Button onClick={() => setAddOpen(true)} size="sm" type="button">
            <PlusIcon aria-hidden className="size-4" />
            Adicionar créditos
          </Button>
        </div>
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-border bg-muted/50">
                <th className="px-4 py-2 font-medium">Email</th>
                <th className="px-4 py-2 font-medium">ID</th>
                <th className="px-4 py-2 font-medium">Saldo</th>
                <th className="px-4 py-2 font-medium">Atualizado</th>
              </tr>
            </thead>
            <tbody>
              {users.map((row) => (
                <tr className="border-border border-t" key={row.userId}>
                  <td className="px-4 py-2">{row.email ?? "—"}</td>
                  <td className="px-4 py-2 font-mono text-muted-foreground text-xs">
                    {row.userId}
                  </td>
                  <td className="px-4 py-2">{row.balance}</td>
                  <td className="px-4 py-2 text-muted-foreground text-xs">
                    {row.updatedAt
                      ? new Date(row.updatedAt).toLocaleString("pt-PT")
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog onOpenChange={setAddOpen} open={addOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Adicionar créditos</DialogTitle>
            <DialogDescription>
              Escolha o utilizador na lista ou introduza o ID. Indique a
              quantidade de créditos a adicionar (número inteiro positivo).
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="add-credits-user-select">
                Utilizador (escolha ou colar ID)
              </Label>
              <select
                aria-describedby="add-credits-user-desc"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                id="add-credits-user-select"
                onChange={(e) => setAddUserId(e.target.value)}
                value={
                  users.some((u) => u.userId === addUserId) ? addUserId : ""
                }
              >
                <option value="">— Escolher da lista —</option>
                {users.map((u) => (
                  <option key={u.userId} value={u.userId}>
                    {u.email ?? u.userId} — {u.balance} cr.
                  </option>
                ))}
              </select>
              <Input
                aria-describedby="add-credits-user-desc"
                id="add-credits-user-input"
                onChange={(e) => setAddUserId(e.target.value)}
                placeholder="ou colar UUID manualmente"
                value={addUserId}
              />
              <p
                className="text-muted-foreground text-xs"
                id="add-credits-user-desc"
              >
                Escolha na lista ou introduza o ID do utilizador.
              </p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="add-credits-delta">Créditos a adicionar</Label>
              <Input
                id="add-credits-delta"
                min={1}
                onChange={(e) => setAddDelta(e.target.value)}
                placeholder="ex.: 100"
                type="number"
                value={addDelta}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={() => setAddOpen(false)}
              type="button"
              variant="outline"
            >
              Cancelar
            </Button>
            <Button
              disabled={submitting}
              onClick={requestConfirm}
              type="button"
            >
              {submitting ? "A adicionar…" : "Adicionar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Diálogo de confirmação — previne erros de digitação sem undo */}
      <Dialog onOpenChange={setConfirmOpen} open={confirmOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Confirmar adição de créditos</DialogTitle>
            <DialogDescription>
              Esta ação não pode ser desfeita. Confirme os detalhes antes de
              prosseguir.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-lg border bg-muted/50 p-4 text-sm">
            <p>
              <span className="text-muted-foreground">Utilizador:</span>{" "}
              <span className="font-mono text-xs">
                {users.find((u) => u.userId === addUserId.trim())?.email ??
                  addUserId.trim()}
              </span>
            </p>
            <p className="mt-1">
              <span className="text-muted-foreground">Créditos a adicionar:</span>{" "}
              <span className="font-semibold">+{addDelta}</span>
            </p>
          </div>
          <DialogFooter>
            <Button
              onClick={() => setConfirmOpen(false)}
              type="button"
              variant="outline"
            >
              Cancelar
            </Button>
            <Button onClick={submitAddCredits} type="button">
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
