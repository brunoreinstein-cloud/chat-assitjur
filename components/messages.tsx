import type { UseChatHelpers } from "@ai-sdk/react";
import { ArrowDownIcon } from "lucide-react";
import { useMessages } from "@/hooks/use-messages";
import type { Vote } from "@/lib/db/schema";
import type { ChatMessage } from "@/lib/types";
import { useDataStream } from "./data-stream-provider";
import { Greeting } from "./greeting";
import { PreviewMessage, ThinkingMessage } from "./message";
import {
  findLastAssistantIndexWithGate05,
  getUserMessageText,
} from "./revisor-phase-banner";

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
  isArtifactVisible: boolean;
  selectedModelId: string;
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
  selectedModelId: _selectedModelId,
}: MessagesProps) {
  const {
    containerRef: messagesContainerRef,
    endRef: messagesEndRef,
    isAtBottom,
    scrollToBottom,
    hasSentMessage,
  } = useMessages({
    status,
  });

  useDataStream();

  const gate05Idx = findLastAssistantIndexWithGate05(messages);
  const afterGate05 = messages.slice(gate05Idx + 1);
  const userRepliedToGate05 = afterGate05.some(
    (m) =>
      m.role === "user" &&
      (getUserMessageText(m) === "CONFIRMAR" ||
        getUserMessageText(m).startsWith("CORRIGIR:"))
  );

  return (
    <div className="relative flex-1 bg-background">
      <div
        className="absolute inset-0 touch-pan-y overflow-y-auto bg-background"
        ref={messagesContainerRef}
      >
        <div className="mx-auto flex min-w-0 max-w-4xl flex-col gap-4 px-2 py-4 md:gap-6 md:px-4">
          {messages.length === 0 && <Greeting />}

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
                setTimeout(() => {
                  inputRef.current?.focus();
                }, 0);
              }}
              regenerate={regenerate}
              requiresScrollPadding={
                hasSentMessage && index === messages.length - 1
              }
              setMessages={setMessages}
              vote={
                votes
                  ? votes.find((vote) => vote.messageId === message.id)
                  : undefined
              }
            />
          ))}

          {status === "submitted" &&
            !messages.some((msg) =>
              msg.parts?.some(
                (part) =>
                  part != null &&
                  "state" in part &&
                  part.state === "approval-responded"
              )
            ) && <ThinkingMessage />}

          <div
            className="min-h-[24px] min-w-[24px] shrink-0"
            ref={messagesEndRef}
          />
        </div>
      </div>

      <button
        aria-label="Rolar para o final"
        className={`absolute bottom-4 left-1/2 z-10 -translate-x-1/2 rounded-full border bg-background p-2 shadow-lg transition-all hover:bg-muted ${
          isAtBottom
            ? "pointer-events-none scale-0 opacity-0"
            : "pointer-events-auto scale-100 opacity-100"
        }`}
        onClick={() => scrollToBottom("smooth")}
        type="button"
      >
        <ArrowDownIcon className="size-4" />
      </button>
    </div>
  );
}

export const Messages = PureMessages;
