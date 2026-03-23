"use client";

import type { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import {
  getDefaultModelForAgent,
  isModelAllowedForAgent,
} from "@/lib/ai/agent-models";
import {
  AGENT_IDS,
  type AgentId,
  DEFAULT_AGENT_ID_WHEN_EMPTY,
} from "@/lib/ai/agents-registry-metadata";

const MAX_KNOWLEDGE_SELECT = 50;

export function useSyncAgentToUrl(
  agentId: string,
  pathname: string,
  router: ReturnType<typeof useRouter>
) {
  useEffect(() => {
    if (pathname !== "/chat" || globalThis.window === undefined) {
      return;
    }
    const expectedSearch = agentId
      ? `?agent=${encodeURIComponent(agentId)}`
      : "";
    if (globalThis.window.location.search !== expectedSearch) {
      router.replace(`/chat${expectedSearch}`);
    }
  }, [agentId, pathname, router]);
}

export function useCustomAgentKnowledgeSync(
  agentId: string,
  setKnowledgeDocumentIds: React.Dispatch<React.SetStateAction<string[]>>
) {
  useEffect(() => {
    if (!agentId || AGENT_IDS.includes(agentId as AgentId)) {
      return;
    }
    fetch(`/api/agents/custom/${agentId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((agent: { knowledgeDocumentIds?: string[] } | null) => {
        const ids =
          agent?.knowledgeDocumentIds?.slice(0, MAX_KNOWLEDGE_SELECT) ?? [];
        setKnowledgeDocumentIds(ids);
      })
      .catch(() => {
        // Ignore fetch errors (e.g. no agent config)
      });
  }, [agentId, setKnowledgeDocumentIds]);
}

export function useAgentModelSync(
  agentId: string,
  currentModelId: string,
  setCurrentModelId: React.Dispatch<React.SetStateAction<string>>
) {
  useEffect(() => {
    const effectiveAgentId = agentId?.trim() || DEFAULT_AGENT_ID_WHEN_EMPTY;
    if (!isModelAllowedForAgent(effectiveAgentId, currentModelId)) {
      setCurrentModelId(getDefaultModelForAgent(effectiveAgentId));
    }
  }, [agentId, currentModelId, setCurrentModelId]);
}

export function useKnowledgeOpenFromSearchParams(
  searchParams: ReturnType<typeof useSearchParams>,
  setKnowledgeOpen: React.Dispatch<React.SetStateAction<boolean>>
) {
  useEffect(() => {
    if (searchParams.get("knowledge") === "open") {
      setKnowledgeOpen(true);
    }
  }, [searchParams, setKnowledgeOpen]);
}

export function useAppendQueryFromSearchParams(
  query: string | null,
  sendMessage: (msg: {
    role: "user";
    parts: [{ type: "text"; text: string }];
  }) => void,
  chatId: string
) {
  const [hasAppendedQuery, setHasAppendedQuery] = useState(false);
  useEffect(() => {
    if (query === null || query === "" || hasAppendedQuery) {
      return;
    }
    sendMessage({
      role: "user" as const,
      parts: [{ type: "text", text: query }],
    });
    setHasAppendedQuery(true);
    globalThis.window.history.replaceState({}, "", `/chat/${chatId}`);
  }, [query, sendMessage, hasAppendedQuery, chatId]);
}
