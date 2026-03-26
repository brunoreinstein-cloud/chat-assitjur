/**
 * Tipos partilhados entre os módulos de chat.
 * Extraído de app/(chat)/api/chat/route.ts para reutilização.
 */

import type { Session } from "next-auth";
import type { UserType } from "@/app/(auth)/auth";
import type { PostRequestBody } from "@/app/(chat)/api/chat/schema";
import type { AgentConfig } from "@/lib/ai/agents-registry";
import type { createChatDebugTracker } from "@/lib/ai/chat-debug";
import type { withPromptCaching } from "@/lib/ai/middleware";
import type { RequestHints } from "@/lib/ai/prompts";
import type {
  getChatById,
  getCustomAgentById,
  getKnowledgeDocumentsByIds,
  getMessageCountByUserId,
  getMessagesByChatId,
  getUserFilesByIds,
} from "@/lib/db/queries";
import type { retrieveKnowledgeContext } from "@/lib/rag";
import type { ChatMessage } from "@/lib/types";

export interface DocumentPartLike {
  type: "document";
  name?: string;
  text?: string;
  documentType?: "pi" | "contestacao";
}

/** Resultado do batch de queries da BD para o chat. */
export interface ChatDbBatchResult {
  messageCount: Awaited<ReturnType<typeof getMessageCountByUserId>>;
  chat: Awaited<ReturnType<typeof getChatById>>;
  messagesFromDb: Awaited<ReturnType<typeof getMessagesByChatId>>;
  knowledgeDocsResult: Awaited<ReturnType<typeof getKnowledgeDocumentsByIds>>;
  builtInOverrides: Record<
    string,
    { instructions: string | null; label: string | null }
  >;
  balanceFromDb: number;
  customAgentFromBatch: Awaited<ReturnType<typeof getCustomAgentById>>;
  /** true se alguma query do batch usou fallback (timeout/erro); o cliente pode mostrar aviso. */
  usedFallback?: boolean;
}

/** Resultado de validação + RAG + getUserFiles. */
export interface ValidationRagResult {
  uiMessages: ChatMessage[];
  ragChunks: Awaited<ReturnType<typeof retrieveKnowledgeContext>>;
  userFilesFromArchivos: Awaited<ReturnType<typeof getUserFilesByIds>>;
}

/** Opções para runValidationRagUserFiles. */
export interface ValidationRagOptions {
  normalizedForValidation: ChatMessage[];
  isToolApprovalFlow: boolean;
  knowledgeDocsResult: Awaited<ReturnType<typeof getKnowledgeDocumentsByIds>>;
  lastUserText: string;
  session: Session;
  effectiveKnowledgeIds: string[];
  agentId: string;
  redatorBancoAllowedUserIds: string[] | undefined;
  archivoIds: PostRequestBody["archivoIds"];
}

/** Parâmetros para buildChatStreamResponse. */
export interface ChatStreamParams {
  requestStart: number;
  debugTracker: ReturnType<typeof createChatDebugTracker>;
  id: string;
  message: PostRequestBody["message"];
  session: Session;
  agentInstructions: PostRequestBody["agentInstructions"];
  agentConfig: AgentConfig;
  effectiveModel: string;
  titlePromise: Promise<string> | null;
  isToolApprovalFlow: boolean;
  uiMessages: ChatMessage[];
  requestHints: RequestHints;
  knowledgeContext: string | undefined;
  processoContext: string | undefined;
  /** true se o dbBatch usou fallback (timeout); o stream envia chunk para o cliente mostrar aviso. */
  dbUsedFallback?: boolean;
  /** Textos completos dos documentos anexados, para o tool buscarNoProcesso. */
  documentTexts: Map<string, string>;
  /** Tools MCP externas (Gmail, Drive, Notion, etc.) já carregadas. */
  mcpTools: Record<string, unknown>;
  /**
   * Documento em cache do intake do processo — injetado como contexto sintético
   * quando o utilizador não fez upload do PDF nesta sessão mas o processo já tem parsedText.
   * Evita re-upload do mesmo PDF a cada tarefa (fluxo "document-first").
   */
  cachedProcessoDocument?: {
    name: string;
    text: string;
    documentType?: "pi" | "contestacao";
  };
  /** ID do processo vinculado ao chat (para telemetria). */
  processoId?: string | null;
}

/** Contexto para o handler execute do stream. */
export interface StreamExecuteContext {
  session: ChatStreamParams["session"];
  agentInstructions: ChatStreamParams["agentInstructions"];
  agentConfig: AgentConfig;
  agentId: string;
  effectiveModel: string;
  requestHints: RequestHints;
  knowledgeContext: string | undefined;
  processoContext: string | undefined;
  messagesForModel: Awaited<ReturnType<typeof withPromptCaching>>;
  isReasoningModel: boolean;
  isAdaptiveThinking: boolean;
  titlePromise: Promise<string> | null;
  id: string;
  requestStart: number;
  preStreamEnd: number;
  dbUsedFallback?: boolean;
  /** Textos completos dos documentos anexados, para o tool buscarNoProcesso. */
  documentTexts: Map<string, string>;
  /** Tools MCP externas (Gmail, Drive, Notion, etc.) já carregadas. */
  mcpTools: Record<string, unknown>;
  /** ID do processo vinculado (para gravar telemetria em TaskExecution). */
  processoId: string | null;
}

/** Contexto para o handler onFinish do stream. */
export interface StreamOnFinishContext {
  requestStart: number;
  session: ChatStreamParams["session"];
  id: string;
  effectiveModel: string;
  isToolApprovalFlow: boolean;
  uiMessages: ChatMessage[];
}

/** Resultado da preparação de mensagens para o modelo. */
export type PrepareModelMessagesResult =
  | {
      messagesForModel: Awaited<ReturnType<typeof withPromptCaching>>;
      preStreamEnd: number;
    }
  | { response: Response };

/** Parâmetros para runCreditsAndPersist. */
export interface CreditsAndPersistParams {
  messageCount: number;
  userType: UserType;
  balanceFromDb: number;
  session: { user: { id: string } };
  initialCredits: number;
  chat: Awaited<ReturnType<typeof getChatById>>;
  id: string;
  message: PostRequestBody["message"];
  agentId: string;
  selectedVisibilityType: PostRequestBody["selectedVisibilityType"];
  isToolApprovalFlow: boolean;
  processoId?: string | null;
}
