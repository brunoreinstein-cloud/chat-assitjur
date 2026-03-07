"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import useSWR, { useSWRConfig } from "swr";
import { unstable_serialize } from "swr/infinite";
import { ChatComposerHeader } from "@/components/chat-composer-header";
import { ChatTopbar } from "@/components/chat-topbar";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useArtifactSelector } from "@/hooks/use-artifact";
import { useAutoResume } from "@/hooks/use-auto-resume";
import { useChatVisibility } from "@/hooks/use-chat-visibility";
import {
  getDefaultModelForAgent,
  isModelAllowedForAgent,
} from "@/lib/ai/agent-models";
import {
  AGENT_IDS,
  type AgentId,
  DEFAULT_AGENT_ID_WHEN_EMPTY,
} from "@/lib/ai/agents-registry-metadata";
import type { Vote } from "@/lib/db/schema";
import { ChatbotError } from "@/lib/errors";
import type { Attachment, ChatMessage } from "@/lib/types";
import {
  fetcher,
  fetchWithErrorHandlers,
  generateUUID,
  getTextFromMessage,
} from "@/lib/utils";
import { Artifact } from "./artifact";
import { DataPolicyLink } from "./data-policy-link";
import { type DataStreamState, useDataStream } from "./data-stream-provider";
import { KnowledgeSidebar } from "./knowledge-sidebar";
import { Messages } from "./messages";
import { MultimodalInput } from "./multimodal-input";
import { RevisorPhaseBanner } from "./revisor-phase-banner";
import { getChatHistoryPaginationKey } from "./sidebar-history";
import { toast } from "./toast";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import type { VisibilityType } from "./visibility-selector";

const MAX_KNOWLEDGE_SELECT = 50;

type ChatProps = Readonly<{
  id: string;
  initialMessages: ChatMessage[];
  initialChatModel: string;
  initialVisibilityType: VisibilityType;
  /** Agente ao carregar o chat (restaurado da BD); omitido = nenhum (novo chat). */
  initialAgentId?: string;
  isReadonly: boolean;
  autoResume: boolean;
}>;

export function Chat({
  id,
  initialMessages,
  initialChatModel,
  initialVisibilityType,
  initialAgentId,
  isReadonly,
  autoResume,
}: ChatProps) {
  const router = useRouter();
  const pathname = usePathname();

  const { visibilityType } = useChatVisibility({
    chatId: id,
    initialVisibilityType,
  });

  const { mutate } = useSWRConfig();

  // Handle browser back/forward navigation
  useEffect(() => {
    const handlePopState = () => {
      // When user navigates back/forward, refresh to sync with URL
      router.refresh();
    };

    globalThis.addEventListener("popstate", handlePopState);
    return () => globalThis.removeEventListener("popstate", handlePopState);
  }, [router]);
  const { setDataStream } = useDataStream();

  const [input, setInput] = useState<string>("");
  const [showCreditCardAlert, setShowCreditCardAlert] = useState(false);
  const [currentModelId, setCurrentModelId] = useState(initialChatModel);
  const [agentInstructions, setAgentInstructions] = useState<string>("");
  const [agentId, setAgentId] = useState<string>(initialAgentId ?? "");
  const [knowledgeDocumentIds, setKnowledgeDocumentIds] = useState<string[]>(
    []
  );
  const [archivoIdsForChat, setArchivoIdsForChat] = useState<string[]>([]);
  const [saveToKnowledgeOpen, setSaveToKnowledgeOpen] = useState(false);
  const [saveToKnowledgeTitle, setSaveToKnowledgeTitle] = useState("");
  const [isSavingToKnowledge, setIsSavingToKnowledge] = useState(false);
  const currentModelIdRef = useRef(currentModelId);
  const agentInstructionsRef = useRef(agentInstructions);
  const agentIdRef = useRef(agentId);
  const knowledgeDocumentIdsRef = useRef(knowledgeDocumentIds);
  const archivoIdsForChatRef = useRef(archivoIdsForChat);

  useEffect(() => {
    currentModelIdRef.current = currentModelId;
  }, [currentModelId]);

  useEffect(() => {
    agentInstructionsRef.current = agentInstructions;
  }, [agentInstructions]);

  useEffect(() => {
    agentIdRef.current = agentId;
  }, [agentId]);

  useEffect(() => {
    const effectiveAgentId = agentId?.trim() || DEFAULT_AGENT_ID_WHEN_EMPTY;
    if (!isModelAllowedForAgent(effectiveAgentId, currentModelId)) {
      setCurrentModelId(getDefaultModelForAgent(effectiveAgentId));
    }
  }, [agentId, currentModelId]); // only when agent changes; currentModelId intentionally omitted to avoid loops

  useEffect(() => {
    knowledgeDocumentIdsRef.current = knowledgeDocumentIds;
  }, [knowledgeDocumentIds]);

  useEffect(() => {
    archivoIdsForChatRef.current = archivoIdsForChat;
  }, [archivoIdsForChat]);

  // Sincroniza o agente selecionado com a URL na página de novo chat (sidebar reflete o estado)
  useEffect(() => {
    if (pathname !== "/chat" || typeof globalThis.window === "undefined") {
      return;
    }
    const expectedSearch = agentId
      ? `?agent=${encodeURIComponent(agentId)}`
      : "";
    if (globalThis.window.location.search !== expectedSearch) {
      router.replace(`/chat${expectedSearch}`);
    }
  }, [agentId, pathname, router]);

  // Ao selecionar um agente personalizado, preencher a base de conhecimento com a do agente
  useEffect(() => {
    if (!agentId || AGENT_IDS.includes(agentId as AgentId)) {
      return;
    }
    fetch(`/api/agents/custom/${agentId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((agent: { knowledgeDocumentIds?: string[] } | null) => {
        const ids = Array.isArray(agent?.knowledgeDocumentIds)
          ? agent.knowledgeDocumentIds.slice(0, MAX_KNOWLEDGE_SELECT)
          : [];
        setKnowledgeDocumentIds(ids);
      })
      .catch(() => {
        // Ignore fetch errors (e.g. no agent config)
      });
  }, [agentId]);

  const {
    messages,
    setMessages,
    sendMessage,
    status,
    stop,
    regenerate,
    resumeStream,
    addToolApprovalResponse,
  } = useChat<ChatMessage>({
    id,
    messages: initialMessages,
    generateId: generateUUID,
    sendAutomaticallyWhen: ({ messages: currentMessages }) => {
      const lastMessage = currentMessages.at(-1);
      const shouldContinue =
        lastMessage?.parts?.some(
          (part) =>
            part != null &&
            "state" in part &&
            part?.state === "approval-responded" &&
            "approval" in part &&
            (part.approval as { approved?: boolean })?.approved === true
        ) ?? false;
      return shouldContinue;
    },
    transport: new DefaultChatTransport({
      api: "/api/chat",
      fetch: fetchWithErrorHandlers,
      prepareSendMessagesRequest(request) {
        const lastMessage = request.messages.at(-1);
        const isToolApprovalContinuation =
          lastMessage?.role !== "user" ||
          request.messages.some((msg) =>
            msg.parts?.some((part) => {
              if (part == null) {
                return false;
              }
              const state = (part as { state?: string })?.state;
              return (
                state === "approval-responded" || state === "output-denied"
              );
            })
          );

        return {
          body: {
            id: request.id,
            ...(isToolApprovalContinuation
              ? { messages: request.messages }
              : { message: lastMessage }),
            selectedChatModel:
              currentModelIdRef.current?.trim() || initialChatModel,
            selectedVisibilityType: visibilityType ?? "private",
            ...(agentInstructionsRef.current?.trim()
              ? { agentInstructions: agentInstructionsRef.current.trim() }
              : {}),
            ...(knowledgeDocumentIdsRef.current.length > 0
              ? { knowledgeDocumentIds: knowledgeDocumentIdsRef.current }
              : {}),
            ...(archivoIdsForChatRef.current.length > 0
              ? { archivoIds: archivoIdsForChatRef.current }
              : {}),
            agentId: agentIdRef.current?.trim() || DEFAULT_AGENT_ID_WHEN_EMPTY,
            ...request.body,
          },
        };
      },
    }),
    onData: (dataPart) => {
      setDataStream(
        (ds) => (ds ? [...ds, dataPart] : []) as unknown as DataStreamState
      );
    },
    onFinish: () => {
      mutate(unstable_serialize(getChatHistoryPaginationKey));
      mutate("/api/credits");
    },
    onError: (error: unknown) => {
      const unwrapped =
        error instanceof Error && error.cause instanceof ChatbotError
          ? error.cause
          : error;
      const errMessage =
        unwrapped instanceof Error ? unwrapped.message : String(unwrapped);
      const cause =
        unwrapped instanceof Error && "cause" in unwrapped
          ? (unwrapped as { cause?: unknown }).cause
          : undefined;
      const causeStr =
        cause instanceof Error
          ? cause.message
          : typeof cause === "string"
            ? cause
            : "";
      const isContextLimit =
        errMessage.includes("context_limit") ||
        errMessage.includes("excede o limite") ||
        causeStr.includes("context_limit");
      if (isContextLimit) {
        toast({
          type: "error",
          description:
            "O contexto desta conversa excede o limite do modelo. Por favor, inicia um novo chat.",
        });
        return;
      }
      if (unwrapped instanceof ChatbotError) {
        if (
          unwrapped.message?.includes("AI Gateway requires a valid credit card")
        ) {
          setShowCreditCardAlert(true);
        } else {
          const description = unwrapped.cause ?? unwrapped.message;
          toast({
            type: "error",
            description,
          });
        }
      } else {
        const message =
          unwrapped instanceof Error
            ? unwrapped.message
            : "Algo correu mal. Tente novamente.";
        toast({ type: "error", description: message });
      }
    },
  });

  const searchParams = useSearchParams();
  const query = searchParams.get("query");
  const [knowledgeOpen, setKnowledgeOpen] = useState(false);

  useEffect(() => {
    if (searchParams.get("knowledge") === "open") {
      setKnowledgeOpen(true);
    }
  }, [searchParams]);

  const closeKnowledgeSidebar = useCallback(() => {
    setKnowledgeOpen(false);
    if (globalThis.window !== undefined) {
      const base = pathname ?? "/chat";
      const params = new URLSearchParams(globalThis.window.location.search);
      params.delete("knowledge");
      params.delete("folder");
      const q = params.toString();
      globalThis.window.history.replaceState(
        null,
        "",
        q ? `${base}?${q}` : base
      );
    }
  }, [pathname]);

  const openKnowledgeSidebar = useCallback(() => {
    setKnowledgeOpen(true);
    if (globalThis.window !== undefined) {
      const base = pathname ?? "/chat";
      const params = new URLSearchParams(globalThis.window.location.search);
      params.set("knowledge", "open");
      globalThis.window.history.replaceState(
        null,
        "",
        `${base}?${params.toString()}`
      );
    }
  }, [pathname]);

  const [hasAppendedQuery, setHasAppendedQuery] = useState(false);

  useEffect(() => {
    if (query && !hasAppendedQuery) {
      sendMessage({
        role: "user" as const,
        parts: [{ type: "text", text: query }],
      });

      setHasAppendedQuery(true);
      globalThis.window.history.replaceState({}, "", `/chat/${id}`);
    }
  }, [query, sendMessage, hasAppendedQuery, id]);

  const { data: votes } = useSWR<Vote[]>(
    messages.length >= 2 ? `/api/vote?chatId=${id}` : null,
    fetcher,
    { dedupingInterval: 5000 }
  );

  const DRAFT_ATTACHMENTS_KEY = `chat-draft-attachments-${id}`;

  const [attachments, setAttachments] = useState<Attachment[]>(() => {
    if (globalThis.window === undefined) {
      return [];
    }
    try {
      const raw = globalThis.sessionStorage.getItem(DRAFT_ATTACHMENTS_KEY);
      return raw ? (JSON.parse(raw) as Attachment[]) : [];
    } catch {
      return [];
    }
  });

  const prevChatIdRef = useRef<string>(id);

  useEffect(() => {
    try {
      const raw = globalThis.sessionStorage.getItem(DRAFT_ATTACHMENTS_KEY);
      const stored = raw ? (JSON.parse(raw) as Attachment[]) : [];
      setAttachments(stored);
    } catch {
      setAttachments([]);
    }
  }, [DRAFT_ATTACHMENTS_KEY]);

  useEffect(() => {
    if (prevChatIdRef.current !== id) {
      prevChatIdRef.current = id;
      return;
    }
    try {
      const key = `chat-draft-attachments-${id}`;
      if (attachments.length > 0) {
        globalThis.sessionStorage.setItem(key, JSON.stringify(attachments));
      } else {
        globalThis.sessionStorage.removeItem(key);
      }
    } catch {
      // Ignora falhas de quota ou sessão
    }
  }, [attachments, id]);

  const isArtifactVisible = useArtifactSelector((state) => state.isVisible);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  useAutoResume({
    autoResume,
    initialMessages,
    resumeStream,
    setMessages,
  });

  const lastAssistantMessage = [...messages]
    .reverse()
    .find((m) => m.role === "assistant");
  const lastAssistantText =
    lastAssistantMessage == null
      ? ""
      : getTextFromMessage(lastAssistantMessage).trim();
  const hasAssistantMessage =
    typeof lastAssistantText === "string" && lastAssistantText.length > 0;

  const openSaveToKnowledgeDialog = () => {
    setSaveToKnowledgeTitle(
      `Resposta do chat - ${new Date().toLocaleDateString("pt-PT", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      })}`
    );
    setSaveToKnowledgeOpen(true);
  };

  const handleSaveToKnowledgeConfirm = async () => {
    if (!hasAssistantMessage || lastAssistantText.length === 0) {
      return;
    }
    const title =
      saveToKnowledgeTitle.trim().slice(0, 512) || "Resposta do chat";
    setIsSavingToKnowledge(true);
    try {
      const res = await fetch("/api/knowledge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, content: lastAssistantText }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as {
          message?: string;
        };
        toast.error(data?.message ?? "Erro ao guardar em conhecimento.");
        return;
      }
      const created = (await res.json()) as { id: string; title: string };
      setKnowledgeDocumentIds((prev) =>
        prev.length < MAX_KNOWLEDGE_SELECT ? [...prev, created.id] : prev
      );
      mutate("/api/knowledge");
      setSaveToKnowledgeOpen(false);
      toast.success(
        "Guardado em conhecimento. Este conteúdo poderá ser usado como contexto noutros chats."
      );
    } catch {
      toast.error("Erro ao guardar em conhecimento.");
    } finally {
      setIsSavingToKnowledge(false);
    }
  };

  const effectiveAgentId =
    agentId && AGENT_IDS.includes(agentId as (typeof AGENT_IDS)[number])
      ? agentId
      : AGENT_IDS[0];

  return (
    <>
      <div className="flex h-dvh w-full min-w-0 bg-background dark:bg-[#0d0f12]">
        <div className="overscroll-behavior-contain flex min-w-0 flex-1 touch-pan-y flex-col">
          <ChatTopbar
            activeAgent={effectiveAgentId}
            chatId={id}
            hasAssistantMessage={hasAssistantMessage}
            isReadonly={isReadonly}
            onKnowledgeBase={openKnowledgeSidebar}
            onSaveToKnowledge={openSaveToKnowledgeDialog}
            selectedVisibilityType={visibilityType}
          />

          {!isReadonly && (
            <div className="border-border bg-muted/30 dark:border-white/8 dark:bg-[#13161b] [&_*]:text-muted-foreground dark:[&_*]:text-[#6b7280] [&_button]:border-border [&_button]:bg-transparent [&_button]:text-foreground [&_button]:hover:bg-muted dark:[&_button]:border-white/8 dark:[&_button]:text-[#e8eaf0] dark:[&_button]:hover:bg-[#1a1e26]">
              <ChatComposerHeader
                agentId={agentId}
                onModelChange={setCurrentModelId}
                selectedModelId={currentModelId}
                setAgentId={setAgentId}
              />
            </div>
          )}

          <Messages
            addToolApprovalResponse={addToolApprovalResponse}
            agentId={agentId}
            attachments={attachments}
            chatId={id}
            inputRef={inputRef}
            isArtifactVisible={isArtifactVisible}
            isReadonly={isReadonly}
            knowledgeDocumentIds={knowledgeDocumentIds}
            messages={messages}
            onAgentSelect={isReadonly ? undefined : setAgentId}
            onFocusInput={
              isReadonly
                ? undefined
                : () => {
                    inputRef.current?.focus();
                  }
            }
            onOpenKnowledge={isReadonly ? undefined : openKnowledgeSidebar}
            onQuickPrompt={isReadonly ? undefined : setInput}
            onStop={isReadonly ? undefined : stop}
            regenerate={regenerate}
            selectedModelId={initialChatModel}
            sendMessage={sendMessage}
            setInput={setInput}
            setMessages={setMessages}
            status={status}
            votes={votes}
          />

          {!isReadonly && agentId === "revisor-defesas" && (
            <RevisorPhaseBanner
              inputRef={inputRef}
              isReadonly={isReadonly}
              messages={messages}
              sendMessage={sendMessage}
              setInput={setInput}
              status={status}
            />
          )}

          <div className="sticky bottom-0 z-1 mx-auto flex w-full max-w-4xl flex-col gap-1 border-border/60 border-t bg-background px-2 pb-3 shadow-[0_-4px_12px_rgba(0,0,0,0.04)] md:px-4 md:pb-4">
            {!isReadonly && (
              <MultimodalInput
                agentId={agentId}
                agentInstructions={agentInstructions}
                attachments={attachments}
                chatId={id}
                input={input}
                inputRef={inputRef}
                knowledgeDocumentIds={knowledgeDocumentIds}
                messages={messages}
                onModelChange={setCurrentModelId}
                onOpenKnowledgeSidebar={openKnowledgeSidebar}
                selectedModelId={currentModelId}
                selectedVisibilityType={visibilityType}
                sendMessage={sendMessage}
                setAgentId={setAgentId}
                setAgentInstructions={setAgentInstructions}
                setAttachments={setAttachments}
                setInput={setInput}
                setKnowledgeDocumentIds={setKnowledgeDocumentIds}
                setMessages={setMessages}
                status={status}
                stop={stop}
              />
            )}
            <p className="flex justify-center text-muted-foreground text-xs">
              <DataPolicyLink />
            </p>
          </div>
        </div>

        {!isReadonly && knowledgeOpen && (
          <KnowledgeSidebar
            archivoIdsForChat={archivoIdsForChat}
            knowledgeDocumentIds={knowledgeDocumentIds}
            onClose={closeKnowledgeSidebar}
            setArchivoIdsForChat={setArchivoIdsForChat}
            setKnowledgeDocumentIds={setKnowledgeDocumentIds}
          />
        )}
      </div>

      <Artifact
        addToolApprovalResponse={addToolApprovalResponse}
        attachments={attachments}
        chatId={id}
        input={input}
        isReadonly={isReadonly}
        messages={messages}
        regenerate={regenerate}
        selectedModelId={currentModelId}
        selectedVisibilityType={visibilityType}
        sendMessage={sendMessage}
        setAttachments={setAttachments}
        setInput={setInput}
        setMessages={setMessages}
        status={status}
        stop={stop}
        votes={votes}
      />

      <AlertDialog
        onOpenChange={setShowCreditCardAlert}
        open={showCreditCardAlert}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Activate AI Gateway</AlertDialogTitle>
            <AlertDialogDescription>
              This application requires{" "}
              {process.env.NODE_ENV === "production" ? "the owner" : "you"} to
              activate Vercel AI Gateway.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                globalThis.window.open(
                  "https://vercel.com/d?to=%2F%5Bteam%5D%2F%7E%2Fai%3Fmodal%3Dadd-credit-card",
                  "_blank"
                );
                globalThis.window.location.href = "/";
              }}
            >
              Activate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog
        onOpenChange={(open) => {
          setSaveToKnowledgeOpen(open);
        }}
        open={saveToKnowledgeOpen}
      >
        <DialogContent aria-describedby="save-to-knowledge-warning">
          <DialogHeader>
            <DialogTitle>Guardar em conhecimento</DialogTitle>
            <DialogDescription id="save-to-knowledge-warning">
              A última resposta do assistente será guardada como documento na
              base de conhecimento. Este conteúdo passará a poder ser usado como
              contexto noutros chats. Confirme se deseja continuar.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2 py-2">
            <Label htmlFor="save-to-knowledge-title">Título do documento</Label>
            <Input
              id="save-to-knowledge-title"
              maxLength={512}
              onChange={(e) => setSaveToKnowledgeTitle(e.target.value)}
              placeholder="Resposta do chat — …"
              value={saveToKnowledgeTitle}
            />
          </div>
          <DialogFooter>
            <Button
              disabled={isSavingToKnowledge || !saveToKnowledgeTitle.trim()}
              onClick={handleSaveToKnowledgeConfirm}
              type="button"
            >
              {isSavingToKnowledge ? "A guardar…" : "Guardar"}
            </Button>
            <Button
              disabled={isSavingToKnowledge}
              onClick={() => setSaveToKnowledgeOpen(false)}
              type="button"
              variant="outline"
            >
              Cancelar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
