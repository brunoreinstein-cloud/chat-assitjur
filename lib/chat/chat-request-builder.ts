import { DEFAULT_AGENT_ID_WHEN_EMPTY } from "@/lib/ai/agents-registry-metadata";

export interface ChatRequestRefs {
  currentModelIdRef: { current: string };
  agentInstructionsRef: { current: string };
  knowledgeDocumentIdsRef: { current: string[] };
  archivoIdsForChatRef: { current: string[] };
  agentIdRef: { current: string };
}

export function buildChatRequestBody(
  request: { id: string; messages: unknown[]; body: Record<string, unknown> },
  isContinuation: boolean,
  lastMessage: unknown,
  refs: ChatRequestRefs,
  initialChatModel: string,
  visibilityType: string,
  processoId?: string | null
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    id: request.id,
    ...(isContinuation
      ? { messages: request.messages }
      : { message: lastMessage }),
    selectedChatModel:
      refs.currentModelIdRef.current?.trim() || initialChatModel,
    selectedVisibilityType: visibilityType ?? "private",
    agentId: refs.agentIdRef.current?.trim() || DEFAULT_AGENT_ID_WHEN_EMPTY,
    ...request.body,
  };
  if (refs.agentInstructionsRef.current?.trim()) {
    body.agentInstructions = refs.agentInstructionsRef.current.trim();
  }
  if (refs.knowledgeDocumentIdsRef.current.length > 0) {
    body.knowledgeDocumentIds = refs.knowledgeDocumentIdsRef.current;
  }
  if (refs.archivoIdsForChatRef.current.length > 0) {
    body.archivoIds = refs.archivoIdsForChatRef.current;
  }
  if (processoId) {
    body.processoId = processoId;
  }
  return body;
}
