"use client";

import { LoaderIcon, PencilIcon, RotateCcwIcon, WandIcon } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import useSWR from "swr";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { chatModels } from "@/lib/ai/models";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AgentToolFlags {
  useRevisorDefesaTools: boolean;
  useRedatorContestacaoTool: boolean;
  useMemoryTools: boolean;
  useApprovalTool: boolean;
  usePipelineTool: boolean;
  useMasterDocumentsTool: boolean;
}

interface BuiltInAgentItem {
  id: string;
  label: string;
  instructions: string;
  hasOverride: boolean;
  defaultModelId: string | null;
  codeDefaultModelId: string;
  allowedModelIds: string[] | null;
  toolFlags: AgentToolFlags;
  /** Flags puras do código, sem override da BD — para reset individual. */
  codeToolFlags: AgentToolFlags;
}

// ---------------------------------------------------------------------------
// Flag definitions — fonte única de verdade para a UI
// ---------------------------------------------------------------------------

interface FlagDef {
  key: keyof AgentToolFlags;
  label: string;
  description: string;
  outputBadge: string | null;
  /** Aviso inline mostrado quando a flag está activa (dependência/requisito). */
  hint?: string;
}

const FLAG_DEFS: Record<keyof AgentToolFlags, FlagDef> = {
  useRevisorDefesaTools: {
    key: "useRevisorDefesaTools",
    label: "Auditoria de Defesas",
    description:
      "Analisa PI + Contestação e gera relatório de auditoria em DOCX",
    outputBadge: "DOCX",
  },
  useRedatorContestacaoTool: {
    key: "useRedatorContestacaoTool",
    label: "Redação de Contestação",
    description:
      "Gera minuta de contestação com aprovação do advogado antes do DOCX final",
    outputBadge: "DOCX",
  },
  useMasterDocumentsTool: {
    key: "useMasterDocumentsTool",
    label: "Relatórios Master",
    description:
      "Geração directa de documentos M01–M14 (DOCX + XLSX) com download ZIP",
    outputBadge: "DOCX+XLSX",
    hint: "Recomenda maxOutputTokens ≥ 16 000 — configurado automaticamente no AssistJur Master.",
  },
  usePipelineTool: {
    key: "usePipelineTool",
    label: "Análise de PDFs grandes",
    description:
      "Pipeline multi-chamadas para processos com mais de 200 páginas",
    outputBadge: null,
    hint: "Incompatível com modelos -thinking/-reasoning — essas variantes desactivam ferramentas e o pipeline nunca é chamado.",
  },
  useMemoryTools: {
    key: "useMemoryTools",
    label: "Memória persistente",
    description:
      "Guarda e recupera contexto entre sessões (saveMemory, recallMemories, forgetMemory)",
    outputBadge: null,
  },
  useApprovalTool: {
    key: "useApprovalTool",
    label: "Aprovação humana (HITL)",
    description:
      "Pausa o agente aguardando aprovação explícita antes de acções irreversíveis",
    outputBadge: null,
    hint: "Adiciona latência ao fluxo. Adequado apenas quando o agente executa acções externas.",
  },
};

// Grupos de flags — ordem e agrupamento visual
const FLAG_GROUPS: Array<{
  label: string;
  keys: ReadonlyArray<keyof AgentToolFlags>;
}> = [
  {
    label: "Geração de Documentos",
    keys: [
      "useRevisorDefesaTools",
      "useRedatorContestacaoTool",
      "useMasterDocumentsTool",
    ],
  },
  {
    label: "Processamento",
    keys: ["usePipelineTool"],
  },
  {
    label: "Comportamento",
    keys: ["useMemoryTools", "useApprovalTool"],
  },
];

// Regras de conflito entre flags
interface ConflictRule {
  flags: ReadonlyArray<keyof AgentToolFlags>;
  message: string;
  severity: "warning" | "info";
}

const CONFLICT_RULES: ConflictRule[] = [
  {
    flags: ["useRevisorDefesaTools", "useRedatorContestacaoTool"],
    message:
      "Auditoria e Redação raramente fazem sentido no mesmo agente — considere criar agentes separados para cada fluxo DOCX.",
    severity: "warning",
  },
  {
    flags: ["useMasterDocumentsTool", "useRevisorDefesaTools"],
    message:
      "Master Documents já inclui funcionalidades de auditoria (M07). Ter ambos activos pode gerar redundância.",
    severity: "info",
  },
];

// Badges de output activos para o painel de resumo
function getOutputBadges(flags: AgentToolFlags): string[] {
  const out: string[] = [];
  if (flags.useRevisorDefesaTools) {
    out.push("Auditoria DOCX");
  }
  if (flags.useRedatorContestacaoTool) {
    out.push("Contestação DOCX");
  }
  if (flags.useMasterDocumentsTool) {
    out.push("DOCX + XLSX");
  }
  if (flags.usePipelineTool) {
    out.push("Pipeline");
  }
  if (flags.useMemoryTools) {
    out.push("Memória");
  }
  if (flags.useApprovalTool) {
    out.push("HITL");
  }
  return out;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function groupModelsByProvider(
  models: typeof chatModels
): Record<string, typeof chatModels> {
  return models.reduce(
    (acc, m) => {
      if (!acc[m.provider]) {
        acc[m.provider] = [];
      }
      acc[m.provider].push(m);
      return acc;
    },
    {} as Record<string, typeof chatModels>
  );
}

async function fetchAgentsWithKey(url: string, adminKey: string) {
  const res = await fetch(url, { headers: { "x-admin-key": adminKey } });
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

async function patchAgent(
  agentId: string,
  adminKey: string,
  payload: Record<string, unknown>
): Promise<void> {
  const res = await fetch(`/api/admin/agents/${agentId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", "x-admin-key": adminKey },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error ?? "Falha ao guardar");
  }
}

// ---------------------------------------------------------------------------
// Sub-component: CapabilityFlag
// ---------------------------------------------------------------------------

interface CapabilityFlagProps {
  def: FlagDef;
  checked: boolean;
  codeDefault: boolean;
  onChange: (value: boolean) => void;
  onReset: () => void;
}

function CapabilityFlag({
  def,
  checked,
  codeDefault,
  onChange,
  onReset,
}: CapabilityFlagProps) {
  const isChanged = checked !== codeDefault;

  return (
    <div
      className={cn(
        "rounded-lg border p-3 transition-colors",
        isChanged ? "border-primary/50 bg-primary/5" : "border-border"
      )}
    >
      <div className="flex items-start gap-3">
        <Checkbox
          checked={checked}
          className="mt-0.5"
          id={`flag-${def.key}`}
          onCheckedChange={(v) => onChange(v === true)}
        />
        <label className="flex-1 cursor-pointer" htmlFor={`flag-${def.key}`}>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-medium text-sm">{def.label}</span>
            {def.outputBadge && (
              <Badge className="text-xs" variant="outline">
                {def.outputBadge}
              </Badge>
            )}
            {isChanged && (
              <span className="rounded bg-primary/15 px-1.5 font-medium text-primary text-xs">
                Alterado
              </span>
            )}
          </div>
          <p className="mt-0.5 text-muted-foreground text-xs">
            {def.description}
          </p>
          {/* Hint de dependência — só mostra quando a flag está activa */}
          {def.hint && checked && (
            <p className="mt-1 text-amber-600 text-xs dark:text-amber-400">
              ⚠ {def.hint}
            </p>
          )}
        </label>
        {/* Reset individual — só mostra quando foi alterado */}
        {isChanged && (
          <button
            aria-label={`Repor ${def.label} ao default do código (${codeDefault ? "activo" : "inactivo"})`}
            className="mt-0.5 rounded p-1 text-muted-foreground opacity-70 transition-opacity hover:text-foreground hover:opacity-100"
            onClick={onReset}
            title={`Repor ao código: ${codeDefault ? "✓ activo" : "✗ inactivo"}`}
            type="button"
          >
            <RotateCcwIcon className="size-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

const DEFAULT_FLAGS: AgentToolFlags = {
  useRevisorDefesaTools: false,
  useRedatorContestacaoTool: false,
  useMemoryTools: true,
  useApprovalTool: false,
  usePipelineTool: false,
  useMasterDocumentsTool: false,
};

export default function AdminAgentsPage() {
  const [adminKey, setAdminKey] = useState("");
  const [keyInput, setKeyInput] = useState("");
  const [editingAgent, setEditingAgent] = useState<BuiltInAgentItem | null>(
    null
  );
  const [formLabel, setFormLabel] = useState("");
  const [formInstructions, setFormInstructions] = useState("");
  const [formModelId, setFormModelId] = useState<string>("");
  const [formToolFlags, setFormToolFlags] =
    useState<AgentToolFlags>(DEFAULT_FLAGS);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
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
    setFormModelId(agent.defaultModelId ?? "");
    setFormToolFlags({ ...agent.toolFlags });
  }, []);

  const closeEdit = useCallback(() => {
    setEditingAgent(null);
  }, []);

  const toggleFlag = useCallback(
    (key: keyof AgentToolFlags, value: boolean) => {
      setFormToolFlags((prev) => ({ ...prev, [key]: value }));
    },
    []
  );

  const resetSingleFlag = useCallback(
    (key: keyof AgentToolFlags) => {
      if (!editingAgent) {
        return;
      }
      setFormToolFlags((prev) => ({
        ...prev,
        [key]: editingAgent.codeToolFlags[key],
      }));
    },
    [editingAgent]
  );

  const saveEdit = useCallback(async () => {
    if (!(editingAgent && adminKey)) {
      return;
    }
    setSaving(true);
    try {
      await patchAgent(editingAgent.id, adminKey, {
        label: formLabel.trim() || "",
        instructions: formInstructions,
        defaultModelId: formModelId || "",
        toolFlags: formToolFlags,
      });
      toast.success("Agente atualizado.");
      await mutate();
      closeEdit();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao guardar");
    } finally {
      setSaving(false);
    }
  }, [
    adminKey,
    closeEdit,
    editingAgent,
    formInstructions,
    formLabel,
    formModelId,
    formToolFlags,
    mutate,
  ]);

  const resetToCodeDefaults = useCallback(async () => {
    if (!(editingAgent && adminKey)) {
      return;
    }
    setResetting(true);
    try {
      await patchAgent(editingAgent.id, adminKey, {
        label: "",
        instructions: "",
        defaultModelId: "",
        toolFlags: null,
      });
      toast.success("Defaults do código restaurados.");
      await mutate();
      closeEdit();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao repor");
    } finally {
      setResetting(false);
    }
  }, [adminKey, closeEdit, editingAgent, mutate]);

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
        toast.error(
          "error" in data && typeof data.error === "string"
            ? data.error
            : "Não foi possível melhorar o prompt."
        );
        return;
      }
      if ("improvedPrompt" in data && typeof data.improvedPrompt === "string") {
        setFormInstructions(data.improvedPrompt);
        toast.success("Instruções melhoradas. Reveja e guarde quando quiser.", {
          description: buildImproveToastDescription(data),
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

  // Conflitos activos com base nos flags do formulário
  const activeConflicts = useMemo(
    () =>
      CONFLICT_RULES.filter(({ flags }) =>
        flags.every((f) => formToolFlags[f])
      ),
    [formToolFlags]
  );

  // Badges de resumo dos outputs activos
  const outputBadges = useMemo(
    () => getOutputBadges(formToolFlags),
    [formToolFlags]
  );

  // Modelos filtrados e agrupados para este agente
  const allowedModels =
    editingAgent?.allowedModelIds != null
      ? chatModels.filter(
          (m) => editingAgent.allowedModelIds?.includes(m.id) ?? false
        )
      : chatModels;
  const modelsByProvider = groupModelsByProvider(allowedModels);

  const codeDefaultModelName =
    editingAgent != null
      ? (chatModels.find((m) => m.id === editingAgent.codeDefaultModelId)
          ?.name ?? editingAgent.codeDefaultModelId)
      : "";

  if (!adminKey) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 p-6">
        <h1 className="font-semibold text-xl">Painel de agentes built-in</h1>
        <p className="text-center text-muted-foreground text-sm">
          Introduza a chave de administrador para editar os agentes.
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
          Configure modelo padrão, capacidades e instruções. As alterações
          aplicam-se a todos os utilizadores imediatamente.
        </p>
      </div>

      {agentsError && (
        <div
          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-destructive"
          role="alert"
        >
          <p className="text-sm">
            {isUnauthorized
              ? "Chave de administrador inválida. Verifique as configurações do servidor."
              : agentsError.message}
          </p>
          <Button onClick={resetKey} type="button" variant="outline">
            Introduzir outra chave
          </Button>
        </div>
      )}

      {agentsLoading && agents.length === 0 && (
        <p className="text-muted-foreground text-sm">A carregar agentes…</p>
      )}

      <ul className="flex flex-col gap-2">
        {agents.map((agent) => (
          <li
            className={cn(
              "flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card p-4",
              agent.hasOverride && "border-primary/40"
            )}
            key={agent.id}
          >
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{agent.label}</span>
                {agent.hasOverride && (
                  <span className="rounded bg-primary/15 px-1.5 font-medium text-primary text-xs">
                    Editado
                  </span>
                )}
                {getOutputBadges(agent.toolFlags).map((b) => (
                  <Badge className="text-xs" key={b} variant="secondary">
                    {b}
                  </Badge>
                ))}
              </div>
              <p className="mt-0.5 text-muted-foreground text-xs">
                {agent.id}
                {agent.defaultModelId && (
                  <span className="ml-2 font-medium text-primary/80">
                    ·{" "}
                    {chatModels.find((m) => m.id === agent.defaultModelId)
                      ?.name ?? agent.defaultModelId.split("/").pop()}
                  </span>
                )}
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

      {/* ── Dialog de edição ── */}
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
              Campos em branco restauram o valor do código. Use ↺ para repor uma
              capacidade individualmente.
            </DialogDescription>
          </DialogHeader>

          {editingAgent && (
            <ScrollArea className="flex-1 pr-1">
              <div className="grid gap-5 pb-2">
                {/* ── Nome exibido ── */}
                <div className="grid gap-2">
                  <Label htmlFor="edit-agent-label">Nome exibido</Label>
                  <Input
                    id="edit-agent-label"
                    maxLength={256}
                    onChange={(e) => setFormLabel(e.target.value)}
                    placeholder={`Default: ${editingAgent.label}`}
                    value={formLabel}
                  />
                </div>

                <Separator />

                {/* ── Modelo padrão ── */}
                <div className="grid gap-2">
                  <Label htmlFor="edit-agent-model">Modelo padrão</Label>
                  <Select onValueChange={setFormModelId} value={formModelId}>
                    <SelectTrigger id="edit-agent-model">
                      <SelectValue
                        placeholder={`Default do código: ${codeDefaultModelName}`}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">
                        Default do código ({codeDefaultModelName})
                      </SelectItem>
                      {Object.entries(modelsByProvider).map(
                        ([provider, models]) => (
                          <SelectGroup key={provider}>
                            <SelectLabel className="capitalize">
                              {provider}
                            </SelectLabel>
                            {models.map((m) => (
                              <SelectItem key={m.id} value={m.id}>
                                {m.name}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        )
                      )}
                    </SelectContent>
                  </Select>
                  {editingAgent.allowedModelIds != null && (
                    <p className="text-amber-600 text-xs dark:text-amber-400">
                      ⚠ Este agente só suporta {allowedModels.length} modelo(s)
                      — outros são rejeitados em runtime.
                    </p>
                  )}
                </div>

                <Separator />

                {/* ── Capacidades & Outputs ── */}
                <div className="grid gap-4">
                  <div className="flex items-center justify-between">
                    <Label>Capacidades &amp; Outputs</Label>
                  </div>

                  {/* Painel de resumo dos outputs activos */}
                  <div className="flex flex-wrap items-center gap-1.5 rounded-lg bg-muted/50 px-3 py-2">
                    <span className="text-muted-foreground text-xs">
                      Outputs activos:
                    </span>
                    {outputBadges.length === 0 ? (
                      <span className="text-muted-foreground text-xs italic">
                        nenhum
                      </span>
                    ) : (
                      outputBadges.map((b) => (
                        <Badge className="text-xs" key={b} variant="secondary">
                          {b}
                        </Badge>
                      ))
                    )}
                  </div>

                  {/* Avisos de conflito */}
                  {activeConflicts.map((c) => (
                    <div
                      className={cn(
                        "flex gap-2 rounded-lg border px-3 py-2 text-xs",
                        c.severity === "warning"
                          ? "border-amber-400/50 bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400"
                          : "border-blue-400/50 bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400"
                      )}
                      key={c.message}
                    >
                      <span>{c.severity === "warning" ? "⚠" : "ℹ"}</span>
                      <span>{c.message}</span>
                    </div>
                  ))}

                  {/* Grupos de flags */}
                  {FLAG_GROUPS.map((group) => (
                    <div className="grid gap-2" key={group.label}>
                      <p className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
                        {group.label}
                      </p>
                      {group.keys.map((key) => (
                        <CapabilityFlag
                          checked={formToolFlags[key]}
                          codeDefault={editingAgent.codeToolFlags[key]}
                          def={FLAG_DEFS[key]}
                          key={key}
                          onChange={(v) => toggleFlag(key, v)}
                          onReset={() => resetSingleFlag(key)}
                        />
                      ))}
                    </div>
                  ))}
                </div>

                <Separator />

                {/* ── Instruções ── */}
                <div className="grid gap-2">
                  <div className="flex items-center justify-between gap-2">
                    <Label htmlFor="edit-agent-instructions">Instruções</Label>
                    <Button
                      aria-label="Melhorar instruções com IA"
                      disabled={
                        isImprovingPrompt ||
                        formInstructions.trim().length === 0
                      }
                      onClick={improvePrompt}
                      size="sm"
                      type="button"
                      variant="secondary"
                    >
                      {isImprovingPrompt ? (
                        <LoaderIcon
                          aria-hidden
                          className="size-4 animate-spin"
                        />
                      ) : (
                        <WandIcon aria-hidden className="size-4" />
                      )}
                      <span className="ml-1.5">
                        {isImprovingPrompt ? "A melhorar…" : "Melhorar prompt"}
                      </span>
                    </Button>
                  </div>
                  <div className="rounded-md border border-input">
                    <Textarea
                      className="min-h-[200px] resize-none border-0 focus-visible:ring-0"
                      id="edit-agent-instructions"
                      maxLength={50_000}
                      onChange={(e) => setFormInstructions(e.target.value)}
                      placeholder="Instruções do sistema… Deixe em branco para usar as do código."
                      value={formInstructions}
                    />
                  </div>
                  {formInstructions.trim().length === 0 && (
                    <p className="text-amber-600 text-xs dark:text-amber-400">
                      ⚠ Campo em branco — ao guardar, restaura as instruções do
                      código.
                    </p>
                  )}
                </div>
              </div>
            </ScrollArea>
          )}

          <DialogFooter className="flex-wrap gap-2 sm:justify-between">
            <Button
              disabled={resetting || saving || !editingAgent?.hasOverride}
              onClick={resetToCodeDefaults}
              size="sm"
              title={
                editingAgent?.hasOverride
                  ? "Repor todos os campos ao valor do código"
                  : "Não existe override activo para este agente"
              }
              type="button"
              variant="ghost"
            >
              {resetting ? (
                <LoaderIcon aria-hidden className="size-4 animate-spin" />
              ) : (
                <RotateCcwIcon aria-hidden className="size-4" />
              )}
              <span className="ml-1.5">
                {resetting ? "A repor…" : "Repor todos os defaults"}
              </span>
            </Button>
            <div className="flex gap-2">
              <Button onClick={closeEdit} type="button" variant="outline">
                Cancelar
              </Button>
              <Button
                disabled={saving || resetting}
                onClick={saveEdit}
                type="button"
              >
                {saving ? "A guardar…" : "Guardar"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
