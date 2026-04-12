import { useCallback, useState } from "react";
import { toast } from "sonner";
import useSWR from "swr";
import { MAX_KNOWLEDGE_SELECT } from "@/lib/attachments";
import { fetcher } from "@/lib/utils";
import type { CustomAgentRow } from "./manage-agents-sheet";

interface UseCustomAgentsOptions {
  /** ID do agente activo — para redireccionar ao apagar o agente em uso. */
  agentId?: string;
  /** Callback para alterar o agente seleccionado. */
  setAgentId?: (value: string) => void;
  /** Indica se o selector de agente está disponível (controla se SWR faz fetch). */
  enabled?: boolean;
}

export function useCustomAgents({
  agentId,
  setAgentId,
  enabled = true,
}: UseCustomAgentsOptions = {}) {
  const { data: customAgents = [], mutate: mutateCustomAgents } = useSWR<
    CustomAgentRow[]
  >(enabled ? "/api/agents/custom" : null, fetcher);

  const [manageAgentsOpen, setManageAgentsOpen] = useState(false);
  const [agentFormVisible, setAgentFormVisible] = useState(false);
  const [agentFormId, setAgentFormId] = useState<string | null>(null);
  const [agentFormName, setAgentFormName] = useState("");
  const [agentFormInstructions, setAgentFormInstructions] = useState("");
  const [agentFormBaseId, setAgentFormBaseId] = useState<string>("");
  const [agentFormKnowledgeIds, setAgentFormKnowledgeIds] = useState<string[]>(
    []
  );
  const [agentIdToDelete, setAgentIdToDelete] = useState<string | null>(null);

  const openManageAgents = useCallback(() => {
    setAgentFormVisible(false);
    setAgentFormId(null);
    setAgentFormName("");
    setAgentFormInstructions("");
    setAgentFormBaseId("");
    setManageAgentsOpen(true);
  }, []);

  const startCreateAgent = useCallback(() => {
    setAgentFormId(null);
    setAgentFormName("");
    setAgentFormInstructions("");
    setAgentFormBaseId("");
    setAgentFormKnowledgeIds([]);
    setAgentFormVisible(true);
  }, []);

  const startEditAgent = useCallback((agent: CustomAgentRow) => {
    setAgentFormId(agent.id);
    setAgentFormName(agent.name);
    setAgentFormInstructions(agent.instructions);
    setAgentFormBaseId(agent.baseAgentId ?? "");
    setAgentFormKnowledgeIds(
      Array.isArray(agent.knowledgeDocumentIds)
        ? agent.knowledgeDocumentIds
        : []
    );
    setAgentFormVisible(true);
    setManageAgentsOpen(true);
  }, []);

  const cancelAgentForm = useCallback(() => {
    setAgentFormId(null);
    setAgentFormName("");
    setAgentFormInstructions("");
    setAgentFormBaseId("");
    setAgentFormKnowledgeIds([]);
    setAgentFormVisible(false);
  }, []);

  const saveAgentForm = useCallback(async () => {
    const name = agentFormName.trim();
    const instructions = agentFormInstructions.trim();
    if (!(name && instructions)) {
      toast.error("Nome e instruções são obrigatórios.");
      return;
    }
    const baseAgentId =
      agentFormBaseId === "" || agentFormBaseId === "none"
        ? null
        : (agentFormBaseId as
            | "revisor-defesas"
            | "redator-contestacao"
            | "assistjur-master");
    const knowledgeIds = agentFormKnowledgeIds.slice(0, MAX_KNOWLEDGE_SELECT);
    try {
      if (agentFormId) {
        const res = await fetch(`/api/agents/custom/${agentFormId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            instructions,
            baseAgentId,
            knowledgeDocumentIds: knowledgeIds,
          }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(
            (data as { message?: string }).message ??
              "Erro ao atualizar agente."
          );
        }
        toast.success("Agente atualizado.");
      } else {
        const res = await fetch("/api/agents/custom", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            instructions,
            baseAgentId,
            knowledgeDocumentIds: knowledgeIds,
          }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(
            (data as { message?: string }).message ?? "Erro ao criar agente."
          );
        }
        toast.success("Agente criado.");
      }
      await mutateCustomAgents();
      cancelAgentForm();
      setAgentFormVisible(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao guardar.");
    }
  }, [
    agentFormId,
    agentFormName,
    agentFormBaseId,
    agentFormInstructions,
    agentFormKnowledgeIds,
    cancelAgentForm,
    mutateCustomAgents,
  ]);

  const performDeleteAgent = useCallback(
    async (id: string) => {
      try {
        const res = await fetch(`/api/agents/custom/${id}`, {
          method: "DELETE",
        });
        if (!res.ok) {
          throw new Error("Erro ao apagar.");
        }
        await mutateCustomAgents();
        if (setAgentId && agentId === id) {
          setAgentId("revisor-defesas");
        }
        toast.success("Agente apagado.");
        if (agentFormId === id) {
          cancelAgentForm();
        }
      } catch {
        toast.error("Erro ao apagar agente.");
      } finally {
        setAgentIdToDelete(null);
      }
    },
    [agentId, agentFormId, cancelAgentForm, mutateCustomAgents, setAgentId]
  );

  const openDeleteAgentDialog = useCallback((id: string) => {
    setAgentIdToDelete(id);
  }, []);

  return {
    customAgents,
    mutateCustomAgents,
    manageAgentsOpen,
    setManageAgentsOpen,
    agentFormVisible,
    setAgentFormVisible,
    agentFormId,
    agentFormName,
    setAgentFormName,
    agentFormInstructions,
    setAgentFormInstructions,
    agentFormBaseId,
    setAgentFormBaseId,
    agentFormKnowledgeIds,
    setAgentFormKnowledgeIds,
    agentIdToDelete,
    setAgentIdToDelete,
    openManageAgents,
    startCreateAgent,
    startEditAgent,
    cancelAgentForm,
    saveAgentForm,
    performDeleteAgent,
    openDeleteAgentDialog,
  };
}
