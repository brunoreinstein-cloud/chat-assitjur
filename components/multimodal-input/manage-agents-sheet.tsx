"use client";

import {
  LoaderIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
  WandIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { MAX_KNOWLEDGE_SELECT } from "@/lib/attachments";

export interface CustomAgentRow {
  id: string;
  name: string;
  instructions: string;
  baseAgentId: string | null;
  knowledgeDocumentIds?: string[];
  createdAt: string;
}

interface ManageAgentsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customAgents: CustomAgentRow[];
  agentFormVisible: boolean;
  agentFormId: string | null;
  agentFormName: string;
  setAgentFormName: (value: string) => void;
  agentFormInstructions: string;
  setAgentFormInstructions: (value: string) => void;
  agentFormBaseId: string;
  setAgentFormBaseId: (value: string) => void;
  agentFormKnowledgeIds: string[];
  setAgentFormKnowledgeIds: (
    value: string[] | ((prev: string[]) => string[])
  ) => void;
  knowledgeDocsForAgentForm: Array<{ id: string; title: string }>;
  isImproving: boolean;
  onImproveInstructions: (
    text: string,
    setResult: (value: string) => void
  ) => void;
  onSave: () => void;
  onCancel: () => void;
  onStartCreate: () => void;
  onStartEdit: (agent: CustomAgentRow) => void;
  onDeleteRequest: (id: string) => void;
  onOpenKnowledgeSidebar?: () => void;
  onRefreshKnowledge: () => void;
}

export function ManageAgentsSheet({
  open,
  onOpenChange,
  customAgents,
  agentFormVisible,
  agentFormId,
  agentFormName,
  setAgentFormName,
  agentFormInstructions,
  setAgentFormInstructions,
  agentFormBaseId,
  setAgentFormBaseId,
  agentFormKnowledgeIds,
  setAgentFormKnowledgeIds,
  knowledgeDocsForAgentForm,
  isImproving,
  onImproveInstructions,
  onSave,
  onCancel,
  onStartCreate,
  onStartEdit,
  onDeleteRequest,
  onOpenKnowledgeSidebar,
  onRefreshKnowledge,
}: Readonly<ManageAgentsSheetProps>) {
  return (
    <Sheet
      onOpenChange={(isOpen) => {
        onOpenChange(isOpen);
        if (!isOpen) {
          onCancel();
        }
      }}
      open={open}
    >
      <SheetContent
        className="flex w-full flex-col overflow-y-auto sm:max-w-lg"
        side="left"
      >
        <SheetHeader>
          <SheetTitle>Meus agentes</SheetTitle>
          <SheetDescription>
            Crie e edite agentes com instruções e base de conhecimento próprias.
            Pode abrir a base de conhecimento à direita para adicionar
            documentos enquanto preenche.
          </SheetDescription>
        </SheetHeader>
        {agentFormVisible ? (
          <AgentForm
            agentFormBaseId={agentFormBaseId}
            agentFormId={agentFormId}
            agentFormInstructions={agentFormInstructions}
            agentFormKnowledgeIds={agentFormKnowledgeIds}
            agentFormName={agentFormName}
            isImproving={isImproving}
            knowledgeDocsForAgentForm={knowledgeDocsForAgentForm}
            onCancel={onCancel}
            onImproveInstructions={onImproveInstructions}
            onOpenKnowledgeSidebar={onOpenKnowledgeSidebar}
            onRefreshKnowledge={onRefreshKnowledge}
            onSave={onSave}
            setAgentFormBaseId={setAgentFormBaseId}
            setAgentFormInstructions={setAgentFormInstructions}
            setAgentFormKnowledgeIds={setAgentFormKnowledgeIds}
            setAgentFormName={setAgentFormName}
          />
        ) : (
          <AgentList
            customAgents={customAgents}
            onDeleteRequest={onDeleteRequest}
            onStartCreate={onStartCreate}
            onStartEdit={onStartEdit}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

// ─── AgentList ────────────────────────────────────────────────────────────────

interface AgentListProps {
  customAgents: CustomAgentRow[];
  onStartCreate: () => void;
  onStartEdit: (agent: CustomAgentRow) => void;
  onDeleteRequest: (id: string) => void;
}

function AgentList({
  customAgents,
  onStartCreate,
  onStartEdit,
  onDeleteRequest,
}: Readonly<AgentListProps>) {
  return (
    <div className="grid gap-3">
      <ul className="divide-y divide-border">
        {customAgents.map((agent) => (
          <li
            className="flex items-center justify-between gap-2 py-2"
            key={agent.id}
          >
            <span className="min-w-0 truncate font-medium">{agent.name}</span>
            <div className="flex shrink-0 gap-1">
              <Button
                aria-label={`Editar ${agent.name}`}
                className="size-8 p-0"
                onClick={() => onStartEdit(agent)}
                type="button"
                variant="ghost"
              >
                <PencilIcon size={14} />
              </Button>
              <Button
                aria-label={`Apagar ${agent.name}`}
                className="size-8 p-0 text-destructive hover:text-destructive"
                onClick={() => onDeleteRequest(agent.id)}
                type="button"
                variant="ghost"
              >
                <Trash2Icon size={14} />
              </Button>
            </div>
          </li>
        ))}
      </ul>
      {customAgents.length === 0 && (
        <p className="text-muted-foreground text-sm">
          Ainda não tem agentes personalizados.
        </p>
      )}
      <Button
        className="w-full"
        onClick={onStartCreate}
        type="button"
        variant="outline"
      >
        <PlusIcon size={16} />
        Criar agente
      </Button>
    </div>
  );
}

// ─── AgentForm ────────────────────────────────────────────────────────────────

interface AgentFormProps {
  agentFormId: string | null;
  agentFormName: string;
  setAgentFormName: (value: string) => void;
  agentFormInstructions: string;
  setAgentFormInstructions: (value: string) => void;
  agentFormBaseId: string;
  setAgentFormBaseId: (value: string) => void;
  agentFormKnowledgeIds: string[];
  setAgentFormKnowledgeIds: (
    value: string[] | ((prev: string[]) => string[])
  ) => void;
  knowledgeDocsForAgentForm: Array<{ id: string; title: string }>;
  isImproving: boolean;
  onImproveInstructions: (
    text: string,
    setResult: (value: string) => void
  ) => void;
  onSave: () => void;
  onCancel: () => void;
  onOpenKnowledgeSidebar?: () => void;
  onRefreshKnowledge: () => void;
}

function AgentForm({
  agentFormId,
  agentFormName,
  setAgentFormName,
  agentFormInstructions,
  setAgentFormInstructions,
  agentFormBaseId,
  setAgentFormBaseId,
  agentFormKnowledgeIds,
  setAgentFormKnowledgeIds,
  knowledgeDocsForAgentForm,
  isImproving,
  onImproveInstructions,
  onSave,
  onCancel,
  onOpenKnowledgeSidebar,
  onRefreshKnowledge,
}: Readonly<AgentFormProps>) {
  return (
    <div className="grid gap-3">
      <div className="grid gap-2">
        <Label htmlFor="custom-agent-name">Nome</Label>
        <Input
          id="custom-agent-name"
          maxLength={256}
          onChange={(e) => setAgentFormName(e.target.value)}
          placeholder="Ex.: Due diligence contratos"
          value={agentFormName}
        />
      </div>
      <div className="grid gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Label htmlFor="custom-agent-instructions">Instruções</Label>
          <Button
            aria-label="Melhorar instruções com IA"
            disabled={isImproving}
            onClick={() =>
              onImproveInstructions(
                agentFormInstructions,
                setAgentFormInstructions
              )
            }
            size="sm"
            type="button"
            variant="outline"
          >
            {isImproving ? (
              <LoaderIcon aria-hidden className="size-4 animate-spin" />
            ) : (
              <WandIcon aria-hidden className="size-4" />
            )}
            {isImproving ? "A melhorar…" : "Melhorar prompt"}
          </Button>
        </div>
        <Textarea
          className="min-h-[120px]"
          id="custom-agent-instructions"
          maxLength={30_000}
          onChange={(e) => setAgentFormInstructions(e.target.value)}
          placeholder="Descreva o papel, tom e regras do agente…"
          value={agentFormInstructions}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="custom-agent-base">Agente base (ferramentas)</Label>
        <Select
          onValueChange={setAgentFormBaseId}
          value={agentFormBaseId || "none"}
        >
          <SelectTrigger id="custom-agent-base">
            <SelectValue placeholder="Nenhum" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Nenhum</SelectItem>
            <SelectItem value="revisor-defesas">Revisor de Defesas</SelectItem>
            <SelectItem value="redator-contestacao">
              Redator de Contestações
            </SelectItem>
            <SelectItem value="assistjur-master">
              AssistJur.IA Master
            </SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-2">
        <Label id="custom-agent-knowledge-label">Base de conhecimento</Label>
        <p className="text-muted-foreground text-xs">
          Documentos incluídos por defeito ao usar este agente no chat (máx.{" "}
          {MAX_KNOWLEDGE_SELECT}).
        </p>
        <fieldset
          aria-labelledby="custom-agent-knowledge-label"
          className="max-h-[180px] overflow-y-auto rounded-md border border-border bg-muted/20 p-2"
        >
          {knowledgeDocsForAgentForm.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-3 text-center">
              <p className="text-muted-foreground text-sm">
                Ainda não tem documentos na base de conhecimento.
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                {onOpenKnowledgeSidebar && (
                  <Button
                    onClick={onOpenKnowledgeSidebar}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    Abrir base de conhecimento
                  </Button>
                )}
                <Button
                  onClick={onRefreshKnowledge}
                  size="sm"
                  type="button"
                  variant="ghost"
                >
                  Atualizar lista
                </Button>
              </div>
              <p className="text-muted-foreground text-xs">
                Use «Abrir base de conhecimento» para abrir a barra lateral à
                direita; adicione documentos e depois «Atualizar lista» aqui.
              </p>
            </div>
          ) : (
            <ul className="flex flex-col gap-1">
              {knowledgeDocsForAgentForm.map((doc) => {
                const isSelected = agentFormKnowledgeIds.includes(doc.id);
                const disabled =
                  !isSelected &&
                  agentFormKnowledgeIds.length >= MAX_KNOWLEDGE_SELECT;
                const handleToggle = () => {
                  setAgentFormKnowledgeIds((prev) => {
                    if (isSelected) {
                      return prev.filter((id) => id !== doc.id);
                    }
                    if (prev.length >= MAX_KNOWLEDGE_SELECT) {
                      return prev;
                    }
                    return [...prev, doc.id];
                  });
                };
                return (
                  <li key={doc.id}>
                    <label className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted/50 has-disabled:cursor-not-allowed has-disabled:opacity-60">
                      <input
                        checked={isSelected}
                        className="size-4 rounded border-input"
                        disabled={disabled}
                        onChange={handleToggle}
                        type="checkbox"
                      />
                      <span className="min-w-0 truncate">
                        {doc.title || doc.id}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </fieldset>
        {agentFormKnowledgeIds.length > 0 && (
          <span className="text-muted-foreground text-xs">
            {agentFormKnowledgeIds.length}/{MAX_KNOWLEDGE_SELECT} selecionados
          </span>
        )}
      </div>
      <div className="flex justify-end gap-2">
        <Button onClick={onCancel} type="button" variant="outline">
          Cancelar
        </Button>
        <Button onClick={onSave} type="button">
          {agentFormId ? "Guardar" : "Criar"}
        </Button>
      </div>
    </div>
  );
}
