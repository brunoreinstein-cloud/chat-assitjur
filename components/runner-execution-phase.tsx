"use client";

import {
  CheckCircle2,
  Database,
  ExternalLink,
  FileText,
  Loader2,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { AutuoriaDocumentsOutput } from "@/components/autuoria-documents-result";
import { AutuoriaDocumentsResult } from "@/components/autuoria-documents-result";
import type { MasterDocumentsOutput } from "@/components/master-documents-result";
import { MasterDocumentsResult } from "@/components/master-documents-result";
import type { RevisorDefesaDocumentsOutput } from "@/components/revisor-defesa-documents-result";
import { RevisorDefesaDocumentsResult } from "@/components/revisor-defesa-documents-result";
import { Button } from "@/components/ui/button";
import {
  AGENT_ID_ASSISTJUR_MASTER,
  AGENT_ID_AUTUORIA_REVISOR,
  AGENT_ID_REVISOR_DEFESAS,
} from "@/lib/ai/agents-registry-metadata";
import type { ChatMessage } from "@/lib/types";
import { cn } from "@/lib/utils";

interface RunnerExecutionPhaseProps {
  agentId: string;
  chatId: string;
  messages: ChatMessage[];
  status: string;
  onReset: () => void;
}

type PipelineStage =
  | "connecting"
  | "loading-context"
  | "analyzing"
  | "generating"
  | "complete"
  | "error";

const STAGE_CONFIG: Record<
  PipelineStage,
  { icon: typeof Loader2; label: string; description: string }
> = {
  connecting: {
    icon: Database,
    label: "Conectando",
    description: "A preparar a ligação à base de dados…",
  },
  "loading-context": {
    icon: Database,
    label: "Carregando contexto",
    description: "A carregar histórico, créditos e configurações…",
  },
  analyzing: {
    icon: Sparkles,
    label: "Analisando documentos",
    description: "O modelo está a ler e cruzar os documentos…",
  },
  generating: {
    icon: FileText,
    label: "Gerando documentos",
    description: "A criar os ficheiros DOCX com os resultados…",
  },
  complete: {
    icon: CheckCircle2,
    label: "Concluído",
    description: "Execução concluída com sucesso.",
  },
  error: {
    icon: Loader2,
    label: "Erro",
    description: "Ocorreu um erro durante a execução.",
  },
};

/**
 * Extracts tool output from assistant message parts matching a tool type prefix.
 */
function extractToolOutput(
  messages: ChatMessage[],
  toolTypePrefix: string
): Record<string, unknown> | undefined {
  for (const msg of messages) {
    if (msg.role !== "assistant") {
      continue;
    }
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

function hasAssistantContent(messages: ChatMessage[]): boolean {
  return messages.some((m) => m.role === "assistant" && m.parts.length > 0);
}

function hasToolInvocation(messages: ChatMessage[]): boolean {
  return messages.some(
    (m) =>
      m.role === "assistant" &&
      m.parts.some(
        (p) => typeof p.type === "string" && p.type.startsWith("tool-")
      )
  );
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

  // Elapsed timer
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (isStreaming && !timerRef.current) {
      const start = Date.now();
      timerRef.current = setInterval(() => {
        setElapsed(Math.floor((Date.now() - start) / 1000));
      }, 1000);
    }
    if (!isStreaming && timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [isStreaming]);

  // Determine pipeline stage from messages + timing
  const stage: PipelineStage = (() => {
    if (isDone) {
      return "complete";
    }
    if (isError) {
      return "error";
    }
    if (hasToolInvocation(messages)) {
      return "generating";
    }
    if (hasAssistantContent(messages)) {
      return "analyzing";
    }
    if (elapsed > 5) {
      return "loading-context";
    }
    return "connecting";
  })();

  const stageConfig = STAGE_CONFIG[stage];
  const _StageIcon = stageConfig.icon;

  const revisorOutput = extractToolOutput(messages, "tool-createRevisorDefesa");
  const autuoriaOutput = extractToolOutput(messages, "tool-createAutuoria");
  const masterOutput = extractToolOutput(messages, "tool-createMaster");

  // Completed stages for the progress indicator
  const stages: PipelineStage[] = [
    "connecting",
    "loading-context",
    "analyzing",
    "generating",
  ];
  const stageIndex = stages.indexOf(stage);

  return (
    <div className="flex w-full flex-col gap-6">
      {/* Pipeline progress steps */}
      {isStreaming && (
        <div className="rounded-xl border border-border/60 bg-card p-5">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Loader2 className="size-4 animate-spin text-primary" />
              <span className="font-medium text-sm">{stageConfig.label}</span>
            </div>
            <span className="font-mono text-muted-foreground text-xs">
              {elapsed}s
            </span>
          </div>

          {/* Progress bar */}
          <div className="mb-4 h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all duration-700 ease-out"
              style={{
                width: `${Math.max(5, ((stageIndex + 1) / stages.length) * 100)}%`,
              }}
            />
          </div>

          {/* Stage steps */}
          <div className="flex flex-col gap-2">
            {stages.map((s, i) => {
              const conf = STAGE_CONFIG[s];
              const Icon = conf.icon;
              const isActive = s === stage;
              const isPast = i < stageIndex;
              return (
                <div
                  className={cn(
                    "flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs transition-colors",
                    isActive && "bg-primary/5 font-medium text-foreground",
                    isPast && "text-muted-foreground",
                    !(isActive || isPast) && "text-muted-foreground/50"
                  )}
                  key={s}
                >
                  {isPast ? (
                    <CheckCircle2 className="size-3.5 text-green-500" />
                  ) : isActive ? (
                    <Loader2 className="size-3.5 animate-spin text-primary" />
                  ) : (
                    <Icon className="size-3.5" />
                  )}
                  <span>{conf.label}</span>
                  {isActive && (
                    <span className="ml-auto text-muted-foreground">
                      {conf.description}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Completion header */}
      {isDone && (
        <div className="flex items-center gap-2">
          <CheckCircle2 className="size-5 text-green-500" />
          <span className="font-medium text-green-600 text-sm dark:text-green-400">
            Execução concluída em {elapsed}s
          </span>
        </div>
      )}
      {isError && (
        <div className="flex items-center gap-2">
          <span className="font-medium text-red-500 text-sm">
            Erro na execução
          </span>
        </div>
      )}

      {/* Result component */}
      <div className="min-h-[200px]">
        {agentId === AGENT_ID_REVISOR_DEFESAS && (
          <RevisorDefesaDocumentsResult
            isReadonly={false}
            output={revisorOutput as RevisorDefesaDocumentsOutput | undefined}
          />
        )}
        {agentId === AGENT_ID_AUTUORIA_REVISOR && (
          <AutuoriaDocumentsResult
            isReadonly={false}
            output={autuoriaOutput as AutuoriaDocumentsOutput | undefined}
          />
        )}
        {agentId === AGENT_ID_ASSISTJUR_MASTER && (
          <MasterDocumentsResult
            isReadonly={false}
            output={masterOutput as MasterDocumentsOutput | undefined}
          />
        )}
      </div>

      {/* Actions */}
      {(isDone || isError) && (
        <div className="flex flex-wrap gap-3">
          <Button
            className="gap-2"
            onClick={() => router.push(`/chat/${chatId}`)}
            variant="outline"
          >
            <ExternalLink className="size-4" />
            Abrir no chat
          </Button>
          <Button className="gap-2" onClick={onReset} variant="outline">
            <RefreshCw className="size-4" />
            Nova execução
          </Button>
        </div>
      )}
    </div>
  );
}
