"use client";

import { CheckIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  GATE_05_RESUMO_END,
  GATE_05_RESUMO_START,
} from "@/lib/ai/agent-revisor-defesas";
import type { ChatMessage } from "@/lib/types";

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function getAssistantMessageText(message: ChatMessage): string {
  if (message.role !== "assistant" || !message.parts) {
    return "";
  }
  return message.parts
    .map((p) => {
      const part = p as { type?: string; text?: string };
      return part.type === "text" && typeof part.text === "string"
        ? part.text
        : "";
    })
    .join("");
}

export function getUserMessageText(message: ChatMessage): string {
  if (message.role !== "user" || !message.parts) {
    return "";
  }
  const textPart = message.parts.find(
    (p) => (p as { type?: string }).type === "text"
  ) as { text?: string } | undefined;
  return typeof textPart?.text === "string" ? textPart.text.trim() : "";
}

export function findLastAssistantIndexWithGate05(
  messages: ChatMessage[]
): number {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "assistant") {
      const text = getAssistantMessageText(messages[i]);
      if (
        text.includes(GATE_05_RESUMO_START) &&
        text.includes(GATE_05_RESUMO_END)
      ) {
        return i;
      }
    }
  }
  return -1;
}

// ─── Stepper ──────────────────────────────────────────────────────────────────

const STEPS = [
  { label: "Fase A", description: "Extração" },
  { label: "Gate 0.5", description: "Confirmação" },
  { label: "Fase B", description: "Documentos" },
  { label: "Concluído", description: "" },
] as const;

type StepIndex = 0 | 1 | 2 | 3;

function WorkflowStepper({ activeStep }: { readonly activeStep: StepIndex }) {
  return (
    <div className="flex w-full items-center justify-center gap-0">
      {STEPS.map((step, i) => {
        const isDone = i < activeStep;
        const isActive = i === activeStep;
        return (
          <div className="flex items-center" key={step.label}>
            {/* Step node */}
            <div className="flex flex-col items-center gap-0.5">
              <div
                className={[
                  "flex size-6 items-center justify-center rounded-full font-semibold text-[11px] transition-all",
                  isDone
                    ? "bg-green-500 text-white"
                    : isActive
                      ? "bg-primary text-primary-foreground ring-2 ring-primary/30"
                      : "border-2 border-muted-foreground/40 text-muted-foreground/50",
                ].join(" ")}
              >
                {isDone ? (
                  <CheckIcon className="size-3" />
                ) : (
                  <span>{i + 1}</span>
                )}
              </div>
              <span
                className={[
                  "whitespace-nowrap font-medium text-[10px]",
                  isActive
                    ? "text-primary"
                    : isDone
                      ? "text-green-600 dark:text-green-400"
                      : "text-muted-foreground/50",
                ].join(" ")}
              >
                {step.label}
              </span>
            </div>
            {/* Connector line */}
            {i < STEPS.length - 1 && (
              <div
                className={[
                  "mx-1 mb-3 h-[2px] w-8 rounded-full transition-all sm:w-12",
                  i < activeStep ? "bg-green-500" : "bg-muted-foreground/20",
                ].join(" ")}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Main Banner ──────────────────────────────────────────────────────────────

interface RevisorPhaseBannerProps {
  readonly messages: ChatMessage[];
  readonly status: string;
  readonly sendMessage: (msg: {
    role: "user";
    parts: Array<{ type: "text"; text: string }>;
  }) => void;
  readonly setInput: (value: string) => void;
  readonly inputRef: React.RefObject<HTMLTextAreaElement | null>;
  readonly isReadonly: boolean;
}

export function RevisorPhaseBanner({
  messages,
  status,
  sendMessage,
  setInput,
  inputRef,
  isReadonly,
}: RevisorPhaseBannerProps) {
  const [startTime, setStartTime] = useState<number | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const idx = findLastAssistantIndexWithGate05(messages);
  const afterMessages = idx >= 0 ? messages.slice(idx + 1) : [];
  const userRepliedToGate05 = afterMessages.some(
    (m) =>
      m.role === "user" &&
      (getUserMessageText(m) === "CONFIRMAR" ||
        getUserMessageText(m).startsWith("CORRIGIR:"))
  );

  const isStreaming = status === "streaming" || status === "submitted";
  const isError = status === "error";
  const lastMessage = messages.at(-1);
  const showFaseB =
    userRepliedToGate05 && (isStreaming || lastMessage?.role === "assistant");
  const showErroAposConfirmar = userRepliedToGate05 && isError;

  const hasAnyAssistantMessage = messages.some((m) => m.role === "assistant");
  const noGate05Yet = !messages.some((m) => {
    if (m.role !== "assistant") {
      return false;
    }
    const t = getAssistantMessageText(m);
    return t.includes(GATE_05_RESUMO_START) && t.includes(GATE_05_RESUMO_END);
  });
  const showFaseA =
    hasAnyAssistantMessage &&
    noGate05Yet &&
    (isStreaming || lastMessage?.role === "assistant") &&
    idx === -1;

  // Determine active step for stepper
  const isConcluido =
    !isStreaming &&
    userRepliedToGate05 &&
    lastMessage?.role === "assistant" &&
    !showErroAposConfirmar;
  const activeStep: StepIndex = (() => {
    if (isConcluido) {
      return 3;
    }
    if (showFaseB) {
      return 2;
    }
    if (idx !== -1 && !userRepliedToGate05) {
      return 1;
    }
    if (showFaseA) {
      return 0;
    }
    return 0;
  })();

  // Timer: starts when entering FASE B in streaming
  useEffect(() => {
    if (showFaseB && isStreaming) {
      setStartTime((prev) => prev ?? Date.now());
    } else {
      setStartTime(null);
      setElapsedSeconds(0);
    }
  }, [showFaseB, isStreaming]);

  useEffect(() => {
    if (startTime === null) {
      return;
    }
    const tick = () =>
      setElapsedSeconds(Math.floor((Date.now() - startTime) / 1000));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [startTime]);

  // Nothing to show before any assistant message
  if (!hasAnyAssistantMessage) {
    return null;
  }

  // After user replied and workflow completed (no more content to show)
  if (
    userRepliedToGate05 &&
    !showFaseB &&
    !showErroAposConfirmar &&
    !isConcluido
  ) {
    return null;
  }

  const handleConfirmar = () => {
    sendMessage({
      role: "user",
      parts: [{ type: "text", text: "CONFIRMAR" }],
    });
  };

  const handleCorrigir = () => {
    setInput("CORRIGIR: ");
    setTimeout(() => {
      inputRef.current?.focus();
    }, 0);
  };

  return (
    <output
      aria-live="polite"
      className="mx-2 mb-1 block rounded-md border border-border bg-muted/50 px-3 py-3 md:mx-4"
    >
      {/* Progress stepper — only shown from Fase A onward */}
      <WorkflowStepper activeStep={activeStep} />

      {/* Phase-specific content */}
      {showFaseA && (
        <p className="mt-2 text-center text-muted-foreground text-sm">
          Extração e mapeamento em curso. Aguarde o resumo para CONFIRMAR ou
          CORRIGIR.
        </p>
      )}

      {idx !== -1 && !userRepliedToGate05 && !isReadonly && (
        <div className="mt-3 flex flex-col items-center gap-2 sm:flex-row sm:justify-center">
          <span className="text-center text-muted-foreground text-sm">
            Confirme se os dados estão corretos ou corrija eventuais
            inconsistências.
          </span>
          <div className="flex gap-2">
            <Button
              onClick={handleConfirmar}
              size="sm"
              type="button"
              variant="default"
            >
              CONFIRMAR
            </Button>
            <Button
              onClick={handleCorrigir}
              size="sm"
              type="button"
              variant="outline"
            >
              CORRIGIR
            </Button>
          </div>
        </div>
      )}

      {idx !== -1 && !userRepliedToGate05 && isReadonly && (
        <p className="mt-2 text-center text-muted-foreground text-sm">
          Por favor, CONFIRME se os dados acima estão corretos ou CORRIJA
          eventuais inconsistências.
        </p>
      )}

      {showFaseB && (
        <div className="mt-2 text-center text-muted-foreground text-sm">
          <span>
            Gerando os 3 documentos (Avaliação da defesa, Roteiro Advogado,
            Roteiro Preposto). O primeiro aparecerá em breve.
          </span>
          {startTime !== null && (
            <span
              aria-label={`Tempo decorrido: ${formatElapsed(elapsedSeconds)}`}
              className="mt-1 block font-medium tabular-nums"
              role="timer"
            >
              Tempo: {formatElapsed(elapsedSeconds)}
            </span>
          )}
        </div>
      )}

      {showErroAposConfirmar && (
        <p className="mt-2 text-center text-destructive text-sm">
          Ocorreu um erro ao gerar os documentos. Pode tentar novamente ou usar
          CORRIGIR para ajustar o resumo.
        </p>
      )}

      {isConcluido && (
        <p className="mt-2 text-center text-green-600 text-sm dark:text-green-400">
          Workflow concluído. Os 3 documentos foram gerados.
        </p>
      )}
    </output>
  );
}
