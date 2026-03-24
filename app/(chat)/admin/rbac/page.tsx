"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";
import useSWR from "swr";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ROLE_LABEL, ROLES, type Role } from "@/lib/rbac/roles";

interface UserRoleRow {
  id: string;
  email: string | null;
  role: string | null;
}

async function fetchUsersWithKey(url: string, adminKey: string) {
  const res = await fetch(url, { headers: { "x-admin-key": adminKey } });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error ?? "Falha ao carregar utilizadores");
  }
  return res.json() as Promise<UserRoleRow[]>;
}

export default function AdminRbacPage() {
  const [adminKey, setAdminKey] = useState("");
  const [keyInput, setKeyInput] = useState("");
  const [saving, setSaving] = useState<string | null>(null);

  const {
    data: users = [],
    error,
    isLoading,
    mutate,
  } = useSWR<UserRoleRow[]>(
    adminKey ? ["/api/admin/rbac", adminKey] : null,
    ([url, key]: [string, string]) => fetchUsersWithKey(url, key),
    { revalidateOnFocus: false }
  );

  const isUnauthorized =
    error?.message?.toLowerCase().includes("unauthorized") ?? false;

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

  const handleRoleChange = useCallback(
    async (userId: string, role: string | null) => {
      setSaving(userId);
      try {
        const res = await fetch("/api/admin/rbac", {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            "x-admin-key": adminKey,
          },
          body: JSON.stringify({ userId, role }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data.error ?? "Erro ao atualizar");
        }
        toast.success("Perfil atualizado.");
        await mutate();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erro ao atualizar");
      } finally {
        setSaving(null);
      }
    },
    [adminKey, mutate]
  );

  if (!adminKey) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 p-6">
        <h1 className="font-semibold text-xl">Perfis RBAC (admin)</h1>
        <p className="text-center text-muted-foreground text-sm">
          Introduza a chave de administrador para gerir os perfis dos
          utilizadores.
        </p>
        <form
          className="flex w-full max-w-sm flex-col gap-2"
          onSubmit={handleKeySubmit}
        >
          <Label htmlFor="admin-key-rbac">Chave de administrador</Label>
          <Input
            autoComplete="off"
            id="admin-key-rbac"
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
      <div>
        <h1 className="font-semibold text-xl">Perfis de utilizadores</h1>
        <p className="text-muted-foreground text-sm">
          Altere o perfil RBAC de cada utilizador. A alteração tem efeito no
          próximo login.
        </p>
      </div>

      {error && (
        <div
          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-destructive"
          role="alert"
        >
          <p className="text-sm">
            {isUnauthorized
              ? "Chave de administrador inválida."
              : error.message}
          </p>
          <Button
            onClick={() => {
              setAdminKey("");
              setKeyInput("");
            }}
            type="button"
            variant="outline"
          >
            Introduzir outra chave
          </Button>
        </div>
      )}

      {isLoading && users.length === 0 ? (
        <p className="text-muted-foreground text-sm">A carregar…</p>
      ) : null}

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-border bg-muted/50">
              <th className="px-4 py-2 font-medium">Email</th>
              <th className="px-4 py-2 font-medium">ID</th>
              <th className="px-4 py-2 font-medium">Perfil atual</th>
              <th className="px-4 py-2 font-medium">Alterar para</th>
            </tr>
          </thead>
          <tbody>
            {users.map((row) => (
              <tr className="border-border border-t" key={row.id}>
                <td className="px-4 py-2">{row.email ?? "—"}</td>
                <td className="px-4 py-2 font-mono text-muted-foreground text-xs">
                  {row.id}
                </td>
                <td className="px-4 py-2">
                  {row.role ? (
                    (ROLE_LABEL[row.role as Role] ?? row.role)
                  ) : (
                    <span className="text-muted-foreground">sem perfil</span>
                  )}
                </td>
                <td className="px-4 py-2">
                  <div className="flex flex-wrap gap-1">
                    {ROLES.map((r) => (
                      <button
                        className={`rounded px-2 py-0.5 text-xs transition-colors ${
                          row.role === r
                            ? "bg-primary text-primary-foreground"
                            : "border border-border bg-muted hover:bg-muted/70"
                        } disabled:opacity-50`}
                        disabled={saving === row.id || row.role === r}
                        key={r}
                        onClick={() => handleRoleChange(row.id, r)}
                        type="button"
                      >
                        {r}
                      </button>
                    ))}
                    {row.role !== null && (
                      <button
                        className="rounded border border-destructive/50 bg-destructive/10 px-2 py-0.5 text-destructive text-xs hover:bg-destructive/20 disabled:opacity-50"
                        disabled={saving === row.id}
                        onClick={() => handleRoleChange(row.id, null)}
                        type="button"
                      >
                        remover
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-muted-foreground text-xs">
        {users.length} utilizador(es) listados (excluindo contas guest).
      </p>
    </div>
  );
}
