"use client";

import type { UseChatHelpers } from "@ai-sdk/react";
import type { ChatMessage } from "@/lib/types";
import { cn, sanitizeText } from "@/lib/utils";
import { MessageContent } from "./elements/message";
import { Response } from "./elements/response";
import { MessageDocumentTool } from "./message-document-tool";
import { MessageRequestSuggestionsTool } from "./message-request-suggestions-tool";
import { MessageWeatherTool } from "./message-weather-tool";
import { MessageEditor } from "./message-editor";
import { MessageReasoning } from "./message-reasoning";
import {
  RevisorDefesaDocumentsResult,
  type RevisorDefesaDocumentsOutput,
} from "./revisor-defesa-documents-result";

export interface MessagePartRendererProps {
  part: ChatMessage["parts"][number];
  messageId: string;
  messageRole: ChatMessage["role"];
  index: number;
  isLoading: boolean;
  mode: "view" | "edit";
  isReadonly: boolean;
  addToolApprovalResponse: UseChatHelpers<ChatMessage>["addToolApprovalResponse"];
  setMessages: UseChatHelpers<ChatMessage>["setMessages"];
  regenerate: UseChatHelpers<ChatMessage>["regenerate"];
  setMode: (mode: "view" | "edit") => void;
  message: ChatMessage;
}

/**
 * Renderiza uma parte (part) de uma mensagem do chat: texto, reasoning ou uma tool.
 */
export function MessagePartRenderer({
  part,
  messageId,
  messageRole,
  index,
  isLoading,
  mode,
  isReadonly,
  addToolApprovalResponse,
  setMessages,
  regenerate,
  setMode,
  message,
}: Readonly<MessagePartRendererProps>) {
  if (part == null) return null;
  const key = `message-${messageId}-part-${index}`;
  const type = part.type;

  if (type === "reasoning") {
    const hasContent = part.text?.trim().length > 0;
    const isStreaming = "state" in part && part.state === "streaming";
    if (hasContent || isStreaming) {
      return (
        <MessageReasoning
          isLoading={isLoading || isStreaming}
          key={key}
          reasoning={part.text || ""}
        />
      );
    }
  }

  if (type === "text") {
    if (mode === "view") {
      return (
        <div
          className={cn({
            "wrap-break-word min-w-0": messageRole === "assistant",
          })}
          key={key}
        >
          <MessageContent
            className={cn({
              "wrap-break-word w-fit rounded-2xl px-3 py-2 text-right text-white":
                messageRole === "user",
              "bg-transparent px-0 py-0 text-left": messageRole === "assistant",
            })}
            data-testid="message-content"
            style={
              messageRole === "user"
                ? { backgroundColor: "#006cff" }
                : undefined
            }
          >
            <Response>{sanitizeText(part.text)}</Response>
          </MessageContent>
        </div>
      );
    }
    if (mode === "edit") {
      return (
        <div
          className="flex w-full flex-row items-start gap-3"
          key={key}
        >
          <div className="size-8" />
          <div className="min-w-0 flex-1">
            <MessageEditor
              key={messageId}
              message={message}
              regenerate={regenerate}
              setMessages={setMessages}
              setMode={setMode}
            />
          </div>
        </div>
      );
    }
  }

  if (type === "tool-getWeather") {
    return (
      <MessageWeatherTool
        addToolApprovalResponse={addToolApprovalResponse}
        key={part.toolCallId}
        part={part}
      />
    );
  }

  if (type === "tool-createDocument") {
    return (
      <MessageDocumentTool
        isReadonly={isReadonly}
        key={part.toolCallId}
        output={part.output}
        toolCallId={part.toolCallId}
        type="create"
      />
    );
  }

  if (type === "tool-updateDocument") {
    return (
      <MessageDocumentTool
        isReadonly={isReadonly}
        key={part.toolCallId}
        output={part.output}
        toolCallId={part.toolCallId}
        type="update"
      />
    );
  }

  if (type === "tool-createRevisorDefesaDocuments") {
    return (
      <RevisorDefesaDocumentsResult
        isReadonly={isReadonly}
        key={part.toolCallId}
        output={part.output as RevisorDefesaDocumentsOutput}
      />
    );
  }

  if (type === "tool-requestSuggestions") {
    return (
      <MessageRequestSuggestionsTool
        input={part.input}
        isReadonly={isReadonly}
        key={part.toolCallId}
        output={part.output}
        state={part.state}
        toolCallId={part.toolCallId}
      />
    );
  }

  return null;
}
