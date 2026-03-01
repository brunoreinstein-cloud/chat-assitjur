"use client";

import type { UseChatHelpers } from "@ai-sdk/react";
import type { ReactNode } from "react";
import type { ChatMessage } from "@/lib/types";
import { cn, sanitizeText } from "@/lib/utils";
import { MessageContent } from "./elements/message";
import { Response } from "./elements/response";
import { MessageDocumentTool } from "./message-document-tool";
import { MessageEditor } from "./message-editor";
import { MessageReasoning } from "./message-reasoning";
import { MessageRequestSuggestionsTool } from "./message-request-suggestions-tool";
import { MessageWeatherTool } from "./message-weather-tool";
import {
  type RevisorDefesaDocumentsOutput,
  RevisorDefesaDocumentsResult,
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

type RenderContext = Readonly<{
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
}>;

function renderReasoningPart(
  part: ChatMessage["parts"][number] & { type: "reasoning" },
  key: string,
  ctx: RenderContext
): ReactNode {
  const hasContent = (part.text?.trim().length ?? 0) > 0;
  const isStreaming = "state" in part && part.state === "streaming";
  if (!(hasContent || isStreaming)) {
    return null;
  }
  return (
    <MessageReasoning
      isLoading={ctx.isLoading || isStreaming}
      key={key}
      reasoning={part.text || ""}
    />
  );
}

function renderTextPart(
  part: ChatMessage["parts"][number] & { type: "text" },
  key: string,
  ctx: RenderContext
): ReactNode {
  if (ctx.mode === "view") {
    return (
      <div
        className={cn({
          "wrap-break-word min-w-0": ctx.messageRole === "assistant",
        })}
        key={key}
      >
        <MessageContent
          className={cn({
            "wrap-break-word w-fit rounded-2xl px-3 py-2 text-right text-white":
              ctx.messageRole === "user",
            "bg-transparent px-0 py-0 text-left":
              ctx.messageRole === "assistant",
          })}
          data-testid="message-content"
          style={
            ctx.messageRole === "user"
              ? { backgroundColor: "#006cff" }
              : undefined
          }
        >
          <Response>{sanitizeText(part.text)}</Response>
        </MessageContent>
      </div>
    );
  }
  if (ctx.mode === "edit") {
    return (
      <div className="flex w-full flex-row items-start gap-3" key={key}>
        <div className="size-8" />
        <div className="min-w-0 flex-1">
          <MessageEditor
            key={ctx.messageId}
            message={ctx.message}
            regenerate={ctx.regenerate}
            setMessages={ctx.setMessages}
            setMode={ctx.setMode}
          />
        </div>
      </div>
    );
  }
  return null;
}

function renderToolPart(
  part: ChatMessage["parts"][number],
  ctx: RenderContext
): ReactNode {
  const type = part.type;
  if (type === "tool-getWeather") {
    return (
      <MessageWeatherTool
        addToolApprovalResponse={ctx.addToolApprovalResponse}
        key={part.toolCallId}
        part={part}
      />
    );
  }
  if (type === "tool-createDocument") {
    return (
      <MessageDocumentTool
        isReadonly={ctx.isReadonly}
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
        isReadonly={ctx.isReadonly}
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
        isReadonly={ctx.isReadonly}
        key={part.toolCallId}
        output={part.output as RevisorDefesaDocumentsOutput}
      />
    );
  }
  if (type === "tool-requestSuggestions") {
    return (
      <MessageRequestSuggestionsTool
        input={part.input}
        isReadonly={ctx.isReadonly}
        key={part.toolCallId}
        output={part.output}
        state={part.state}
        toolCallId={part.toolCallId}
      />
    );
  }
  return null;
}

function renderPartByType(
  part: ChatMessage["parts"][number],
  key: string,
  ctx: RenderContext
): ReactNode {
  const type = part.type;
  if (type === "reasoning") {
    return renderReasoningPart(part, key, ctx);
  }
  if (type === "text") {
    return renderTextPart(part, key, ctx);
  }
  if (
    type === "tool-getWeather" ||
    type === "tool-createDocument" ||
    type === "tool-updateDocument" ||
    type === "tool-createRevisorDefesaDocuments" ||
    type === "tool-requestSuggestions"
  ) {
    return renderToolPart(part, ctx);
  }
  return null;
}

/**
 * Renderiza uma parte (part) de uma mensagem do chat: texto, reasoning ou uma tool.
 */
export function MessagePartRenderer(props: Readonly<MessagePartRendererProps>) {
  const { part, messageId, index, ...ctx } = props;
  if (part == null) {
    return null;
  }
  const key = `message-${messageId}-part-${index}`;
  return renderPartByType(part, key, ctx);
}
