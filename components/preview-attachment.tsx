import Image from "next/image";
import type { Attachment, DocumentTypeLabel } from "@/lib/types";
import { Loader } from "./elements/loader";
import { CrossSmallIcon } from "./icons";
import { Button } from "./ui/button";

const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export const PreviewAttachment = ({
  attachment,
  isUploading = false,
  onDocumentTypeChange,
  onRemove,
}: {
  attachment: Attachment;
  isUploading?: boolean;
  /** Quando definido, mostra seletor PI/Contestação para documentos com texto extraído */
  onDocumentTypeChange?: (documentType: DocumentTypeLabel) => void;
  onRemove?: () => void;
}) => {
  const { name, url, contentType, documentType, extractedText } = attachment;
  const isPdf = contentType === "application/pdf";
  const isDocx = contentType === DOCX_MIME;
  const isDocumentWithText = extractedText != null || isPdf || isDocx;
  const showDocumentTypeSelector =
    isDocumentWithText && onDocumentTypeChange != null;

  let documentLabel: string;
  if (isPdf) {
    documentLabel = "PDF";
  } else if (isDocx) {
    documentLabel = "DOCX";
  } else {
    documentLabel = "Arquivo";
  }

  return (
    <div
      className="group relative flex flex-col gap-1 overflow-hidden rounded-lg border bg-muted"
      data-testid="input-attachment-preview"
    >
      <div className="relative size-16 shrink-0 overflow-hidden rounded-t-lg">
        {contentType?.startsWith("image") ? (
          <Image
            alt={name ?? "Imagem anexada"}
            className="size-full object-cover"
            height={64}
            src={url}
            width={64}
          />
        ) : (
          <div
            className="flex size-full flex-col items-center justify-center gap-0.5 text-muted-foreground text-xs"
            title={name}
          >
            <span className="font-medium">{documentLabel}</span>
            <span className="truncate px-1 max-w-full" title={name}>
              {name}
            </span>
          </div>
        )}

        {isUploading && (
          <div
            className="absolute inset-0 flex items-center justify-center bg-black/50"
            data-testid="input-attachment-loader"
          >
            <Loader size={16} />
          </div>
        )}

        {onRemove && !isUploading && (
          <Button
            className="absolute top-0.5 right-0.5 size-4 rounded-full p-0 opacity-0 transition-opacity group-hover:opacity-100"
            onClick={onRemove}
            size="sm"
            variant="destructive"
          >
            <CrossSmallIcon size={8} />
          </Button>
        )}

        <div className="absolute inset-x-0 bottom-0 truncate bg-linear-to-t from-black/80 to-transparent px-1 py-0.5 text-[10px] text-white">
          {name}
        </div>
      </div>

      {showDocumentTypeSelector && (
        <div className="px-1 pb-1">
          <label className="sr-only" htmlFor={`attachment-doctype-${url}`}>
            Tipo de documento
          </label>
          <select
            className="w-full rounded border border-border bg-background px-1 py-0.5 text-muted-foreground text-[10px] outline-none focus:ring-1 focus:ring-primary"
            id={`attachment-doctype-${url}`}
            onChange={(e) => {
              const value = e.target.value;
              if (value === "pi" || value === "contestacao") {
                onDocumentTypeChange(value);
              }
            }}
            value={documentType ?? ""}
          >
            <option value="">Selecionar tipo</option>
            <option value="pi">Petição Inicial</option>
            <option value="contestacao">Contestação</option>
          </select>
        </div>
      )}
    </div>
  );
};
