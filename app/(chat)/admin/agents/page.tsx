"use client";

import { LoaderIcon, PencilIcon, WandIcon } from "lucide-react";
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

function buildImproveToastDescription(data: {
  diagnosis?: string;
  notes?: string;
}): string | undefined {
  const parts: string[] = [];
  if (data.diagnosis?.trim()) {
    parts.push(data.diagnosis.trim());
  }
  if (data.notes?.trim()) {
    parts.push(`Alterações: ${data.notes.trim()}`);
  }
  if (parts.length === 0) {
    return undefined;
  }
  const full = parts.join("\n\n");
  return full.length > 400 ? `${full.slice(0, 400)}…` : full;
}

async function patchAgentAndMutate(
  agentId: string,
  adminKey: string,
  label: string | undefined,
  instructions: string
): Promise<void> {
  const res = await fetch(`/api/admin/agents/${agentId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "x-admin-key": adminKey,
    },
    body: JSON.stringify({ label: label || undefined, instructions }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error ?? "Falha ao guardar");
  }
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
  const [isImprovingPrompt, setIsImprovingPrompt] = useState(false);

  const {
    data: agents = [],
    error: agentsError,
    isLoading: agentsLoading,
    mutate,
  } = useSWR<BuiltInAgentItem[]>(
    adminKey ? ["/api/admin/agents", adminKey] : null,
    ([url, key]: [string, string]) => fetchAgentsWithKey(url, key),
    { revalidateOnFocus: false }
  );

  const isUnauthorized =
    agentsError?.message?.toLowerCase().includes("unauthorized") ?? false;

  const resetKey = useCallback(() => {
    setAdminKey("");
    setKeyInput("");
  }, []);

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
      await patchAgentAndMutate(
        editingAgent.id,
        adminKey,
        formLabel.trim() || undefined,
        formInstructions
      );
      toast.success("Agente atualizado.");
      closeEdit();
      await mutate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao guardar");
    } finally {
      setSaving(false);
    }
  }, [adminKey, closeEdit, editingAgent, formInstructions, formLabel, mutate]);

  const improvePrompt = useCallback(async () => {
    const text = formInstructions.trim();
    if (text.length === 0) {
      toast.error("Escreva ou cole instruções para melhorar.");
      return;
    }
    setIsImprovingPrompt(true);
    try {
      const res = await fetch("/api/prompt/improve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: text }),
      });
      const data = (await res.json()) as
        | { improvedPrompt: string; diagnosis?: string; notes?: string }
        | { error?: string };
      if (!res.ok) {
        const msg =
          "error" in data && typeof data.error === "string"
            ? data.error
            : "Não foi possível melhorar o prompt.";
        toast.error(msg);
        return;
      }
      if ("improvedPrompt" in data && typeof data.improvedPrompt === "string") {
        setFormInstructions(data.improvedPrompt);
        const description = buildImproveToastDescription(data);
        toast.success("Instruções melhoradas. Reveja e guarde quando quiser.", {
          description,
        });
      }
    } catch {
      toast.error("Erro de ligação. Tente novamente.");
    } finally {
      setIsImprovingPrompt(false);
    }
  }, [formInstructions]);

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
          etiquetas dos agentes (Revisor de Defesas, Redator de Contestações).
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
        <h1 className="font-semibold text-xl">Agentes built-in</h1>
        <p className="text-muted-foreground text-sm">
          Edite as instruções e o nome exibido dos agentes. As alterações
          aplicam-se a todos os utilizadores. Deixe em branco para restaurar o
          valor do código.
        </p>
      </div>

      {agentsError && (
        <div
          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-destructive"
          role="alert"
        >
          <p className="text-sm">
            {isUnauthorized
              ? "Chave de administrador inválida ou em falta no servidor (ADMIN_CREDITS_SECRET). Verifique .env.local e reinicie o servidor se acabou de adicionar."
              : agentsError.message}
          </p>
          <Button onClick={resetKey} type="button" variant="outline">
            Introduzir outra chave
          </Button>
        </div>
      )}

      {agentsLoading && agents.length === 0 ? (
        <p className="text-muted-foreground text-sm">A carregar agentes…</p>
      ) : null}

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
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor="edit-agent-instructions">Instruções</Label>
                  <Button
                    aria-label="Melhorar instruções com IA"
                    disabled={
                      isImprovingPrompt || formInstructions.trim().length === 0
                    }
                    onClick={improvePrompt}
                    size="sm"
                    type="button"
                    variant="secondary"
                  >
                    {isImprovingPrompt ? (
                      <LoaderIcon aria-hidden className="size-4 animate-spin" />
                    ) : (
                      <WandIcon aria-hidden className="size-4" />
                    )}
                    <span className="ml-1.5">
                      {isImprovingPrompt ? "A melhorar…" : "Melhorar prompt"}
                    </span>
                  </Button>
                </div>
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
