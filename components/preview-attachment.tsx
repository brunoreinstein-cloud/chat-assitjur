"use client";

import Image from "next/image";
import { useCallback, useState } from "react";
import type { Attachment, DocumentTypeLabel } from "@/lib/types";
import { Loader } from "./elements/loader";
import { CrossSmallIcon } from "./icons";
import { Button } from "./ui/button";

function PasteTextFallback({
  onConfirm,
}: {
  readonly onConfirm: (text: string) => void;
}) {
  const [value, setValue] = useState("");
  const [expanded, setExpanded] = useState(false);
  const handleConfirm = useCallback(() => {
    const trimmed = value.trim();
    if (trimmed.length > 0) {
      onConfirm(trimmed);
    }
  }, [value, onConfirm]);

  if (!expanded) {
    return (
      <div className="flex flex-col gap-1 px-1 pb-1">
        <p className="text-[10px] text-amber-600 dark:text-amber-400">
          Texto não extraído.
        </p>
        <Button
          aria-label="Abrir área para colar texto deste documento"
          className="h-6 text-[10px]"
          onClick={() => setExpanded(true)}
          size="sm"
          type="button"
          variant="secondary"
        >
          Colar texto
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1 px-1 pb-1">
      <p className="text-[10px] text-amber-600 dark:text-amber-400">
        Cole abaixo e confirme.
      </p>
      <textarea
        aria-label="Texto do documento (colar quando a extração falhar)"
        className="min-h-[60px] w-full resize-y rounded border border-border bg-background px-1.5 py-1 text-[11px] outline-none focus-visible:ring-1 focus-visible:ring-primary"
        onChange={(e) => setValue(e.target.value)}
        placeholder="Colar texto do PDF/DOC/DOCX aqui…"
        rows={3}
        value={value}
      />
      <div className="flex gap-1">
        <Button
          className="h-6 text-[10px]"
          disabled={value.trim().length === 0}
          onClick={handleConfirm}
          size="sm"
          type="button"
        >
          Usar este texto
        </Button>
        <Button
          aria-label="Fechar área de colar texto"
          className="h-6 text-[10px]"
          onClick={() => setExpanded(false)}
          size="sm"
          type="button"
          variant="ghost"
        >
          Cancelar
        </Button>
      </div>
    </div>
  );
}

const DOC_MIME = "application/msword";
const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export const PreviewAttachment = ({
  attachment,
  isUploading = false,
  onDocumentTypeChange,
  onPastedText,
  onRemove,
}: {
  attachment: Attachment;
  isUploading?: boolean;
  /** Quando definido, mostra seletor PI/Contestação para documentos com texto extraído */
  onDocumentTypeChange?: (documentType: DocumentTypeLabel) => void;
  /** Quando definido e extração falhou, permite colar texto; ao confirmar, o anexo passa a ter extractedText */
  onPastedText?: (text: string) => void;
  onRemove?: () => void;
}) => {
  const {
    name,
    url,
    contentType,
    documentType,
    extractedText,
    extractionFailed,
  } = attachment;
  const isPdf = contentType === "application/pdf";
  const isDoc = contentType === DOC_MIME;
  const isDocx = contentType === DOCX_MIME;
  const isDocumentWithText = extractedText != null || isPdf || isDoc || isDocx;
  const showDocumentTypeSelector =
    isDocumentWithText && onDocumentTypeChange != null;
  const showExtractionFailedHint =
    extractionFailed === true && (isPdf || isDoc || isDocx);

  let documentLabel: string;
  if (isPdf) {
    documentLabel = "PDF";
  } else if (isDoc) {
    documentLabel = "DOC";
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
            aria-label="Remover anexo"
            className="absolute top-0.5 right-0.5 size-4 rounded-full p-0 opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100 focus-visible:ring-2 focus-visible:ring-primary"
            onClick={onRemove}
            size="sm"
            type="button"
            variant="destructive"
          >
            <CrossSmallIcon size={8} aria-hidden />
          </Button>
        )}

        <div className="absolute inset-x-0 bottom-0 truncate bg-linear-to-t from-black/80 to-transparent px-1 py-0.5 text-[10px] text-white">
          {name}
        </div>
      </div>

      {showExtractionFailedHint && onPastedText && (
        <PasteTextFallback onConfirm={onPastedText} />
      )}
      {showExtractionFailedHint && !onPastedText && (
        <p className="px-1 pb-0.5 text-[10px] text-amber-600 dark:text-amber-400">
          Texto não extraído. Cole o texto na caixa de mensagem.
        </p>
      )}

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
