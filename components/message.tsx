"use client";

import type { UseChatHelpers } from "@ai-sdk/react";
import { CoinsIcon } from "lucide-react";
import { useMemo, useState } from "react";
import useSWR from "swr";
import { Button } from "@/components/ui/button";
import type { Vote } from "@/lib/db/schema";
import type { ChatMessage, ChatMessagePart } from "@/lib/types";
import { cn, fetcher } from "@/lib/utils";

/** Part sintética para reasoning agregado (várias parts reasoning → uma com steps). */
type ReasoningAggregatePart = ChatMessagePart & {
  type: "reasoning";
  steps?: string[];
};

function aggregateConsecutiveReasoning(
  parts: ChatMessagePart[],
  startIndex: number
): {
  steps: string[];
  lastState: "streaming" | undefined;
  nextIndex: number;
} {
  const steps: string[] = [];
  let lastState: "streaming" | undefined;
  let i = startIndex;
  while (
    i < parts.length &&
    (parts[i] as { type: string })?.type === "reasoning"
  ) {
    const p = parts[i] as {
      type: "reasoning";
      text?: string;
      state?: "streaming";
    };
    steps.push(p.text ?? "");
    if (p.state === "streaming") {
      lastState = "streaming";
    }
    i++;
  }
  return { steps, lastState, nextIndex: i };
}

/** Agrega parts consecutivas de reasoning numa única part com steps (estrutura do pensamento). */
function flattenReasoningParts(
  parts: ChatMessagePart[] | undefined
): (ChatMessagePart | ReasoningAggregatePart)[] {
  if (!parts?.length) {
    return [];
  }
  const result: (ChatMessagePart | ReasoningAggregatePart)[] = [];
  let i = 0;
  while (i < parts.length) {
    const part = parts[i];
    if (part?.type === "reasoning") {
      const { steps, lastState, nextIndex } = aggregateConsecutiveReasoning(
        parts,
        i
      );
      result.push({
        type: "reasoning",
        text: steps.join("\n\n"),
        ...(lastState && { state: lastState }),
        steps: steps.length > 0 ? steps : undefined,
      });
      i = nextIndex;
      continue;
    }
    result.push(part);
    i++;
  }
  return result;
}

/** Gera uma key estável e única para uma parte de mensagem. Durante streaming o conteúdo
 * da parte muda a cada chunk; usar hash do conteúdo faria a key mudar e o React remontar
 * o componente (piscar). Por isso, para partes sem toolCallId usamos type+index estável. */
function getMessagePartKey(
  messageId: string,
  part: ChatMessagePart | ReasoningAggregatePart,
  index: number
): string {
  const withId = part as { toolCallId?: string };
  if (typeof withId.toolCallId === "string" && withId.toolCallId) {
    return `${messageId}-${withId.toolCallId}`;
  }
  if (
    part.type === "reasoning" &&
    (part as ReasoningAggregatePart).steps?.length
  ) {
    return `${messageId}-reasoning-aggregate`;
  }
  return `${messageId}-part-${part.type}-${index}`;
}

import { Shimmer } from "@/components/ai-elements/shimmer";
import { useDataStream } from "./data-stream-provider";
import { SparklesIcon } from "./icons";
import { MessageActions } from "./message-actions";
import { MessagePartRenderer } from "./message-part-renderer";
import { PreviewAttachment } from "./preview-attachment";

interface CreditsResponse {
  balance: number;
  recentUsage: Array<{
    promptTokens: number;
    completionTokens: number;
    creditsConsumed: number;
  }>;
}

function LastMessageUsage() {
  const { data } = useSWR<CreditsResponse>("/api/credits", fetcher);
  const last = data?.recentUsage?.[0];
  if (!last) {
    return null;
  }
  const totalTokens = last.promptTokens + last.completionTokens;
  return (
    <p className="mt-2 flex items-center gap-1.5 text-muted-foreground text-xs">
      <CoinsIcon aria-hidden className="size-3.5 shrink-0" />
      <span>
        Esta resposta: {last.creditsConsumed} créditos (
        {totalTokens.toLocaleString("pt-PT")} tokens)
      </span>
    </p>
  );
}

const PurePreviewMessage = ({
  addToolApprovalResponse,
  chatId,
  message,
  vote,
  isLoading,
  setMessages,
  regenerate,
  isReadonly,
  requiresScrollPadding: _requiresScrollPadding,
  gate05ConfirmInline = false,
  showLastUsage = false,
  onConfirmGate05,
  onCorrigirGate05,
}: {
  addToolApprovalResponse: UseChatHelpers<ChatMessage>["addToolApprovalResponse"];
  chatId: string;
  message: ChatMessage;
  vote: Vote | undefined;
  isLoading: boolean;
  setMessages: UseChatHelpers<ChatMessage>["setMessages"];
  regenerate: UseChatHelpers<ChatMessage>["regenerate"];
  isReadonly: boolean;
  requiresScrollPadding: boolean;
  gate05ConfirmInline?: boolean;
  showLastUsage?: boolean;
  onConfirmGate05?: () => void;
  onCorrigirGate05?: () => void;
}) => {
  const [mode, setMode] = useState<"view" | "edit">("view");

  const processedParts = useMemo(
    () => flattenReasoningParts(message.parts?.filter(Boolean) ?? []),
    [message.parts]
  );

  const attachmentsFromMessage = message.parts.filter(
    (part): part is Extract<ChatMessagePart, { type: "file" }> =>
      part.type === "file"
  );

  useDataStream();

  return (
    <div
      className="group/message fade-in w-full animate-in duration-200"
      data-role={message.role}
      data-testid={`message-${message.role}`}
    >
      <div
        className={cn("flex w-full items-start gap-2 md:gap-3", {
          "justify-end": message.role === "user" && mode !== "edit",
          "justify-start": message.role === "assistant",
        })}
      >
        {message.role === "assistant" && (
          <div className="-mt-1 flex size-8 shrink-0 items-center justify-center rounded-full bg-background ring-1 ring-border">
            <SparklesIcon size={14} />
          </div>
        )}

        <div
          className={cn("flex flex-col", {
            "gap-2 md:gap-4": message.parts?.some(
              (p) => p.type === "text" && p.text?.trim()
            ),
            "w-full":
              (message.role === "assistant" &&
                (message.parts?.some(
                  (p) => p.type === "text" && p.text?.trim()
                ) ||
                  message.parts?.some((p) => p.type.startsWith("tool-")))) ||
              mode === "edit",
            "max-w-[calc(100%-2.5rem)] sm:max-w-[min(fit-content,80%)]":
              message.role === "user" && mode !== "edit",
          })}
        >
          {attachmentsFromMessage.length > 0 && (
            <div
              className="flex flex-row justify-end gap-2"
              data-testid={"message-attachments"}
            >
              {attachmentsFromMessage.map((attachment) => (
                <PreviewAttachment
                  attachment={{
                    name: attachment.filename ?? "file",
                    contentType: attachment.mediaType,
                    url: attachment.url,
                  }}
                  key={attachment.url}
                />
              ))}
            </div>
          )}

          {processedParts.map((part, index) => (
            <MessagePartRenderer
              addToolApprovalResponse={addToolApprovalResponse}
              index={index}
              isLoading={isLoading}
              isReadonly={isReadonly}
              key={getMessagePartKey(message.id, part, index)}
              message={message}
              messageId={message.id}
              messageRole={message.role}
              mode={mode}
              part={part}
              regenerate={regenerate}
              setMessages={setMessages}
              setMode={setMode}
            />
          ))}

          {message.role === "assistant" &&
            processedParts.length > 0 &&
            processedParts.every((p) => p.type === "reasoning") &&
            (isLoading ? (
              <p
                className="text-muted-foreground text-sm"
                data-testid="reasoning-wait-hint"
              >
                O modelo está a raciocinar; a resposta em texto surgirá em
                seguida.
              </p>
            ) : (
              !processedParts.some((p) => {
                const part = p as { type: string; text?: string };
                return (
                  part.type === "text" &&
                  (part.text?.trim().length ?? 0) > 0
                );
              }) && (
                <p
                  className="text-muted-foreground text-sm"
                  data-testid="reasoning-no-text-fallback"
                >
                  O modelo concluiu o raciocínio mas não devolveu texto. Tenta
                  novamente ou escolhe outro modelo.
                </p>
              )
            ))}

          {gate05ConfirmInline && onConfirmGate05 && onCorrigirGate05 && (
            <section
              aria-label="Confirmação dos dados do resumo"
              className="mt-3 flex flex-col gap-2 rounded-lg border border-border bg-muted/50 px-3 py-2"
            >
              <p className="text-muted-foreground text-sm">
                Por favor, CONFIRME se os dados acima estão corretos ou CORRIJA
                eventuais inconsistências.
              </p>
              <div className="flex gap-2">
                <Button
                  onClick={onConfirmGate05}
                  size="sm"
                  type="button"
                  variant="default"
                >
                  CONFIRMAR
                </Button>
                <Button
                  onClick={onCorrigirGate05}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  CORRIGIR
                </Button>
              </div>
            </section>
          )}

          {showLastUsage && <LastMessageUsage />}
          {!isReadonly && (
            <MessageActions
              chatId={chatId}
              isLoading={isLoading}
              key={`action-${message.id}`}
              message={message}
              setMode={setMode}
              vote={vote}
            />
          )}
        </div>
      </div>
    </div>
  );
};

export const PreviewMessage = PurePreviewMessage;

export const ThinkingMessage = () => {
  return (
    <output
      aria-live="polite"
      className="group/message fade-in w-full animate-in duration-300"
      data-role="assistant"
      data-testid="message-assistant-loading"
    >
      <div className="flex items-start justify-start gap-3">
        <div
          aria-hidden
          className="-mt-1 flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/5 ring-1 ring-primary/20"
        >
          <div className="animate-pulse text-primary/80">
            <SparklesIcon size={14} />
          </div>
        </div>

        <div className="flex w-full flex-col gap-2 md:gap-4">
          <div className="flex items-center gap-1 p-0 text-muted-foreground text-sm">
            <Shimmer duration={1.2}>A pensar</Shimmer>
          </div>
          <span className="sr-only">
            O assistente está a processar a sua mensagem.
          </span>
        </div>
      </div>
    </output>
  );
};
