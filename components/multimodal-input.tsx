"use client";

import type { UseChatHelpers } from "@ai-sdk/react";
import { upload as uploadToBlob } from "@vercel/blob/client";
import type { UIMessage, UIMessagePart } from "ai";
import equal from "fast-deep-equal";
import {
  BookOpenIcon,
  CheckIcon,
  PencilIcon,
  PlusIcon,
  Settings2Icon,
  SparklesIcon,
  Trash2Icon,
} from "lucide-react";
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
import useSWR from "swr";
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
  getModelsByProviderForAgent,
  getModelsForAgent,
} from "@/lib/ai/agent-models";
import {
  AGENT_IDS,
  type AgentId,
  getAgentConfig,
} from "@/lib/ai/agents-registry";

interface CustomAgentRow {
  id: string;
  name: string;
  instructions: string;
  baseAgentId: string | null;
  createdAt: string;
}

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
import { cn, fetcher } from "@/lib/utils";
import {
  PromptInput,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputToolbar,
  PromptInputTools,
} from "./elements/prompt-input";
import { ArrowUpIcon, PaperclipIcon, StopIcon } from "./icons";
import { PreviewAttachment } from "./preview-attachment";
import { PromptSelector } from "./prompt-selector";
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
  DialogTrigger,
} from "./ui/dialog";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { Textarea } from "./ui/textarea";
import type { VisibilityType } from "./visibility-selector";

const AGENT_INSTRUCTIONS_MAX_LENGTH = 4000;

function setCookie(name: string, value: string) {
  const maxAge = 60 * 60 * 24 * 365; // 1 year
  // biome-ignore lint/suspicious/noDocumentCookie: needed for client-side cookie setting
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${maxAge}`;
}

/** Limite do body em produção (Vercel). Ficheiros maiores usam upload direto para Blob. */
const BODY_SIZE_LIMIT_BYTES = 4.5 * 1024 * 1024;

interface FileUploadResponse {
  url?: string;
  pathname?: string;
  contentType?: string;
  extractedText?: string;
  extractionFailed?: boolean;
  extractionDetail?: string;
  documentType?: "pi" | "contestacao";
}

function buildAttachmentFromUploadResponse(
  data: FileUploadResponse,
  file: File
) {
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
    url: url ?? "",
    name: file.name,
    contentType: contentType ?? file.type,
    ...(typeof pathname === "string" && pathname.length > 0
      ? { pathname }
      : {}),
    ...(typeof extractedText === "string" ? { extractedText } : {}),
    ...(extractionFailed === true ? { extractionFailed: true } : {}),
    ...(docType ? { documentType: docType } : {}),
  };
}

function updateAttachmentByUrl(
  attachments: Attachment[],
  url: string,
  update: Partial<Attachment>
): Attachment[] {
  return attachments.map((a) => (a.url === url ? { ...a, ...update } : a));
}

function removeAttachmentByUrl(
  attachments: Attachment[],
  url: string
): Attachment[] {
  return attachments.filter((a) => a.url !== url);
}

function isDocumentContentType(ct: string | undefined): boolean {
  return (
    ct === "application/pdf" ||
    ct === "application/msword" ||
    ct ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  );
}

/**
 * Infere PI ou Contestação a partir do nome do ficheiro (ex.: "Inicial.pdf", "Contestação.docx").
 * Usado quando o anexo é adicionado pelo clipe ou drop genérico, para reconhecer o tipo mesmo sem backend.
 */
function inferDocumentTypeFromFilename(
  filename: string
): "pi" | "contestacao" | undefined {
  const n = filename.toLowerCase().replace(/\s+/g, " ");
  const looksLikeContestacao =
    n.includes("contest") ||
    n.includes("defesa") ||
    n.includes("reclamado") ||
    n.includes("impugna");
  const looksLikePi =
    (n.includes("inicial") ||
      n.includes("petição") ||
      n.includes("peticao") ||
      n.includes("reclamante")) &&
    !looksLikeContestacao;
  if (looksLikeContestacao) {
    return "contestacao";
  }
  if (looksLikePi) {
    return "pi";
  }
  return undefined;
}

/**
 * Se há exatamente 2 anexos de documento com texto e apenas um tem tipo (PI ou Contestação),
 * atribui o tipo em falta ao outro — completa a identificação automática.
 */
function autoAssignMissingDocumentType(
  attachments: Attachment[]
): Attachment[] {
  const docsWithText = attachments.filter(
    (a) =>
      typeof a.extractedText === "string" &&
      isDocumentContentType(a.contentType)
  );
  if (docsWithText.length !== 2) {
    return attachments;
  }
  const [first, second] = docsWithText;
  const type1 = first.documentType;
  const type2 = second.documentType;
  if (type1 && type2) {
    return attachments;
  }
  if (!(type1 || type2)) {
    return attachments;
  }
  const missingType: "pi" | "contestacao" =
    type1 === "pi" ? "contestacao" : "pi";
  const urlToFix = type1 ? second.url : first.url;
  return attachments.map((a) =>
    a.url === urlToFix ? { ...a, documentType: missingType } : a
  );
}

/** Retorna mensagem de erro se houver documentos sem texto extraído; null se válido para envio. */
function validateAttachmentsForSubmit(
  attachments: Attachment[]
): string | null {
  const docsWithoutText = attachments.filter(
    (a) => isDocumentContentType(a.contentType) && a.extractedText == null
  );
  if (docsWithoutText.length > 0) {
    return `${docsWithoutText.length} documento(s) sem texto. Cole o texto no cartão do documento ou remova-os para enviar.`;
  }
  return null;
}

/**
 * Validação pré-envio para o Revisor de Defesas: exige PI e Contestação identificados.
 * Aplicar quando o agente é o Revisor (sem instruções customizadas) e há anexos de documento ou primeira mensagem.
 * Retorna mensagem de erro ou null se válido.
 */
function validateRevisorPiContestacao(
  attachments: Attachment[],
  messageCount: number
): string | null {
  const hasDocumentParts = attachments.some(
    (a) =>
      typeof a.extractedText === "string" &&
      (a.documentType === "pi" || a.documentType === "contestacao")
  );
  if (!hasDocumentParts && messageCount > 0) {
    return null;
  }
  const hasPi = attachments.some(
    (a) => typeof a.extractedText === "string" && a.documentType === "pi"
  );
  const hasContestacao = attachments.some(
    (a) =>
      typeof a.extractedText === "string" && a.documentType === "contestacao"
  );
  if (!(hasPi && hasContestacao)) {
    return "Para auditar a contestação, anexe a Petição Inicial e a Contestação (arraste para os slots ou use o anexo). O tipo é identificado automaticamente quando possível; pode ajustar no menu de cada documento.";
  }
  return null;
}

interface DocumentPart {
  type: "document";
  name: string;
  text: string;
  documentType?: "pi" | "contestacao";
}

interface FilePart {
  type: "file";
  url: string;
  name: string;
  mediaType: string;
}

function buildAttachmentParts(
  attachments: Attachment[]
): Array<DocumentPart | FilePart> {
  const parts: Array<DocumentPart | FilePart> = [];
  for (const attachment of attachments) {
    if (typeof attachment.extractedText === "string") {
      parts.push({
        type: "document",
        name: attachment.name,
        text: attachment.extractedText,
        ...(attachment.documentType
          ? { documentType: attachment.documentType }
          : {}),
      });
    } else if (attachment.contentType?.startsWith("image/")) {
      parts.push({
        type: "file",
        url: attachment.url,
        name: attachment.name,
        mediaType: attachment.contentType,
      });
    }
  }
  return parts;
}

async function getUploadErrorFromResponse(response: Response): Promise<string> {
  if (response.status === 401) {
    return "Inicie sessão para anexar ficheiros. Use «Continuar como visitante» ou entre na sua conta.";
  }
  if (response.status === 413) {
    return "Ficheiro demasiado grande. Em produção o limite é 4,5 MB. Use um ficheiro com menos de 4,5 MB.";
  }
  try {
    const data = (await response.json()) as { error?: string; detail?: string };
    if (typeof data?.error === "string" && data.error.length > 0) {
      let msg = data.error;
      if (typeof data?.detail === "string" && data.detail.length > 0) {
        msg += ` (${data.detail})`;
      }
      return msg;
    }
  } catch {
    // Resposta não é JSON; manter mensagem genérica
  }
  return "Falha ao enviar o arquivo. Tente novamente.";
}

async function uploadLargeFile(
  file: File
): Promise<ReturnType<typeof buildAttachmentFromUploadResponse> | undefined> {
  const tokenCheckRes = await fetch("/api/files/upload-token", {
    method: "GET",
  });
  if (!tokenCheckRes.ok) {
    const errData = (await tokenCheckRes.json().catch(() => ({}))) as {
      error?: string;
    };
    const msg =
      typeof errData.error === "string"
        ? errData.error
        : "Upload de ficheiros grandes não disponível. Use um ficheiro com menos de 4,5 MB.";
    toast.error(msg);
    return undefined;
  }
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
      const errData = (await processRes.json().catch(() => ({}))) as {
        error?: string;
      };
      const msg =
        typeof errData.error === "string"
          ? errData.error
          : "Falha ao processar o ficheiro após o upload.";
      toast.error(msg);
      return undefined;
    }
    const data = (await processRes.json()) as FileUploadResponse;
    return buildAttachmentFromUploadResponse(data, file);
  } catch (directError: unknown) {
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

async function uploadSmallFile(
  file: File
): Promise<ReturnType<typeof buildAttachmentFromUploadResponse> | undefined> {
  const formData = new FormData();
  formData.append("file", file);
  const response = await fetch("/api/files/upload", {
    method: "POST",
    body: formData,
  });
  if (response.ok) {
    const data = (await response.json()) as FileUploadResponse;
    return buildAttachmentFromUploadResponse(data, file);
  }
  const errorMessage = await getUploadErrorFromResponse(response);
  toast.error(errorMessage);
  return undefined;
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
  /** Id do agente (revisor-defesas | analise-contratos). Validação PI+Contestação só quando revisor-defesas. */
  agentId?: string;
  /** Permite alterar o agente a partir do rodapé (composer). Quando omitido, o seletor de agente não é exibido. */
  setAgentId?: (value: string) => void;
  /** Permite alterar as instruções customizadas do agente a partir do rodapé. */
  setAgentInstructions?: (value: string) => void;
  /** Abre a barra lateral da base de conhecimento (ex.: ao clicar no botão no rodapé). */
  onOpenKnowledgeSidebar?: () => void;
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
  onModelChange,
  inputRef: inputRefProp,
  knowledgeDocumentIds = [],
  setKnowledgeDocumentIds,
  agentInstructions = "",
  agentId = "revisor-defesas",
  setAgentId,
  setAgentInstructions,
  onOpenKnowledgeSidebar,
}: PureMultimodalInputProps) {
  const MAX_KNOWLEDGE_SELECT = 50;
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
  const [agentIdToDelete, setAgentIdToDelete] = useState<string | null>(null);

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

  const startCreateAgent = useCallback(() => {
    setAgentFormId(null);
    setAgentFormName("");
    setAgentFormInstructions("");
    setAgentFormBaseId("");
    setAgentFormVisible(true);
  }, []);

  const startEditAgent = useCallback((agent: CustomAgentRow) => {
    setAgentFormId(agent.id);
    setAgentFormName(agent.name);
    setAgentFormInstructions(agent.instructions);
    setAgentFormBaseId(agent.baseAgentId ?? "");
    setAgentFormVisible(true);
    setManageAgentsOpen(true);
  }, []);

  const cancelAgentForm = useCallback(() => {
    setAgentFormId(null);
    setAgentFormName("");
    setAgentFormInstructions("");
    setAgentFormBaseId("");
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
            | "analise-contratos"
            | "redator-contestacao");
    try {
      if (agentFormId) {
        const res = await fetch(`/api/agents/custom/${agentFormId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, instructions, baseAgentId }),
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
          body: JSON.stringify({ name, instructions, baseAgentId }),
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
  const [uploadQueue, setUploadQueue] = useState<string[]>([]);

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
    isRevisorAgent,
    messages.length,
  ]);

  const uploadFile = useCallback(async (file: File) => {
    try {
      if (file.size > BODY_SIZE_LIMIT_BYTES) {
        return await uploadLargeFile(file);
      }
      return await uploadSmallFile(file);
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
      setUploadQueue((prev) => [...prev, ...files.map((f) => f.name)]);
      try {
        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          const attachment = await uploadFile(file);
          if (attachment !== undefined && typeof attachment.url === "string") {
            const docType =
              attachment.documentType ??
              (i === 0 ? preferredTypeForFirst : undefined) ??
              inferDocumentTypeFromFilename(file.name);
            const a: Attachment = {
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
            };
            setAttachments((current) =>
              autoAssignMissingDocumentType([...current, a])
            );
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
      const preferred = pendingPreferredTypeRef.current ?? undefined;
      pendingPreferredTypeRef.current = null;
      processFiles(files, preferred);
      event.target.value = "";
    },
    [processFiles]
  );

  const handleDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const items = event.dataTransfer.files;
      if (!items?.length) {
        return;
      }
      const files = Array.from(items).filter(
        (f) =>
          f.type.startsWith("image/") ||
          f.type === "application/pdf" ||
          f.type === "application/msword" ||
          f.type ===
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
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
  }, []);

  const removeAllAttachments = useCallback(() => {
    setAttachments([]);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, [setAttachments]);

  const handleSaveToArchivos = useCallback(async (attachment: Attachment) => {
    const pathname = attachment.pathname;
    const url = attachment.url;
    if (!(pathname && url)) {
      toast.error(
        "Este anexo não pode ser guardado em Arquivos (falta referência)."
      );
      return;
    }
    try {
      const res = await fetch("/api/arquivos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pathname,
          url,
          filename: attachment.name,
          contentType: attachment.contentType,
          ...(typeof attachment.extractedText === "string" && {
            extractedTextCache: attachment.extractedText,
          }),
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as {
          message?: string;
        };
        toast.error(data?.message ?? "Erro ao guardar em Arquivos.");
        return;
      }
      toast.success(
        "Guardado em Arquivos. Pode adicionar à base de conhecimento na sidebar."
      );
    } catch {
      toast.error("Erro ao guardar em Arquivos.");
    }
  }, []);

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
            attachment?.url != null && attachment?.contentType != null
        );

        setAttachments((curr) => [
          ...curr,
          ...(successfullyUploadedAttachments as Attachment[]),
        ]);
      } catch {
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

  const handleDocumentTypeChange = useCallback(
    (attachmentUrl: string) => (documentType: "pi" | "contestacao") => {
      setAttachments((current) =>
        updateAttachmentByUrl(current, attachmentUrl, { documentType })
      );
    },
    [setAttachments]
  );

  const handlePastedTextForAttachment = useCallback(
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

  const revisorFirstMessage = isRevisorAgent && messages.length === 0;
  const sendButtonDisabled =
    (revisorFirstMessage
      ? !hasPiAndContestacao && input.trim() === ""
      : attachments.length === 0 && input.trim() === "") ||
    uploadQueue.length > 0;

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
        accept="image/jpeg,image/png,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        aria-label="Anexar documentos (imagens, PDF, DOC, DOCX)"
        className="sr-only"
        id={fileInputId}
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
        {messages.length === 0 &&
          agentId === "revisor-defesas" &&
          attachments.length < 2 && (
            <section
              aria-label="Zonas de drop para Petição Inicial e Contestação"
              className="mb-3 grid gap-3 sm:grid-cols-2"
            >
              <button
                aria-label="Enviar Petição Inicial: arraste o ficheiro ou clique para selecionar"
                className="flex min-h-[88px] cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-muted-foreground/30 border-dashed bg-muted/20 px-4 py-4 text-center transition-colors hover:border-primary/40 hover:bg-muted/40 focus-visible:border-primary/50 focus-visible:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                onClick={() => {
                  pendingPreferredTypeRef.current = "pi";
                  fileInputRef.current?.click();
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  e.dataTransfer.dropEffect = "copy";
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  const file = e.dataTransfer.files[0];
                  if (
                    file &&
                    (file.type.startsWith("image/") ||
                      file.type === "application/pdf" ||
                      file.type === "application/msword" ||
                      file.type ===
                        "application/vnd.openxmlformats-officedocument.wordprocessingml.document")
                  ) {
                    processFiles([file], "pi");
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    pendingPreferredTypeRef.current = "pi";
                    fileInputRef.current?.click();
                  }
                }}
                type="button"
              >
                <span className="font-medium text-muted-foreground text-sm">
                  Petição Inicial
                </span>
                <span className="text-muted-foreground/80 text-xs">
                  Arraste o documento aqui ou clique para selecionar
                </span>
              </button>
              <button
                aria-label="Enviar Contestação: arraste o ficheiro ou clique para selecionar"
                className="flex min-h-[88px] cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-muted-foreground/30 border-dashed bg-muted/20 px-4 py-4 text-center transition-colors hover:border-primary/40 hover:bg-muted/40 focus-visible:border-primary/50 focus-visible:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                onClick={() => {
                  pendingPreferredTypeRef.current = "contestacao";
                  fileInputRef.current?.click();
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  e.dataTransfer.dropEffect = "copy";
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  const file = e.dataTransfer.files[0];
                  if (
                    file &&
                    (file.type.startsWith("image/") ||
                      file.type === "application/pdf" ||
                      file.type === "application/msword" ||
                      file.type ===
                        "application/vnd.openxmlformats-officedocument.wordprocessingml.document")
                  ) {
                    processFiles([file], "contestacao");
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    pendingPreferredTypeRef.current = "contestacao";
                    fileInputRef.current?.click();
                  }
                }}
                type="button"
              >
                <span className="font-medium text-muted-foreground text-sm">
                  Contestação
                </span>
                <span className="text-muted-foreground/80 text-xs">
                  Arraste o documento aqui ou clique para selecionar
                </span>
              </button>
            </section>
          )}
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
            <ul
              aria-label={`Lista de anexos: ${attachments.length} documento(s)`}
              className="flex flex-row items-end gap-2 overflow-x-auto overflow-y-hidden py-0.5"
              data-testid="attachments-preview"
            >
              {attachments.map((attachment) => (
                <li className="min-w-[120px] shrink-0" key={attachment.url}>
                  <PreviewAttachment
                    attachment={attachment}
                    key={attachment.url}
                    onDocumentTypeChange={
                      typeof attachment.extractedText === "string"
                        ? handleDocumentTypeChange(attachment.url)
                        : undefined
                    }
                    onPastedText={
                      attachment.extractionFailed === true
                        ? handlePastedTextForAttachment(attachment.url)
                        : undefined
                    }
                    onRemove={handleRemoveAttachment(attachment.url)}
                    onSaveToArchivos={handleSaveToArchivos}
                  />
                </li>
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
                  uploadingLabel="A enviar e a processar documento…"
                />
              ))}
            </ul>
          </div>
        )}
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
              if (atPopoverOpen && e.key === "Escape") {
                setAtPopoverOpen(false);
              }
            }}
            placeholder="Cole o texto da Petição Inicial e da Contestação, ou descreva o caso e anexe documentos… Escreva @ para incluir um documento da base."
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
        <PromptInputToolbar className="mt-1.5 flex min-h-9 flex-wrap items-center justify-between gap-2 border-border/60 border-t p-0 pt-2 shadow-none">
          <PromptInputTools className="min-w-0 flex-1 flex-wrap items-center gap-1 sm:gap-1.5">
            {setAgentId && (
              <>
                <Select
                  onValueChange={(value) => setAgentId(value)}
                  value={
                    AGENT_IDS.includes(agentId as AgentId)
                      ? agentId
                      : customAgents.some((a) => a.id === agentId)
                        ? agentId
                        : "revisor-defesas"
                  }
                >
                  <SelectTrigger
                    aria-label="Selecionar agente"
                    className="h-8 w-auto min-w-[120px] border border-border/60 bg-muted/40 px-2.5 shadow-none transition-colors hover:border-muted-foreground/30 hover:bg-muted/70 focus:ring-2 focus:ring-ring/50 md:min-w-[140px]"
                  >
                    <SelectValue placeholder="Agente" />
                  </SelectTrigger>
                  <SelectContent>
                    {AGENT_IDS.map((id) => {
                      const config = getAgentConfig(id);
                      return (
                        <SelectItem key={id} value={id}>
                          {config.label}
                        </SelectItem>
                      );
                    })}
                    {customAgents.length > 0 && (
                      <>
                        <div className="border-t px-2 py-1.5 font-medium text-muted-foreground text-xs">
                          Meus agentes
                        </div>
                        {customAgents.map((agent) => (
                          <SelectItem key={agent.id} value={agent.id}>
                            {agent.name}
                          </SelectItem>
                        ))}
                      </>
                    )}
                  </SelectContent>
                </Select>
                <Dialog
                  onOpenChange={(open) => {
                    setManageAgentsOpen(open);
                    if (!open) {
                      setAgentFormVisible(false);
                    }
                  }}
                  open={manageAgentsOpen}
                >
                  <DialogTrigger asChild>
                    <Button
                      aria-label="Gerir agentes personalizados"
                      className="size-8 shrink-0 rounded-lg p-0 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                      onClick={openManageAgents}
                      title="Gerir agentes personalizados"
                      type="button"
                      variant="ghost"
                    >
                      <Settings2Icon size={16} />
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-h-[85vh] overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle>Meus agentes</DialogTitle>
                      <DialogDescription>
                        Crie e edite agentes com instruções e base de
                        conhecimento próprias. Pode herdar as ferramentas do
                        Revisor de Defesas (agente base).
                      </DialogDescription>
                    </DialogHeader>
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
                          <Label htmlFor="custom-agent-instructions">
                            Instruções
                          </Label>
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
                                Revisor de Defesas (DOCX, validação
                                PI+Contestação)
                              </SelectItem>
                              <SelectItem value="analise-contratos">
                                Análise de contratos
                              </SelectItem>
                              <SelectItem value="redator-contestacao">
                                Redator de Contestações
                              </SelectItem>
                            </SelectContent>
                          </Select>
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
                            Ainda não tem agentes personalizados. Crie um para
                            usar instruções e contexto próprios.
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
                  </DialogContent>
                </Dialog>
                {setAgentInstructions && (
                  <Dialog
                    onOpenChange={handleAgentInstructionsDialogOpenChange}
                    open={agentInstructionsDialogOpen}
                  >
                    <DialogTrigger asChild>
                      <Button
                        aria-label="Configurar instruções do agente (padrão: Revisor de Defesas)"
                        className="size-8 shrink-0 rounded-lg p-0 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                        title="Instruções do agente (padrão: Revisor de Defesas)"
                        type="button"
                        variant="ghost"
                      >
                        <SparklesIcon size={16} />
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Instruções do agente</DialogTitle>
                        <DialogDescription>
                          Por padrão o agente atua como Revisor de Defesas
                          Trabalhistas (auditoria, parecer, roteiros).
                          Sobrescreva aqui apenas se quiser outro comportamento
                          neste chat.
                        </DialogDescription>
                      </DialogHeader>
                      <div className="grid gap-2">
                        <Label htmlFor="agent-instructions-composer">
                          Sobrescrever orientações (opcional)
                        </Label>
                        <Textarea
                          autoComplete="off"
                          id="agent-instructions-composer"
                          maxLength={AGENT_INSTRUCTIONS_MAX_LENGTH}
                          name="agent-instructions-composer"
                          onChange={(e) =>
                            setLocalAgentInstructions(e.target.value)
                          }
                          placeholder="Deixe em branco = Revisor de Defesas. Ou descreva outro tom/regras para este chat…"
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
            {onOpenKnowledgeSidebar && setKnowledgeDocumentIds && (
              <Button
                aria-label="Abrir base de conhecimento"
                className={cn(
                  "relative size-8 shrink-0 rounded-lg p-0 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground",
                  (knowledgeDocumentIds?.length ?? 0) > 0 && "text-primary"
                )}
                onClick={onOpenKnowledgeSidebar}
                title="Base de conhecimento — escolher documentos para o chat (ou use @ no texto)"
                type="button"
                variant="ghost"
              >
                <BookOpenIcon size={16} />
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
            <PromptSelector
              chatId={chatId}
              disabled={status !== "ready"}
              hasAttachments={attachments.length > 0}
              messagesCount={messages.length}
              sendMessage={sendMessage}
            />
            <AttachmentsButton
              fileInputRef={fileInputRef}
              selectedModelId={selectedModelId}
              status={status}
            />
            <div aria-hidden className="mx-1 h-4 w-px shrink-0 bg-border/60" />
            <ModelSelectorCompact
              agentId={agentId}
              onModelChange={onModelChange}
              selectedModelId={selectedModelId}
            />
          </PromptInputTools>

          {status === "submitted" ? (
            <StopButton setMessages={setMessages} stop={stop} />
          ) : (
            <PromptInputSubmit
              className="size-8 shrink-0 rounded-full bg-primary text-primary-foreground transition-colors duration-200 hover:bg-primary/90 disabled:bg-muted disabled:text-muted-foreground disabled:opacity-60"
              data-testid="send-button"
              disabled={sendButtonDisabled}
              status={status}
            >
              <ArrowUpIcon size={14} />
            </PromptInputSubmit>
          )}
        </PromptInputToolbar>
      </PromptInput>
      {messages.length === 0 && (
        <p className="text-muted-foreground text-xs" id="revisor-input-hint">
          Anexe a Petição Inicial e a Contestação (PDF, DOC ou DOCX); o tipo é
          identificado automaticamente. Ajuste no menu de cada documento se
          necessário. Use o ícone de livro para a base ou @ no texto. Pode
          arrastar ficheiros para a caixa.
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
    if (prevProps.agentId !== nextProps.agentId) {
      return false;
    }
    if (prevProps.agentInstructions !== nextProps.agentInstructions) {
      return false;
    }

    return true;
  }
);

function PureAttachmentsButton({
  fileInputRef,
  status,
  selectedModelId,
}: Readonly<{
  fileInputRef: React.MutableRefObject<HTMLInputElement | null>;
  status: UseChatHelpers<ChatMessage>["status"];
  selectedModelId: string;
}>) {
  const isReasoningModel =
    selectedModelId.includes("reasoning") || selectedModelId.includes("think");
  const disabled = status !== "ready" || isReasoningModel;

  const openFileDialog = useCallback(() => {
    fileInputRef.current?.click();
  }, [fileInputRef]);

  return (
    <Button
      aria-label="Anexar documentos (imagens, PDF, DOC, DOCX)"
      className="aspect-square h-8 rounded-lg p-1 transition-colors hover:bg-accent"
      data-testid="attachments-button"
      disabled={disabled}
      onClick={openFileDialog}
      title="Anexar documentos (imagens, PDF, DOCX)"
      type="button"
      variant="ghost"
    >
      <PaperclipIcon size={14} />
    </Button>
  );
}

const AttachmentsButton = memo(PureAttachmentsButton);

function PureModelSelectorCompact({
  agentId,
  selectedModelId,
  onModelChange,
}: Readonly<{
  agentId?: string;
  selectedModelId: string;
  onModelChange?: (modelId: string) => void;
}>) {
  const [open, setOpen] = useState(false);

  const modelsForAgent = agentId ? getModelsForAgent(agentId) : chatModels;
  const modelsByProviderFiltered = agentId
    ? getModelsByProviderForAgent(agentId)
    : modelsByProvider;

  const selectedModel =
    modelsForAgent.find((m) => m.id === selectedModelId) ??
    modelsForAgent.find((m) => m.id === DEFAULT_CHAT_MODEL) ??
    modelsForAgent[0] ??
    chatModels[0];
  const [provider] = selectedModel.id.split("/");

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
        <ModelSelectorInput placeholder="Buscar modelos…" />
        <ModelSelectorList>
          {Object.entries(modelsByProviderFiltered).map(
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
}: Readonly<{
  stop: () => void;
  setMessages: UseChatHelpers<ChatMessage>["setMessages"];
}>) {
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
