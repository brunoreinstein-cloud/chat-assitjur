"use client";

import { PencilIcon } from "lucide-react";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

interface BuiltInAgentItem {
  id: string;
  label: string;
  instructions: string;
  hasOverride: boolean;
}

async function fetchAgentsWithKey(url: string, adminKey: string) {
  const res = await fetch(url, {
    headers: { "x-admin-key": adminKey },
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error ?? "Falha ao carregar agentes");
  }
  return res.json() as Promise<BuiltInAgentItem[]>;
}

export default function AdminAgentsPage() {
  const [adminKey, setAdminKey] = useState("");
  const [keyInput, setKeyInput] = useState("");
  const [editingAgent, setEditingAgent] = useState<BuiltInAgentItem | null>(
    null
  );
  const [formLabel, setFormLabel] = useState("");
  const [formInstructions, setFormInstructions] = useState("");
  const [saving, setSaving] = useState(false);

  const { data: agents = [], mutate } = useSWR<BuiltInAgentItem[]>(
    adminKey ? ["/api/admin/agents", adminKey] : null,
    ([url, key]) => fetchAgentsWithKey(url, key),
    { revalidateOnFocus: false }
  );

  const openEdit = useCallback((agent: BuiltInAgentItem) => {
    setEditingAgent(agent);
    setFormLabel(agent.label);
    setFormInstructions(agent.instructions);
  }, []);

  const closeEdit = useCallback(() => {
    setEditingAgent(null);
  }, []);

  const saveEdit = useCallback(async () => {
    if (!(editingAgent && adminKey)) {
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/agents/${editingAgent.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-admin-key": adminKey,
        },
        body: JSON.stringify({
          label: formLabel.trim() || undefined,
          instructions: formInstructions,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error ?? "Falha ao guardar");
      }
      toast.success("Agente atualizado.");
      await mutate();
      closeEdit();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao guardar");
    } finally {
      setSaving(false);
    }
  }, [adminKey, closeEdit, editingAgent, formInstructions, formLabel, mutate]);

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

  if (!adminKey) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 p-6">
        <h1 className="font-semibold text-xl">Painel de agentes built-in</h1>
        <p className="text-center text-muted-foreground text-sm">
          Introduza a chave de administrador para editar as instruções e
          etiquetas dos agentes (Revisor de Defesas, Análise de contratos,
          Redator de Contestações).
        </p>
        <form
          className="flex w-full max-w-sm flex-col gap-2"
          onSubmit={handleKeySubmit}
        >
          <Label htmlFor="admin-key">Chave de administrador</Label>
          <Input
            autoComplete="off"
            id="admin-key"
            onChange={(e) => setKeyInput(e.target.value)}
            placeholder="ADMIN_CREDITS_SECRET"
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
        <h1 className="font-semibold text-xl">Agentes built-in</h1>
        <p className="text-muted-foreground text-sm">
          Edite as instruções e o nome exibido dos agentes. As alterações
          aplicam-se a todos os utilizadores. Deixe em branco para restaurar o
          valor do código.
        </p>
      </div>

      <ul className="flex flex-col gap-2">
        {agents.map((agent) => (
          <li
            className={cn(
              "flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-card p-4",
              agent.hasOverride && "border-primary/40"
            )}
            key={agent.id}
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-medium">{agent.label}</span>
                {agent.hasOverride && (
                  <span className="rounded bg-primary/15 px-1.5 font-medium text-primary text-xs">
                    Editado
                  </span>
                )}
              </div>
              <p className="mt-0.5 truncate text-muted-foreground text-sm">
                {agent.id}
              </p>
              <p className="mt-1 line-clamp-2 text-muted-foreground text-xs">
                {agent.instructions.slice(0, 200)}
                {agent.instructions.length > 200 ? "…" : ""}
              </p>
            </div>
            <Button
              aria-label={`Editar ${agent.label}`}
              onClick={() => openEdit(agent)}
              type="button"
              variant="outline"
            >
              <PencilIcon aria-hidden className="size-4" />
              Editar
            </Button>
          </li>
        ))}
      </ul>

      <Dialog
        onOpenChange={(open) => !open && closeEdit()}
        open={!!editingAgent}
      >
        <DialogContent className="flex max-h-[90vh] max-w-2xl flex-col">
          <DialogHeader>
            <DialogTitle>
              Editar agente: {editingAgent?.label ?? editingAgent?.id}
            </DialogTitle>
            <DialogDescription>
              Altere o nome exibido e as instruções do sistema. O agente base
              (ferramentas e modelos permitidos) continua definido no código.
            </DialogDescription>
          </DialogHeader>
          {editingAgent && (
            <div className="grid flex-1 gap-4 overflow-hidden">
              <div className="grid gap-2">
                <Label htmlFor="edit-agent-label">Nome exibido</Label>
                <Input
                  id="edit-agent-label"
                  maxLength={256}
                  onChange={(e) => setFormLabel(e.target.value)}
                  placeholder="Ex.: Revisor de Defesas"
                  value={formLabel}
                />
              </div>
              <div className="grid min-h-0 flex-1 gap-2">
                <Label htmlFor="edit-agent-instructions">Instruções</Label>
                <ScrollArea className="h-[min(50vh,320px)] rounded-md border border-input">
                  <Textarea
                    className="min-h-[min(50vh,300px)] resize-none border-0 focus-visible:ring-0"
                    id="edit-agent-instructions"
                    maxLength={50_000}
                    onChange={(e) => setFormInstructions(e.target.value)}
                    placeholder="Instruções do sistema para este agente…"
                    value={formInstructions}
                  />
                </ScrollArea>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button onClick={closeEdit} type="button" variant="outline">
              Cancelar
            </Button>
            <Button disabled={saving} onClick={saveEdit} type="button">
              {saving ? "A guardar…" : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
