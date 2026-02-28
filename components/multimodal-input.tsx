"use client";

import type { UseChatHelpers } from "@ai-sdk/react";
import type { UIMessage, UIMessagePart } from "ai";
import { upload as uploadToBlob } from "@vercel/blob/client";
import equal from "fast-deep-equal";
import { CheckIcon } from "lucide-react";
import {
  type ChangeEvent,
  type Dispatch,
  memo,
  type SetStateAction,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import { useLocalStorage, useWindowSize } from "usehooks-ts";
import {
  ModelSelector,
  ModelSelectorContent,
  ModelSelectorGroup,
  ModelSelectorInput,
  ModelSelectorItem,
  ModelSelectorList,
  ModelSelectorLogo,
  ModelSelectorName,
  ModelSelectorTrigger,
} from "@/components/ai-elements/model-selector";
import {
  chatModels,
  DEFAULT_CHAT_MODEL,
  modelsByProvider,
} from "@/lib/ai/models";
import type {
  Attachment,
  ChatMessage,
  ChatTools,
  CustomUIDataTypes,
} from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  PromptInput,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputToolbar,
  PromptInputTools,
} from "./elements/prompt-input";
import { ArrowUpIcon, PaperclipIcon, StopIcon } from "./icons";
import { PreviewAttachment } from "./preview-attachment";
import { SuggestedActions } from "./suggested-actions";
import { Button } from "./ui/button";
import type { VisibilityType } from "./visibility-selector";

function setCookie(name: string, value: string) {
  const maxAge = 60 * 60 * 24 * 365; // 1 year
  // biome-ignore lint/suspicious/noDocumentCookie: needed for client-side cookie setting
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${maxAge}`;
}

function PureMultimodalInput({
  chatId,
  input,
  setInput,
  status,
  stop,
  attachments,
  setAttachments,
  messages,
  setMessages,
  sendMessage,
  className,
  selectedVisibilityType,
  selectedModelId,
  onModelChange,
  inputRef: inputRefProp,
  knowledgeDocumentIds = [],
}: {
  chatId: string;
  input: string;
  setInput: Dispatch<SetStateAction<string>>;
  status: UseChatHelpers<ChatMessage>["status"];
  stop: () => void;
  attachments: Attachment[];
  setAttachments: Dispatch<SetStateAction<Attachment[]>>;
  messages: UIMessage[];
  setMessages: UseChatHelpers<ChatMessage>["setMessages"];
  sendMessage: UseChatHelpers<ChatMessage>["sendMessage"];
  className?: string;
  selectedVisibilityType: VisibilityType;
  selectedModelId: string;
  onModelChange?: (modelId: string) => void;
  /** Ref opcional para o textarea (ex.: foco ao clicar CORRIGIR no banner do Revisor) */
  inputRef?: React.RefObject<HTMLTextAreaElement | null>;
  /** IDs da base de conhecimento selecionados (para o checklist Revisor) */
  knowledgeDocumentIds?: string[];
}) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const { width } = useWindowSize();

  const adjustHeight = useCallback(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "44px";
    }
  }, []);

  useEffect(() => {
    if (textareaRef.current) {
      adjustHeight();
    }
  }, [adjustHeight]);

  const hasAutoFocused = useRef(false);
  useEffect(() => {
    if (!hasAutoFocused.current && width) {
      const timer = setTimeout(() => {
        textareaRef.current?.focus();
        hasAutoFocused.current = true;
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [width]);

  const resetHeight = useCallback(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "44px";
    }
  }, []);

  const [localStorageInput, setLocalStorageInput] = useLocalStorage(
    "input",
    ""
  );

  useEffect(() => {
    if (textareaRef.current) {
      const domValue = textareaRef.current.value;
      // Prefer DOM value over localStorage to handle hydration
      const finalValue = domValue || localStorageInput || "";
      setInput(finalValue);
      adjustHeight();
    }
    // Only run once after hydration
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adjustHeight, localStorageInput, setInput]);

  useEffect(() => {
    setLocalStorageInput(input);
  }, [input, setLocalStorageInput]);

  const handleInput = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(event.target.value);
  };

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadQueue, setUploadQueue] = useState<string[]>([]);

  const submitForm = useCallback(() => {
    const isDocumentType = (ct: string | undefined) =>
      ct === "application/pdf" ||
      ct === "application/msword" ||
      ct ===
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

    const docsWithoutText = attachments.filter(
      (a) => isDocumentType(a.contentType) && a.extractedText == null
    );
    if (docsWithoutText.length > 0) {
      toast.error(
        `${docsWithoutText.length} documento(s) sem texto. Cole o texto no cartão do documento ou remova-os para enviar.`
      );
      return;
    }

    window.history.pushState({}, "", `/chat/${chatId}`);

    type DocumentPart = {
      type: "document";
      name: string;
      text: string;
      documentType?: "pi" | "contestacao";
    };
    type FilePart = {
      type: "file";
      url: string;
      name: string;
      mediaType: string;
    };
    const attachmentParts: Array<DocumentPart | FilePart> = [];
    for (const attachment of attachments) {
      if (attachment.extractedText != null) {
        attachmentParts.push({
          type: "document",
          name: attachment.name,
          text: attachment.extractedText,
          ...(attachment.documentType
            ? { documentType: attachment.documentType }
            : {}),
        });
      } else if (attachment.contentType?.startsWith("image/")) {
        attachmentParts.push({
          type: "file",
          url: attachment.url,
          name: attachment.name,
          mediaType: attachment.contentType,
        });
      }
    }

    sendMessage({
      role: "user",
      parts: [
        ...(attachmentParts as UIMessagePart<CustomUIDataTypes, ChatTools>[]),
        {
          type: "text",
          text: input.trim() || "(sem texto adicional)",
        },
      ],
    });

    setAttachments([]);
    setLocalStorageInput("");
    resetHeight();
    setInput("");

    if (width && width > 768) {
      textareaRef.current?.focus();
    }
  }, [
    input,
    setInput,
    attachments,
    sendMessage,
    setAttachments,
    setLocalStorageInput,
    width,
    chatId,
    resetHeight,
  ]);

  /** Limite do body em produção (Vercel). Ficheiros maiores usam upload direto para Blob. */
  const BODY_SIZE_LIMIT_BYTES = 4.5 * 1024 * 1024;

  const uploadFile = useCallback(async (file: File) => {
    const buildAttachmentFromResponse = (data: {
      url?: string;
      pathname?: string;
      contentType?: string;
      extractedText?: string;
      extractionFailed?: boolean;
      extractionDetail?: string;
      documentType?: "pi" | "contestacao";
    }) => {
      const {
        url,
        pathname,
        contentType,
        extractedText,
        extractionFailed,
        extractionDetail,
        documentType,
      } = data;
      if (extractionFailed === true) {
        const reason =
          typeof extractionDetail === "string" && extractionDetail.length > 0
            ? ` Motivo: ${extractionDetail}`
            : "";
        toast.warning(
          `Não foi possível extrair o texto deste ficheiro. Pode colar o texto no cartão do documento abaixo.${reason}`
        );
      }
      const docType =
        documentType === "pi" || documentType === "contestacao"
          ? documentType
          : undefined;
      return {
        url,
        name: pathname ?? file.name,
        contentType: contentType ?? file.type,
        ...(typeof extractedText === "string" ? { extractedText } : {}),
        ...(extractionFailed === true ? { extractionFailed: true } : {}),
        ...(docType ? { documentType: docType } : {}),
      };
    };

    try {
      if (file.size > BODY_SIZE_LIMIT_BYTES) {
        try {
          const blob = await uploadToBlob(file.name, file, {
            access: "public",
            handleUploadUrl: "/api/files/upload-token",
          });
          const processRes = await fetch("/api/files/process", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              url: blob.url,
              pathname: blob.pathname,
              contentType: file.type || "application/octet-stream",
              filename: file.name,
            }),
          });
          if (!processRes.ok) {
            const errData = await processRes.json().catch(() => ({}));
            const msg =
              typeof (errData as { error?: string }).error === "string"
                ? (errData as { error: string }).error
                : "Falha ao processar o ficheiro após o upload.";
            toast.error(msg);
            return undefined;
          }
          const data = (await processRes.json()) as Parameters<typeof buildAttachmentFromResponse>[0];
          return buildAttachmentFromResponse(data);
        } catch (directError) {
          const msg =
            directError instanceof Error
              ? directError.message
              : "Upload de ficheiros grandes não disponível.";
          toast.error(
            `${msg} Use um ficheiro com menos de 4,5 MB ou tente novamente.`
          );
          return undefined;
        }
      }

      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch("/api/files/upload", {
        method: "POST",
        body: formData,
      });

      if (response.ok) {
        const data = (await response.json()) as Parameters<typeof buildAttachmentFromResponse>[0];
        return buildAttachmentFromResponse(data);
      }

      let errorMessage = "Falha ao enviar o arquivo. Tente novamente.";
      if (response.status === 413) {
        errorMessage =
          "Ficheiro demasiado grande. Em produção o limite é 4,5 MB. Use um ficheiro com menos de 4,5 MB.";
      } else {
        try {
          const data = (await response.json()) as {
            error?: string;
            detail?: string;
          };
          if (typeof data?.error === "string" && data.error.length > 0) {
            errorMessage = data.error;
            if (typeof data?.detail === "string" && data.detail.length > 0) {
              errorMessage += ` (${data.detail})`;
            }
          }
        } catch {
          // Resposta não é JSON (ex.: página de erro)
        }
      }
      toast.error(errorMessage);
      return undefined;
    } catch (_error) {
      toast.error(
        "Falha ao enviar o arquivo. Verifique a ligação e tente novamente."
      );
      return undefined;
    }
  }, []);

  const processFiles = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;
      setUploadQueue((prev) => [...prev, ...files.map((f) => f.name)]);
      try {
        for (const file of files) {
          const attachment = await uploadFile(file);
          if (
            attachment !== undefined &&
            typeof attachment.url === "string"
          ) {
            const a: Attachment = {
              name: attachment.name,
              url: attachment.url,
              contentType: attachment.contentType,
              ...(attachment.extractedText !== undefined && {
                extractedText: attachment.extractedText,
              }),
              ...(attachment.documentType !== undefined && {
                documentType: attachment.documentType,
              }),
              ...(attachment.extractionFailed === true && {
                extractionFailed: true,
              }),
            };
            setAttachments((current) => [...current, a]);
          }
          setUploadQueue((prev) => prev.filter((n) => n !== file.name));
        }
      } finally {
        setUploadQueue([]);
      }
    },
    [setAttachments, uploadFile]
  );

  const handleFileChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files ?? []);
      void processFiles(files);
      event.target.value = "";
    },
    [processFiles]
  );

  const handleDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const items = event.dataTransfer.files;
      if (!items?.length) return;
      const files = Array.from(items).filter(
        (f) =>
          f.type.startsWith("image/") ||
          f.type === "application/pdf" ||
          f.type === "application/msword" ||
          f.type ===
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      );
      if (files.length > 0) void processFiles(files);
    },
    [processFiles]
  );

  const handleDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  }, []);

  const removeAllAttachments = useCallback(() => {
    setAttachments([]);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, [setAttachments]);

  const handlePaste = useCallback(
    async (event: ClipboardEvent) => {
      const items = event.clipboardData?.items;
      if (!items) {
        return;
      }

      const imageItems = Array.from(items).filter((item) =>
        item.type.startsWith("image/")
      );

      if (imageItems.length === 0) {
        return;
      }

      // Prevent default paste behavior for images
      event.preventDefault();

      setUploadQueue((prev) => [...prev, "Imagem colada"]);

      try {
        const uploadPromises = imageItems
          .map((item) => item.getAsFile())
          .filter((file): file is File => file !== null)
          .map((file) => uploadFile(file));

        const uploadedAttachments = await Promise.all(uploadPromises);
        const successfullyUploadedAttachments = uploadedAttachments.filter(
          (attachment) =>
            attachment !== undefined &&
            attachment.url !== undefined &&
            attachment.contentType !== undefined
        );

        setAttachments((curr) => [
          ...curr,
          ...(successfullyUploadedAttachments as Attachment[]),
        ]);
      } catch (error) {
        console.error("Error uploading pasted images:", error);
        toast.error("Falha ao enviar a(s) imagem(ns) colada(s)");
      } finally {
        setUploadQueue([]);
      }
    },
    [setAttachments, uploadFile]
  );

  // Add paste event listener to textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) {
      return;
    }

    textarea.addEventListener("paste", handlePaste);
    return () => textarea.removeEventListener("paste", handlePaste);
  }, [handlePaste]);

  return (
    <div className={cn("relative flex w-full flex-col gap-4", className)}>
      {messages.length === 0 &&
        attachments.length === 0 &&
        uploadQueue.length === 0 && (
          <SuggestedActions
            chatId={chatId}
            selectedVisibilityType={selectedVisibilityType}
            sendMessage={sendMessage}
          />
        )}

      <input
        accept="image/jpeg,image/png,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        className="pointer-events-none fixed -top-4 -left-4 size-0.5 opacity-0"
        multiple
        onChange={handleFileChange}
        ref={fileInputRef}
        tabIndex={-1}
        type="file"
      />

      <PromptInput
        className="rounded-xl border border-border bg-background p-3 shadow-xs transition-all duration-200 focus-within:border-border hover:border-muted-foreground/50"
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onSubmit={(event) => {
          event.preventDefault();
          if (!input.trim() && attachments.length === 0) {
            return;
          }
          if (status !== "ready") {
            toast.error("Aguarde o modelo terminar a resposta!");
            return;
          }
          submitForm();
        }}
      >
        {(attachments.length > 0 || uploadQueue.length > 0) && (
          <div className="flex flex-col gap-1">
            {attachments.length >= 2 && (
              <div className="flex flex-wrap items-center justify-end gap-2">
                {attachments.length >= 4 && (
                  <span
                    aria-live="polite"
                    className="text-muted-foreground text-xs"
                  >
                    {attachments.length} anexos
                    {attachments.some((a) => a.extractionFailed) &&
                      ` (${attachments.filter((a) => a.extractionFailed).length} sem texto)`}
                  </span>
                )}
                <Button
                  aria-label="Remover todos os anexos"
                  className="h-6 text-muted-foreground text-xs"
                  onClick={removeAllAttachments}
                  type="button"
                  variant="ghost"
                >
                  Remover todos os anexos
                </Button>
              </div>
            )}
            <div
              aria-label={`Lista de anexos: ${attachments.length} documento(s)`}
              className="flex flex-row items-end gap-2 overflow-x-auto overflow-y-hidden py-0.5"
              data-testid="attachments-preview"
              role="list"
            >
              {attachments.map((attachment) => (
              <div
                className="min-w-[120px] shrink-0"
                key={attachment.url}
                role="listitem"
              >
              <PreviewAttachment
                attachment={attachment}
                key={attachment.url}
                onDocumentTypeChange={
                  attachment.extractedText != null
                    ? (documentType) => {
                        setAttachments((currentAttachments) =>
                          currentAttachments.map((a) =>
                            a.url === attachment.url
                              ? { ...a, documentType }
                              : a
                          )
                        );
                      }
                    : undefined
                }
                onPastedText={
                  attachment.extractionFailed === true
                    ? (text) => {
                        setAttachments((currentAttachments) =>
                          currentAttachments.map((a) =>
                            a.url === attachment.url
                              ? {
                                  ...a,
                                  extractedText: text,
                                  extractionFailed: false,
                                }
                              : a
                          )
                        );
                      }
                    : undefined
                }
                onRemove={() => {
                  setAttachments((currentAttachments) =>
                    currentAttachments.filter((a) => a.url !== attachment.url)
                  );
                  if (fileInputRef.current) {
                    fileInputRef.current.value = "";
                  }
                }}
              />
              </div>
            ))}

              {uploadQueue.map((filename) => (
                <PreviewAttachment
                  attachment={{
                    url: "",
                    name: filename,
                    contentType: "",
                  }}
                  isUploading={true}
                  key={filename}
                />
              ))}
            </div>
          </div>
        )}
        <div className="flex flex-row items-start gap-1 sm:gap-2">
          <PromptInputTextarea
            className="grow resize-none border-0! border-none! bg-transparent p-2 text-base outline-none ring-0 [-ms-overflow-style:none] [scrollbar-width:none] placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0 [&::-webkit-scrollbar]:hidden"
            data-testid="multimodal-input"
            disableAutoResize={true}
            maxHeight={200}
            minHeight={44}
            onChange={handleInput}
            placeholder="Cole o texto da Petição Inicial e da Contestação, ou descreva o caso e anexe documentos..."
            ref={(el) => {
              textareaRef.current = el;
              if (inputRefProp) {
                (
                  inputRefProp as React.MutableRefObject<HTMLTextAreaElement | null>
                ).current = el;
              }
            }}
            rows={1}
            value={input}
          />
        </div>
        <PromptInputToolbar className="border-top-0! border-t-0! p-0 shadow-none dark:border-0 dark:border-transparent!">
          <PromptInputTools className="gap-0 sm:gap-0.5">
            <AttachmentsButton
              fileInputRef={fileInputRef}
              selectedModelId={selectedModelId}
              status={status}
            />
            <ModelSelectorCompact
              onModelChange={onModelChange}
              selectedModelId={selectedModelId}
            />
          </PromptInputTools>

          {status === "submitted" ? (
            <StopButton setMessages={setMessages} stop={stop} />
          ) : (
            <PromptInputSubmit
              className="size-8 rounded-full bg-primary text-primary-foreground transition-colors duration-200 hover:bg-primary/90 disabled:bg-muted disabled:text-muted-foreground"
              data-testid="send-button"
              disabled={
                (attachments.length === 0 && !input.trim()) ||
                uploadQueue.length > 0
              }
              status={status}
            >
              <ArrowUpIcon size={14} />
            </PromptInputSubmit>
          )}
        </PromptInputToolbar>
      </PromptInput>
      {messages.length === 0 && (
        <p className="text-muted-foreground text-xs" id="revisor-input-hint">
          Anexe a Petição Inicial e a Contestação (PDF, DOC ou DOCX) e
          identifique cada uma no menu. Ou cole o texto abaixo. Pode arrastar
          ficheiros para a caixa de mensagem.
        </p>
      )}
    </div>
  );
}

export const MultimodalInput = memo(
  PureMultimodalInput,
  (prevProps, nextProps) => {
    if (prevProps.input !== nextProps.input) {
      return false;
    }
    if (prevProps.status !== nextProps.status) {
      return false;
    }
    if (!equal(prevProps.attachments, nextProps.attachments)) {
      return false;
    }
    if (prevProps.selectedVisibilityType !== nextProps.selectedVisibilityType) {
      return false;
    }
    if (prevProps.selectedModelId !== nextProps.selectedModelId) {
      return false;
    }
    if (
      (prevProps.messages?.length ?? 0) !== (nextProps.messages?.length ?? 0)
    ) {
      return false;
    }
    if (
      !equal(prevProps.knowledgeDocumentIds, nextProps.knowledgeDocumentIds)
    ) {
      return false;
    }

    return true;
  }
);

function PureAttachmentsButton({
  fileInputRef,
  status,
  selectedModelId,
}: {
  fileInputRef: React.MutableRefObject<HTMLInputElement | null>;
  status: UseChatHelpers<ChatMessage>["status"];
  selectedModelId: string;
}) {
  const isReasoningModel =
    selectedModelId.includes("reasoning") || selectedModelId.includes("think");

  return (
    <Button
      className="aspect-square h-8 rounded-lg p-1 transition-colors hover:bg-accent"
      data-testid="attachments-button"
      disabled={status !== "ready" || isReasoningModel}
      onClick={(event) => {
        event.preventDefault();
        fileInputRef.current?.click();
      }}
      title="Anexar documentos (imagens, PDF, DOCX)"
      type="button"
      variant="ghost"
    >
      <PaperclipIcon size={14} style={{ width: 14, height: 14 }} />
    </Button>
  );
}

const AttachmentsButton = memo(PureAttachmentsButton);

function PureModelSelectorCompact({
  selectedModelId,
  onModelChange,
}: {
  selectedModelId: string;
  onModelChange?: (modelId: string) => void;
}) {
  const [open, setOpen] = useState(false);

  const selectedModel =
    chatModels.find((m) => m.id === selectedModelId) ??
    chatModels.find((m) => m.id === DEFAULT_CHAT_MODEL) ??
    chatModels[0];
  const [provider] = selectedModel.id.split("/");

  // Provider display names
  const providerNames: Record<string, string> = {
    anthropic: "Anthropic",
    openai: "OpenAI",
    google: "Google",
    xai: "xAI",
    reasoning: "Raciocínio",
  };

  return (
    <ModelSelector onOpenChange={setOpen} open={open}>
      <ModelSelectorTrigger asChild>
        <Button className="h-8 w-[200px] justify-between px-2" variant="ghost">
          {provider && <ModelSelectorLogo provider={provider} />}
          <ModelSelectorName>{selectedModel.name}</ModelSelectorName>
        </Button>
      </ModelSelectorTrigger>
      <ModelSelectorContent>
        <ModelSelectorInput placeholder="Buscar modelos..." />
        <ModelSelectorList>
          {Object.entries(modelsByProvider).map(
            ([providerKey, providerModels]) => (
              <ModelSelectorGroup
                heading={providerNames[providerKey] ?? providerKey}
                key={providerKey}
              >
                {providerModels.map((model) => {
                  const logoProvider = model.id.split("/")[0];
                  return (
                    <ModelSelectorItem
                      key={model.id}
                      onSelect={() => {
                        onModelChange?.(model.id);
                        setCookie("chat-model", model.id);
                        setOpen(false);
                      }}
                      value={model.id}
                    >
                      <ModelSelectorLogo provider={logoProvider} />
                      <ModelSelectorName>{model.name}</ModelSelectorName>
                      {model.id === selectedModel.id && (
                        <CheckIcon className="ml-auto size-4" />
                      )}
                    </ModelSelectorItem>
                  );
                })}
              </ModelSelectorGroup>
            )
          )}
        </ModelSelectorList>
      </ModelSelectorContent>
    </ModelSelector>
  );
}

const ModelSelectorCompact = memo(PureModelSelectorCompact);

function PureStopButton({
  stop,
  setMessages,
}: {
  stop: () => void;
  setMessages: UseChatHelpers<ChatMessage>["setMessages"];
}) {
  return (
    <Button
      className="size-7 rounded-full bg-foreground p-1 text-background transition-colors duration-200 hover:bg-foreground/90 disabled:bg-muted disabled:text-muted-foreground"
      data-testid="stop-button"
      onClick={(event) => {
        event.preventDefault();
        stop();
        setMessages((messages) => messages);
      }}
    >
      <StopIcon size={14} />
    </Button>
  );
}

const StopButton = memo(PureStopButton);
