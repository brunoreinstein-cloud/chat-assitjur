"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { memo, useState } from "react";
import { useWindowSize } from "usehooks-ts";
import { BookOpenIcon, SparklesIcon } from "lucide-react";
import useSWR, { useSWRConfig } from "swr";
import { SidebarToggle } from "@/components/sidebar-toggle";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PlusIcon, VercelIcon } from "./icons";
import { useSidebar } from "./ui/sidebar";
import { VisibilitySelector, type VisibilityType } from "./visibility-selector";
import { fetcher } from "@/lib/utils";

const AGENT_INSTRUCTIONS_MAX_LENGTH = 4000;

type KnowledgeDoc = { id: string; title: string };

function PureChatHeader({
  chatId,
  selectedVisibilityType,
  isReadonly,
  agentInstructions,
  setAgentInstructions,
  knowledgeDocumentIds,
  setKnowledgeDocumentIds,
}: {
  chatId: string;
  selectedVisibilityType: VisibilityType;
  isReadonly: boolean;
  agentInstructions: string;
  setAgentInstructions: (value: string) => void;
  knowledgeDocumentIds: string[];
  setKnowledgeDocumentIds: (value: string[] | ((prev: string[]) => string[])) => void;
}) {
  const router = useRouter();
  const { open } = useSidebar();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [knowledgeDialogOpen, setKnowledgeDialogOpen] = useState(false);
  const [localInstructions, setLocalInstructions] = useState(agentInstructions);
  const [localKnowledgeIds, setLocalKnowledgeIds] =
    useState<string[]>(knowledgeDocumentIds);
  const [newDocTitle, setNewDocTitle] = useState("");
  const [newDocContent, setNewDocContent] = useState("");
  const [isAddingDoc, setIsAddingDoc] = useState(false);
  const [addDocError, setAddDocError] = useState<string | null>(null);

  const { mutate } = useSWRConfig();
  const { data: knowledgeDocs = [] } = useSWR<KnowledgeDoc[]>(
    knowledgeDialogOpen ? "/api/knowledge" : null,
    fetcher
  );

  const handleAddDocument = async (e: React.FormEvent) => {
    e.preventDefault();
    const title = newDocTitle.trim();
    const content = newDocContent.trim();
    if (!title || !content) {
      setAddDocError("Título e conteúdo são obrigatórios.");
      return;
    }
    setAddDocError(null);
    setIsAddingDoc(true);
    try {
      const res = await fetch("/api/knowledge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, content }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setAddDocError(data?.message ?? "Erro ao criar documento.");
        return;
      }
      const created = (await res.json()) as { id: string; title: string };
      setNewDocTitle("");
      setNewDocContent("");
      setLocalKnowledgeIds((prev) =>
        prev.length < 20 ? [...prev, created.id] : prev
      );
      await mutate("/api/knowledge");
    } finally {
      setIsAddingDoc(false);
    }
  };

  const { width: windowWidth } = useWindowSize();

  const handleOpenChange = (open: boolean) => {
    setDialogOpen(open);
    if (open) {
      setLocalInstructions(agentInstructions);
    } else {
      setAgentInstructions(localInstructions);
    }
  };

  const handleKnowledgeOpenChange = (open: boolean) => {
    setKnowledgeDialogOpen(open);
    if (open) {
      setLocalKnowledgeIds(knowledgeDocumentIds);
    } else {
      setKnowledgeDocumentIds(localKnowledgeIds);
    }
  };

  const toggleKnowledgeId = (id: string) => {
    setLocalKnowledgeIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  return (
    <header className="sticky top-0 flex items-center gap-2 bg-background px-2 py-1.5 md:px-2">
      <SidebarToggle />

      {(!open || windowWidth < 768) && (
        <Button
          className="order-2 ml-auto h-8 px-2 md:order-1 md:ml-0 md:h-fit md:px-2"
          onClick={() => {
            router.push("/");
            router.refresh();
          }}
          type="button"
          variant="outline"
        >
          <PlusIcon />
          <span className="md:sr-only">New Chat</span>
        </Button>
      )}

      {!isReadonly && (
        <VisibilitySelector
          chatId={chatId}
          className="order-1 md:order-2"
          selectedVisibilityType={selectedVisibilityType}
        />
      )}

      {!isReadonly && (
        <Dialog onOpenChange={handleOpenChange} open={dialogOpen}>
          <DialogTrigger asChild>
            <Button
              aria-label="Configurar instruções do agente"
              className="order-2 h-8 px-2 md:h-fit md:px-2"
              title="Instruções do agente"
              type="button"
              variant="outline"
            >
              <SparklesIcon size={16} />
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Instruções do agente</DialogTitle>
              <DialogDescription>
                Oriente como o assistente deve responder neste chat: tom, estilo,
                formato ou regras específicas. Deixe em branco para usar o
                padrão.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-2">
              <Label htmlFor="agent-instructions">
                Prompt de orientação (opcional)
              </Label>
              <Textarea
                id="agent-instructions"
                maxLength={AGENT_INSTRUCTIONS_MAX_LENGTH}
                onChange={(e) => setLocalInstructions(e.target.value)}
                placeholder="Ex: Responda sempre em tom formal e técnico. Use listas quando enumerar opções."
                rows={4}
                value={localInstructions}
              />
              <span className="text-muted-foreground text-xs">
                {localInstructions.length}/{AGENT_INSTRUCTIONS_MAX_LENGTH}{" "}
                caracteres
              </span>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {!isReadonly && (
        <Dialog
          onOpenChange={handleKnowledgeOpenChange}
          open={knowledgeDialogOpen}
        >
          <DialogTrigger asChild>
            <Button
              aria-label="Selecionar base de conhecimento"
              className="order-2 h-8 px-2 md:h-fit md:px-2"
              title="Base de conhecimento"
              type="button"
              variant="outline"
            >
              <BookOpenIcon size={16} />
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Base de conhecimento</DialogTitle>
              <DialogDescription>
                Selecione os documentos que o assistente deve usar como
                contexto nas respostas (máx. 20). Crie novos documentos abaixo.
              </DialogDescription>
            </DialogHeader>

            <form
              className="grid gap-2 border-b pb-3"
              onSubmit={handleAddDocument}
            >
              <Label htmlFor="kb-new-title">Novo documento</Label>
              <Input
                id="kb-new-title"
                maxLength={512}
                onChange={(e) => setNewDocTitle(e.target.value)}
                placeholder="Título"
                value={newDocTitle}
              />
              <Textarea
                className="min-h-[80px]"
                onChange={(e) => setNewDocContent(e.target.value)}
                placeholder="Conteúdo (texto que o assistente usará como contexto)"
                value={newDocContent}
              />
              {addDocError && (
                <p className="text-destructive text-sm">{addDocError}</p>
              )}
              <Button
                disabled={isAddingDoc || !newDocTitle.trim() || !newDocContent.trim()}
                type="submit"
                variant="secondary"
              >
                {isAddingDoc ? "Adicionando…" : "Adicionar documento"}
              </Button>
            </form>

            <div className="grid gap-2 max-h-48 overflow-y-auto">
              {knowledgeDocs.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  Nenhum documento ainda. Crie um acima.
                </p>
              ) : (
                <ul className="grid gap-2">
                  {knowledgeDocs.map((doc) => (
                    <li key={doc.id} className="flex items-center gap-2">
                      <input
                        checked={localKnowledgeIds.includes(doc.id)}
                        id={`kb-${doc.id}`}
                        onChange={() => toggleKnowledgeId(doc.id)}
                        type="checkbox"
                      />
                      <Label
                        className="cursor-pointer font-normal"
                        htmlFor={`kb-${doc.id}`}
                      >
                        {doc.title}
                      </Label>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}

      <Button
        asChild
        className="order-3 hidden bg-zinc-900 px-2 text-zinc-50 hover:bg-zinc-800 md:ml-auto md:flex md:h-fit dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
      >
        <Link
          href="https://vercel.com/templates/next.js/chatbot"
          rel="noopener noreferrer"
          target="_blank"
        >
          <VercelIcon size={16} />
          Deploy with Vercel
        </Link>
      </Button>
    </header>
  );
}

export const ChatHeader = memo(PureChatHeader, (prevProps, nextProps) => {
  return (
    prevProps.chatId === nextProps.chatId &&
    prevProps.selectedVisibilityType === nextProps.selectedVisibilityType &&
    prevProps.isReadonly === nextProps.isReadonly &&
    prevProps.agentInstructions === nextProps.agentInstructions &&
    prevProps.knowledgeDocumentIds.length === nextProps.knowledgeDocumentIds.length &&
    prevProps.knowledgeDocumentIds.every(
      (id, i) => id === nextProps.knowledgeDocumentIds[i]
    )
  );
});
