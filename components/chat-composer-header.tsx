"use client";

import { CheckIcon, ChevronDownIcon, Settings2Icon } from "lucide-react";
import { memo, useState } from "react";
import useSWR from "swr";
import {
  ModelSelector,
  ModelSelectorContent,
  ModelSelectorGroup,
  ModelSelectorInput,
  ModelSelectorItem,
  ModelSelectorList,
  ModelSelectorLogo,
  ModelSelectorName,
  ModelSelectorTrigger,
} from "@/components/ai-elements/model-selector";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  getModelsByProviderForAgent,
  getModelsForAgent,
} from "@/lib/ai/agent-models";
import {
  AGENT_IDS,
  type AgentId,
  getAgentConfig,
  NO_AGENT_SELECTED,
} from "@/lib/ai/agents-registry-metadata";
import type { ChatModel } from "@/lib/ai/models";
import { chatModels, DEFAULT_CHAT_MODEL } from "@/lib/ai/models";
import { fetcher } from "@/lib/utils";

interface CustomAgentRow {
  id: string;
  name: string;
  instructions: string;
  baseAgentId: string | null;
  createdAt: string;
}

function setCookie(name: string, value: string) {
  const maxAge = 60 * 60 * 24 * 365;
  // biome-ignore lint/suspicious/noDocumentCookie: persist model preference
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${maxAge}`;
}

const providerNames: Record<string, string> = {
  anthropic: "Anthropic",
  openai: "OpenAI",
  google: "Google",
  xai: "xAI",
  reasoning: "Raciocínio",
};

function PureChatComposerHeader({
  agentId,
  setAgentId,
  selectedModelId,
  onModelChange,
}: Readonly<{
  agentId: string;
  setAgentId?: (value: string) => void;
  selectedModelId: string;
  onModelChange?: (modelId: string) => void;
}>) {
  const [modelOpen, setModelOpen] = useState(false);
  const { data: customAgents = [] } = useSWR<CustomAgentRow[]>(
    setAgentId ? "/api/agents/custom" : null,
    fetcher
  );

  const hasAgent = agentId && agentId !== NO_AGENT_SELECTED;
  const modelsForAgent = hasAgent
    ? getModelsForAgent(agentId)
    : [...chatModels];
  const modelsByProviderFiltered = hasAgent
    ? getModelsByProviderForAgent(agentId)
    : modelsForAgent.reduce(
        (acc, model) => {
          if (!acc[model.provider]) {
            acc[model.provider] = [];
          }
          acc[model.provider].push(model);
          return acc;
        },
        {} as Record<string, ChatModel[]>
      );
  const selectedModel =
    modelsForAgent.find((m) => m.id === selectedModelId) ??
    modelsForAgent.find((m) => m.id === DEFAULT_CHAT_MODEL) ??
    modelsForAgent[0] ??
    chatModels[0];

  const isBuiltIn = agentId && AGENT_IDS.includes(agentId as AgentId);
  const isCustom = agentId && customAgents.some((a) => a.id === agentId);
  const effectiveAgentId = isBuiltIn || isCustom ? agentId : NO_AGENT_SELECTED;

  return (
    <section
      aria-label="Configurações rápidas e agente do chat"
      className="flex flex-wrap items-center justify-between gap-2 border-border/50 border-b bg-muted/20 px-3 py-2"
    >
      <div className="flex items-center gap-2">
        {onModelChange ? (
          <ModelSelector onOpenChange={setModelOpen} open={modelOpen}>
            <ModelSelectorTrigger asChild>
              <Button
                className="h-8 gap-1.5 pr-2 pl-2 font-normal text-muted-foreground"
                data-testid="model-selector-trigger"
                variant="ghost"
              >
                <span className="max-w-[160px] truncate text-sm">
                  {selectedModel.name}
                </span>
                <ChevronDownIcon className="size-4 opacity-70" />
              </Button>
            </ModelSelectorTrigger>
            <ModelSelectorContent>
              <ModelSelectorInput placeholder="Buscar modelos…" />
              <ModelSelectorList>
                {Object.entries(modelsByProviderFiltered).map(
                  ([providerKey, providerModels]) => (
                    <ModelSelectorGroup
                      heading={providerNames[providerKey] ?? providerKey}
                      key={providerKey}
                    >
                      {providerModels.map((model) => {
                        const logoProvider = model.id.split("/")[0];
                        return (
                          <ModelSelectorItem
                            key={model.id}
                            onSelect={() => {
                              onModelChange(model.id);
                              setCookie("chat-model", model.id);
                              setModelOpen(false);
                            }}
                            value={model.id}
                          >
                            <ModelSelectorLogo provider={logoProvider} />
                            <ModelSelectorName>{model.name}</ModelSelectorName>
                            {model.id === selectedModel.id && (
                              <CheckIcon className="ml-auto size-4" />
                            )}
                          </ModelSelectorItem>
                        );
                      })}
                    </ModelSelectorGroup>
                  )
                )}
              </ModelSelectorList>
            </ModelSelectorContent>
          </ModelSelector>
        ) : (
          <span className="text-muted-foreground text-sm">
            {selectedModel.name}
          </span>
        )}
      </div>
      <div className="flex items-center gap-1.5">
        {setAgentId ? (
          <Select
            onValueChange={(v) => setAgentId(v === "none" ? "" : v)}
            value={effectiveAgentId || "none"}
          >
            <SelectTrigger
              aria-label="Selecionar agente"
              className="h-8 w-auto gap-1.5 border-0 bg-transparent shadow-none hover:bg-muted/50 md:min-w-[140px]"
            >
              <Settings2Icon className="size-4 shrink-0 text-muted-foreground" />
              <SelectValue placeholder="Agente" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Selecionar agente</SelectItem>
              {AGENT_IDS.map((id) => {
                const config = getAgentConfig(id);
                return (
                  <SelectItem key={id} value={id}>
                    {config.label}
                  </SelectItem>
                );
              })}
              {customAgents.length > 0 && (
                <>
                  <div className="border-t px-2 py-1.5 font-medium text-muted-foreground text-xs">
                    Meus agentes
                  </div>
                  {customAgents.map((agent) => (
                    <SelectItem key={agent.id} value={agent.id}>
                      {agent.name}
                    </SelectItem>
                  ))}
                </>
              )}
            </SelectContent>
          </Select>
        ) : (
          <span className="flex items-center gap-1.5 font-medium text-sm">
            <Settings2Icon className="size-4 text-muted-foreground" />
            {effectiveAgentId && effectiveAgentId !== NO_AGENT_SELECTED
              ? (customAgents.find((a) => a.id === effectiveAgentId)?.name ??
                getAgentConfig(effectiveAgentId).label)
              : "Selecionar agente"}
          </span>
        )}
      </div>
    </section>
  );
}

export const ChatComposerHeader = memo(PureChatComposerHeader);
