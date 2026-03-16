"use client";

import {
  CONTEXT_WINDOW_INPUT_TARGET_TOKENS,
  estimateTokensFromText,
  MAX_CHARS_PER_DOCUMENT,
  MAX_TOTAL_DOC_CHARS,
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

/** Limites para o semáforo de capacidade da sessão */
const THRESHOLD_YELLOW = 60;
const THRESHOLD_ORANGE = 80;
const THRESHOLD_RED = 93;

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

  // Espelha a truncagem server-side: cada doc é limitado a MAX_CHARS_PER_DOCUMENT
  // e o total de chars de documentos é limitado a MAX_TOTAL_DOC_CHARS.
  let totalDocChars = 0;
  for (const att of attachments) {
    if (att.extractedText) {
      const remaining = Math.max(0, MAX_TOTAL_DOC_CHARS - totalDocChars);
      const cappedLen = Math.min(
        att.extractedText.length,
        MAX_CHARS_PER_DOCUMENT,
        remaining
      );
      totalDocChars += cappedLen;
      tokens += estimateTokensFromText(att.extractedText.slice(0, cappedLen));
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

  // --- Semáforo: 0-60% verde (discreto), 60-80% amarelo, 80-93% laranja, 93%+ vermelho ---

  // Abaixo de 60%: só mostrar um indicador verde discreto, sem texto alarmante
  if (pct < THRESHOLD_YELLOW) {
    return (
      <div className="flex items-center gap-1.5 px-1 pb-1">
        <div className="size-1.5 shrink-0 rounded-full bg-green-500" />
        <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-green-500/60 transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    );
  }

  // Acima de 60%: mostrar label + barra
  let dotColor: string;
  let barColor: string;
  let label: string;
  let labelColor: string;

  if (pct < THRESHOLD_ORANGE) {
    dotColor = "bg-yellow-500";
    barColor = "bg-yellow-500";
    labelColor = "text-yellow-600 dark:text-yellow-400";
    label = `Contexto ${pct}% utilizado`;
  } else if (pct < THRESHOLD_RED) {
    dotColor = "bg-orange-500";
    barColor = "bg-orange-500";
    labelColor = "text-orange-600 dark:text-orange-400";
    label = `Contexto ${pct}% utilizado — considere iniciar nova conversa`;
  } else {
    dotColor = "bg-red-500";
    barColor = "bg-red-500";
    labelColor = "text-red-600 dark:text-red-400";
    label = `Contexto ${pct}% utilizado — inicie nova conversa para melhores resultados`;
  }

  return (
    <div className="px-1 pb-1">
      <div className="mb-0.5 flex items-center gap-1.5">
        <div className={`size-2 shrink-0 rounded-full ${dotColor}`} />
        <span className={`font-medium text-[10px] ${labelColor}`}>{label}</span>
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
