import { memo } from "react";
import { toast } from "sonner";
import { useArtifact } from "@/hooks/use-artifact";
import type { ArtifactKind } from "./artifact";
import { FileIcon, LoaderIcon, MessageIcon, PencilEditIcon } from "./icons";

type DocumentToolType = "create" | "update" | "request-suggestions";
type Tense = "present" | "past";

const getActionText = (type: DocumentToolType, tense: Tense) => {
  switch (type) {
    case "create":
      return tense === "present" ? "Criando" : "Criado";
    case "update":
      return tense === "present" ? "Atualizando" : "Atualizado";
    case "request-suggestions":
      return tense === "present"
        ? "Adicionando sugestões"
        : "Adicionadas sugestões em";
    default:
      return null;
  }
};

interface DocumentToolResultProps {
  type: DocumentToolType;
  result: { id: string; title: string; kind: ArtifactKind };
  isReadonly: boolean;
}

function PureDocumentToolResult({
  type,
  result,
  isReadonly,
}: Readonly<DocumentToolResultProps>) {
  const { setArtifact } = useArtifact();

  return (
    <button
      className="flex max-w-full cursor-pointer flex-row items-start gap-3 rounded-xl border bg-background px-3 py-2"
      onClick={(event) => {
        if (isReadonly) {
          toast.error(
            "Visualizar arquivos em chats compartilhados não é suportado no momento."
          );
          return;
        }

        const rect = event.currentTarget.getBoundingClientRect();

        const boundingBox = {
          top: rect.top,
          left: rect.left,
          width: rect.width,
          height: rect.height,
        };

        setArtifact((currentArtifact) => ({
          documentId: result.id,
          kind: result.kind,
          content: currentArtifact.content,
          title: result.title,
          isVisible: true,
          status: "idle",
          boundingBox,
        }));
      }}
      type="button"
    >
      <div className="mt-1 text-muted-foreground">
        {getDocumentToolIcon(type)}
      </div>
      <div className="min-w-0 flex-1 truncate text-left" title={result.title}>
        <span className="font-medium text-muted-foreground">
          {getActionText(type, "past")}
        </span>
        <span className="ml-1 truncate"> {result.title}</span>
      </div>
    </button>
  );
}

export const DocumentToolResult = memo(PureDocumentToolResult, () => true);

function getDocumentToolIcon(type: DocumentToolType) {
  if (type === "create") {
    return <FileIcon />;
  }
  if (type === "update") {
    return <PencilEditIcon />;
  }
  if (type === "request-suggestions") {
    return <MessageIcon />;
  }
  return null;
}

function getDocumentToolCallLabel(
  type: DocumentToolType,
  args:
    | { title: string; kind: ArtifactKind }
    | { id: string; description: string }
    | { documentId: string }
): string {
  if (type === "create" && "title" in args && args.title) {
    return `"${args.title}"`;
  }
  if (type === "update" && "description" in args) {
    return `"${args.description}"`;
  }
  if (type === "request-suggestions") {
    return "para o documento";
  }
  return "";
}

interface DocumentToolCallProps {
  type: DocumentToolType;
  args:
    | { title: string; kind: ArtifactKind } // for create
    | { id: string; description: string } // for update
    | { documentId: string }; // for request-suggestions
  isReadonly: boolean;
}

function PureDocumentToolCall({
  type,
  args,
  isReadonly,
}: Readonly<DocumentToolCallProps>) {
  const { setArtifact } = useArtifact();

  return (
    <button
      className="flex w-fit cursor-pointer flex-row items-start justify-between gap-3 rounded-xl border px-3 py-2"
      onClick={(event) => {
        if (isReadonly) {
          toast.error(
            "Visualizar arquivos em chats compartilhados não é suportado no momento."
          );
          return;
        }

        const rect = event.currentTarget.getBoundingClientRect();

        const boundingBox = {
          top: rect.top,
          left: rect.left,
          width: rect.width,
          height: rect.height,
        };

        setArtifact((currentArtifact) => ({
          ...currentArtifact,
          isVisible: true,
          boundingBox,
        }));
      }}
      type="button"
    >
      <div className="flex flex-row items-start gap-3">
        <div className="mt-1 text-zinc-500">{getDocumentToolIcon(type)}</div>

        <div className="text-left">
          {`${getActionText(type, "present")} ${getDocumentToolCallLabel(type, args)}`}
        </div>
      </div>

      <div className="mt-1 animate-spin">{<LoaderIcon />}</div>
    </button>
  );
}

export const DocumentToolCall = memo(PureDocumentToolCall, () => true);
