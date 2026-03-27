import type { Attachment } from "@/lib/types";

export type RunnerPhase =
  | "upload"
  | "validate"
  | "execute"
  | "complete"
  | "error";

export interface RunnerState {
  phase: RunnerPhase;
  chatId: string;
  attachments: Attachment[];
  processoId: string | null;
  modelId: string;
  isExecuting: boolean;
  error: string | null;
}

export type DocumentType = "pi" | "contestacao" | "sentenca" | "laudo";

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  pi: "Petição Inicial",
  contestacao: "Contestação",
  sentenca: "Sentença",
  laudo: "Laudo Pericial",
};
