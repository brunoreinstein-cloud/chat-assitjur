"use client";

import { CheckIcon } from "lucide-react";
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
} from "@/lib/ai/agents-registry";
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

  const modelsForAgent = getModelsForAgent(agentId);
  const modelsByProviderFiltered = getModelsByProviderForAgent(agentId);
  const selectedModel =
    modelsForAgent.find((m) => m.id === selectedModelId) ??
    modelsForAgent.find((m) => m.id === DEFAULT_CHAT_MODEL) ??
    modelsForAgent[0] ??
    chatModels[0];
  const [provider] = selectedModel.id.split("/");

  let effectiveAgentId = "revisor-defesas";
  if (AGENT_IDS.includes(agentId as AgentId)) {
    effectiveAgentId = agentId;
  } else if (customAgents.some((a) => a.id === agentId)) {
    effectiveAgentId = agentId;
  }

  return (
    <section
      aria-label="Agente e modelo do chat"
      className="flex flex-wrap items-center gap-2 border-border/50 border-b bg-muted/20 px-3 py-2"
    >
      {setAgentId ? (
        <Select onValueChange={setAgentId} value={effectiveAgentId}>
          <SelectTrigger
            aria-label="Selecionar agente"
            className="h-8 w-auto min-w-[140px] border-border/60 bg-background shadow-none md:min-w-[160px]"
          >
            <SelectValue placeholder="Agente" />
          </SelectTrigger>
          <SelectContent>
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
        <span className="font-medium text-sm">
          {getAgentConfig(effectiveAgentId as AgentId).label}
        </span>
      )}

      <span aria-hidden className="text-muted-foreground/60 text-sm">
        |
      </span>

      {onModelChange ? (
        <ModelSelector onOpenChange={setModelOpen} open={modelOpen}>
          <ModelSelectorTrigger asChild>
            <Button
              className="h-8 min-w-[140px] justify-between px-2 md:min-w-[180px]"
              variant="ghost"
            >
              {provider && <ModelSelectorLogo provider={provider} />}
              <ModelSelectorName>{selectedModel.name}</ModelSelectorName>
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
    </section>
  );
}

export const ChatComposerHeader = memo(PureChatComposerHeader);
