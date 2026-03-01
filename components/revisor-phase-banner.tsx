"use client";

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

  // Cronómetro: inicia quando entramos em FASE B em streaming, limpa quando termina
  useEffect(() => {
    if (showFaseB && isStreaming) {
      setStartTime((prev) => prev ?? Date.now());
    } else {
      setStartTime(null);
      setElapsedSeconds(0);
    }
  }, [showFaseB, isStreaming]);

  useEffect(() => {
    if (startTime === null) return;
    const tick = () =>
      setElapsedSeconds(Math.floor((Date.now() - startTime) / 1000));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [startTime]);

  if (idx === -1) {
    return null;
  }

  if (showErroAposConfirmar) {
    return (
      <output
        aria-live="polite"
        className="mx-2 mb-1 block rounded-md border border-border bg-destructive/10 px-3 py-2 text-center text-destructive text-sm md:mx-4"
      >
        Ocorreu um erro ao gerar os documentos. Pode tentar novamente ou usar
        CORRIGIR para ajustar o resumo.
      </output>
    );
  }

  if (showFaseB) {
    return (
      <output
        aria-live="polite"
        className="mx-2 mb-1 block rounded-md border border-border bg-muted/50 px-3 py-2 text-center text-muted-foreground text-sm md:mx-4"
      >
        <span className="block">
          FASE B — Gerando os 3 documentos. O primeiro aparecerá em breve.
        </span>
        {startTime !== null && (
          <span
            aria-label={`Tempo decorrido: ${formatElapsed(elapsedSeconds)}`}
            className="mt-1 block font-medium tabular-nums"
          >
            Tempo: {formatElapsed(elapsedSeconds)}
          </span>
        )}
      </output>
    );
  }

  if (userRepliedToGate05) {
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

  if (isReadonly) {
    return (
      <output
        aria-live="polite"
        className="mx-2 mb-1 block rounded-md border border-border bg-muted/50 px-3 py-2 text-center text-muted-foreground text-sm md:mx-4"
      >
        Por favor, CONFIRME se os dados acima estão corretos ou CORRIJA
        eventuais inconsistências.
      </output>
    );
  }

  return (
    <output
      aria-live="polite"
      className="mx-2 mb-1 flex flex-col items-center gap-2 rounded-md border border-border bg-muted/50 px-3 py-2 text-center text-muted-foreground text-sm md:mx-4 md:flex-row md:justify-center"
    >
      <span className="shrink-0">
        Por favor, CONFIRME se os dados acima estão corretos ou CORRIJA
        eventuais inconsistências.
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
    </output>
  );
}
