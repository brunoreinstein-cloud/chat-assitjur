"use client";

import {
  CheckIcon,
  ExternalLinkIcon,
  FileSpreadsheetIcon,
  FileTextIcon,
  FolderPlusIcon,
  type LucideIcon,
} from "lucide-react";
import Image from "next/image";
import { useCallback, useState } from "react";
import { getExtractionQuality } from "@/lib/extraction-quality";
import type { Attachment, DocumentTypeLabel } from "@/lib/types";
import { Loader } from "./elements/loader";
import { CrossSmallIcon } from "./icons";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "./ui/dialog";

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
const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const XLS_MIME = "application/vnd.ms-excel";
const CSV_MIME = "text/csv";
const TXT_MIME = "text/plain";
const ODT_MIME = "application/vnd.oasis.opendocument.text";

/** Texto mostrado no overlay durante upload/processamento. Se não for passado, usa o padrão. */
const DEFAULT_UPLOADING_LABEL = "A processar documento…";

/** Aparência visual (ícone + cor) por tipo de ficheiro. */
interface FileTypeAppearance {
  icon: LucideIcon;
  /** Classe de cor para o ícone e label de tipo (Tailwind). */
  iconColor: string;
  /** Classe de background tênue para a área do ícone. */
  bgColor: string;
  /** Nome legível completo para tooltip. */
  fullName: string;
}

function getFileTypeAppearance(contentType: string): FileTypeAppearance {
  switch (contentType) {
    case "application/pdf":
      return {
        icon: FileTextIcon,
        iconColor: "text-red-500",
        bgColor: "bg-red-50 dark:bg-red-950/30",
        fullName: "PDF — Portable Document Format",
      };
    case DOCX_MIME:
      return {
        icon: FileTextIcon,
        iconColor: "text-blue-500",
        bgColor: "bg-blue-50 dark:bg-blue-950/30",
        fullName: "Word — Open XML Document",
      };
    case DOC_MIME:
      return {
        icon: FileTextIcon,
        iconColor: "text-blue-500",
        bgColor: "bg-blue-50 dark:bg-blue-950/30",
        fullName: "Word — Documento Legado (.doc)",
      };
    case XLSX_MIME:
      return {
        icon: FileSpreadsheetIcon,
        iconColor: "text-green-600",
        bgColor: "bg-green-50 dark:bg-green-950/30",
        fullName: "Excel — Open XML Spreadsheet",
      };
    case XLS_MIME:
      return {
        icon: FileSpreadsheetIcon,
        iconColor: "text-green-600",
        bgColor: "bg-green-50 dark:bg-green-950/30",
        fullName: "Excel — Spreadsheet Legado (.xls)",
      };
    case CSV_MIME:
      return {
        icon: FileSpreadsheetIcon,
        iconColor: "text-teal-500",
        bgColor: "bg-teal-50 dark:bg-teal-950/30",
        fullName: "CSV — Comma-Separated Values",
      };
    case ODT_MIME:
      return {
        icon: FileTextIcon,
        iconColor: "text-purple-500",
        bgColor: "bg-purple-50 dark:bg-purple-950/30",
        fullName: "ODT — OpenDocument Text",
      };
    case TXT_MIME:
      return {
        icon: FileTextIcon,
        iconColor: "text-muted-foreground",
        bgColor: "",
        fullName: "Ficheiro de Texto (.txt)",
      };
    default:
      return {
        icon: FileTextIcon,
        iconColor: "text-muted-foreground",
        bgColor: "",
        fullName: "Ficheiro",
      };
  }
}

/** Tipos de documento que suportam extração de texto e seletor PI/Contestação. */
const EXTRACTABLE_DOCUMENT_TYPES = new Set([
  "application/pdf",
  DOC_MIME,
  DOCX_MIME,
  XLSX_MIME,
  XLS_MIME,
  CSV_MIME,
  TXT_MIME,
  ODT_MIME,
]);

export const PreviewAttachment = ({
  attachment,
  isUploading = false,
  onDocumentTypeChange,
  onPastedText,
  onRemove,
  onSaveToArchivos,
  uploadingLabel = DEFAULT_UPLOADING_LABEL,
}: {
  attachment: Attachment;
  isUploading?: boolean;
  /** Quando definido, mostra seletor PI/Contestação para documentos com texto extraído */
  onDocumentTypeChange?: (documentType: DocumentTypeLabel) => void;
  /** Quando definido e extração falhou, permite colar texto; ao confirmar, o anexo passa a ter extractedText */
  onPastedText?: (text: string) => void;
  onRemove?: () => void;
  /** Quando definido e anexo tem pathname+url, permite guardar em "Arquivos" */
  onSaveToArchivos?: (attachment: Attachment) => void;
  /** Texto no overlay durante upload/processamento (ex.: "A processar documento…") */
  uploadingLabel?: string;
}) => {
  const {
    name,
    url,
    contentType,
    documentType,
    extractedText,
    extractionFailed,
    pathname,
  } = attachment;
  const canSaveToArchivos =
    Boolean(onSaveToArchivos) && Boolean(pathname && url) && !isUploading;
  const isPdf = contentType === "application/pdf";
  const isDoc = contentType === DOC_MIME;
  const isDocx = contentType === DOCX_MIME;
  const isExtractableDocument = EXTRACTABLE_DOCUMENT_TYPES.has(
    contentType ?? ""
  );
  const isDocumentWithText =
    extractedText != null || isPdf || isDoc || isDocx || isExtractableDocument;
  const showDocumentTypeSelector =
    isDocumentWithText && onDocumentTypeChange != null;
  const showExtractionFailedHint =
    extractionFailed === true && isExtractableDocument;

  let documentLabel: string;
  if (isPdf) {
    documentLabel = "PDF";
  } else if (isDoc) {
    documentLabel = "DOC";
  } else if (isDocx) {
    documentLabel = "DOCX";
  } else if (contentType === XLSX_MIME) {
    documentLabel = "XLSX";
  } else if (contentType === XLS_MIME) {
    documentLabel = "XLS";
  } else if (contentType === CSV_MIME) {
    documentLabel = "CSV";
  } else if (contentType === TXT_MIME) {
    documentLabel = "TXT";
  } else if (contentType === ODT_MIME) {
    documentLabel = "ODT";
  } else {
    documentLabel = "Arquivo";
  }

  const fileAppearance = contentType?.startsWith("image/")
    ? null
    : getFileTypeAppearance(contentType ?? "");

  const hasExtractedText =
    typeof extractedText === "string" && extractedText.trim().length > 0;
  const canOpenInNewTab = Boolean(url && !isUploading);
  const canPreviewDocx =
    isDocx && Boolean(url) && url.startsWith("https://") && !isUploading;

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
        ) : fileAppearance ? (
          <div
            className={`flex size-full flex-col items-center justify-center gap-0.5 text-xs ${fileAppearance.bgColor}`}
            title={fileAppearance.fullName}
          >
            <fileAppearance.icon
              aria-hidden
              className={`size-5 shrink-0 ${fileAppearance.iconColor}`}
            />
            <span
              className={`font-semibold leading-none ${fileAppearance.iconColor}`}
            >
              {documentLabel}
            </span>
          </div>
        ) : null}

        {isUploading && (
          <output
            aria-busy="true"
            aria-label={uploadingLabel}
            className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-black/50 px-1 py-2"
            data-testid="input-attachment-loader"
          >
            <Loader size={16} />
            <span className="text-center font-medium text-[10px] text-white drop-shadow-sm">
              {uploadingLabel}
            </span>
          </output>
        )}

        {onRemove && !isUploading && (
          <Button
            aria-label="Remover anexo"
            className="absolute top-0.5 right-0.5 size-4 rounded-full p-0 opacity-0 transition-opacity focus:opacity-100 focus-visible:ring-2 focus-visible:ring-primary group-hover:opacity-100"
            onClick={onRemove}
            size="sm"
            type="button"
            variant="destructive"
          >
            <CrossSmallIcon aria-hidden size={8} />
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

      {!isUploading &&
        (() => {
          const quality = getExtractionQuality(attachment);
          const pageCount = attachment.pageCount;
          if (!(quality || pageCount)) {
            return null;
          }
          return (
            <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 px-1 pb-0.5">
              {quality && (
                <span
                  className={`inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 font-medium text-[10px] ${quality.color}`}
                  title={quality.title}
                >
                  {quality.label}
                </span>
              )}
              {quality?.chars != null && quality.chars > 0 && (
                <span className="text-[9px] text-muted-foreground">
                  {quality.chars >= 1000
                    ? `${(quality.chars / 1000).toFixed(0)}k chars`
                    : `${quality.chars} chars`}
                </span>
              )}
              {pageCount != null && (
                <span
                  className="text-[9px] text-muted-foreground"
                  title="Número de páginas"
                >
                  {pageCount} {pageCount === 1 ? "pág." : "págs."}
                </span>
              )}
            </div>
          );
        })()}

      {showDocumentTypeSelector && (
        <div className="px-1 pb-1">
          <label className="sr-only" htmlFor={`attachment-doctype-${url}`}>
            Tipo de documento
          </label>
          <select
            className="w-full rounded border border-border bg-background px-1 py-0.5 text-[10px] text-muted-foreground outline-none focus:ring-1 focus:ring-primary"
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
          {documentType != null && (
            <output
              className="mt-0.5 flex items-center gap-1 text-[10px] text-green-700 dark:text-green-400"
              htmlFor={`attachment-doctype-${url}`}
            >
              <CheckIcon aria-hidden className="size-3 shrink-0" />
              {documentType === "pi"
                ? "Petição Inicial identificada"
                : "Contestação identificada"}
            </output>
          )}
        </div>
      )}

      {canSaveToArchivos && (
        <div className="px-1 pb-1">
          <Button
            aria-label="Guardar em Arquivos"
            className="h-6 w-full gap-1 text-[10px]"
            onClick={() => onSaveToArchivos?.(attachment)}
            size="sm"
            title="Guardar na biblioteca Arquivos para depois adicionar à base de conhecimento"
            type="button"
            variant="secondary"
          >
            <FolderPlusIcon aria-hidden size={10} />
            Guardar em Arquivos
          </Button>
        </div>
      )}

      {(canOpenInNewTab || hasExtractedText || canPreviewDocx) && (
        <div className="flex flex-wrap gap-1 px-1 pb-1">
          {canPreviewDocx && (
            <Dialog>
              <DialogTrigger asChild>
                <button
                  aria-label="Pré-visualizar documento como HTML"
                  className="inline-flex h-6 items-center gap-1 rounded border border-border bg-background px-1.5 text-[10px] text-foreground outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-primary"
                  title="Ver documento formatado"
                  type="button"
                >
                  <FileTextIcon aria-hidden size={10} />
                  Ver documento
                </button>
              </DialogTrigger>
              <DialogContent
                aria-describedby="docx-preview-frame-desc"
                className="flex max-h-[85vh] max-w-3xl flex-col gap-2"
              >
                <DialogTitle id="docx-preview-title">
                  Pré-visualização — {name}
                </DialogTitle>
                <p className="sr-only" id="docx-preview-frame-desc">
                  Conteúdo do documento em formato de leitura
                </p>
                <div className="min-h-[60vh] min-w-0 flex-1 overflow-hidden rounded border border-border">
                  <iframe
                    className="size-full"
                    src={`/api/files/preview?url=${encodeURIComponent(url)}&title=${encodeURIComponent(name)}`}
                    title={`Pré-visualização de ${name}`}
                  />
                </div>
              </DialogContent>
            </Dialog>
          )}
          {canOpenInNewTab && (
            <a
              className="inline-flex h-6 items-center gap-1 rounded border border-border bg-background px-1.5 text-[10px] text-foreground no-underline outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-primary"
              href={url}
              rel="noopener noreferrer"
              target="_blank"
              title="Abrir ficheiro em nova aba"
            >
              <ExternalLinkIcon aria-hidden size={10} />
              Abrir
            </a>
          )}
          {hasExtractedText && (
            <Dialog>
              <DialogTrigger asChild>
                <button
                  aria-label="Ver texto extraído do documento"
                  className="inline-flex h-6 items-center gap-1 rounded border border-border bg-background px-1.5 text-[10px] text-foreground outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-primary"
                  title="Ver texto extraído"
                  type="button"
                >
                  <FileTextIcon aria-hidden size={10} />
                  Ver texto
                </button>
              </DialogTrigger>
              <DialogContent
                aria-describedby="extracted-text-body"
                className="flex max-h-[85vh] max-w-2xl flex-col"
              >
                <DialogTitle id="extracted-text-title">
                  Texto extraído — {name}
                </DialogTitle>
                <div
                  className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap rounded border border-border bg-muted/30 p-3 font-mono text-xs"
                  id="extracted-text-body"
                >
                  {extractedText}
                </div>
              </DialogContent>
            </Dialog>
          )}
        </div>
      )}
    </div>
  );
};
