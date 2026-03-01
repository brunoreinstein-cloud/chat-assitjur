"use client";

import type { UseChatHelpers } from "@ai-sdk/react";
import type { ToolUIPart } from "ai";
import type { ChatMessage } from "@/lib/types";
import { Tool, ToolContent, ToolHeader, ToolInput } from "./elements/tool";
import { Weather, type WeatherAtLocation } from "./weather";

interface WeatherPart {
  toolCallId: string;
  state: ToolUIPart["state"];
  input?: unknown;
  output?: unknown;
  approval?: { id: string; approved?: boolean };
}

interface MessageWeatherToolProps {
  part: WeatherPart;
  addToolApprovalResponse: UseChatHelpers<ChatMessage>["addToolApprovalResponse"];
}

const WIDTH_CLASS = "w-[min(100%,450px)]";

/**
 * Renderiza a tool getWeather na mensagem: output, denied, approval-responded ou input/approval-requested.
 */
export function MessageWeatherTool({
  part,
  addToolApprovalResponse,
}: Readonly<MessageWeatherToolProps>) {
  const { toolCallId, state } = part;
  const approvalId = part.approval?.id;
  const isDenied =
    state === "output-denied" ||
    (state === "approval-responded" && part.approval?.approved === false);

  if (state === "output-available") {
    return (
      <div className={WIDTH_CLASS} key={toolCallId}>
        <Weather weatherAtLocation={part.output as WeatherAtLocation} />
      </div>
    );
  }

  if (isDenied) {
    return (
      <div className={WIDTH_CLASS} key={toolCallId}>
        <Tool className="w-full" defaultOpen={true}>
          <ToolHeader state="output-denied" type="tool-getWeather" />
          <ToolContent>
            <div className="px-4 py-3 text-muted-foreground text-sm">
              Weather lookup was denied.
            </div>
          </ToolContent>
        </Tool>
      </div>
    );
  }

  if (state === "approval-responded") {
    return (
      <div className={WIDTH_CLASS} key={toolCallId}>
        <Tool className="w-full" defaultOpen={true}>
          <ToolHeader state={state} type="tool-getWeather" />
          <ToolContent>
            <ToolInput input={part.input} />
          </ToolContent>
        </Tool>
      </div>
    );
  }

  return (
    <div className={WIDTH_CLASS} key={toolCallId}>
      <Tool className="w-full" defaultOpen={true}>
        <ToolHeader state={state} type="tool-getWeather" />
        <ToolContent>
          {(state === "input-available" || state === "approval-requested") && (
            <ToolInput input={part.input} />
          )}
          {state === "approval-requested" && approvalId ? (
            <div className="flex items-center justify-end gap-2 border-t px-4 py-3">
              <button
                className="rounded-md px-3 py-1.5 text-muted-foreground text-sm transition-colors hover:bg-muted hover:text-foreground"
                onClick={() => {
                  addToolApprovalResponse({
                    id: approvalId,
                    approved: false,
                    reason: "User denied weather lookup",
                  });
                }}
                type="button"
              >
                Deny
              </button>
              <button
                className="rounded-md bg-primary px-3 py-1.5 text-primary-foreground text-sm transition-colors hover:bg-primary/90"
                onClick={() => {
                  addToolApprovalResponse({
                    id: approvalId,
                    approved: true,
                  });
                }}
                type="button"
              >
                Allow
              </button>
            </div>
          ) : null}
        </ToolContent>
      </Tool>
    </div>
  );
}
