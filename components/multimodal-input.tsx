"use client";

import type { UseChatHelpers } from "@ai-sdk/react";
import { upload as uploadToBlob } from "@vercel/blob/client";
import type { UIMessage, UIMessagePart } from "ai";
import equal from "fast-deep-equal";
import {
  BookOpenIcon,
  CheckIcon,
  FileTextIcon,
  Loader2Icon,
  LoaderIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  Settings2Icon,
  SparklesIcon,
  Trash2Icon,
  WandIcon,
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
import { getExtractionQuality } from "@/lib/extraction-quality";

interface CustomAgentRow {
  id: string;
  name: string;
  instructions: string;
  baseAgentId: string | null;
  knowledgeDocumentIds?: string[];
  createdAt: string;
}

type UploadPhase = "uploading" | "extracting" | "classifying" | "done";

const PHASE_LABELS: Record<UploadPhase, string> = {
  uploading: "Enviando…",
  extracting: "Extraindo texto…",
  classifying: "Classificando…",
  done: "Concluído",
};

/** Tamanho a partir do qual mostra label estendida na extração (10 MB). */
const LARGE_FILE_THRESHOLD = 10 * 1024 * 1024;

function getPhaseLabel(phase: UploadPhase, fileSize?: number): string {
  if (phase === "extracting" && fileSize && fileSize > LARGE_FILE_THRESHOLD) {
    return "Extraindo texto (documento grande, pode levar 30s+)…";
  }
  return PHASE_LABELS[phase];
}

interface UploadQueueItem {
  id: string;
  label: string;
  /** Current phase of the upload pipeline */
  phase: UploadPhase;
  /** Upload progress 0-100 (only meaningful during 'uploading' phase) */
  percent: number;
  /** File size in bytes */
  fileSize?: number;
}

import { MIN_CREDITS_TO_START_CHAT } from "@/lib/ai/credits";
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
import { ArrowUpIcon, PaperclipIcon, StopIcon } from "./icons";
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

const AGENT_INSTRUCTIONS_MAX_LENGTH = 4000;

/** Máximo de documentos da base de conhecimento selecionáveis no popover @ e no formulário de agente. */
const MAX_KNOWLEDGE_SELECT = 50;

/** Tipos MIME aceites para anexos (chat e base de conhecimento). */
const ACCEPTED_FILE_ACCEPT =
  "image/jpeg,image/png,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv,text/plain,application/vnd.oasis.opendocument.text";

const ACCEPTED_DROP_EXTENSIONS = /\.(docx?|pdf|jpe?g|png|xlsx?|csv|txt|odt)$/i;

function isAcceptedAttachmentType(type: string, filename?: string): boolean {
  if (
    type.startsWith("image/") ||
    type === "application/pdf" ||
    type === "application/msword" ||
    type ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    type ===
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    type === "application/vnd.ms-excel" ||
    type === "text/csv" ||
    type === "text/plain" ||
    type === "application/vnd.oasis.opendocument.text"
  ) {
    return true;
  }
  // Fallback: Windows/browsers may report application/octet-stream or "" for DOCX/PDF on drag-and-drop
  if ((type === "" || type === "application/octet-stream") && filename) {
    return ACCEPTED_DROP_EXTENSIONS.test(filename);
  }
  return false;
}

function _setCookie(name: string, value: string) {
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
  pageCount?: number;
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
    ...(typeof data.pageCount === "number"
      ? { pageCount: data.pageCount }
      : {}),
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

async function _getUploadErrorFromResponse(
  response: Response
): Promise<string> {
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
  file: File,
  onPhase?: (phase: UploadPhase, percent: number) => void
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
    onPhase?.("uploading", 10);
    const blob = await uploadToBlob(file.name, file, {
      access: "public",
      handleUploadUrl: "/api/files/upload-token",
    });
    onPhase?.("extracting", 50);
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
    onPhase?.("classifying", 90);
    const data = (await processRes.json()) as FileUploadResponse;
    onPhase?.("done", 100);
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
  file: File,
  onPhase?: (phase: UploadPhase, percent: number) => void
): Promise<ReturnType<typeof buildAttachmentFromUploadResponse> | undefined> {
  onPhase?.("uploading", 0);
  const formData = new FormData();
  formData.append("file", file);

  // Use XHR for real upload progress tracking
  const result = await new Promise<{
    ok: boolean;
    status: number;
    body: string;
  }>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/files/upload");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        const pct = Math.round((e.loaded / e.total) * 60); // Upload = 0-60%
        onPhase?.("uploading", pct);
      }
    };
    xhr.onload = () => {
      onPhase?.("extracting", 65);
      resolve({
        ok: xhr.status >= 200 && xhr.status < 300,
        status: xhr.status,
        body: xhr.responseText,
      });
    };
    xhr.onerror = () => reject(new Error("Network error"));
    xhr.send(formData);
  });

  if (result.ok) {
    onPhase?.("classifying", 90);
    try {
      const data = JSON.parse(result.body) as FileUploadResponse;
      onPhase?.("done", 100);
      return buildAttachmentFromUploadResponse(data, file);
    } catch {
      toast.error("Resposta inválida do servidor.");
      return undefined;
    }
  }

  // Error handling
  try {
    const errData = JSON.parse(result.body) as {
      error?: string;
      message?: string;
    };
    toast.error(
      errData.error ??
        errData.message ??
        "Falha ao enviar o arquivo. Tente novamente."
    );
  } catch {
    toast.error("Falha ao enviar o arquivo. Tente novamente.");
  }
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
}>;

interface ImproveTextOptions {
  emptyError: string;
  genericError: string;
  successTitle: string;
}

function usePromptImprovement() {
  const [isImproving, setIsImproving] = useState(false);
  const improveText = useCallback(
    async (
      text: string,
      setResult: (value: string) => void,
      options: ImproveTextOptions
    ) => {
      const trimmed = text.trim();
      if (trimmed.length === 0) {
        toast.error(options.emptyError);
        return;
      }
      setIsImproving(true);
      try {
        const res = await fetch("/api/prompt/improve", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: trimmed }),
        });
        const data = (await res.json()) as
          | { improvedPrompt: string; diagnosis?: string; notes?: string }
          | { error?: string };
        if (!res.ok) {
          const msg =
            "error" in data && typeof data.error === "string"
              ? data.error
              : options.genericError;
          toast.error(msg);
          return;
        }
        if (
          "improvedPrompt" in data &&
          typeof data.improvedPrompt === "string"
        ) {
          setResult(data.improvedPrompt);
          const parts: string[] = [];
          if (data.diagnosis?.trim()) {
            parts.push(data.diagnosis.trim());
          }
          if (data.notes?.trim()) {
            parts.push(`Alterações: ${data.notes.trim()}`);
          }
          const description =
            parts.length > 0
              ? parts.join("\n\n").slice(0, 400) +
                (parts.join("\n\n").length > 400 ? "…" : "")
              : undefined;
          toast.success(options.successTitle, { description });
        }
      } catch {
        toast.error("Erro de ligação. Tente novamente.");
      } finally {
        setIsImproving(false);
      }
    },
    []
  );
  return { improveText, isImproving };
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
}: PureMultimodalInputProps) {
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
      const now = Date.now();
      const queueIds = files.map((_, i) => `uq-${now}-${i}`);
      setUploadQueue((prev) => [
        ...prev,
        ...files.map((f, i) => ({
          id: queueIds[i],
          label: f.name,
          phase: "uploading" as UploadPhase,
          percent: 0,
          fileSize: f.size,
        })),
      ]);
      try {
        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          const attachment = await uploadFile(file, queueIds[i]);
          if (attachment !== undefined && typeof attachment.url === "string") {
            // Preferir tipo pelo nome do ficheiro quando explícito (ex.: "Contestação - RO.pdf") para evitar classificação errada pelo conteúdo
            const docType =
              inferDocumentTypeFromFilename(file.name) ??
              attachment.documentType ??
              (i === 0 ? preferredTypeForFirst : undefined);
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
          setUploadQueue((prev) => {
            const idx = prev.findIndex((q) => q.label === file.name);
            if (idx < 0) {
              return prev;
            }
            return [...prev.slice(0, idx), ...prev.slice(idx + 1)];
          });
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
  const isInputEmpty = revisorFirstMessage
    ? !hasPiAndContestacao && input.trim() === ""
    : attachments.length === 0 && input.trim() === "";
  const isUploading = uploadQueue.length > 0;
  const hasInsufficientCredits =
    creditsData !== undefined &&
    creditsData.balance < MIN_CREDITS_TO_START_CHAT;
  const sendButtonDisabled =
    isInputEmpty || isUploading || hasInsufficientCredits;

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
            className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-background/90 backdrop-blur-sm"
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDropWithOverlay(e)}
          >
            <p className="font-semibold text-base text-foreground">
              Solte os ficheiros aqui
            </p>
            {isRevisorAgent && (
              <div className="flex gap-2">
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
                  Marcar como PI
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
                  {visibleAttachments.map((attachment) => (
                    <div
                      className="flex max-w-[200px] items-center gap-1.5 rounded-full border border-border/60 bg-muted/50 px-2.5 py-1 text-xs"
                      key={attachment.url}
                    >
                      <FileTextIcon
                        aria-hidden
                        className="size-3.5 shrink-0 text-muted-foreground"
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
                  ))}
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
            placeholder="Enviar mensagem…"
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

          {status === "submitted" || status === "streaming" ? (
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
      aria-label="Anexar documentos (imagens, PDF, DOC, DOCX, XLS, XLSX, CSV, TXT, ODT)"
      className="aspect-square h-8 rounded-lg p-1 transition-colors hover:bg-accent"
      data-testid="attachments-button"
      disabled={disabled}
      onClick={openFileDialog}
      title="Anexar documentos (imagens, PDF, DOC, DOCX, Excel, CSV, TXT, ODT)"
      type="button"
      variant="ghost"
    >
      <PaperclipIcon size={14} />
    </Button>
  );
}

const AttachmentsButton = memo(PureAttachmentsButton);

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
