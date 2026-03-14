"use client";

import {
  CONTEXT_WINDOW_INPUT_TARGET_TOKENS,
  estimateTokensFromText,
} from "@/lib/ai/context-window";

interface MessageLike {
  parts?: Array<{ type?: string; text?: string; [key: string]: unknown }>;
}

interface AttachmentLike {
  extractedText?: string;
}

interface ContextUsageIndicatorProps {
  readonly messages: MessageLike[];
  readonly attachments: AttachmentLike[];
  readonly knowledgeDocCount: number;
}

const SYSTEM_PROMPT_ESTIMATE_TOKENS = 2000;
const TOKENS_PER_KNOWLEDGE_DOC = 15_000;

export function ContextUsageIndicator({
  messages,
  attachments,
  knowledgeDocCount,
}: ContextUsageIndicatorProps) {
  let tokens = SYSTEM_PROMPT_ESTIMATE_TOKENS;

  for (const msg of messages) {
    for (const part of msg.parts ?? []) {
      if (part.type === "text" && typeof part.text === "string") {
        tokens += estimateTokensFromText(part.text);
      }
    }
  }

  for (const att of attachments) {
    if (att.extractedText) {
      tokens += estimateTokensFromText(att.extractedText);
    }
  }

  tokens += knowledgeDocCount * TOKENS_PER_KNOWLEDGE_DOC;

  if (tokens <= SYSTEM_PROMPT_ESTIMATE_TOKENS && knowledgeDocCount === 0) {
    return null;
  }

  const pct = Math.min(
    100,
    Math.round((tokens / CONTEXT_WINDOW_INPUT_TARGET_TOKENS) * 100)
  );
  const kTokens = Math.round(tokens / 1000);

  const barColor =
    pct >= 85 ? "bg-red-500" : pct >= 60 ? "bg-yellow-500" : "bg-green-500";

  const labelColor =
    pct >= 85
      ? "text-red-500"
      : pct >= 60
        ? "text-yellow-500"
        : "text-muted-foreground";

  return (
    <div className="px-1 pb-1">
      <div className="mb-0.5 flex items-center justify-between">
        <span className={`text-[10px] tabular-nums ${labelColor}`}>
          Contexto: {pct}%{" "}
          <span className="opacity-70">
            (~{kTokens}k /{" "}
            {Math.round(CONTEXT_WINDOW_INPUT_TARGET_TOKENS / 1000)}k tokens)
          </span>
        </span>
        {pct >= 85 && (
          <span className="font-medium text-[10px] text-red-500">
            Limite próximo
          </span>
        )}
      </div>
      <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full rounded-full transition-all duration-500 ${barColor}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
