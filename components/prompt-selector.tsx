"use client";

import type { UseChatHelpers } from "@ai-sdk/react";
import { memo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ChatMessage } from "@/lib/types";
import { SparklesIcon } from "./icons";

/** Prompts do Revisor: label curto (UI) e texto completo (enviado no chat). */
const REVISOR_PROMPTS = [
  {
    id: "explicar-fluxo",
    label: "Explicar o fluxo do Revisor",
    text: "Explicar o fluxo do Revisor: GATE-1, FASE A, GATE 0.5, FASE B e entrega dos 3 DOCX.",
    /** Disponível mesmo sem anexos (informativo). */
    alwaysAvailable: true,
  },
  {
    id: "auditar",
    label: "Auditar minha contestação",
    text: "Auditar minha contestação: segue em anexo a Petição Inicial e a Contestação. Extraia dados, mapeie pedidos e siga o fluxo (Gate 0.5 antes de gerar docs).",
    /** Só faz sentido com anexos (PI + Contestação). */
    requiresAttachments: true,
  },
  {
    id: "roteiros",
    label: "Preparar roteiros de audiência",
    text: "Preparar roteiros de audiência para advogado e preposto com base na contestação já analisada.",
    /** Requer conversa já iniciada (contestação analisada). */
    requiresMessages: true,
  },
  {
    id: "bancodetese",
    label: "Usar base de teses (@bancodetese)",
    text: "Usar base de teses (@bancodetese): incluir quadro de teses na Avaliação da Defesa.",
    /** Faz sentido após análise ou com base de conhecimento. */
    requiresMessages: true,
  },
] as const;

type PromptSelectorProps = Readonly<{
  chatId: string;
  sendMessage: UseChatHelpers<ChatMessage>["sendMessage"];
  messagesCount: number;
  hasAttachments: boolean;
  /** Desativa o botão enquanto o modelo está a responder. */
  disabled?: boolean;
}>;

function PurePromptSelector({
  chatId,
  sendMessage,
  messagesCount: messagesCountProp,
  hasAttachments,
  disabled = false,
}: PromptSelectorProps) {
  const [open, setOpen] = useState(false);

  const prompts = REVISOR_PROMPTS.filter((p) => {
    if ("alwaysAvailable" in p && p.alwaysAvailable) {
      return true;
    }
    if ("requiresAttachments" in p && p.requiresAttachments && !hasAttachments) {
      return false;
    }
    if ("requiresMessages" in p && p.requiresMessages && messagesCountProp === 0) {
      return false;
    }
    return true;
  });

  const handleSelect = (text: string) => {
    globalThis.history.pushState({}, "", `/chat/${chatId}`);
    sendMessage({
      role: "user",
      parts: [{ type: "text", text }],
    });
    setOpen(false);
  };

  return (
    <DropdownMenu onOpenChange={setOpen} open={open}>
      <DropdownMenuTrigger asChild>
        <Button
          aria-expanded={open}
          aria-haspopup="true"
          aria-label="Abrir sugestões de prompts"
          className="aspect-square h-8 rounded-lg p-1 transition-colors hover:bg-accent"
          data-testid="prompt-selector-trigger"
          disabled={disabled}
          title="Sugestões de prompts"
          type="button"
          variant="ghost"
        >
          <SparklesIcon size={14} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="max-w-[min(90vw,380px)]"
        side="top"
      >
        {prompts.map((p) => (
          <DropdownMenuItem
            className="cursor-pointer whitespace-normal py-2 text-left"
            key={p.id}
            onSelect={() => handleSelect(p.text)}
          >
            {p.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export const PromptSelector = memo(PurePromptSelector);
