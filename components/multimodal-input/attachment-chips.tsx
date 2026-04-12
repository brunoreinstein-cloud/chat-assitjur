"use client";

import {
  FileSpreadsheetIcon,
  FileTextIcon,
  ImageIcon,
  Loader2Icon,
  Trash2Icon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { UploadPhase, UploadQueueItem } from "@/lib/attachments";
import { getExtractionQuality } from "@/lib/extraction-quality";
import type { Attachment } from "@/lib/types";
import { cn } from "@/lib/utils";

function getChipIcon(contentType = ""): {
  Icon: typeof FileTextIcon;
  color: string;
} {
  if (contentType === "application/pdf") {
    return { Icon: FileTextIcon, color: "text-red-500" };
  }
  if (
    contentType ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    contentType === "application/msword"
  ) {
    return { Icon: FileTextIcon, color: "text-blue-500" };
  }
  if (
    contentType ===
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    contentType === "application/vnd.ms-excel" ||
    contentType === "text/csv"
  ) {
    return { Icon: FileSpreadsheetIcon, color: "text-green-600" };
  }
  if (contentType.startsWith("image/")) {
    return { Icon: ImageIcon, color: "text-purple-400" };
  }
  if (contentType === "application/vnd.oasis.opendocument.text") {
    return { Icon: FileTextIcon, color: "text-purple-500" };
  }
  return { Icon: FileTextIcon, color: "text-muted-foreground" };
}

function getPhaseLabel(phase: UploadPhase, _fileSize?: number): string {
  if (phase === "extracting") {
    return "Extraindo…";
  }
  if (phase === "done") {
    return "Pronto";
  }
  return "A enviar…";
}

interface AttachmentChipsProps {
  attachments: Attachment[];
  uploadQueue: UploadQueueItem[];
  chipsExpanded: boolean;
  onExpandChips: () => void;
  onRemoveAttachment: (url: string) => () => void;
}

export function AttachmentChips({
  attachments,
  uploadQueue,
  chipsExpanded,
  onExpandChips,
  onRemoveAttachment,
}: Readonly<AttachmentChipsProps>) {
  const total = attachments.length + uploadQueue.length;
  const showCollapsed = total > 3 && !chipsExpanded;
  const visibleAttachments = showCollapsed
    ? attachments.slice(0, 2)
    : attachments;
  const visibleQueue = showCollapsed
    ? uploadQueue.slice(0, Math.max(0, 2 - attachments.length))
    : uploadQueue;

  return (
    <div className="mb-2 flex flex-wrap items-center gap-1.5">
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
              onClick={onRemoveAttachment(attachment.url)}
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
          onClick={onExpandChips}
          type="button"
          variant="ghost"
        >
          +{total - 2} anexos
        </Button>
      )}
    </div>
  );
}
