"use client";

import { formatDistanceToNow } from "date-fns";
import { pt } from "date-fns/locale";
import {
  BookOpenIcon,
  ChevronDownIcon,
  EllipsisVertical,
  EyeIcon,
  FolderIcon,
  FolderInput,
  FolderOpenIcon,
  FolderPlusIcon,
  Loader2,
  Pencil,
  SearchIcon,
  SparklesIcon,
  Trash2,
  UploadIcon,
  XIcon,
} from "lucide-react";
import { usePathname, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import useSWR, { useSWRConfig } from "swr";
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
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn, fetcher } from "@/lib/utils";

const KNOWLEDGE_FILES_ACCEPT =
  ".pdf,.doc,.docx,.jpg,.jpeg,.png,.xls,.xlsx,.csv,.txt,.odt,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv,text/plain,application/vnd.oasis.opendocument.text,image/jpeg,image/png";
/** Máximo de ficheiros por pedido à API (enviados em lotes se for mais). */
const MAX_FILES_PER_BATCH = 50;
const MAX_KNOWLEDGE_SELECT = 50;
const MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024; // 100 MB
const ACCEPTED_EXTENSIONS = /\.(docx?|pdf|jpe?g|png|xlsx?|csv|txt|odt)$/i;
const RECENT_DOCS_LIMIT = 8;

interface KnowledgeDoc {
  id: string;
  title: string;
  folderId?: string | null;
  createdAt?: string;
  /** pending = só guardado; indexed = chunks disponíveis; failed = erro ao vetorizar. */
  indexingStatus?: "pending" | "indexed" | "failed";
}

interface KnowledgeFolderType {
  id: string;
  name: string;
  parentId: string | null;
}

interface UserFileType {
  id: string;
  filename: string;
  pathname: string;
  contentType: string;
  createdAt: string;
}

/** Pasta selecionada: null = raiz. Estado no URL ?folder=root ou ?folder=uuid. Usa history.replaceState para não provocar remount do Chat (preserva agente selecionado). */
function useKnowledgeFolderFromUrl(): [
  string | null,
  (folderId: string | null) => void,
] {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const rawFromUrl = searchParams.get("folder");
  const fromUrl =
    rawFromUrl === "root" || rawFromUrl === "" || !rawFromUrl
      ? null
      : rawFromUrl;
  const [folderState, setFolderState] = useState<string | null | undefined>(
    undefined
  );
  const current = folderState === undefined ? fromUrl : folderState;

  useEffect(() => {
    setFolderState(undefined);
  }, []);

  const setFolder = useCallback(
    (folderId: string | null) => {
      setFolderState(folderId);
      if (globalThis.window !== undefined) {
        const params = new URLSearchParams(globalThis.window.location.search);
        params.set("knowledge", "open");
        params.set("folder", folderId ?? "root");
        globalThis.window.history.replaceState(
          null,
          "",
          `${pathname ?? "/chat"}?${params.toString()}`
        );
      }
    },
    [pathname]
  );
  return [current, setFolder];
}

const MAX_ARCHIVOS_FOR_CHAT = 50;

export function KnowledgeSidebarContent({
  knowledgeDocumentIds,
  setKnowledgeDocumentIds,
  archivoIdsForChat = [],
  setArchivoIdsForChat,
  onClose,
  className,
}: Readonly<{
  knowledgeDocumentIds: string[];
  setKnowledgeDocumentIds: (
    value: string[] | ((prev: string[]) => string[])
  ) => void;
  /** IDs de Arquivos usados apenas neste chat (sem guardar na base). */
  archivoIdsForChat?: string[];
  setArchivoIdsForChat?: (
    value: string[] | ((prev: string[]) => string[])
  ) => void;
  onClose: () => void;
  className?: string;
}>) {
  const [newDocTitle, setNewDocTitle] = useState("");
  const [newDocContent, setNewDocContent] = useState("");
  const [isAddingDoc, setIsAddingDoc] = useState(false);
  const [addDocError, setAddDocError] = useState<string | null>(null);
  const [isAddingFromFiles, setIsAddingFromFiles] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{
    processed: number;
    total: number;
  } | null>(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [isAddingFolder, setIsAddingFolder] = useState(false);
  const [selectedArchivoIds, setSelectedArchivoIds] = useState<string[]>([]);
  const [isAddingFromArchivos, setIsAddingFromArchivos] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [docToRename, setDocToRename] = useState<{
    id: string;
    title: string;
  } | null>(null);
  const [renameInputValue, setRenameInputValue] = useState("");
  const [docToDelete, setDocToDelete] = useState<{
    id: string;
    title: string;
  } | null>(null);
  const [docToView, setDocToView] = useState<{
    id: string;
    title: string;
  } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isPatchingDoc, setIsPatchingDoc] = useState(false);
  const [bulkDeleteConfirmOpen, setBulkDeleteConfirmOpen] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [isBulkMoving, setIsBulkMoving] = useState(false);
  const [skipVectorize, setSkipVectorize] = useState(false);
  const [isIndexingPending, setIsIndexingPending] = useState(false);
  const [addSectionOpen, setAddSectionOpen] = useState(true);
  const [shakeLimit, setShakeLimit] = useState(false);
  const filesInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const archivosSectionRef = useRef<HTMLElement>(null);

  const [currentFolderId, setCurrentFolderId] = useKnowledgeFolderFromUrl();
  const docsKey =
    currentFolderId === null
      ? "/api/knowledge?folderId=root"
      : `/api/knowledge?folderId=${currentFolderId}`;

  const { mutate } = useSWRConfig();
  const { data: knowledgeDocs = [], isLoading: isLoadingKnowledge } = useSWR<
    KnowledgeDoc[]
  >(docsKey, fetcher);
  const { data: folders = [], mutate: mutateFolders } = useSWR<
    KnowledgeFolderType[]
  >("/api/knowledge/folders", fetcher);

  const filteredKnowledgeDocs =
    searchQuery.trim() === ""
      ? knowledgeDocs
      : knowledgeDocs.filter((doc) =>
          doc.title.toLowerCase().includes(searchQuery.trim().toLowerCase())
        );

  const pendingCount = knowledgeDocs.filter(
    (d) => d.indexingStatus === "pending"
  ).length;

  const idsForChat =
    knowledgeDocumentIds.length > 0
      ? `/api/knowledge?ids=${knowledgeDocumentIds.join(",")}`
      : null;
  const { data: docsInChat = [] } = useSWR<KnowledgeDoc[]>(idsForChat, fetcher);

  const recentKey = `/api/knowledge?recent=${RECENT_DOCS_LIMIT}`;
  const { data: recentDocs = [], mutate: mutateRecent } = useSWR<
    KnowledgeDoc[]
  >(recentKey, fetcher);

  const viewDocKey = docToView ? `/api/knowledge/${docToView.id}` : null;
  const { data: viewedDoc } = useSWR<KnowledgeDoc & { content?: string }>(
    viewDocKey,
    fetcher
  );

  const { data: userFiles = [], mutate: mutateArchivos } = useSWR<
    UserFileType[]
  >("/api/arquivos", fetcher);

  const handleAddDocument = async (e: React.FormEvent) => {
    e.preventDefault();
    const title = newDocTitle.trim();
    const content = newDocContent.trim();
    if (!(title && content)) {
      setAddDocError("Preencha título e conteúdo para criar o documento.");
      return;
    }
    setAddDocError(null);
    setIsAddingDoc(true);
    try {
      const res = await fetch("/api/knowledge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          content,
          folderId: currentFolderId ?? null,
          skipVectorize,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setAddDocError(data?.message ?? "Erro ao criar documento.");
        return;
      }
      const created = (await res.json()) as { id: string; title: string };
      setNewDocTitle("");
      setNewDocContent("");
      setKnowledgeDocumentIds((prev) =>
        prev.length < MAX_KNOWLEDGE_SELECT ? [...prev, created.id] : prev
      );
      await mutate("/api/knowledge");
      await mutate(docsKey);
      await mutateRecent();
    } finally {
      setIsAddingDoc(false);
    }
  };

  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newFolderName.trim();
    if (!name) {
      return;
    }
    setIsAddingFolder(true);
    try {
      const res = await fetch("/api/knowledge/folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, parentId: null }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data?.message ?? "Erro ao criar pasta.");
        return;
      }
      setNewFolderName("");
      await mutateFolders();
      toast.success("Pasta criada.");
    } finally {
      setIsAddingFolder(false);
    }
  };

  /** Filtra ficheiros por extensão e tamanho (útil quando vêm de uma pasta). */
  const filterAcceptedFiles = (files: File[]): File[] =>
    files.filter(
      (f) => f.size <= MAX_FILE_SIZE_BYTES && ACCEPTED_EXTENSIONS.test(f.name)
    );

  const handleKnowledgeFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) {
      return;
    }
    const allFiles = filterAcceptedFiles(Array.from(fileList));
    if (allFiles.length === 0) {
      toast.error(
        "Nenhum ficheiro válido (PDF, DOC, DOCX, XLS, XLSX, CSV, TXT, ODT, JPEG ou PNG, até 100 MB)."
      );
      return;
    }
    setIsAddingFromFiles(true);
    setUploadProgress({ processed: 0, total: allFiles.length });
    setAddDocError(null);
    const totalCreated: Array<{ id: string; title: string }> = [];
    const totalFailed: Array<{ filename: string; error: string }> = [];
    const batches = (() => {
      const b: File[][] = [];
      for (let i = 0; i < allFiles.length; i += MAX_FILES_PER_BATCH) {
        b.push(allFiles.slice(i, i + MAX_FILES_PER_BATCH));
      }
      return b;
    })();
    try {
      let processedSoFar = 0;
      for (const batch of batches) {
        const formData = new FormData();
        for (const f of batch) {
          formData.append("files", f);
        }
        formData.set(
          "folderId",
          currentFolderId === null ? "root" : currentFolderId
        );
        if (skipVectorize) {
          formData.set("skipVectorize", "true");
        }
        const res = await fetch("/api/knowledge/from-files", {
          method: "POST",
          body: formData,
        });
        const data = (await res.json()) as {
          created?: Array<{ id: string; title: string }>;
          failed?: Array<{ filename: string; error: string }>;
        };
        if (!res.ok) {
          const msg =
            data && "error" in data
              ? (data as { error?: string }).error
              : "Erro ao adicionar ficheiros.";
          toast.error(msg);
          return;
        }
        const created = data.created ?? [];
        const failed = data.failed ?? [];
        totalCreated.push(...created);
        totalFailed.push(...failed);
        processedSoFar += batch.length;
        setUploadProgress({
          processed: processedSoFar,
          total: allFiles.length,
        });
      }
      await mutate("/api/knowledge");
      await mutate(docsKey);
      await mutateRecent();
      for (const { id } of totalCreated) {
        setKnowledgeDocumentIds((prev) =>
          prev.length < MAX_KNOWLEDGE_SELECT ? [...prev, id] : prev
        );
      }
      if (totalCreated.length > 0) {
        toast.success(
          `${totalCreated.length} documento(s) adicionado(s). Título a partir do nome do ficheiro; conteúdo extraído automaticamente.`
        );
      }
      if (totalFailed.length > 0) {
        toast.warning(
          `${totalFailed.length} ficheiro(s) falharam: ${totalFailed
            .map((f) => f.filename)
            .slice(0, 5)
            .join(", ")}${totalFailed.length > 5 ? "…" : ""}`
        );
      }
      if (filesInputRef.current) {
        filesInputRef.current.value = "";
      }
      if (folderInputRef.current) {
        folderInputRef.current.value = "";
      }
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Erro ao enviar ficheiros."
      );
    } finally {
      setIsAddingFromFiles(false);
      setUploadProgress(null);
      setIsDraggingOver(false);
    }
  };

  const toggleKnowledgeId = (id: string) => {
    setKnowledgeDocumentIds((prev) => {
      if (prev.includes(id)) {
        return prev.filter((x) => x !== id);
      }
      if (prev.length < MAX_KNOWLEDGE_SELECT) {
        return [...prev, id];
      }
      setShakeLimit(true);
      setTimeout(() => setShakeLimit(false), 400);
      return prev;
    });
  };

  const toggleArchivoId = (id: string) => {
    setSelectedArchivoIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const toggleArchivoForChat = (id: string) => {
    if (!setArchivoIdsForChat) {
      return;
    }
    setArchivoIdsForChat((prev) => {
      if (prev.includes(id)) {
        return prev.filter((x) => x !== id);
      }
      if (prev.length >= MAX_ARCHIVOS_FOR_CHAT) {
        return prev;
      }
      return [...prev, id];
    });
  };

  const handleAddArchivosToKnowledge = async () => {
    if (selectedArchivoIds.length === 0) {
      return;
    }
    setIsAddingFromArchivos(true);
    try {
      const res = await fetch("/api/knowledge/from-archivos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileIds: selectedArchivoIds,
          folderId: currentFolderId ?? "root",
          skipVectorize,
        }),
      });
      const data = (await res.json()) as {
        created?: Array<{ id: string; title: string }>;
        failed?: Array<{ fileId: string; filename: string; error: string }>;
      };
      if (!res.ok) {
        toast.error(
          (data as { message?: string }).message ??
            "Erro ao adicionar à base de conhecimento."
        );
        return;
      }
      const created = data.created ?? [];
      const failed = data.failed ?? [];
      setSelectedArchivoIds([]);
      await mutate("/api/knowledge");
      await mutate(docsKey);
      await mutateRecent();
      await mutateArchivos();
      for (const { id } of created) {
        setKnowledgeDocumentIds((prev) =>
          prev.length < MAX_KNOWLEDGE_SELECT ? [...prev, id] : prev
        );
      }
      if (created.length > 0) {
        toast.success(
          `${created.length} documento(s) adicionado(s) à base e incluído(s) neste chat.`
        );
      }
      if (failed.length > 0) {
        toast.warning(
          `${failed.length} ficheiro(s) falharam: ${failed.map((f) => f.filename).join(", ")}`
        );
      }
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : "Erro ao adicionar à base de conhecimento."
      );
    } finally {
      setIsAddingFromArchivos(false);
    }
  };

  const openRenameDialog = (doc: { id: string; title: string }) => {
    setDocToRename(doc);
    setRenameInputValue(doc.title);
  };

  const handleRenameSubmit = async () => {
    if (!(docToRename && renameInputValue.trim())) {
      return;
    }
    setIsPatchingDoc(true);
    try {
      const res = await fetch(`/api/knowledge/${docToRename.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: renameInputValue.trim() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(
          (data as { message?: string }).message ?? "Erro ao renomear."
        );
        return;
      }
      toast.success("Documento renomeado.");
      setDocToRename(null);
      await mutate("/api/knowledge");
      await mutate(docsKey);
      await mutateRecent();
    } catch {
      toast.error("Erro ao renomear documento.");
    } finally {
      setIsPatchingDoc(false);
    }
  };

  const handleMoveToFolder = async (docId: string, folderId: string | null) => {
    setIsPatchingDoc(true);
    try {
      const res = await fetch(`/api/knowledge/${docId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folderId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error((data as { message?: string }).message ?? "Erro ao mover.");
        return;
      }
      toast.success("Documento movido.");
      await mutate("/api/knowledge");
      await mutate(docsKey);
      await mutateRecent();
    } catch {
      toast.error("Erro ao mover documento.");
    } finally {
      setIsPatchingDoc(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!docToDelete) {
      return;
    }
    setIsDeleting(true);
    try {
      const res = await fetch(
        `/api/knowledge?id=${encodeURIComponent(docToDelete.id)}`,
        {
          method: "DELETE",
        }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(
          (data as { message?: string }).message ?? "Erro ao eliminar."
        );
        setDocToDelete(null);
        return;
      }
      setKnowledgeDocumentIds((prev) =>
        prev.filter((id) => id !== docToDelete.id)
      );
      toast.success("Documento eliminado.");
      setDocToDelete(null);
      await mutate("/api/knowledge");
      await mutate(docsKey);
      await mutateRecent();
    } catch {
      toast.error("Erro ao eliminar documento.");
      setDocToDelete(null);
    } finally {
      setIsDeleting(false);
    }
  };

  /** Selecionar todos os documentos visíveis (máx. para o chat = MAX_KNOWLEDGE_SELECT). */
  const selectAllFiltered = () => {
    const ids = filteredKnowledgeDocs
      .map((d) => d.id)
      .slice(0, MAX_KNOWLEDGE_SELECT);
    setKnowledgeDocumentIds((prev) => {
      const set = new Set(prev);
      for (const id of ids) {
        set.add(id);
      }
      return [...set].slice(0, MAX_KNOWLEDGE_SELECT);
    });
  };

  const clearSelection = () => {
    setKnowledgeDocumentIds([]);
  };

  const handleIndexPending = async () => {
    if (pendingCount === 0) {
      return;
    }
    setIsIndexingPending(true);
    try {
      const res = await fetch("/api/knowledge/index-pending", {
        method: "POST",
      });
      const data = (await res.json()) as {
        processed?: number;
        results?: Array<{ id: string; status: string; indexed?: number }>;
      };
      if (!res.ok) {
        toast.error("Erro ao indexar documentos pendentes.");
        return;
      }
      const processed = data.processed ?? 0;
      await mutate("/api/knowledge");
      await mutate(docsKey);
      await mutateRecent();
      toast.success(
        processed > 0
          ? `${processed} documento(s) indexado(s). Já pode usar RAG nestes documentos.`
          : "Nenhum documento pendente para indexar."
      );
    } catch {
      toast.error("Erro ao indexar documentos pendentes.");
    } finally {
      setIsIndexingPending(false);
    }
  };

  const handleBulkMove = async (folderId: string | null) => {
    if (knowledgeDocumentIds.length === 0) {
      return;
    }
    setIsBulkMoving(true);
    try {
      for (const id of knowledgeDocumentIds) {
        const res = await fetch(`/api/knowledge/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ folderId }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          toast.error(
            (data as { message?: string }).message ?? "Erro ao mover."
          );
          return;
        }
      }
      toast.success(`${knowledgeDocumentIds.length} documento(s) movido(s).`);
      await mutate("/api/knowledge");
      await mutate(docsKey);
      await mutateRecent();
    } catch {
      toast.error("Erro ao mover documentos.");
    } finally {
      setIsBulkMoving(false);
    }
  };

  const handleBulkDeleteConfirm = async () => {
    if (knowledgeDocumentIds.length === 0) {
      return;
    }
    const idsToDelete = [...knowledgeDocumentIds];
    setIsBulkDeleting(true);
    setBulkDeleteConfirmOpen(false);
    try {
      for (const id of idsToDelete) {
        const res = await fetch(`/api/knowledge?id=${encodeURIComponent(id)}`, {
          method: "DELETE",
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          toast.error(
            (data as { message?: string }).message ?? "Erro ao eliminar."
          );
          return;
        }
      }
      setKnowledgeDocumentIds([]);
      toast.success(`${idsToDelete.length} documento(s) eliminado(s).`);
      await mutate("/api/knowledge");
      await mutate(docsKey);
      await mutateRecent();
    } catch {
      toast.error("Erro ao eliminar documentos.");
    } finally {
      setIsBulkDeleting(false);
    }
  };

  const dropzoneBorderClass = isDraggingOver
    ? "border-primary bg-primary/5"
    : "border-muted-foreground/30 bg-muted/30 hover:border-muted-foreground/50 hover:bg-muted/50";
  const dropzoneBase =
    "flex min-h-[88px] w-full cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed px-4 py-3 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";
  const dropzoneClassName = isAddingFromFiles
    ? `${dropzoneBase} pointer-events-none opacity-70`
    : `${dropzoneBase} ${dropzoneBorderClass}`;

  let listContent: ReactNode;
  if (isLoadingKnowledge) {
    listContent = <p className="text-muted-foreground text-sm">A carregar…</p>;
  } else if (knowledgeDocs.length === 0) {
    listContent = (
      <p className="text-muted-foreground text-sm">
        {currentFolderId === null
          ? "Nenhum documento na raiz. Adicione por ficheiros ou crie abaixo."
          : "Nenhum documento nesta pasta. Adicione por ficheiros ou crie abaixo."}
      </p>
    );
  } else if (filteredKnowledgeDocs.length === 0) {
    listContent = (
      <p className="text-muted-foreground text-sm">
        Nenhum documento corresponde à pesquisa. Altere os termos ou limpe a
        busca.
      </p>
    );
  } else {
    listContent = (
      <ul className="grid gap-2">
        {filteredKnowledgeDocs.map((doc) => {
          const dateLabel =
            doc.createdAt != null
              ? formatDistanceToNow(new Date(doc.createdAt), {
                  addSuffix: true,
                  locale: pt,
                })
              : null;
          const isSelected = knowledgeDocumentIds.includes(doc.id);
          return (
            <li
              className={cn(
                "group flex min-w-0 flex-col gap-0.5 rounded-md py-0.5 pr-0.5 transition-colors",
                isSelected && "border-primary border-l-2 bg-primary/5"
              )}
              key={doc.id}
            >
              <div className="flex min-w-0 flex-wrap items-center gap-1 rounded-md px-2 py-1 hover:bg-muted/40">
                <input
                  aria-describedby={`kb-${doc.id}-title`}
                  checked={isSelected}
                  className="shrink-0"
                  id={`kb-${doc.id}`}
                  onChange={() => toggleKnowledgeId(doc.id)}
                  title="Usar no chat, mover ou eliminar"
                  type="checkbox"
                />
                <Label
                  className="min-w-0 flex-1 cursor-pointer truncate font-normal"
                  htmlFor={`kb-${doc.id}`}
                  id={`kb-${doc.id}-title`}
                  title={doc.title}
                >
                  {doc.title}
                </Label>
                {doc.indexingStatus === "pending" && (
                  <span
                    className="shrink-0 rounded bg-amber-500/20 px-1.5 py-0 text-[10px] text-amber-700 dark:text-amber-400"
                    title="Ainda não indexado; use «Indexar pendentes» ou aguarde o job."
                  >
                    Pendente
                  </span>
                )}
                {doc.indexingStatus === "failed" && (
                  <span
                    className="shrink-0 rounded bg-destructive/20 px-1.5 py-0 text-[10px] text-destructive"
                    title="Erro ao vetorizar; pode reindexar depois."
                  >
                    Erro
                  </span>
                )}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      aria-label={`Ações do documento «${doc.title}»`}
                      className="size-7 shrink-0 opacity-0 transition-opacity focus:opacity-100 group-focus-within:opacity-100 group-hover:opacity-100"
                      size="icon"
                      type="button"
                      variant="ghost"
                    >
                      <EllipsisVertical aria-hidden className="size-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="min-w-[180px]">
                    <DropdownMenuItem
                      onSelect={(e) => {
                        e.preventDefault();
                        setDocToView({ id: doc.id, title: doc.title });
                      }}
                    >
                      <EyeIcon aria-hidden className="size-4" />
                      Ver
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={(e) => {
                        e.preventDefault();
                        openRenameDialog(doc);
                      }}
                    >
                      <Pencil aria-hidden className="size-4" />
                      Renomear
                    </DropdownMenuItem>
                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger>
                        <FolderInput aria-hidden className="size-4" />
                        Mover para pasta
                      </DropdownMenuSubTrigger>
                      <DropdownMenuSubContent>
                        <DropdownMenuItem
                          onSelect={() => handleMoveToFolder(doc.id, null)}
                        >
                          Raiz
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        {folders.map((folder) => (
                          <DropdownMenuItem
                            key={folder.id}
                            onSelect={() =>
                              handleMoveToFolder(doc.id, folder.id)
                            }
                          >
                            {folder.name}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onSelect={(e) => {
                        e.preventDefault();
                        setDocToDelete(doc);
                      }}
                    >
                      <Trash2 aria-hidden className="size-4" />
                      Eliminar
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              {dateLabel != null && (
                <span
                  className="pl-6 text-[11px] text-muted-foreground/80"
                  title={
                    doc.createdAt != null
                      ? new Date(doc.createdAt).toLocaleString("pt-PT")
                      : undefined
                  }
                >
                  {dateLabel}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <section
      aria-label="Base de conhecimento"
      className={cn(
        "flex h-full flex-col overflow-hidden bg-background",
        className
      )}
    >
      <style
        dangerouslySetInnerHTML={{
          __html:
            "@keyframes kb-shake{0%,100%{transform:translateX(0)}20%{transform:translateX(-4px)}40%{transform:translateX(4px)}60%{transform:translateX(-3px)}80%{transform:translateX(3px)}}.kb-shake{animation:kb-shake 0.4s ease}",
        }}
      />
      <header className="flex shrink-0 flex-col gap-0.5 border-b px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <BookOpenIcon
              aria-hidden
              className="size-5 shrink-0 text-muted-foreground"
            />
            <h2 className="truncate font-semibold text-base">
              Base de conhecimento
            </h2>
          </div>
          <Button
            aria-label="Fechar base de conhecimento"
            className="size-8 shrink-0 rounded-full p-0"
            onClick={onClose}
            type="button"
            variant="ghost"
          >
            <XIcon aria-hidden className="size-4" />
          </Button>
        </div>
        <p className="text-muted-foreground text-xs">
          Extraia, organize e use os seus documentos no chat.
        </p>
        {pendingCount > 0 && (
          <Button
            aria-label="Indexar documentos pendentes para pesquisa semântica (RAG)"
            className="mt-2 gap-1.5 text-xs"
            disabled={isIndexingPending}
            onClick={handleIndexPending}
            size="sm"
            title="Vetoriza e indexa documentos guardados sem indexar; permite usar RAG nesses documentos."
            type="button"
            variant="secondary"
          >
            {isIndexingPending ? (
              <Loader2 aria-hidden className="size-3.5 animate-spin" />
            ) : (
              <SparklesIcon aria-hidden className="size-3.5" />
            )}
            {isIndexingPending
              ? "A indexar…"
              : `Indexar ${pendingCount} pendente(s)`}
          </Button>
        )}
        <div className="relative mt-2">
          <SearchIcon
            aria-hidden
            className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            aria-label="Procurar na base de conhecimento"
            className="h-8 pl-8 text-sm"
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Procurar por título…"
            value={searchQuery}
          />
        </div>
        <nav
          aria-label="Atalhos da base de conhecimento"
          className="mt-2 border-border/60 border-t pt-2"
        >
          <button
            className="text-muted-foreground text-xs underline underline-offset-2 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            onClick={() =>
              archivosSectionRef.current?.scrollIntoView({
                behavior: "smooth",
                block: "start",
              })
            }
            type="button"
          >
            Arquivos — ficheiros guardados a partir do chat
          </button>
        </nav>
      </header>

      <div className="overscroll-behavior-contain flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-3">
        <nav
          aria-label="Pastas da base de conhecimento"
          className="grid gap-1 border-b pb-3"
        >
          <h3 className="font-medium text-muted-foreground text-xs uppercase tracking-wider">
            Pasta atual
          </h3>
          <div className="flex flex-wrap gap-1.5">
            <Button
              aria-pressed={currentFolderId === null}
              className={cn(
                "h-8 gap-1 rounded-full px-3 font-medium text-xs transition-colors",
                currentFolderId === null
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border hover:bg-muted/50"
              )}
              onClick={() => setCurrentFolderId(null)}
              size="sm"
              type="button"
              variant="outline"
            >
              {currentFolderId === null ? (
                <FolderOpenIcon aria-hidden className="size-3.5" />
              ) : (
                <FolderIcon aria-hidden className="size-3.5" />
              )}
              Raiz
            </Button>
            {folders.map((folder) => {
              const isSelected = currentFolderId === folder.id;
              return (
                <Button
                  aria-pressed={isSelected}
                  className={cn(
                    "h-8 max-w-[180px] gap-1 truncate rounded-full px-3 font-medium text-xs transition-colors",
                    isSelected
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border hover:bg-muted/50"
                  )}
                  key={folder.id}
                  onClick={() => setCurrentFolderId(folder.id)}
                  size="sm"
                  title={folder.name}
                  type="button"
                  variant="outline"
                >
                  {isSelected ? (
                    <FolderOpenIcon aria-hidden className="size-3.5 shrink-0" />
                  ) : (
                    <FolderIcon aria-hidden className="size-3.5 shrink-0" />
                  )}
                  <span className="truncate">{folder.name}</span>
                </Button>
              );
            })}
          </div>
          <form className="flex gap-1 pt-1" onSubmit={handleCreateFolder}>
            <Input
              aria-label="Nome da nova pasta"
              className="h-8 text-xs"
              disabled={isAddingFolder}
              maxLength={256}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="Nova pasta…"
              value={newFolderName}
            />
            <Button
              disabled={isAddingFolder || !newFolderName.trim()}
              size="sm"
              type="submit"
              variant="outline"
            >
              {isAddingFolder ? "…" : "Criar"}
            </Button>
          </form>
        </nav>

        <section
          aria-labelledby="kb-in-chat-heading"
          className="grid gap-1 rounded-lg border border-primary/10 bg-primary/5 pb-3"
        >
          <h3
            className="flex items-center justify-between px-3 pt-3 font-medium text-xs"
            id="kb-in-chat-heading"
          >
            <span className="text-primary">Neste chat</span>
            <span
              aria-live="polite"
              className={cn(
                "font-semibold tabular-nums transition-colors",
                (() => {
                  const n = knowledgeDocumentIds.length;
                  if (n >= MAX_KNOWLEDGE_SELECT) {
                    return "text-destructive";
                  }
                  if (n >= 0.8 * MAX_KNOWLEDGE_SELECT) {
                    return "text-amber-600 dark:text-amber-500";
                  }
                  return "text-muted-foreground";
                })()
              )}
              title={`${knowledgeDocumentIds.length} de ${MAX_KNOWLEDGE_SELECT} selecionados`}
            >
              {knowledgeDocumentIds.length}/{MAX_KNOWLEDGE_SELECT}
            </span>
          </h3>
          <progress
            aria-label={`${knowledgeDocumentIds.length} de ${MAX_KNOWLEDGE_SELECT} documentos selecionados`}
            className={cn(
              "mx-3 h-1 w-[calc(100%-24px)] overflow-hidden rounded-full [&::-webkit-progress-bar]:bg-muted [&::-webkit-progress-value]:rounded-full",
              (() => {
                const n = knowledgeDocumentIds.length;
                if (n >= MAX_KNOWLEDGE_SELECT) {
                  return "[&::-webkit-progress-value]:bg-destructive";
                }
                if (n >= 0.8 * MAX_KNOWLEDGE_SELECT) {
                  return "[&::-webkit-progress-value]:bg-amber-500";
                }
                return "[&::-webkit-progress-value]:bg-primary";
              })()
            )}
            max={MAX_KNOWLEDGE_SELECT}
            value={knowledgeDocumentIds.length}
          />
          {shakeLimit && (
            <p
              aria-live="assertive"
              className="kb-shake mx-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-destructive text-xs"
            >
              Limite de {MAX_KNOWLEDGE_SELECT} documentos atingido.
            </p>
          )}
          {docsInChat.length === 0 ? (
            <p className="px-3 text-muted-foreground text-sm italic">
              Nenhum documento selecionado. Marque documentos abaixo.
            </p>
          ) : (
            <ul className="grid gap-0.5 px-1 pb-2">
              {docsInChat.map((doc) => (
                <li
                  className={cn(
                    "flex min-w-0 cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-primary/10",
                    "border-primary border-l-2 bg-primary/5"
                  )}
                  key={doc.id}
                >
                  <input
                    aria-describedby={`kb-chat-${doc.id}-title`}
                    checked
                    className="shrink-0"
                    id={`kb-chat-${doc.id}`}
                    onChange={() => toggleKnowledgeId(doc.id)}
                    type="checkbox"
                  />
                  <Label
                    className="min-w-0 flex-1 cursor-pointer truncate font-normal"
                    htmlFor={`kb-chat-${doc.id}`}
                    id={`kb-chat-${doc.id}-title`}
                    title={doc.title}
                  >
                    {doc.title}
                  </Label>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section
          aria-labelledby="kb-recent-heading"
          className="grid gap-1 border-b pb-3"
        >
          <h3
            className="font-medium text-muted-foreground text-xs"
            id="kb-recent-heading"
          >
            Recentes
          </h3>
          {recentDocs.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Ainda não há documentos. Adicione por ficheiros ou crie abaixo.
            </p>
          ) : (
            <ul className="grid gap-0.5">
              {recentDocs.map((doc) => {
                const isSelected = knowledgeDocumentIds.includes(doc.id);
                return (
                  <li
                    className={cn(
                      "flex min-w-0 cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-muted/40",
                      isSelected && "border-primary border-l-2 bg-primary/5"
                    )}
                    key={doc.id}
                  >
                    <input
                      aria-describedby={`kb-recent-${doc.id}-title`}
                      checked={isSelected}
                      className="shrink-0"
                      id={`kb-recent-${doc.id}`}
                      onChange={() => toggleKnowledgeId(doc.id)}
                      type="checkbox"
                    />
                    <Label
                      className="min-w-0 flex-1 cursor-pointer truncate font-normal"
                      htmlFor={`kb-recent-${doc.id}`}
                      id={`kb-recent-${doc.id}-title`}
                      title={doc.title}
                    >
                      {doc.title}
                    </Label>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section
          aria-labelledby="kb-archivos-heading"
          className="grid gap-1 border-b pb-3"
          ref={archivosSectionRef}
        >
          <h3
            className="font-medium text-muted-foreground text-xs"
            id="kb-archivos-heading"
          >
            Arquivos
          </h3>
          <p className="text-muted-foreground text-xs">
            Ficheiros guardados a partir do chat. Podem ser usados neste chat ou
            adicionados à base.
          </p>
          {userFiles.length === 0 ? (
            <p className="text-muted-foreground text-sm italic">
              Nenhum ficheiro guardado ainda. Use «Guardar em Arquivos» nos
              anexos do chat.
            </p>
          ) : (
            <>
              {archivoIdsForChat.length > 0 && (
                <p className="text-muted-foreground text-xs">
                  Neste chat (apenas Arquivos): {archivoIdsForChat.length}{" "}
                  ficheiro(s) — conteúdo usado sem guardar na base.
                </p>
              )}
              <ul className="grid gap-1">
                {userFiles.map((file) => {
                  const usedInChat = archivoIdsForChat.includes(file.id);
                  return (
                    <li
                      className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5"
                      key={file.id}
                    >
                      <div className="flex min-w-0 flex-1 items-center gap-2">
                        <input
                          aria-describedby={`archivo-${file.id}-title`}
                          checked={selectedArchivoIds.includes(file.id)}
                          id={`archivo-${file.id}`}
                          onChange={() => toggleArchivoId(file.id)}
                          type="checkbox"
                        />
                        <Label
                          className="min-w-0 cursor-pointer truncate font-normal"
                          htmlFor={`archivo-${file.id}`}
                          id={`archivo-${file.id}-title`}
                          title={file.filename}
                        >
                          {file.filename}
                        </Label>
                      </div>
                      {setArchivoIdsForChat != null && (
                        <button
                          className="text-primary text-xs underline underline-offset-2 outline-none hover:no-underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                          onClick={() => toggleArchivoForChat(file.id)}
                          title={
                            usedInChat
                              ? "Remover do uso neste chat"
                              : "Usar conteúdo apenas neste chat (sem guardar na base)"
                          }
                          type="button"
                        >
                          {usedInChat ? "Remover do chat" : "Usar neste chat"}
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
              <Button
                aria-label="Adicionar ficheiros selecionados à base de conhecimento e usar neste chat"
                className="mt-1 gap-1 text-xs"
                disabled={
                  isAddingFromArchivos || selectedArchivoIds.length === 0
                }
                onClick={handleAddArchivosToKnowledge}
                size="sm"
                title="Converte os ficheiros em documentos na base e inclui-os no contexto deste chat"
                type="button"
                variant="secondary"
              >
                <FolderPlusIcon aria-hidden size={14} />
                {isAddingFromArchivos
                  ? "A adicionar…"
                  : "Adicionar à base e usar neste chat"}
              </Button>
            </>
          )}
        </section>

        <section aria-labelledby="kb-select-heading" className="grid gap-2">
          <h3
            className="flex items-center justify-between font-medium text-muted-foreground text-xs"
            id="kb-select-heading"
          >
            <span>Documentos na pasta</span>
            <span
              aria-live="polite"
              className="tabular-nums"
              title={`${filteredKnowledgeDocs.length} documento(s) nesta pasta`}
            >
              {filteredKnowledgeDocs.length}
            </span>
          </h3>
          {filteredKnowledgeDocs.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              {knowledgeDocumentIds.length === 0 ? (
                <Button
                  className="h-7 text-xs"
                  onClick={selectAllFiltered}
                  size="sm"
                  type="button"
                  variant="ghost"
                >
                  Selecionar todos
                </Button>
              ) : (
                <>
                  <span
                    aria-live="polite"
                    className="text-muted-foreground text-xs tabular-nums"
                  >
                    {knowledgeDocumentIds.length} selecionado(s)
                  </span>
                  <Button
                    className="h-7 text-xs"
                    onClick={clearSelection}
                    size="sm"
                    type="button"
                    variant="ghost"
                  >
                    Desmarcar todos
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        aria-label="Mover selecionados para pasta"
                        className="h-7 gap-1 text-xs"
                        disabled={isBulkMoving}
                        size="sm"
                        type="button"
                        variant="outline"
                      >
                        <FolderInput aria-hidden className="size-3.5" />
                        {isBulkMoving ? "A mover…" : "Mover"}
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start">
                      <DropdownMenuItem onSelect={() => handleBulkMove(null)}>
                        Raiz
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      {folders.map((folder) => (
                        <DropdownMenuItem
                          key={folder.id}
                          onSelect={() => handleBulkMove(folder.id)}
                        >
                          {folder.name}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <Button
                    aria-label="Eliminar documentos selecionados"
                    className="h-7 gap-1 text-destructive text-xs hover:bg-destructive/10 hover:text-destructive"
                    disabled={isBulkDeleting}
                    onClick={() => setBulkDeleteConfirmOpen(true)}
                    size="sm"
                    type="button"
                    variant="ghost"
                  >
                    <Trash2 aria-hidden className="size-3.5" />
                    Eliminar
                  </Button>
                </>
              )}
            </div>
          )}
          <div className="min-h-0 overflow-y-auto rounded-md border border-muted/50 bg-muted/20 p-3">
            {listContent}
          </div>
        </section>

        <Collapsible
          aria-labelledby="kb-add-heading"
          className="grid shrink-0 gap-2 border-t pt-4"
          onOpenChange={setAddSectionOpen}
          open={addSectionOpen}
        >
          <CollapsibleTrigger asChild>
            <button
              aria-expanded={addSectionOpen}
              className="flex w-full items-center justify-between py-2 text-left font-medium text-muted-foreground text-xs uppercase tracking-wider outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              id="kb-add-heading"
              type="button"
            >
              <span>Adicionar documentos</span>
              <ChevronDownIcon
                aria-hidden
                className={cn(
                  "size-4 shrink-0 transition-transform duration-200",
                  addSectionOpen && "rotate-180"
                )}
              />
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent className="grid gap-2">
            <div className="flex items-center gap-2">
              <input
                aria-describedby="kb-skip-vectorize-desc"
                checked={skipVectorize}
                id="kb-skip-vectorize"
                onChange={(e) => setSkipVectorize(e.target.checked)}
                type="checkbox"
              />
              <Label
                className="cursor-pointer font-normal text-muted-foreground text-xs"
                htmlFor="kb-skip-vectorize"
                id="kb-skip-vectorize-desc"
              >
                Guardar sem indexar (vetorizar depois)
              </Label>
            </div>
            <input
              accept={KNOWLEDGE_FILES_ACCEPT}
              aria-label="Selecionar ficheiros para a base de conhecimento"
              className="sr-only"
              multiple
              onChange={(e) => handleKnowledgeFiles(e.target.files)}
              ref={filesInputRef}
              type="file"
            />
            <input
              accept={KNOWLEDGE_FILES_ACCEPT}
              aria-label="Selecionar pasta para importar todos os ficheiros"
              className="sr-only"
              multiple
              onChange={(e) => handleKnowledgeFiles(e.target.files)}
              ref={folderInputRef}
              type="file"
              {...({
                webkitdirectory: "",
              } as React.InputHTMLAttributes<HTMLInputElement>)}
            />
            {/* biome-ignore lint/a11y/useSemanticElements: dropzone is a custom drag-and-drop widget; group groups the drop area for assistive tech */}
            <div
              aria-label="Adicionar documentos por ficheiros ou pasta"
              className={dropzoneClassName}
              onDragLeave={() => setIsDraggingOver(false)}
              onDragOver={(e) => {
                e.preventDefault();
                setIsDraggingOver(true);
              }}
              onDrop={(e) => {
                e.preventDefault();
                setIsDraggingOver(false);
                handleKnowledgeFiles(e.dataTransfer.files);
              }}
              role="group"
            >
              {isAddingFromFiles ? (
                <div
                  aria-live="polite"
                  className="flex w-full max-w-[240px] flex-col items-center gap-2"
                >
                  <span className="flex items-center gap-2 text-muted-foreground text-sm">
                    <Loader2
                      aria-hidden
                      className="size-4 shrink-0 animate-spin"
                    />
                    A adicionar ficheiros…
                  </span>
                  {uploadProgress && (
                    <>
                      <output
                        aria-label={`${uploadProgress.processed} de ${uploadProgress.total} ficheiros processados`}
                        className="text-muted-foreground/90 text-xs tabular-nums"
                      >
                        {uploadProgress.processed}/{uploadProgress.total}{" "}
                        ficheiros
                      </output>
                      <progress
                        aria-label={`${uploadProgress.processed} de ${uploadProgress.total} ficheiros`}
                        className="h-1.5 w-full overflow-hidden rounded-full [&::-webkit-progress-bar]:bg-muted [&::-webkit-progress-value]:rounded-full [&::-webkit-progress-value]:bg-primary"
                        max={uploadProgress.total}
                        value={uploadProgress.processed}
                      />
                    </>
                  )}
                </div>
              ) : (
                <>
                  <button
                    aria-label="Selecionar ficheiros para adicionar à base de conhecimento"
                    className="flex flex-col items-center gap-1 bg-transparent p-0 text-inherit outline-none focus-visible:ring-0 disabled:pointer-events-none disabled:opacity-70"
                    disabled={isAddingFromFiles}
                    onClick={() => filesInputRef.current?.click()}
                    type="button"
                  >
                    <UploadIcon
                      aria-hidden
                      className="size-5 text-muted-foreground"
                    />
                    <span className="text-muted-foreground text-sm">
                      Arraste ficheiros ou clique para selecionar
                    </span>
                    <span className="text-muted-foreground/80 text-xs">
                      PDF, DOC, DOCX, XLS, XLSX, CSV, TXT, ODT, JPEG ou PNG (até{" "}
                      {MAX_FILES_PER_BATCH} por envio, enviados em lotes)
                    </span>
                  </button>
                  <button
                    aria-label="Importar pasta (selecionar pasta para adicionar todos os ficheiros)"
                    className="mt-0.5 inline-flex items-center gap-1 text-primary text-xs underline underline-offset-2 outline-none hover:no-underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
                    disabled={isAddingFromFiles}
                    onClick={(e) => {
                      e.stopPropagation();
                      folderInputRef.current?.click();
                    }}
                    type="button"
                  >
                    <FolderIcon aria-hidden className="size-3.5" />
                    Ou importar pasta
                  </button>
                </>
              )}
            </div>

            <form className="grid gap-2" onSubmit={handleAddDocument}>
              <Label htmlFor="kb-new-title">Ou criar manualmente</Label>
              <Input
                autoComplete="off"
                id="kb-new-title"
                maxLength={512}
                name="kb-new-title"
                onChange={(e) => setNewDocTitle(e.target.value)}
                placeholder="Título…"
                value={newDocTitle}
              />
              <Label htmlFor="kb-new-content">Conteúdo</Label>
              <Textarea
                autoComplete="off"
                className="min-h-[80px]"
                id="kb-new-content"
                name="kb-new-content"
                onChange={(e) => setNewDocContent(e.target.value)}
                placeholder="Texto que o assistente usará como contexto…"
                value={newDocContent}
              />
              {addDocError && (
                <p aria-live="polite" className="text-destructive text-sm">
                  {addDocError}
                </p>
              )}
              <Button
                disabled={
                  isAddingDoc || !newDocTitle.trim() || !newDocContent.trim()
                }
                type="submit"
                variant="secondary"
              >
                {isAddingDoc ? "Adicionando…" : "Adicionar documento"}
              </Button>
            </form>
          </CollapsibleContent>
        </Collapsible>
      </div>

      <Dialog
        onOpenChange={(open) => {
          if (!open) {
            setDocToView(null);
          }
        }}
        open={docToView !== null}
      >
        <DialogContent
          aria-describedby="view-doc-content"
          className="flex max-h-[85vh] max-w-2xl flex-col gap-2"
        >
          <DialogTitle id="view-doc-title">
            {docToView ? `Ver — ${docToView.title}` : "Documento"}
          </DialogTitle>
          <div
            className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap rounded border border-border bg-muted/30 p-3 font-mono text-xs"
            id="view-doc-content"
          >
            {(() => {
              if (viewedDoc == null && docToView != null) {
                return (
                  <span className="text-muted-foreground">A carregar…</span>
                );
              }
              if (viewedDoc && typeof viewedDoc.content === "string") {
                return viewedDoc.content;
              }
              if (viewedDoc) {
                return (
                  <span className="text-muted-foreground">
                    Documento sem conteúdo.
                  </span>
                );
              }
              return null;
            })()}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        onOpenChange={(open) => {
          if (!open) {
            setDocToRename(null);
          }
        }}
        open={docToRename !== null}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Renomear documento</DialogTitle>
          </DialogHeader>
          <div className="grid gap-2 py-2">
            <Label htmlFor="kb-rename-title">Título</Label>
            <Input
              id="kb-rename-title"
              maxLength={512}
              onChange={(e) => setRenameInputValue(e.target.value)}
              value={renameInputValue}
            />
          </div>
          <DialogFooter>
            <Button
              onClick={() => setDocToRename(null)}
              type="button"
              variant="outline"
            >
              Cancelar
            </Button>
            <Button
              disabled={!renameInputValue.trim() || isPatchingDoc}
              onClick={handleRenameSubmit}
              type="button"
            >
              {isPatchingDoc ? "A guardar…" : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        onOpenChange={(open) => {
          if (!open) {
            setDocToDelete(null);
          }
        }}
        open={docToDelete !== null}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar documento?</AlertDialogTitle>
            <AlertDialogDescription>
              {docToDelete ? (
                <>
                  «{docToDelete.title}» será eliminado da base de conhecimento.
                  Esta ação não pode ser desfeita.
                </>
              ) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel type="button">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={isDeleting}
              onClick={(e) => {
                e.preventDefault();
                handleDeleteConfirm();
              }}
              type="button"
            >
              {isDeleting ? "A eliminar…" : "Eliminar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        onOpenChange={(open) => {
          if (!(open || isBulkDeleting)) {
            setBulkDeleteConfirmOpen(false);
          }
        }}
        open={bulkDeleteConfirmOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Eliminar documentos selecionados?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {knowledgeDocumentIds.length} documento(s) serão eliminados da
              base de conhecimento. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => setBulkDeleteConfirmOpen(false)}
              type="button"
            >
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={isBulkDeleting}
              onClick={(e) => {
                e.preventDefault();
                handleBulkDeleteConfirm();
              }}
              type="button"
            >
              {isBulkDeleting ? "A eliminar…" : "Eliminar todos"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

/** Barra lateral direita (desktop) ou Sheet (mobile) para a Base de conhecimento. Estado no URL ?knowledge=open. */
export function KnowledgeSidebar({
  knowledgeDocumentIds,
  setKnowledgeDocumentIds,
  archivoIdsForChat = [],
  setArchivoIdsForChat,
  onClose,
}: Readonly<{
  knowledgeDocumentIds: string[];
  setKnowledgeDocumentIds: (
    value: string[] | ((prev: string[]) => string[])
  ) => void;
  archivoIdsForChat?: string[];
  setArchivoIdsForChat?: (
    value: string[] | ((prev: string[]) => string[])
  ) => void;
  onClose: () => void;
}>) {
  const isMobile = useIsMobile();

  const content = (
    <KnowledgeSidebarContent
      archivoIdsForChat={archivoIdsForChat}
      knowledgeDocumentIds={knowledgeDocumentIds}
      onClose={onClose}
      setArchivoIdsForChat={setArchivoIdsForChat}
      setKnowledgeDocumentIds={setKnowledgeDocumentIds}
    />
  );

  if (isMobile) {
    return (
      <Sheet onOpenChange={(open) => !open && onClose()} open>
        <SheetContent
          aria-describedby={undefined}
          className="flex h-full flex-col gap-0 p-0 sm:max-w-[320px]"
          side="right"
        >
          {content}
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <aside
      aria-label="Base de conhecimento"
      className="flex h-full w-[320px] shrink-0 flex-col border-border border-l bg-background"
    >
      {content}
    </aside>
  );
}
