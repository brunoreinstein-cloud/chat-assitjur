"use client";

import { useRouter } from "next/navigation";
import { ExternalLink, Loader2, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  AGENT_ID_ASSISTJUR_MASTER,
  AGENT_ID_AUTUORIA_REVISOR,
  AGENT_ID_REVISOR_DEFESAS,
} from "@/lib/ai/agents-registry-metadata";
import { RevisorDefesaDocumentsResult } from "@/components/revisor-defesa-documents-result";
import type { RevisorDefesaDocumentsOutput } from "@/components/revisor-defesa-documents-result";
import { AutuoriaDocumentsResult } from "@/components/autuoria-documents-result";
import type { AutuoriaDocumentsOutput } from "@/components/autuoria-documents-result";
import { MasterDocumentsResult } from "@/components/master-documents-result";
import type { MasterDocumentsOutput } from "@/components/master-documents-result";
import type { ChatMessage } from "@/lib/types";

interface RunnerExecutionPhaseProps {
  agentId: string;
  chatId: string;
  messages: ChatMessage[];
  status: string;
  onReset: () => void;
}

/**
 * Extracts tool output from assistant message parts matching a tool type prefix.
 * The AI SDK v5 puts tool parts with type "tool-{toolName}" and output directly on the part.
 */
function extractToolOutput(
  messages: ChatMessage[],
  toolTypePrefix: string
): Record<string, unknown> | undefined {
  for (const msg of messages) {
    if (msg.role !== "assistant") continue;
    for (const part of msg.parts) {
      if (
        typeof part.type === "string" &&
        part.type.startsWith(toolTypePrefix) &&
        "output" in part &&
        part.output != null
      ) {
        return part.output as Record<string, unknown>;
      }
    }
  }
  return undefined;
}

export function RunnerExecutionPhase({
  agentId,
  chatId,
  messages,
  status,
  onReset,
}: RunnerExecutionPhaseProps) {
  const router = useRouter();
  const isStreaming = status === "streaming" || status === "submitted";
  const isDone = status === "ready" && messages.length > 1;
  const isError = status === "error";

  const revisorOutput = extractToolOutput(
    messages,
    "tool-createRevisorDefesa"
  );
  const autuoriaOutput = extractToolOutput(
    messages,
    "tool-createAutuoria"
  );
  const masterOutput = extractToolOutput(
    messages,
    "tool-createMaster"
  );

  return (
    <div className="flex w-full flex-col gap-6">
      {/* Status header */}
      <div className="flex items-center gap-3">
        {isStreaming && (
          <>
            <Loader2 className="size-5 animate-spin text-primary" />
            <span className="text-sm font-medium">A executar…</span>
          </>
        )}
        {isDone && (
          <span className="text-sm font-medium text-green-600 dark:text-green-400">
            Execução concluída
          </span>
        )}
        {isError && (
          <span className="text-sm font-medium text-red-500">
            Erro na execução
          </span>
        )}
      </div>

      {/* Result component — DataStreamHandler populates progress stores,
          so these show real-time progress during streaming */}
      <div className="min-h-[200px]">
        {agentId === AGENT_ID_REVISOR_DEFESAS && (
          <RevisorDefesaDocumentsResult
            output={revisorOutput as RevisorDefesaDocumentsOutput | undefined}
            isReadonly={false}
          />
        )}
        {agentId === AGENT_ID_AUTUORIA_REVISOR && (
          <AutuoriaDocumentsResult
            output={autuoriaOutput as AutuoriaDocumentsOutput | undefined}
            isReadonly={false}
          />
        )}
        {agentId === AGENT_ID_ASSISTJUR_MASTER && (
          <MasterDocumentsResult
            output={masterOutput as MasterDocumentsOutput | undefined}
            isReadonly={false}
          />
        )}
      </div>

      {/* Actions — only shown when complete */}
      {(isDone || isError) && (
        <div className="flex flex-wrap gap-3">
          <Button
            variant="outline"
            onClick={() => router.push(`/chat/${chatId}`)}
            className="gap-2"
          >
            <ExternalLink className="size-4" />
            Abrir no chat
          </Button>
          <Button variant="outline" onClick={onReset} className="gap-2">
            <RefreshCw className="size-4" />
            Nova execução
          </Button>
        </div>
      )}
    </div>
  );
}
