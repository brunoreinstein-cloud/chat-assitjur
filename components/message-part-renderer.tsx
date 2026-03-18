"use client";

import type { UseChatHelpers } from "@ai-sdk/react";
import { Loader2 } from "lucide-react";
import type { Dispatch, ReactNode, SetStateAction } from "react";
import { useEffect, useRef, useState } from "react";
import type { ChatMessage } from "@/lib/types";
import { cn, sanitizeText } from "@/lib/utils";
import { DocumentToolResult } from "./document";
import { MessageContent } from "./elements/message";
import { Response } from "./elements/response";
import {
  type MasterDocumentsOutput,
  MasterDocumentsResult,
} from "./master-documents-result";
import { MessageDocumentTool } from "./message-document-tool";
import { MessageEditor } from "./message-editor";
import { MessageReasoning } from "./message-reasoning";
import { MessageRequestSuggestionsTool } from "./message-request-suggestions-tool";
import { MessageWeatherTool } from "./message-weather-tool";
import {
  type RevisorDefesaDocumentsOutput,
  RevisorDefesaDocumentsResult,
} from "./revisor-defesa-documents-result";

/** Formata segundos em "Xs" ou "Xm Ys". */
function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

/**
 * Pill de loading para createRedatorContestacaoDocument.
 * Usa useRef(Date.now()) para registar o próprio tempo de montagem — não precisa de store
 * externo. O componente é montado quando o tool call começa e desmontado quando id chega.
 */
function RedatorLoadingPill() {
  const startedAt = useRef(Date.now());
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAt.current) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex items-center gap-2 rounded-xl border bg-muted/50 px-3 py-2">
      <Loader2 className="size-4 shrink-0 animate-spin text-primary/70" />
      <span className="flex-1 text-muted-foreground text-sm">
        A criar minuta de contestação…
      </span>
      {elapsed > 0 && (
        <span className="shrink-0 text-muted-foreground/60 text-xs">
          {formatDuration(elapsed)}
        </span>
      )}
    </div>
  );
}

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
  setMode: Dispatch<SetStateAction<"view" | "edit">>;
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
  setMode: Dispatch<SetStateAction<"view" | "edit">>;
  message: ChatMessage;
}>;

type ReasoningPart = ChatMessage["parts"][number] & {
  type: "reasoning";
  steps?: string[];
};

function renderReasoningPart(
  part: ReasoningPart,
  key: string,
  ctx: RenderContext
): ReactNode {
  const steps = part.steps;
  const hasSteps = Array.isArray(steps) && steps.length > 0;
  const hasContent = hasSteps || (part.text?.trim().length ?? 0) > 0;
  const isStreaming =
    part != null && "state" in part && part?.state === "streaming";
  if (!(hasContent || isStreaming)) {
    return null;
  }
  return (
    <MessageReasoning
      isLoading={ctx.isLoading || isStreaming}
      key={key}
      reasoning={part.text || ""}
      steps={steps}
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
  if (type === "tool-createMasterDocuments") {
    return (
      <MasterDocumentsResult
        isReadonly={ctx.isReadonly}
        key={part.toolCallId}
        output={part.output as MasterDocumentsOutput}
      />
    );
  }
  if (type === "tool-createRedatorContestacaoDocument") {
    const output = part.output as
      | { id?: string; title?: string; error?: unknown }
      | undefined;
    if (output && typeof output === "object" && "error" in output) {
      return (
        <div
          className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-500 dark:bg-red-950/50"
          key={part.toolCallId}
        >
          Erro ao criar minuta: {String(output.error)}
        </div>
      );
    }
    const id = output?.id;
    const title = output?.title ?? "Minuta de contestação";
    if (!id) {
      return <RedatorLoadingPill key={part.toolCallId} />;
    }
    return (
      <DocumentToolResult
        isReadonly={ctx.isReadonly}
        key={part.toolCallId}
        result={{ id, kind: "text", title }}
        type="create"
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
        state={part != null && "state" in part ? part?.state : undefined}
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
    type === "tool-createMasterDocuments" ||
    type === "tool-createRedatorContestacaoDocument" ||
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
  const { part, messageId, index, ...rest } = props;
  if (part == null) {
    return null;
  }
  const key = `message-${messageId}-part-${index}`;
  const ctx: RenderContext = { ...rest, messageId, index };
  return renderPartByType(part, key, ctx);
}
