import { Download, FileText } from "lucide-react";
import { toast } from "sonner";
import { Artifact } from "@/components/create-artifact";
import { DiffView } from "@/components/diffview";
import { DocumentPageLayout } from "@/components/document-page-layout";
import { DocumentSkeleton } from "@/components/document-skeleton";
import {
  ClockRewind,
  CopyIcon,
  MessageIcon,
  PenIcon,
  RedoIcon,
  UndoIcon,
} from "@/components/icons";
import { Editor } from "@/components/text-editor";
import type { Suggestion } from "@/lib/db/schema";
import { getSuggestions } from "../actions";

interface TextArtifactMetadata {
  suggestions: Suggestion[];
}

export const textArtifact = new Artifact<"text", TextArtifactMetadata>({
  kind: "text",
  description: "Useful for text content, like drafting essays and emails.",
  initialize: ({ documentId, setMetadata }) => {
    const load = async () => {
      const suggestions = await getSuggestions({ documentId });
      setMetadata({ suggestions });
    };
    load();
  },
  onStreamPart: ({ streamPart, setMetadata, setArtifact }) => {
    if (streamPart.type === "data-suggestion") {
      setMetadata((metadata): TextArtifactMetadata => {
        const suggestion = streamPart.data as Suggestion;
        return {
          suggestions: [...metadata.suggestions, suggestion],
        };
      });
    }

    if (streamPart.type === "data-textDelta") {
      const textDelta =
        typeof streamPart.data === "string" ? streamPart.data : "";
      setArtifact((draftArtifact) => {
        return {
          ...draftArtifact,
          content: draftArtifact.content + textDelta,
          isVisible:
            draftArtifact.status === "streaming" &&
            draftArtifact.content.length > 400 &&
            draftArtifact.content.length < 450
              ? true
              : draftArtifact.isVisible,
          status: "streaming",
        };
      });
    }
  },
  content: ({
    mode,
    status,
    content,
    isCurrentVersion,
    currentVersionIndex,
    onSaveContent,
    getDocumentContentById,
    isLoading,
    metadata,
  }) => {
    if (isLoading) {
      return (
        <DocumentPageLayout aria-label="Conteúdo do documento" as="article">
          <DocumentSkeleton artifactKind="text" />
        </DocumentPageLayout>
      );
    }

    if (mode === "diff") {
      const oldContent = getDocumentContentById(currentVersionIndex - 1);
      const newContent = getDocumentContentById(currentVersionIndex);

      return (
        <DocumentPageLayout
          aria-label="Comparação de versões do documento"
          as="article"
        >
          <DiffView newContent={newContent} oldContent={oldContent} />
        </DocumentPageLayout>
      );
    }

    const hasContent = typeof content === "string" && content.trim().length > 0;

    if (!hasContent) {
      return (
        <DocumentPageLayout aria-label="Conteúdo do documento" as="article">
          <div
            aria-live="polite"
            className="flex min-h-80 flex-col items-center justify-center gap-4 rounded-lg border border-border border-dashed bg-muted/30 px-6 py-16 text-center"
          >
            <div className="rounded-full bg-muted p-4">
              <FileText aria-hidden className="size-8 text-muted-foreground" />
            </div>
            <div className="space-y-1">
              <p className="font-medium text-foreground text-sm">
                Nenhum conteúdo ainda
              </p>
              <p className="max-w-sm text-muted-foreground text-xs">
                O conteúdo do documento será exibido aqui. Peça ao assistente
                para gerar ou atualizar o documento (ex.: gerar os 3 DOCX na
                FASE B).
              </p>
            </div>
          </div>
        </DocumentPageLayout>
      );
    }

    return (
      <DocumentPageLayout aria-label="Conteúdo do documento" as="article">
        <div className="flex flex-row">
          <Editor
            content={content}
            currentVersionIndex={currentVersionIndex}
            isCurrentVersion={isCurrentVersion}
            onSaveContent={onSaveContent}
            status={status}
            suggestions={metadata ? metadata.suggestions : []}
          />
          {metadata?.suggestions && metadata.suggestions.length > 0 ? (
            <div className="h-dvh w-12 shrink-0 md:hidden" />
          ) : null}
        </div>
      </DocumentPageLayout>
    );
  },
  actions: [
    {
      icon: <ClockRewind size={18} />,
      description: "View changes",
      onClick: ({ handleVersionChange }) => {
        handleVersionChange("toggle");
      },
      isDisabled: ({ currentVersionIndex }) => {
        if (currentVersionIndex === 0) {
          return true;
        }

        return false;
      },
    },
    {
      icon: <UndoIcon size={18} />,
      description: "View Previous version",
      onClick: ({ handleVersionChange }) => {
        handleVersionChange("prev");
      },
      isDisabled: ({ currentVersionIndex }) => {
        if (currentVersionIndex === 0) {
          return true;
        }

        return false;
      },
    },
    {
      icon: <RedoIcon size={18} />,
      description: "View Next version",
      onClick: ({ handleVersionChange }) => {
        handleVersionChange("next");
      },
      isDisabled: ({ isCurrentVersion }) => {
        if (isCurrentVersion) {
          return true;
        }

        return false;
      },
    },
    {
      icon: <CopyIcon size={18} />,
      description: "Copy to clipboard",
      onClick: ({ content }) => {
        navigator.clipboard.writeText(content);
        toast.success("Copied to clipboard!");
      },
    },
    {
      icon: <Download size={18} />,
      label: "DOCX",
      description: "Descarregar como DOCX",
      onClick: ({ documentId }) => {
        (async () => {
          try {
            const res = await fetch(
              `/api/document/export?id=${encodeURIComponent(documentId)}`,
              { credentials: "include" }
            );
            if (!res.ok) {
              const data = await res.json().catch(() => ({}));
              const msg =
                (data as { message?: string }).message ??
                "Falha ao exportar DOCX.";
              toast.error(msg);
              return;
            }
            const blob = await res.blob();
            const disposition = res.headers.get("Content-Disposition");
            const filenameMatch = disposition?.match(/filename="?([^";\n]+)"?/);
            const filename = filenameMatch?.[1] ?? "documento.docx";
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = filename;
            a.click();
            URL.revokeObjectURL(url);
            toast.success("DOCX descarregado.");
          } catch {
            toast.error("Falha ao descarregar DOCX.");
          }
        })();
      },
    },
  ],
  toolbar: [
    {
      icon: <PenIcon />,
      description: "Add final polish",
      onClick: ({ sendMessage }) => {
        sendMessage({
          role: "user",
          parts: [
            {
              type: "text",
              text: "Please add final polish and check for grammar, add section titles for better structure, and ensure everything reads smoothly.",
            },
          ],
        });
      },
    },
    {
      icon: <MessageIcon />,
      description: "Request suggestions",
      onClick: ({ sendMessage }) => {
        sendMessage({
          role: "user",
          parts: [
            {
              type: "text",
              text: "Please add suggestions you have that could improve the writing.",
            },
          ],
        });
      },
    },
  ],
});
