"use client";

import type { UseChatHelpers } from "@ai-sdk/react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { Vote } from "@/lib/db/schema";
import type { ChatMessage } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useDataStream } from "./data-stream-provider";
import { MessagePartRenderer } from "./message-part-renderer";
import { SparklesIcon } from "./icons";
import { MessageActions } from "./message-actions";
import { PreviewAttachment } from "./preview-attachment";

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
  onConfirmGate05?: () => void;
  onCorrigirGate05?: () => void;
}) => {
  const [mode, setMode] = useState<"view" | "edit">("view");

  const attachmentsFromMessage = message.parts.filter(
    (part) => part.type === "file"
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

          {message.parts
            ?.filter((p): p is NonNullable<typeof p> => p != null)
            .map((part, index) => (
            <MessagePartRenderer
              addToolApprovalResponse={addToolApprovalResponse}
              index={index}
              isLoading={isLoading}
              isReadonly={isReadonly}
              key={`message-${message.id}-part-${index}`}
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
    <div
      className="group/message fade-in w-full animate-in duration-300"
      data-role="assistant"
      data-testid="message-assistant-loading"
    >
      <div className="flex items-start justify-start gap-3">
        <div className="-mt-1 flex size-8 shrink-0 items-center justify-center rounded-full bg-background ring-1 ring-border">
          <div className="animate-pulse">
            <SparklesIcon size={14} />
          </div>
        </div>

        <div className="flex w-full flex-col gap-2 md:gap-4">
          <div className="flex items-center gap-1 p-0 text-muted-foreground text-sm">
            <span className="animate-pulse">Thinking</span>
            <span className="inline-flex">
              <span className="animate-bounce [animation-delay:0ms]">.</span>
              <span className="animate-bounce [animation-delay:150ms]">.</span>
              <span className="animate-bounce [animation-delay:300ms]">.</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
