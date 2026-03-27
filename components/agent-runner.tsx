"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useCallback, useRef, useState } from "react";
import { RunnerExecutionPhase } from "@/components/runner-execution-phase";
import { RunnerUploadPhase } from "@/components/runner-upload-phase";
import { RunnerValidationPhase } from "@/components/runner-validation-phase";
import { buildAttachmentParts } from "@/lib/attachments/utils";
import type { DocumentType, RunnerPhase } from "@/lib/runner/types";
import type { Attachment, ChatMessage, ChatMessagePart } from "@/lib/types";
import { generateUUID } from "@/lib/utils";

interface AgentRunnerProps {
  agentId: string;
  agentLabel: string;
  agentDescription: string;
  requiredDocumentTypes: DocumentType[];
  minDocuments?: number;
  allowedModelIds?: string[];
  initialModel: string;
}

export function AgentRunner({
  agentId,
  agentLabel,
  agentDescription,
  requiredDocumentTypes,
  minDocuments,
  initialModel,
}: AgentRunnerProps) {
  const [phase, setPhase] = useState<RunnerPhase>("upload");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [chatId] = useState(() => generateUUID());
  const modelRef = useRef(initialModel);

  const { messages, sendMessage, status } = useChat<ChatMessage>({
    id: chatId,
    messages: [],
    generateId: generateUUID,
    transport: new DefaultChatTransport({
      api: "/api/chat",
      prepareSendMessagesRequest(request) {
        const lastMsg = request.messages.at(-1);
        // Extract only the fields the server schema expects for a user message
        const message = lastMsg
          ? {
              id: lastMsg.id,
              role: lastMsg.role,
              parts: lastMsg.parts.map((p) => {
                if (p.type === "text") {
                  return { type: "text", text: (p as { text: string }).text };
                }
                if (p.type === "file") {
                  return p;
                }
                // document parts
                return p;
              }),
            }
          : undefined;
        return {
          body: {
            id: chatId,
            message,
            selectedChatModel: modelRef.current,
            selectedVisibilityType: "private",
            agentId,
          },
        };
      },
    }),
  });

  const handleExecute = useCallback(() => {
    setPhase("execute");

    const parts = buildAttachmentParts(attachments);
    sendMessage({
      role: "user",
      parts: [
        ...(parts as ChatMessagePart[]),
        {
          type: "text" as const,
          text: "Executar análise dos documentos anexados.",
        },
      ],
    });
  }, [attachments, sendMessage]);

  const handleReset = useCallback(() => {
    // Reload gives a fresh chatId and clean state
    window.location.reload();
  }, []);

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col items-center px-4 py-10">
      {phase === "upload" && (
        <RunnerUploadPhase
          agentDescription={agentDescription}
          agentLabel={agentLabel}
          attachments={attachments}
          minDocuments={minDocuments}
          onReady={() => setPhase("validate")}
          requiredDocumentTypes={requiredDocumentTypes}
          setAttachments={setAttachments}
        />
      )}

      {phase === "validate" && (
        <RunnerValidationPhase
          agentLabel={agentLabel}
          attachments={attachments}
          onBack={() => setPhase("upload")}
          onExecute={handleExecute}
        />
      )}

      {(phase === "execute" || phase === "complete" || phase === "error") && (
        <RunnerExecutionPhase
          agentId={agentId}
          chatId={chatId}
          messages={messages}
          onReset={handleReset}
          status={status}
        />
      )}
    </div>
  );
}
