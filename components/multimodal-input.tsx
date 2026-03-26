"use client";

import type { UseChatHelpers } from "@ai-sdk/react";
import type { UIMessage, UIMessagePart } from "ai";
import equal from "fast-deep-equal";
import {
  BookOpenIcon,
  CheckIcon,
  FileSpreadsheetIcon,
  FileTextIcon,
  ImageIcon,
  Loader2Icon,
  LoaderIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  Settings2Icon,
  SparklesIcon,
  Trash2Icon,
  UploadCloudIcon,
  WandIcon,
} from "lucide-react";
import {
  type ChangeEvent,
  type Dispatch,
  memo,
  type SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import useSWR, { useSWRConfig } from "swr";
import { useLocalStorage, useWindowSize } from "usehooks-ts";
import {
  getAgentConfig,
  NO_AGENT_SELECTED,
} from "@/lib/ai/agents-registry-metadata";
import { MIN_CREDITS_TO_START_CHAT } from "@/lib/ai/credits";
import {
  ACCEPTED_FILE_ACCEPT,
  autoAssignMissingDocumentType,
  BODY_SIZE_LIMIT_BYTES,
  buildAttachmentParts,
  getPhaseLabel,
  inferDocumentTypeFromFilename,
  isAcceptedAttachmentType,
  MAX_KNOWLEDGE_SELECT,
  POST_UPLOAD_PROMPTS,
  removeAttachmentByUrl,
  type UploadPhase,
  type UploadQueueItem,
  updateAttachmentByUrl,
  uploadLargeFile,
  uploadSmallFile,
  usePromptImprovement,
  validateAttachmentsForSubmit,
  validateRevisorPiContestacao,
} from "@/lib/attachments";
import { getExtractionQuality } from "@/lib/extraction-quality";
import type {
  Attachment,
  ChatMessage,
  ChatTools,
  CreditsResponse,
  CustomUIDataTypes,
} from "@/lib/types";
import { cn, fetcher } from "@/lib/utils";
import { ContextUsageIndicator } from "./context-usage-indicator";
import {
  PromptInput,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputToolbar,
  PromptInputTools,
} from "./elements/prompt-input";
import { ArrowUpIcon } from "./icons";
import { AttachmentsButton } from "./multimodal-input/attachments-button";
import { StopButton } from "./multimodal-input/stop-button";
import { REVISOR_PROMPTS } from "./prompt-selector";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "./ui/alert-dialog";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "./ui/sheet";
import { Textarea } from "./ui/textarea";
import type { VisibilityType } from "./visibility-selector";

interface CustomAgentRow {
  id: string;
  name: string;
  instructions: string;
  baseAgentId: string | null;
  knowledgeDocumentIds?: string[];
  createdAt: string;
}

const AGENT_INSTRUCTIONS_MAX_LENGTH = 4000;

/** Dot colorido por agente (mantido em sincronia com chat-topbar.tsx). */
const AGENT_DOT_CLASS: Record<string, string> = {
  "assistente-geral": "bg-muted-foreground/60",
  "revisor-defesas": "bg-gold-accent",
  "redator-contestacao": "bg-primary",
  "assistjur-master": "bg-primary",
};

function getChipIcon(contentType: string | undefined): {
  Icon: typeof FileTextIcon;
  color: string;
} {
  const ct = contentType ?? "";
  if (ct === "application/pdf") {
    return { Icon: FileTextIcon, color: "text-red-500" };
  }
  if (
    ct ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    ct === "application/msword"
  ) {
    return { Icon: FileTextIcon, color: "text-blue-500" };
  }
  if (
    ct ===
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    ct === "application/vnd.ms-excel" ||
    ct === "text/csv"
  ) {
    return { Icon: FileSpreadsheetIcon, color: "text-green-600" };
  }
  if (ct.startsWith("image/")) {
    return { Icon: ImageIcon, color: "text-purple-400" };
  }
  if (ct === "application/vnd.oasis.opendocument.text") {
    return { Icon: FileTextIcon, color: "text-purple-500" };
  }
  return { Icon: FileTextIcon, color: "text-muted-foreground" };
}

type PureMultimodalInputProps = Readonly<{
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
  /** IDs da base de conhecimento selecionados (para o checklist Revisor e popover @) */
  knowledgeDocumentIds?: string[];
  /** Atualizar documentos selecionados para o chat (permite @ no input chamar documento) */
  setKnowledgeDocumentIds?: (
    value: string[] | ((prev: string[]) => string[])
  ) => void;
  /** Instruções customizadas do agente; vazio = instruções do agente selecionado (validação PI+Contestação só para revisor-defesas) */
  agentInstructions?: string;
  /** Id do agente (revisor-defesas | redator-contestacao | assistjur-master). Validação PI+Contestação só quando revisor-defesas. */
  agentId?: string;
  /** Permite alterar o agente a partir do rodapé (composer). Quando omitido, o seletor de agente não é exibido. */
  setAgentId?: (value: string) => void;
  /** Permite alterar as instruções customizadas do agente a partir do rodapé. */
  setAgentInstructions?: (value: string) => void;
  /** Abre a barra lateral da base de conhecimento (ex.: ao clicar no botão no rodapé). */
  onOpenKnowledgeSidebar?: () => void;
  /** Quando true, desativa o overlay de drag-and-drop para não interceptar drops destinados à KB sidebar. */
  knowledgeSidebarOpen?: boolean;
  /** ID do processo vinculado ao chat — quando definido, dispara intake automático ao fazer upload de PDF. */
  processoId?: string | null;
}>;

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
  selectedVisibilityType: _selectedVisibilityType,
  selectedModelId,
  onModelChange: _onModelChange,
  inputRef: inputRefProp,
  knowledgeDocumentIds = [],
  setKnowledgeDocumentIds,
  agentInstructions = "",
  agentId = "",
  setAgentId,
  setAgentInstructions,
  onOpenKnowledgeSidebar,
  knowledgeSidebarOpen = false,
  processoId = null,
}: PureMultimodalInputProps) {
  const { mutate } = useSWRConfig();
  const [atPopoverOpen, setAtPopoverOpen] = useState(false);
  const [agentInstructionsDialogOpen, setAgentInstructionsDialogOpen] =
    useState(false);
  const [localAgentInstructions, setLocalAgentInstructions] =
    useState(agentInstructions);
  const [manageAgentsOpen, setManageAgentsOpen] = useState(false);
  const [agentFormVisible, setAgentFormVisible] = useState(false);
  const [agentFormId, setAgentFormId] = useState<string | null>(null);
  const [agentFormName, setAgentFormName] = useState("");
  const [agentFormInstructions, setAgentFormInstructions] = useState("");
  const [agentFormBaseId, setAgentFormBaseId] = useState<string>("");
  const [agentFormKnowledgeIds, setAgentFormKnowledgeIds] = useState<string[]>(
    []
  );
  const [agentIdToDelete, setAgentIdToDelete] = useState<string | null>(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [chipsExpanded, setChipsExpanded] = useState(false);

  const { improveText, isImproving } = usePromptImprovement();

  // Metadados do agente activo para placeholder e badge no toolbar.
  const activeAgentMeta = useMemo(() => {
    if (!agentId || agentId === NO_AGENT_SELECTED) {
      return null;
    }
    const config = getAgentConfig(agentId);
    return {
      label: config.label,
      dotClass: AGENT_DOT_CLASS[agentId] ?? "bg-gold-accent",
    };
  }, [agentId]);

  const { data: customAgents = [], mutate: mutateCustomAgents } = useSWR<
    CustomAgentRow[]
  >(setAgentId ? "/api/agents/custom" : null, fetcher);

  const handleAgentInstructionsDialogOpenChange = useCallback(
    (open: boolean) => {
      setAgentInstructionsDialogOpen(open);
      if (open) {
        setLocalAgentInstructions(agentInstructions);
      } else if (setAgentInstructions) {
        setAgentInstructions(localAgentInstructions);
      }
    },
    [agentInstructions, localAgentInstructions, setAgentInstructions]
  );

  const openManageAgents = useCallback(() => {
    setAgentFormVisible(false);
    setAgentFormId(null);
    setAgentFormName("");
    setAgentFormInstructions("");
    setAgentFormBaseId("");
    setManageAgentsOpen(true);
  }, []);

  const handleImprovePrompt = useCallback(() => {
    improveText(input, setInput, {
      emptyError: "Escreva um texto para melhorar.",
      genericError: "Não foi possível melhorar o prompt.",
      successTitle: "Prompt melhorado. Pode editar antes de enviar.",
    });
  }, [input, setInput, improveText]);

  const handleImproveInstructions = useCallback(
    (text: string, setResult: (value: string) => void) => {
      improveText(text, setResult, {
        emptyError: "Escreva instruções para melhorar.",
        genericError: "Não foi possível melhorar as instruções.",
        successTitle: "Instruções melhoradas. Pode editar antes de guardar.",
      });
    },
    [improveText]
  );

  const startCreateAgent = useCallback(() => {
    setAgentFormId(null);
    setAgentFormName("");
    setAgentFormInstructions("");
    setAgentFormBaseId("");
    setAgentFormKnowledgeIds([]);
    setAgentFormVisible(true);
  }, []);

  const startEditAgent = useCallback((agent: CustomAgentRow) => {
    setAgentFormId(agent.id);
    setAgentFormName(agent.name);
    setAgentFormInstructions(agent.instructions);
    setAgentFormBaseId(agent.baseAgentId ?? "");
    setAgentFormKnowledgeIds(
      Array.isArray(agent.knowledgeDocumentIds)
        ? agent.knowledgeDocumentIds
        : []
    );
    setAgentFormVisible(true);
    setManageAgentsOpen(true);
  }, []);

  const cancelAgentForm = useCallback(() => {
    setAgentFormId(null);
    setAgentFormName("");
    setAgentFormInstructions("");
    setAgentFormBaseId("");
    setAgentFormKnowledgeIds([]);
    setAgentFormVisible(false);
  }, []);

  const saveAgentForm = useCallback(async () => {
    const name = agentFormName.trim();
    const instructions = agentFormInstructions.trim();
    if (!(name && instructions)) {
      toast.error("Nome e instruções são obrigatórios.");
      return;
    }
    const baseAgentId =
      agentFormBaseId === "" || agentFormBaseId === "none"
        ? null
        : (agentFormBaseId as
            | "revisor-defesas"
            | "redator-contestacao"
            | "assistjur-master");
    const knowledgeIds = agentFormKnowledgeIds.slice(0, MAX_KNOWLEDGE_SELECT);
    try {
      if (agentFormId) {
        const res = await fetch(`/api/agents/custom/${agentFormId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            instructions,
            baseAgentId,
            knowledgeDocumentIds: knowledgeIds,
          }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.message ?? "Erro ao atualizar agente.");
        }
        toast.success("Agente atualizado.");
      } else {
        const res = await fetch("/api/agents/custom", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            instructions,
            baseAgentId,
            knowledgeDocumentIds: knowledgeIds,
          }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.message ?? "Erro ao criar agente.");
        }
        toast.success("Agente criado.");
      }
      await mutateCustomAgents();
      cancelAgentForm();
      setAgentFormVisible(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao guardar.");
    }
  }, [
    agentFormId,
    agentFormName,
    agentFormBaseId,
    agentFormInstructions,
    agentFormKnowledgeIds,
    cancelAgentForm,
    mutateCustomAgents,
  ]);

  const performDeleteAgent = useCallback(
    async (id: string) => {
      try {
        const res = await fetch(`/api/agents/custom/${id}`, {
          method: "DELETE",
        });
        if (!res.ok) {
          throw new Error("Erro ao apagar.");
        }
        await mutateCustomAgents();
        if (setAgentId && agentId === id) {
          setAgentId("revisor-defesas");
        }
        toast.success("Agente apagado.");
        if (agentFormId === id) {
          cancelAgentForm();
        }
      } catch {
        toast.error("Erro ao apagar agente.");
      } finally {
        setAgentIdToDelete(null);
      }
    },
    [agentId, agentFormId, cancelAgentForm, mutateCustomAgents, setAgentId]
  );

  const openDeleteAgentDialog = useCallback((id: string) => {
    setAgentIdToDelete(id);
  }, []);

  const [atQuery, setAtQuery] = useState("");
  const [atStartIndex, setAtStartIndex] = useState(0);
  const [atEndIndex, setAtEndIndex] = useState(0);

  const { data: knowledgeDocsForAt = [] } = useSWR<
    Array<{ id: string; title: string }>
  >(
    atPopoverOpen && setKnowledgeDocumentIds ? "/api/knowledge" : null,
    fetcher
  );
  const {
    data: knowledgeDocsForAgentForm = [],
    mutate: mutateKnowledgeForAgentForm,
  } = useSWR<Array<{ id: string; title: string }>>(
    agentFormVisible ? "/api/knowledge" : null,
    fetcher
  );
  const filteredKnowledgeDocs = atQuery.trim()
    ? knowledgeDocsForAt.filter((d) =>
        d.title.toLowerCase().includes(atQuery.toLowerCase())
      )
    : knowledgeDocsForAt;

  const isRevisorAgent =
    agentId === "revisor-defesas" && agentInstructions.trim() === "";
  const hasPi = attachments.some(
    (a) => typeof a.extractedText === "string" && a.documentType === "pi"
  );
  const hasContestacao = attachments.some(
    (a) =>
      typeof a.extractedText === "string" && a.documentType === "contestacao"
  );
  const hasPiAndContestacao = hasPi && hasContestacao;
  const hasPiOrContestacao = hasPi || hasContestacao;
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const { width } = useWindowSize();

  const resetTextareaHeight = useCallback(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "44px";
    }
  }, []);

  const hasHydratedInput = useRef(false);
  const [localStorageInput, setLocalStorageInput] = useLocalStorage(
    "input",
    ""
  );
  useEffect(() => {
    if (hasHydratedInput.current) {
      return;
    }
    if (!textareaRef.current) {
      return;
    }
    hasHydratedInput.current = true;
    const domValue = textareaRef.current.value;
    const finalValue = domValue || localStorageInput || "";
    setInput(finalValue);
    resetTextareaHeight();
  }, [localStorageInput, setInput, resetTextareaHeight]);

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

  useEffect(() => {
    setLocalStorageInput(input);
  }, [input, setLocalStorageInput]);

  const handleInput = useCallback(
    (event: React.ChangeEvent<HTMLTextAreaElement>) => {
      const value = event.target.value;
      const cursor = event.target.selectionStart ?? value.length;
      setInput(value);

      if (!setKnowledgeDocumentIds) {
        setAtPopoverOpen(false);
        return;
      }
      const lastAt = value.lastIndexOf("@", cursor - 1);
      if (
        lastAt >= 0 &&
        (lastAt === 0 || /[\s(]/.test(value[lastAt - 1] ?? ""))
      ) {
        setAtPopoverOpen(true);
        setAtStartIndex(lastAt);
        setAtEndIndex(cursor);
        setAtQuery(value.slice(lastAt + 1, cursor));
      } else {
        setAtPopoverOpen(false);
      }
    },
    [setInput, setKnowledgeDocumentIds]
  );

  const handleSelectKnowledgeDoc = useCallback(
    (doc: { id: string; title: string }) => {
      if (!setKnowledgeDocumentIds) {
        return;
      }
      setKnowledgeDocumentIds((prev) => {
        if (prev.includes(doc.id) || prev.length >= MAX_KNOWLEDGE_SELECT) {
          return prev;
        }
        return [...prev, doc.id];
      });
      const newInput =
        input.slice(0, atStartIndex) +
        `@${doc.title} ` +
        input.slice(atEndIndex);
      setInput(newInput);
      setAtPopoverOpen(false);
      const newCursor = atStartIndex + doc.title.length + 2;
      setTimeout(() => {
        textareaRef.current?.focus();
        textareaRef.current?.setSelectionRange(newCursor, newCursor);
      }, 0);
    },
    [setKnowledgeDocumentIds, input, atStartIndex, atEndIndex, setInput]
  );

  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingPreferredTypeRef = useRef<"pi" | "contestacao" | null>(null);
  const [uploadQueue, setUploadQueue] = useState<UploadQueueItem[]>([]);

  const submitForm = useCallback(() => {
    const validationError = validateAttachmentsForSubmit(attachments);
    if (validationError !== null) {
      toast.error(validationError);
      return;
    }
    if (isRevisorAgent) {
      const revisorError = validateRevisorPiContestacao(
        attachments,
        messages.length
      );
      if (revisorError !== null) {
        toast.error(revisorError);
        return;
      }
    }

    globalThis.history.pushState({}, "", `/chat/${chatId}`);

    const attachmentParts = buildAttachmentParts(attachments);
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
    resetTextareaHeight();
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
    resetTextareaHeight,
    isRevisorAgent,
    messages.length,
  ]);

  const uploadFile = useCallback(async (file: File, queueId?: string) => {
    const onPhase = queueId
      ? (phase: UploadPhase, percent: number) => {
          setUploadQueue((prev) =>
            prev.map((q) => (q.id === queueId ? { ...q, phase, percent } : q))
          );
        }
      : undefined;
    try {
      if (file.size > BODY_SIZE_LIMIT_BYTES) {
        return await uploadLargeFile(file, onPhase);
      }
      return await uploadSmallFile(file, onPhase);
    } catch {
      toast.error(
        "Falha ao enviar o arquivo. Verifique a ligação e tente novamente."
      );
      return undefined;
    }
  }, []);

  const processFiles = useCallback(
    async (files: File[], preferredTypeForFirst?: "pi" | "contestacao") => {
      if (files.length === 0) {
        return;
      }

      // Detectar duplicados pelo nome antes de fazer upload (evita chamadas desnecessárias à API)
      const duplicates = files.filter((f) =>
        attachments.some((a) => a.name === f.name)
      );
      if (duplicates.length > 0) {
        const names = duplicates.map((f) => `"${f.name}"`).join(", ");
        toast.warning(
          `${names} ${duplicates.length === 1 ? "já está adicionado" : "já estão adicionados"}.`,
          { id: "attachment-duplicate" }
        );
      }
      const uniqueFiles = files.filter(
        (f) => !attachments.some((a) => a.name === f.name)
      );
      if (uniqueFiles.length === 0) {
        return;
      }

      const now = Date.now();
      const queueIds = uniqueFiles.map((_, i) => `uq-${now}-${i}`);
      setUploadQueue((prev) => [
        ...prev,
        ...uniqueFiles.map((f, i) => ({
          id: queueIds[i],
          label: f.name,
          phase: "uploading" as UploadPhase,
          percent: 0,
          fileSize: f.size,
        })),
      ]);
      for (let i = 0; i < uniqueFiles.length; i++) {
        const file = uniqueFiles[i];
        const queueId = queueIds[i];
        try {
          const uploadResult = await uploadFile(file, queueId);
          if (uploadResult !== undefined) {
            const newAttachments: Attachment[] = [];
            for (let j = 0; j < uploadResult.attachments.length; j++) {
              const attachment = uploadResult.attachments[j];
              if (typeof attachment.url !== "string") {
                continue;
              }
              // Preferir tipo pelo nome do ficheiro quando explícito (ex.: "Contestação - RO.pdf") para evitar classificação errada pelo conteúdo
              const docType =
                inferDocumentTypeFromFilename(attachment.name) ??
                attachment.documentType ??
                (i === 0 && j === 0 ? preferredTypeForFirst : undefined);
              newAttachments.push({
                name: attachment.name,
                url: attachment.url,
                contentType: attachment.contentType,
                ...(attachment.pathname !== undefined && {
                  pathname: attachment.pathname,
                }),
                ...(attachment.extractedText !== undefined && {
                  extractedText: attachment.extractedText,
                }),
                ...(docType !== undefined && { documentType: docType }),
                ...(attachment.extractionFailed === true && {
                  extractionFailed: true,
                }),
              });
            }
            if (newAttachments.length > 0) {
              setAttachments((current) =>
                autoAssignMissingDocumentType([...current, ...newAttachments])
              );
            }
            // Intake automático: dispara em background quando há processoId e o ficheiro é PDF
            for (const attachment of uploadResult.attachments) {
              const isPdf =
                attachment.contentType === "application/pdf" ||
                attachment.name.toLowerCase().endsWith(".pdf");
              if (processoId && isPdf) {
                const intakeToastId = `intake-${processoId}-${attachment.name}`;
                toast.loading("Processando documento no processo...", {
                  id: intakeToastId,
                });
                fetch("/api/processos/intake", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    processoId,
                    blobUrl: attachment.url,
                    filename: attachment.name,
                  }),
                })
                  .then((res) => res.json())
                  .then((data: { intakeStatus?: string; titulo?: string }) => {
                    if (data.intakeStatus === "ready") {
                      toast.success("Documento processado no processo", {
                        id: intakeToastId,
                        description: data.titulo ?? undefined,
                      });
                      mutate("/api/processos");
                    } else {
                      toast.dismiss(intakeToastId);
                    }
                  })
                  .catch(() => {
                    toast.dismiss(intakeToastId);
                  });
              }
            }
          }
        } finally {
          // Remover só este item (por id), nunca esvaziar a fila inteira: outro
          // processFiles em paralelo ou filas de outros ficheiros ficariam corrompidos
          // e isUploading podia ficar true indefinidamente.
          setUploadQueue((prev) => prev.filter((q) => q.id !== queueId));
        }
      }
    },
    [attachments, setAttachments, uploadFile, processoId, mutate]
  );

  const handleFileChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files ?? []);
      const preferred = pendingPreferredTypeRef.current ?? undefined;
      pendingPreferredTypeRef.current = null;
      processFiles(files, preferred);
      event.target.value = "";
    },
    [processFiles]
  );

  const handleDrop = useCallback(
    (event: React.DragEvent) => {
      setIsDraggingOver(false);
      event.preventDefault();
      const items = event.dataTransfer.files;
      if (!items?.length) {
        return;
      }
      const files = Array.from(items).filter((f) =>
        isAcceptedAttachmentType(f.type, f.name)
      );
      if (files.length > 0) {
        processFiles(files);
      }
    },
    [processFiles]
  );

  const handleDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setIsDraggingOver(true);
  }, []);

  const handleDragLeave = useCallback((event: React.DragEvent) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setIsDraggingOver(false);
    }
  }, []);

  const handleDropWithOverlay = useCallback(
    (event: React.DragEvent, preferredType?: "pi" | "contestacao") => {
      setIsDraggingOver(false);
      event.preventDefault();
      const items = event.dataTransfer.files;
      if (!items?.length) {
        return;
      }
      const files = Array.from(items).filter((f) =>
        isAcceptedAttachmentType(f.type, f.name)
      );
      if (files.length > 0) {
        processFiles(files, preferredType);
      }
    },
    [processFiles]
  );

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

      const imgQueueId = `uq-${Date.now()}-img`;
      setUploadQueue((prev) => [
        ...prev,
        {
          id: imgQueueId,
          label: "Imagem colada",
          phase: "uploading" as UploadPhase,
          percent: 0,
        },
      ]);

      try {
        const uploadPromises = imageItems
          .map((item) => item.getAsFile())
          .filter((file): file is File => file !== null)
          .map((file) => uploadFile(file, imgQueueId));

        // allSettled: se 1 de N uploads falha, os restantes continuam
        const results = await Promise.allSettled(uploadPromises);
        const fulfilled = results.filter(
          (
            r
          ): r is PromiseFulfilledResult<
            | {
                attachments: Array<{
                  url: string;
                  name: string;
                  contentType: string;
                  [key: string]: unknown;
                }>;
              }
            | undefined
          > => r.status === "fulfilled"
        );
        const failedCount = results.length - fulfilled.length;
        const successfullyUploadedAttachments: Attachment[] = [];
        for (const r of fulfilled) {
          if (r.value) {
            for (const att of r.value.attachments) {
              if (att?.url != null && att?.contentType != null) {
                successfullyUploadedAttachments.push(att as Attachment);
              }
            }
          }
        }

        setAttachments((curr) => [...curr, ...successfullyUploadedAttachments]);

        if (failedCount > 0) {
          toast.error(`${failedCount} imagem(ns) falhou/falharam ao enviar`);
        }
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

  // Window-level drag listeners: extend drop zone to entire viewport
  useEffect(() => {
    const onWindowDragOver = (e: DragEvent) => {
      if (knowledgeSidebarOpen) {
        return;
      }
      if (e.dataTransfer?.types.includes("Files")) {
        e.preventDefault();
        setIsDraggingOver(true);
      }
    };
    const onWindowDragLeave = (e: DragEvent) => {
      if (e.relatedTarget === null) {
        setIsDraggingOver(false);
      }
    };
    const onWindowDrop = (e: DragEvent) => {
      e.preventDefault();
      setIsDraggingOver(false);
    };
    window.addEventListener("dragover", onWindowDragOver);
    window.addEventListener("dragleave", onWindowDragLeave);
    window.addEventListener("drop", onWindowDrop);
    return () => {
      window.removeEventListener("dragover", onWindowDragOver);
      window.removeEventListener("dragleave", onWindowDragLeave);
      window.removeEventListener("drop", onWindowDrop);
    };
  }, [knowledgeSidebarOpen]);

  // Reset overlay when KB sidebar opens
  useEffect(() => {
    if (knowledgeSidebarOpen) {
      setIsDraggingOver(false);
    }
  }, [knowledgeSidebarOpen]);

  const _handleDocumentTypeChange = useCallback(
    (attachmentUrl: string) => (documentType: "pi" | "contestacao") => {
      setAttachments((current) =>
        updateAttachmentByUrl(current, attachmentUrl, { documentType })
      );
    },
    [setAttachments]
  );

  const _handlePastedTextForAttachment = useCallback(
    (attachmentUrl: string) => (text: string) => {
      setAttachments((current) =>
        updateAttachmentByUrl(current, attachmentUrl, {
          extractedText: text,
          extractionFailed: false,
        })
      );
    },
    [setAttachments]
  );

  const handleRemoveAttachment = useCallback(
    (attachmentUrl: string) => () => {
      setAttachments((current) =>
        removeAttachmentByUrl(current, attachmentUrl)
      );
      const inputEl = fileInputRef.current;
      if (inputEl) {
        inputEl.value = "";
      }
    },
    [setAttachments]
  );

  const fileInputId = "chat-file-input";

  const { data: creditsData } = useSWR<CreditsResponse>(
    "/api/credits",
    fetcher
  );
  const revisorFirstMessage = isRevisorAgent && messages.length === 0;
  // Items still processing (not yet "done") block the send button.
  // Items in "done" phase are visually complete but may not yet be in `attachments`
  // due to React batching — treat them as ready so the button enables immediately.
  const isUploading = uploadQueue.some((q) => q.phase !== "done");
  const hasDoneUploads = uploadQueue.some((q) => q.phase === "done");
  const hasAttachmentsOrReady = attachments.length > 0 || hasDoneUploads;

  const isInputEmpty = revisorFirstMessage
    ? !hasPiAndContestacao && input.trim() === ""
    : !hasAttachmentsOrReady && input.trim() === "";

  // Contextual prompt chips shown after upload, before the first message.
  const postUploadPrompts = (() => {
    if (
      isRevisorAgent ||
      !hasAttachmentsOrReady ||
      messages.length > 0 ||
      input.trim() !== ""
    ) {
      return [];
    }
    const docType = attachments.some((a) => a.documentType === "pi")
      ? "pi"
      : attachments.some((a) => a.documentType === "contestacao")
        ? "contestacao"
        : "any";
    const effectiveAgentId = agentId ?? "any";
    const agentSpecific = POST_UPLOAD_PROMPTS.filter(
      (p) =>
        p.agentId === effectiveAgentId &&
        (p.docType === docType || p.docType === "any")
    );
    const generic = POST_UPLOAD_PROMPTS.filter(
      (p) =>
        p.agentId === "any" && (p.docType === docType || p.docType === "any")
    );
    return [...agentSpecific, ...generic].slice(0, 3);
  })();

  const hasInsufficientCredits =
    creditsData !== undefined &&
    creditsData.balance < MIN_CREDITS_TO_START_CHAT;
  const docsSubmitError = validateAttachmentsForSubmit(attachments);
  const revisorSubmitError =
    isRevisorAgent && messages.length === 0
      ? validateRevisorPiContestacao(attachments, messages.length)
      : null;
  const submitPrevalidationError = docsSubmitError ?? revisorSubmitError;
  const sendButtonDisabled =
    isInputEmpty ||
    isUploading ||
    hasInsufficientCredits ||
    submitPrevalidationError !== null;

  return (
    <div className={cn("relative flex w-full flex-col gap-4", className)}>
      <AlertDialog
        onOpenChange={(open) => {
          if (!open) {
            setAgentIdToDelete(null);
          }
        }}
        open={agentIdToDelete !== null}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apagar agente</AlertDialogTitle>
            <AlertDialogDescription>
              Apagar este agente? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (agentIdToDelete) {
                  performDeleteAgent(agentIdToDelete);
                }
              }}
            >
              Apagar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <input
        accept={ACCEPTED_FILE_ACCEPT}
        aria-label="Anexar documentos (imagens, PDF, DOC, DOCX, XLS, XLSX, CSV, TXT, ODT)"
        className="sr-only"
        id={fileInputId}
        multiple
        onChange={handleFileChange}
        ref={fileInputRef}
        tabIndex={-1}
        type="file"
      />

      <PromptInput
        className="relative rounded-[22px] border border-border/80 bg-muted/10 p-3 shadow-sm transition-all duration-200 focus-within:border-primary/30 focus-within:bg-background hover:border-muted-foreground/40"
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onSubmit={(event) => {
          event.preventDefault();
          const canSendWithoutPrompt =
            isRevisorAgent && hasPiAndContestacao && messages.length === 0;
          if (
            input.trim() === "" &&
            attachments.length === 0 &&
            !canSendWithoutPrompt
          ) {
            return;
          }
          if (status !== "ready") {
            toast.error("Aguarde o modelo terminar a resposta!");
            return;
          }
          submitForm();
        }}
      >
        {isDraggingOver && (
          <section
            aria-label="Zona de largar ficheiros para anexar"
            aria-live="polite"
            className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-5 bg-background/90 backdrop-blur-sm"
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDropWithOverlay(e)}
          >
            <div className="flex flex-col items-center gap-4 rounded-2xl border-2 border-primary/50 border-dashed bg-background/90 px-14 py-10 shadow-xl">
              <UploadCloudIcon
                aria-hidden
                className="size-10 text-primary/60"
              />
              <p className="font-semibold text-foreground text-lg">
                Solte os ficheiros aqui
              </p>
              {/* Tipos de ficheiro aceites com ícones coloridos */}
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <FileTextIcon aria-hidden className="size-3.5 text-red-500" />
                <span>PDF</span>
                <span aria-hidden className="opacity-40">
                  ·
                </span>
                <FileTextIcon aria-hidden className="size-3.5 text-blue-500" />
                <span>Word</span>
                <span aria-hidden className="opacity-40">
                  ·
                </span>
                <FileSpreadsheetIcon
                  aria-hidden
                  className="size-3.5 text-green-600"
                />
                <span>Excel / CSV</span>
                <span aria-hidden className="opacity-40">
                  ·
                </span>
                <ImageIcon aria-hidden className="size-3.5 text-purple-400" />
                <span>Imagem</span>
              </div>
              {/* Botões de tipo para agente Revisor de Defesas */}
              {isRevisorAgent && (
                <div className="mt-1 flex gap-3">
                  <Button
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.stopPropagation();
                      handleDropWithOverlay(e, "pi");
                    }}
                    size="sm"
                    type="button"
                    variant="secondary"
                  >
                    Marcar como Petição Inicial
                  </Button>
                  <Button
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.stopPropagation();
                      handleDropWithOverlay(e, "contestacao");
                    }}
                    size="sm"
                    type="button"
                    variant="secondary"
                  >
                    Marcar como Contestação
                  </Button>
                </div>
              )}
            </div>
          </section>
        )}
        {messages.length === 0 && agentId === "revisor-defesas" && (
          <section
            aria-label="Dicas para começar a revisão"
            className="mb-2 flex flex-wrap items-center gap-2 rounded-lg bg-muted/30 px-3 py-2"
          >
            <span className="text-muted-foreground text-xs">
              Para revisar defesas, anexe PI e Contestação
              (PDF/DOC/DOCX/Excel/CSV/TXT/ODT) ou cole o texto.
            </span>
            <div className="flex gap-1.5">
              <Button
                aria-label="Adicionar Petição Inicial"
                className="h-7 text-xs"
                onClick={() => {
                  pendingPreferredTypeRef.current = "pi";
                  fileInputRef.current?.click();
                }}
                size="sm"
                type="button"
                variant="outline"
              >
                Adicionar PI
              </Button>
              <Button
                aria-label="Adicionar Contestação"
                className="h-7 text-xs"
                onClick={() => {
                  pendingPreferredTypeRef.current = "contestacao";
                  fileInputRef.current?.click();
                }}
                size="sm"
                type="button"
                variant="outline"
              >
                Adicionar Contestação
              </Button>
            </div>
          </section>
        )}
        {(attachments.length > 0 || uploadQueue.length > 0) && (
          <div className="mb-2 flex flex-wrap items-center gap-1.5">
            {(() => {
              const total = attachments.length + uploadQueue.length;
              const showCollapsed = total > 3 && !chipsExpanded;
              const visibleAttachments = showCollapsed
                ? attachments.slice(0, 2)
                : attachments;
              const visibleQueue = showCollapsed
                ? uploadQueue.slice(0, Math.max(0, 2 - attachments.length))
                : uploadQueue;
              return (
                <>
                  {visibleAttachments.map((attachment) => {
                    const { Icon: ChipIcon, color: chipColor } = getChipIcon(
                      attachment.contentType
                    );
                    return (
                      <div
                        className="flex max-w-[200px] items-center gap-1.5 rounded-full border border-border/60 bg-muted/50 px-2.5 py-1 text-xs"
                        key={attachment.url}
                      >
                        <ChipIcon
                          aria-hidden
                          className={cn("size-3.5 shrink-0", chipColor)}
                        />
                        <span
                          className="min-w-0 truncate text-foreground"
                          title={attachment.name}
                        >
                          {attachment.name}
                        </span>
                        {attachment.documentType != null && (
                          <span
                            className={cn(
                              "shrink-0 rounded px-1.5 py-0.5 font-medium text-[10px]",
                              attachment.documentType === "pi"
                                ? "bg-primary/15 text-primary"
                                : "bg-amber-500/15 text-amber-700 dark:text-amber-400"
                            )}
                          >
                            {attachment.documentType === "pi" ? "PI" : "Cont."}
                          </span>
                        )}
                        {attachment.extractionFailed === true && (
                          <span className="shrink-0 text-[10px] text-amber-600 dark:text-amber-400">
                            sem texto
                          </span>
                        )}
                        {(() => {
                          const quality = getExtractionQuality(attachment);
                          if (!quality) {
                            return null;
                          }
                          return (
                            <span
                              className={cn(
                                "shrink-0 rounded px-1 py-0.5 font-medium text-[9px]",
                                quality.color
                              )}
                              title={quality.title}
                            >
                              {quality.label}
                            </span>
                          );
                        })()}
                        <Button
                          aria-label="Remover anexo"
                          className="size-5 shrink-0 rounded-full p-0"
                          onClick={handleRemoveAttachment(attachment.url)}
                          type="button"
                          variant="ghost"
                        >
                          <Trash2Icon size={10} />
                        </Button>
                      </div>
                    );
                  })}
                  {visibleQueue.map((item) => (
                    <div
                      className="relative flex max-w-[240px] items-center gap-1.5 overflow-hidden rounded-full border border-border/60 bg-muted/50 px-2.5 py-1 text-xs"
                      key={item.id}
                    >
                      {/* Progress bar background */}
                      <div
                        aria-hidden
                        className="absolute inset-y-0 left-0 bg-primary/10 transition-all duration-300"
                        style={{ width: `${item.percent}%` }}
                      />
                      <Loader2Icon
                        aria-hidden
                        className="relative size-3.5 shrink-0 animate-spin text-primary"
                      />
                      <span className="relative min-w-0 truncate text-muted-foreground">
                        {item.label}
                      </span>
                      <span className="relative shrink-0 font-medium text-[10px] text-primary">
                        {item.percent > 0 && item.phase === "uploading"
                          ? `${item.percent}%`
                          : getPhaseLabel(item.phase, item.fileSize)}
                      </span>
                    </div>
                  ))}
                  {showCollapsed && (
                    <Button
                      aria-label={`Mostrar mais ${total - 2} anexos`}
                      className="h-6 rounded-full px-2.5 text-xs"
                      onClick={() => setChipsExpanded(true)}
                      type="button"
                      variant="ghost"
                    >
                      +{total - 2} anexos
                    </Button>
                  )}
                </>
              );
            })()}
          </div>
        )}
        {isRevisorAgent &&
          (messages.length === 0 || hasPiOrContestacao) &&
          (hasPiAndContestacao ? (
            <div
              aria-live="polite"
              className="mb-2 flex items-center gap-2 rounded-lg border border-green-500/30 bg-green-500/5 px-3 py-1.5 text-green-800 dark:text-green-200"
            >
              <CheckIcon aria-hidden className="size-4 shrink-0" />
              <span className="font-medium text-sm">Pronto para enviar</span>
            </div>
          ) : (
            <div className="mb-2 flex flex-wrap items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-1.5">
              <span className="text-amber-800 text-sm dark:text-amber-200">
                Falta anexar: {(() => {
                  if (hasPi && hasContestacao) {
                    return null;
                  }
                  if (hasPi) {
                    return "Contestação";
                  }
                  if (hasContestacao) {
                    return "Petição Inicial";
                  }
                  return "PI e Contestação";
                })()}
              </span>
              {!hasPi && (
                <Button
                  className="h-7 text-xs"
                  onClick={() => {
                    pendingPreferredTypeRef.current = "pi";
                    fileInputRef.current?.click();
                  }}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  Adicionar PI
                </Button>
              )}
              {!hasContestacao && (
                <Button
                  className="h-7 text-xs"
                  onClick={() => {
                    pendingPreferredTypeRef.current = "contestacao";
                    fileInputRef.current?.click();
                  }}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  Adicionar Contestação
                </Button>
              )}
            </div>
          ))}
        {postUploadPrompts.length > 0 && (
          <fieldset
            aria-label="Sugestões de ação para o documento anexado"
            className="mb-2 flex min-w-0 flex-wrap gap-1.5 border-0 p-0"
          >
            {postUploadPrompts.map((p) => (
              <button
                className="whitespace-nowrap rounded-full border border-border bg-muted/70 px-3 py-1 text-[12px] text-muted-foreground transition-all hover:border-primary/40 hover:bg-primary/5 hover:text-foreground"
                key={p.label}
                onClick={() => {
                  setInput(p.text);
                  textareaRef.current?.focus();
                }}
                type="button"
              >
                {p.label}
              </button>
            ))}
          </fieldset>
        )}
        <ContextUsageIndicator
          attachments={attachments}
          knowledgeDocCount={knowledgeDocumentIds.length}
          messages={messages}
        />
        <div className="relative flex flex-row items-start gap-1 sm:gap-2">
          {atPopoverOpen && setKnowledgeDocumentIds && (
            <section
              aria-label="Documentos da base de conhecimento. Escolha um para incluir no chat."
              className="overscroll-behavior-contain absolute right-0 bottom-full left-0 z-10 mb-1 max-h-48 overflow-y-auto rounded-md border border-border bg-popover py-1 shadow-md"
            >
              {filteredKnowledgeDocs.length === 0 ? (
                <p className="px-3 py-2 text-muted-foreground text-sm">
                  {knowledgeDocsForAt.length === 0
                    ? "A carregar…"
                    : "Nenhum documento encontrado. Digite para filtrar."}
                </p>
              ) : (
                filteredKnowledgeDocs.map((doc) => {
                  const isSelected = knowledgeDocumentIds.includes(doc.id);
                  const disabled =
                    !isSelected &&
                    knowledgeDocumentIds.length >= MAX_KNOWLEDGE_SELECT;
                  return (
                    <button
                      className={cn(
                        "flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        disabled && "cursor-not-allowed opacity-60"
                      )}
                      key={doc.id}
                      onClick={() => {
                        if (disabled) {
                          return;
                        }
                        handleSelectKnowledgeDoc(doc);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Escape") {
                          setAtPopoverOpen(false);
                          textareaRef.current?.focus();
                        }
                      }}
                      type="button"
                    >
                      {isSelected ? (
                        <CheckIcon
                          aria-hidden
                          className="size-4 shrink-0 text-primary"
                        />
                      ) : (
                        <span aria-hidden className="size-4 shrink-0" />
                      )}
                      <span className="min-w-0 truncate" title={doc.title}>
                        {doc.title}
                      </span>
                    </button>
                  );
                })
              )}
            </section>
          )}
          <PromptInputTextarea
            className="grow resize-none border-0! border-none! bg-transparent p-2 text-base outline-none [-ms-overflow-style:none] [scrollbar-width:none] placeholder:text-muted-foreground focus-visible:rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 [&::-webkit-scrollbar]:hidden"
            data-testid="multimodal-input"
            disableAutoResize={true}
            maxHeight={200}
            minHeight={44}
            onChange={handleInput}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                if (atPopoverOpen) {
                  setAtPopoverOpen(false);
                  e.preventDefault();
                } else if (input.trim().length > 0) {
                  // Escape limpa o input quando não há modal aberto
                  setInput("");
                  e.preventDefault();
                }
              }
            }}
            placeholder={
              attachments.length > 0
                ? "O que deseja fazer com este documento?"
                : activeAgentMeta
                  ? `Perguntar ao ${activeAgentMeta.label}…`
                  : "Enviar mensagem…"
            }
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
        <PromptInputToolbar className="mt-1.5 flex min-h-11 flex-wrap items-center justify-between gap-2 border-border/50 border-t p-0 pt-2 shadow-none">
          <PromptInputTools className="min-w-0 flex-1 flex-wrap items-center gap-1 sm:gap-1.5">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  aria-label="Anexar ficheiros ou abrir base de conhecimento"
                  className="size-11 shrink-0 rounded-full p-0"
                  title="Adicionar (PI, Contestação, outros, base)"
                  type="button"
                  variant="ghost"
                >
                  <PlusIcon size={20} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" side="top">
                <DropdownMenuItem
                  onSelect={() => {
                    pendingPreferredTypeRef.current = "pi";
                    fileInputRef.current?.click();
                  }}
                >
                  Anexar Petição Inicial
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => {
                    pendingPreferredTypeRef.current = "contestacao";
                    fileInputRef.current?.click();
                  }}
                >
                  Anexar Contestação
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => {
                    pendingPreferredTypeRef.current = null;
                    fileInputRef.current?.click();
                  }}
                >
                  Anexar outros docs
                </DropdownMenuItem>
                {onOpenKnowledgeSidebar && (
                  <DropdownMenuItem onSelect={onOpenKnowledgeSidebar}>
                    Base de conhecimento
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
            <AttachmentsButton
              fileInputRef={fileInputRef}
              selectedModelId={selectedModelId}
              status={status}
            />
            {onOpenKnowledgeSidebar && setKnowledgeDocumentIds && (
              <Button
                aria-label="Abrir base de conhecimento"
                className={cn(
                  "relative size-11 shrink-0 rounded-full p-0 transition-colors hover:bg-accent",
                  (knowledgeDocumentIds?.length ?? 0) > 0 && "text-primary"
                )}
                onClick={onOpenKnowledgeSidebar}
                title="Base de conhecimento (@ no texto)"
                type="button"
                variant="ghost"
              >
                <BookOpenIcon size={18} />
                {(knowledgeDocumentIds?.length ?? 0) > 0 && (
                  <span
                    aria-hidden
                    className="absolute -top-0.5 -right-0.5 flex size-4 items-center justify-center rounded-full bg-primary font-medium text-[10px] text-primary-foreground"
                  >
                    {knowledgeDocumentIds.length > 9
                      ? "9+"
                      : knowledgeDocumentIds.length}
                  </span>
                )}
              </Button>
            )}
            <Button
              aria-label="Melhorar prompt com IA"
              className="size-11 shrink-0 rounded-full p-0"
              disabled={
                status === "submitted" ||
                input.trim().length === 0 ||
                isImproving
              }
              onClick={handleImprovePrompt}
              title="Melhorar prompt"
              type="button"
              variant="ghost"
            >
              {isImproving ? (
                <LoaderIcon aria-hidden className="size-[18px] animate-spin" />
              ) : (
                <WandIcon aria-hidden size={18} />
              )}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  aria-label="Mais opções (sugestões, instruções, agentes)"
                  className="size-11 shrink-0 rounded-full p-0"
                  title="Mais opções"
                  type="button"
                  variant="ghost"
                >
                  <MoreHorizontalIcon size={18} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-[200px]">
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    Sugestões de prompt
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    {REVISOR_PROMPTS.filter((p) => {
                      if ("alwaysAvailable" in p && p.alwaysAvailable) {
                        return true;
                      }
                      if (
                        "requiresAttachments" in p &&
                        p.requiresAttachments &&
                        !(attachments.length > 0)
                      ) {
                        return false;
                      }
                      if (
                        "requiresMessages" in p &&
                        p.requiresMessages &&
                        messages.length === 0
                      ) {
                        return false;
                      }
                      return true;
                    }).map((p) => (
                      <DropdownMenuItem
                        className="whitespace-normal py-2 text-left"
                        key={p.id}
                        onSelect={() => {
                          globalThis.history.pushState(
                            {},
                            "",
                            `/chat/${chatId}`
                          );
                          sendMessage({
                            role: "user",
                            parts: [{ type: "text", text: p.text }],
                          });
                        }}
                      >
                        {p.label}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                {setAgentInstructions && (
                  <DropdownMenuItem
                    onSelect={() => setAgentInstructionsDialogOpen(true)}
                  >
                    <SparklesIcon className="mr-2 size-4" />
                    Instruções do agente
                  </DropdownMenuItem>
                )}
                {setAgentId && (
                  <DropdownMenuItem onSelect={openManageAgents}>
                    <Settings2Icon className="mr-2 size-4" />
                    Meus agentes
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
            {setAgentId && (
              <>
                <Sheet
                  onOpenChange={(open) => {
                    setManageAgentsOpen(open);
                    if (!open) {
                      setAgentFormVisible(false);
                    }
                  }}
                  open={manageAgentsOpen}
                >
                  <SheetContent
                    className="flex w-full flex-col overflow-y-auto sm:max-w-lg"
                    side="left"
                  >
                    <SheetHeader>
                      <SheetTitle>Meus agentes</SheetTitle>
                      <SheetDescription>
                        Crie e edite agentes com instruções e base de
                        conhecimento próprias. Pode abrir a base de conhecimento
                        à direita para adicionar documentos enquanto preenche.
                      </SheetDescription>
                    </SheetHeader>
                    {agentFormVisible ? (
                      <div className="grid gap-3">
                        <div className="grid gap-2">
                          <Label htmlFor="custom-agent-name">Nome</Label>
                          <Input
                            id="custom-agent-name"
                            maxLength={256}
                            onChange={(e) => setAgentFormName(e.target.value)}
                            placeholder="Ex.: Due diligence contratos"
                            value={agentFormName}
                          />
                        </div>
                        <div className="grid gap-2">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <Label htmlFor="custom-agent-instructions">
                              Instruções
                            </Label>
                            <Button
                              aria-label="Melhorar instruções com IA"
                              disabled={isImproving}
                              onClick={() =>
                                handleImproveInstructions(
                                  agentFormInstructions,
                                  setAgentFormInstructions
                                )
                              }
                              size="sm"
                              type="button"
                              variant="outline"
                            >
                              {isImproving ? (
                                <LoaderIcon
                                  aria-hidden
                                  className="size-4 animate-spin"
                                />
                              ) : (
                                <WandIcon aria-hidden className="size-4" />
                              )}
                              {isImproving ? "A melhorar…" : "Melhorar prompt"}
                            </Button>
                          </div>
                          <Textarea
                            className="min-h-[120px]"
                            id="custom-agent-instructions"
                            maxLength={30_000}
                            onChange={(e) =>
                              setAgentFormInstructions(e.target.value)
                            }
                            placeholder="Descreva o papel, tom e regras do agente…"
                            value={agentFormInstructions}
                          />
                        </div>
                        <div className="grid gap-2">
                          <Label htmlFor="custom-agent-base">
                            Agente base (ferramentas)
                          </Label>
                          <Select
                            onValueChange={setAgentFormBaseId}
                            value={agentFormBaseId || "none"}
                          >
                            <SelectTrigger id="custom-agent-base">
                              <SelectValue placeholder="Nenhum" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">Nenhum</SelectItem>
                              <SelectItem value="revisor-defesas">
                                Revisor de Defesas
                              </SelectItem>
                              <SelectItem value="redator-contestacao">
                                Redator de Contestações
                              </SelectItem>
                              <SelectItem value="assistjur-master">
                                AssistJur.IA Master
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="grid gap-2">
                          <Label id="custom-agent-knowledge-label">
                            Base de conhecimento
                          </Label>
                          <p className="text-muted-foreground text-xs">
                            Documentos incluídos por defeito ao usar este agente
                            no chat (máx. {MAX_KNOWLEDGE_SELECT}).
                          </p>
                          <fieldset
                            aria-labelledby="custom-agent-knowledge-label"
                            className="max-h-[180px] overflow-y-auto rounded-md border border-border bg-muted/20 p-2"
                          >
                            {knowledgeDocsForAgentForm.length === 0 ? (
                              <div className="flex flex-col items-center gap-2 py-3 text-center">
                                <p className="text-muted-foreground text-sm">
                                  Ainda não tem documentos na base de
                                  conhecimento.
                                </p>
                                <div className="flex flex-wrap justify-center gap-2">
                                  {onOpenKnowledgeSidebar && (
                                    <Button
                                      onClick={onOpenKnowledgeSidebar}
                                      size="sm"
                                      type="button"
                                      variant="outline"
                                    >
                                      Abrir base de conhecimento
                                    </Button>
                                  )}
                                  <Button
                                    onClick={() => {
                                      mutateKnowledgeForAgentForm();
                                    }}
                                    size="sm"
                                    type="button"
                                    variant="ghost"
                                  >
                                    Atualizar lista
                                  </Button>
                                </div>
                                <p className="text-muted-foreground text-xs">
                                  Use «Abrir base de conhecimento» para abrir a
                                  barra lateral à direita; adicione documentos e
                                  depois «Atualizar lista» aqui.
                                </p>
                              </div>
                            ) : (
                              <ul className="flex flex-col gap-1">
                                {knowledgeDocsForAgentForm.map((doc) => {
                                  const isSelected =
                                    agentFormKnowledgeIds.includes(doc.id);
                                  const disabled =
                                    !isSelected &&
                                    agentFormKnowledgeIds.length >=
                                      MAX_KNOWLEDGE_SELECT;
                                  return (
                                    <li key={doc.id}>
                                      <label className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted/50 has-disabled:cursor-not-allowed has-disabled:opacity-60">
                                        <input
                                          checked={isSelected}
                                          className="size-4 rounded border-input"
                                          disabled={disabled}
                                          onChange={() => {
                                            setAgentFormKnowledgeIds((prev) => {
                                              if (isSelected) {
                                                return prev.filter(
                                                  (id) => id !== doc.id
                                                );
                                              }
                                              if (
                                                prev.length >=
                                                MAX_KNOWLEDGE_SELECT
                                              ) {
                                                return prev;
                                              }
                                              return [...prev, doc.id];
                                            });
                                          }}
                                          type="checkbox"
                                        />
                                        <span className="min-w-0 truncate">
                                          {doc.title || doc.id}
                                        </span>
                                      </label>
                                    </li>
                                  );
                                })}
                              </ul>
                            )}
                          </fieldset>
                          {agentFormKnowledgeIds.length > 0 && (
                            <span className="text-muted-foreground text-xs">
                              {agentFormKnowledgeIds.length}/
                              {MAX_KNOWLEDGE_SELECT} selecionados
                            </span>
                          )}
                        </div>
                        <div className="flex justify-end gap-2">
                          <Button
                            onClick={cancelAgentForm}
                            type="button"
                            variant="outline"
                          >
                            Cancelar
                          </Button>
                          <Button onClick={saveAgentForm} type="button">
                            {agentFormId ? "Guardar" : "Criar"}
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="grid gap-3">
                        <ul className="divide-y divide-border">
                          {customAgents.map((agent) => (
                            <li
                              className="flex items-center justify-between gap-2 py-2"
                              key={agent.id}
                            >
                              <span className="min-w-0 truncate font-medium">
                                {agent.name}
                              </span>
                              <div className="flex shrink-0 gap-1">
                                <Button
                                  aria-label={`Editar ${agent.name}`}
                                  className="size-8 p-0"
                                  onClick={() => startEditAgent(agent)}
                                  type="button"
                                  variant="ghost"
                                >
                                  <PencilIcon size={14} />
                                </Button>
                                <Button
                                  aria-label={`Apagar ${agent.name}`}
                                  className="size-8 p-0 text-destructive hover:text-destructive"
                                  onClick={() =>
                                    openDeleteAgentDialog(agent.id)
                                  }
                                  type="button"
                                  variant="ghost"
                                >
                                  <Trash2Icon size={14} />
                                </Button>
                              </div>
                            </li>
                          ))}
                        </ul>
                        {customAgents.length === 0 && (
                          <p className="text-muted-foreground text-sm">
                            Ainda não tem agentes personalizados.
                          </p>
                        )}
                        <Button
                          className="w-full"
                          onClick={startCreateAgent}
                          type="button"
                          variant="outline"
                        >
                          <PlusIcon size={16} />
                          Criar agente
                        </Button>
                      </div>
                    )}
                  </SheetContent>
                </Sheet>
                {setAgentInstructions && (
                  <Dialog
                    onOpenChange={handleAgentInstructionsDialogOpenChange}
                    open={agentInstructionsDialogOpen}
                  >
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Instruções do agente</DialogTitle>
                        <DialogDescription>
                          Por padrão o agente atua como Revisor de Defesas.
                          Sobrescreva aqui apenas se quiser outro comportamento.
                        </DialogDescription>
                      </DialogHeader>
                      <div className="grid gap-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <Label htmlFor="agent-instructions-composer">
                            Sobrescrever orientações (opcional)
                          </Label>
                          <Button
                            aria-label="Melhorar instruções com IA"
                            disabled={isImproving}
                            onClick={() =>
                              handleImproveInstructions(
                                localAgentInstructions,
                                setLocalAgentInstructions
                              )
                            }
                            size="sm"
                            type="button"
                            variant="outline"
                          >
                            {isImproving ? (
                              <LoaderIcon
                                aria-hidden
                                className="size-4 animate-spin"
                              />
                            ) : (
                              <WandIcon aria-hidden className="size-4" />
                            )}
                            {isImproving ? "A melhorar…" : "Melhorar prompt"}
                          </Button>
                        </div>
                        <Textarea
                          autoComplete="off"
                          id="agent-instructions-composer"
                          maxLength={AGENT_INSTRUCTIONS_MAX_LENGTH}
                          name="agent-instructions-composer"
                          onChange={(e) =>
                            setLocalAgentInstructions(e.target.value)
                          }
                          placeholder="Deixe em branco = Revisor de Defesas."
                          rows={4}
                          value={localAgentInstructions}
                        />
                        <span className="text-muted-foreground text-xs">
                          {localAgentInstructions.length}/
                          {AGENT_INSTRUCTIONS_MAX_LENGTH} caracteres
                        </span>
                      </div>
                    </DialogContent>
                  </Dialog>
                )}
              </>
            )}
          </PromptInputTools>

          {activeAgentMeta && (
            <span
              className="hidden shrink-0 items-center gap-1.5 rounded-full border border-border/60 bg-muted/60 px-2.5 py-0.5 text-muted-foreground text-xs sm:flex"
              title={`Agente activo: ${activeAgentMeta.label}`}
            >
              <span
                aria-hidden
                className={`size-1.5 rounded-full ${activeAgentMeta.dotClass}`}
              />
              {activeAgentMeta.label}
            </span>
          )}

          {status === "submitted" || status === "streaming" ? (
            <StopButton setMessages={setMessages} stop={stop} />
          ) : (
            <PromptInputSubmit
              className="size-8 shrink-0 rounded-full bg-primary text-primary-foreground transition-colors duration-200 hover:bg-primary/90 disabled:bg-muted disabled:text-muted-foreground disabled:opacity-60"
              data-testid="send-button"
              disabled={sendButtonDisabled}
              status={status}
              title={
                submitPrevalidationError ??
                (hasInsufficientCredits
                  ? "Créditos insuficientes para iniciar conversa."
                  : undefined)
              }
            >
              <ArrowUpIcon size={14} />
            </PromptInputSubmit>
          )}
        </PromptInputToolbar>
      </PromptInput>
      {messages.length === 0 && (
        <p className="text-muted-foreground/90 text-xs" id="revisor-input-hint">
          PDF/DOC/DOCX/Excel/CSV/TXT/ODT • Auto-identificação • @ base
        </p>
      )}
    </div>
  );
}

/**
 * Comparador do memo: inclui callbacks (sendMessage, setAgentId, etc.) para que
 * o componente re-renderize quando o pai passar novas referências.
 * O pai deve usar useCallback nesses callbacks para evitar re-renders desnecessários.
 */
export const MultimodalInput = memo(
  PureMultimodalInput,
  (prevProps, nextProps) => {
    if (prevProps.input !== nextProps.input) {
      return false;
    }
    if (prevProps.status !== nextProps.status) {
      return false;
    }
    if (prevProps.sendMessage !== nextProps.sendMessage) {
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
      prevProps.setKnowledgeDocumentIds !== nextProps.setKnowledgeDocumentIds
    ) {
      return false;
    }
    if (
      !equal(prevProps.knowledgeDocumentIds, nextProps.knowledgeDocumentIds)
    ) {
      return false;
    }
    if (prevProps.onOpenKnowledgeSidebar !== nextProps.onOpenKnowledgeSidebar) {
      return false;
    }
    if (prevProps.agentId !== nextProps.agentId) {
      return false;
    }
    if (prevProps.agentInstructions !== nextProps.agentInstructions) {
      return false;
    }
    if (prevProps.setAgentId !== nextProps.setAgentId) {
      return false;
    }
    if (prevProps.setAgentInstructions !== nextProps.setAgentInstructions) {
      return false;
    }

    return true;
  }
);
