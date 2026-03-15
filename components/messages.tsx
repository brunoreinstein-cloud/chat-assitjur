import type { UseChatHelpers } from "@ai-sdk/react";
import { ArrowDownIcon } from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import { useMessages } from "@/hooks/use-messages";
import type { AgentId } from "@/lib/ai/agents-registry-metadata";
import type { Vote } from "@/lib/db/schema";
import {
  getPipelineDashboardData,
  subscribePipelineDashboard,
} from "@/lib/pipeline-dashboard-store";
import type { Attachment, ChatMessage } from "@/lib/types";
import { ChatEmptyState } from "./chat-empty-state";
import { useDataStream } from "./data-stream-provider";
import { Greeting } from "./greeting";
import { PreviewMessage, ThinkingMessage } from "./message";
import { PipelineQualityDashboard } from "./pipeline-quality-dashboard";
import { RedatorContestacaoHint } from "./redator-contestacao-hint";
import { RevisorChecklist } from "./revisor-checklist";
import {
  findLastAssistantIndexWithGate05,
  getUserMessageText,
} from "./revisor-phase-banner";
import { Button } from "./ui/button";

interface MessagesProps {
  addToolApprovalResponse: UseChatHelpers<ChatMessage>["addToolApprovalResponse"];
  chatId: string;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  status: UseChatHelpers<ChatMessage>["status"];
  votes: Vote[] | undefined;
  messages: ChatMessage[];
  sendMessage: (msg: {
    role: "user";
    parts: Array<{ type: "text"; text: string }>;
  }) => void;
  setInput: (value: string) => void;
  setMessages: UseChatHelpers<ChatMessage>["setMessages"];
  regenerate: UseChatHelpers<ChatMessage>["regenerate"];
  isReadonly: boolean;
  /** Callback para o onboarding: abrir base de conhecimento */
  onOpenKnowledge?: () => void;
  /** Callback para o onboarding: focar a barra de digitação */
  onFocusInput?: () => void;
  /** Para verificação centralizada (Revisor): anexos e base de conhecimento */
  attachments?: Attachment[];
  knowledgeDocumentIds?: string[];
  agentId?: string;
  /** Quando definidos, usa ChatEmptyState em vez de Greeting no estado vazio */
  onAgentSelect?: (id: AgentId) => void;
  onQuickPrompt?: (text: string) => void;
  /** Opcional: chamado para cancelar o pedido em curso (mostrado no aviso de espera longa) */
  onStop?: () => void;
  /** true quando o servidor usou fallback da BD (resposta pode ter dados parciais) */
  dbFallbackUsed?: boolean;
}

function PureMessages({
  addToolApprovalResponse,
  chatId,
  inputRef,
  status,
  votes,
  messages,
  sendMessage,
  setInput,
  setMessages,
  regenerate,
  isReadonly,
  onOpenKnowledge,
  onFocusInput,
  attachments = [],
  knowledgeDocumentIds = [],
  agentId,
  onAgentSelect,
  onQuickPrompt,
  onStop,
  dbFallbackUsed = false,
}: Readonly<MessagesProps>) {
  const {
    containerRef: messagesContainerRef,
    endRef: messagesEndRef,
    isAtBottom,
    scrollToBottom,
    hasSentMessage,
  } = useMessages({
    status,
  });

  const [submittedElapsedMs, setSubmittedElapsedMs] = useState(0);
  useEffect(() => {
    if (status !== "submitted") {
      setSubmittedElapsedMs(0);
      return;
    }
    const start = Date.now();
    const interval = setInterval(() => {
      setSubmittedElapsedMs(Date.now() - start);
    }, 1000);
    return () => clearInterval(interval);
  }, [status]);

  useDataStream();

  const pipelineDashboard = useSyncExternalStore(
    subscribePipelineDashboard,
    getPipelineDashboardData,
    () => null
  );

  const focusInput = useCallback(() => {
    setTimeout(() => inputRef.current?.focus(), 0);
  }, [inputRef]);

  const gate05State = useMemo(() => {
    const gate05Idx = findLastAssistantIndexWithGate05(messages);
    const lastAssistantIndex = messages.findLastIndex(
      (m) => m?.role === "assistant"
    );
    const afterGate05 = gate05Idx >= 0 ? messages.slice(gate05Idx + 1) : [];
    const userRepliedToGate05 = afterGate05.some(
      (m) =>
        m.role === "user" &&
        (getUserMessageText(m) === "CONFIRMAR" ||
          getUserMessageText(m).startsWith("CORRIGIR:"))
    );
    return {
      gate05Idx,
      lastAssistantIndex: lastAssistantIndex >= 0 ? lastAssistantIndex : -1,
      userRepliedToGate05,
    };
  }, [messages]);

  const { gate05Idx, lastAssistantIndex, userRepliedToGate05 } = gate05State;

  const hasApprovalResponded = useMemo(
    () =>
      messages.some((msg) =>
        msg.parts?.some(
          (part) =>
            part != null &&
            "state" in part &&
            (part as { state?: string }).state === "approval-responded"
        )
      ),
    [messages]
  );

  const showNewEmptyState =
    messages.length === 0 && onAgentSelect != null && onQuickPrompt != null;

  return (
    <div className="relative flex-1 bg-background dark:bg-[#0d0f12]">
      <div
        className="absolute inset-0 touch-pan-y overflow-y-auto bg-background dark:bg-[#0d0f12]"
        ref={messagesContainerRef}
      >
        <div className="mx-auto flex min-w-0 max-w-4xl flex-col gap-4 px-2 py-4 md:gap-6 md:px-4">
          {messages.length === 0 && (
            <>
              {showNewEmptyState ? (
                <ChatEmptyState
                  onAgentSelect={onAgentSelect}
                  onQuickPrompt={(text) => {
                    onQuickPrompt(text);
                    focusInput();
                  }}
                />
              ) : (
                <Greeting
                  agentId={agentId}
                  onFocusInput={
                    onFocusInput ?? (() => inputRef.current?.focus())
                  }
                  onOpenKnowledge={onOpenKnowledge}
                />
              )}
              {agentId === "revisor-defesas" && (
                <RevisorChecklist
                  attachments={attachments}
                  knowledgeDocumentIds={knowledgeDocumentIds}
                  messageCount={messages.length}
                  onOpenKnowledge={onOpenKnowledge}
                  variant="central"
                />
              )}
              {agentId === "redator-contestacao" && <RedatorContestacaoHint />}
            </>
          )}

          {messages.map((message, index) => (
            <PreviewMessage
              addToolApprovalResponse={addToolApprovalResponse}
              chatId={chatId}
              gate05ConfirmInline={
                !isReadonly &&
                message.role === "assistant" &&
                index === gate05Idx &&
                !userRepliedToGate05
              }
              isLoading={
                status === "streaming" && messages.length - 1 === index
              }
              isReadonly={isReadonly}
              key={message.id}
              message={message}
              onConfirmGate05={() =>
                sendMessage({
                  role: "user",
                  parts: [{ type: "text", text: "CONFIRMAR" }],
                })
              }
              onCorrigirGate05={() => {
                setInput("CORRIGIR: ");
                focusInput();
              }}
              regenerate={regenerate}
              requiresScrollPadding={
                hasSentMessage && index === messages.length - 1
              }
              setMessages={setMessages}
              showLastUsage={
                !isReadonly &&
                message.role === "assistant" &&
                index === lastAssistantIndex
              }
              vote={
                votes
                  ? votes.find((vote) => vote.messageId === message.id)
                  : undefined
              }
            />
          ))}

          {pipelineDashboard && (
            <div className="mx-auto w-full max-w-[640px]">
              <PipelineQualityDashboard data={pipelineDashboard} />
            </div>
          )}

          {status === "submitted" && !hasApprovalResponded && (
            <div className="flex flex-col gap-2">
              <ThinkingMessage />
              {submittedElapsedMs >= 5000 && onStop && !isReadonly && (
                <p className="text-muted-foreground text-sm">
                  A demorar mais do que o habitual. Se for a primeira vez ou
                  após muito tempo sem usar, a base de dados pode estar a
                  acordar — podes{" "}
                  <Button
                    className="h-auto p-0 font-normal text-sm underline"
                    onClick={onStop}
                    type="button"
                    variant="link"
                  >
                    cancelar e tentar de novo
                  </Button>
                  .
                </p>
              )}
            </div>
          )}
          {dbFallbackUsed && (
            <p
              aria-atomic="true"
              aria-live="polite"
              className="text-muted-foreground text-sm"
            >
              Resposta pode incluir dados parciais (base de dados lenta).
            </p>
          )}

          <div
            className="min-h-[24px] min-w-[24px] shrink-0"
            ref={messagesEndRef}
          />
        </div>
      </div>

      <button
        aria-label="Rolar para o final"
        className={`absolute bottom-4 left-1/2 z-10 -translate-x-1/2 rounded-full border border-border bg-muted/95 p-2 shadow-lg transition-all hover:bg-accent ${
          isAtBottom
            ? "pointer-events-none scale-0 opacity-0"
            : "pointer-events-auto scale-100 opacity-100"
        }`}
        onClick={() => scrollToBottom("smooth")}
        type="button"
      >
        <ArrowDownIcon className="size-4 text-foreground" />
      </button>
    </div>
  );
}

export const Messages = PureMessages;
