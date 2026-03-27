"use client";

import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, Circle, CloudUpload, FileText, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  ACCEPTED_DROP_EXTENSIONS,
  ACCEPTED_FILE_ACCEPT,
  BODY_SIZE_LIMIT_BYTES,
  PHASE_LABELS,
  uploadLargeFile,
  uploadSmallFile,
} from "@/lib/attachments";
import {
  autoAssignMissingDocumentType,
  buildAttachmentFromUploadResponse,
  inferDocumentTypeFromFilename,
} from "@/lib/attachments/utils";
import type { Attachment } from "@/lib/types";
import type { UploadQueueItem } from "@/lib/attachments/types";
import type { DocumentType } from "@/lib/runner/types";
import { DOCUMENT_TYPE_LABELS } from "@/lib/runner/types";
import { validateRunnerDocuments } from "@/lib/runner/validation";
import { cn } from "@/lib/utils";

interface RunnerUploadPhaseProps {
  agentLabel: string;
  agentDescription: string;
  requiredDocumentTypes: DocumentType[];
  minDocuments?: number;
  attachments: Attachment[];
  setAttachments: (fn: (prev: Attachment[]) => Attachment[]) => void;
  onReady: () => void;
}

export function RunnerUploadPhase({
  agentLabel,
  agentDescription,
  requiredDocumentTypes,
  minDocuments,
  attachments,
  setAttachments,
  onReady,
}: RunnerUploadPhaseProps) {
  const [uploadQueue, setUploadQueue] = useState<UploadQueueItem[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isUploading = uploadQueue.some((q) => q.phase !== "done");
  const validation = validateRunnerDocuments(
    attachments,
    requiredDocumentTypes,
    minDocuments
  );

  const uploadFile = useCallback(
    async (file: File, queueId: string) => {
      const onPhase = (phase: UploadQueueItem["phase"], percent: number) => {
        setUploadQueue((prev) =>
          prev.map((q) => (q.id === queueId ? { ...q, phase, percent } : q))
        );
      };
      try {
        if (file.size > BODY_SIZE_LIMIT_BYTES) {
          return await uploadLargeFile(file, onPhase);
        }
        return await uploadSmallFile(file, onPhase);
      } catch {
        toast.error("Falha ao enviar o arquivo.");
        return undefined;
      }
    },
    []
  );

  const processFiles = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;

      // Filter duplicates
      const unique = files.filter(
        (f) => !attachments.some((a) => a.name === f.name)
      );
      if (unique.length === 0) {
        toast.warning("Ficheiros já adicionados.");
        return;
      }

      const now = Date.now();
      const queueIds = unique.map((_, i) => `uq-${now}-${i}`);
      setUploadQueue((prev) => [
        ...prev,
        ...unique.map((f, i) => ({
          id: queueIds[i],
          label: f.name,
          phase: "uploading" as const,
          percent: 0,
          fileSize: f.size,
        })),
      ]);

      for (let i = 0; i < unique.length; i++) {
        const file = unique[i];
        const queueId = queueIds[i];
        try {
          const result = await uploadFile(file, queueId);
          if (result) {
            const newAttachments: Attachment[] = [];
            for (const att of result.attachments) {
              if (typeof att.url !== "string") continue;
              const docType =
                inferDocumentTypeFromFilename(att.name) ?? att.documentType;
              newAttachments.push({
                name: att.name,
                url: att.url,
                contentType: att.contentType,
                ...(att.pathname && { pathname: att.pathname }),
                ...(att.extractedText && { extractedText: att.extractedText }),
                ...(att.extractionFailed && { extractionFailed: true }),
                ...(docType && { documentType: docType }),
                ...(att.pageCount !== undefined && { pageCount: att.pageCount }),
              });
            }
            if (newAttachments.length > 0) {
              setAttachments((current) =>
                autoAssignMissingDocumentType([...current, ...newAttachments])
              );
            }
          }
        } finally {
          setUploadQueue((prev) => prev.filter((q) => q.id !== queueId));
        }
      }
    },
    [attachments, setAttachments, uploadFile]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      const files = Array.from(e.dataTransfer.files).filter((f) =>
        ACCEPTED_DROP_EXTENSIONS.test(f.name)
      );
      processFiles(files);
    },
    [processFiles]
  );

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files ?? []);
      processFiles(files);
      e.target.value = "";
    },
    [processFiles]
  );

  const removeAttachment = useCallback(
    (url: string) => {
      setAttachments((prev) => prev.filter((a) => a.url !== url));
    },
    [setAttachments]
  );

  return (
    <div className="flex w-full flex-col gap-6">
      {/* Agent card */}
      <div className="rounded-xl border border-border/60 bg-card p-6">
        <h2 className="text-lg font-semibold">{agentLabel}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {agentDescription}
        </p>
      </div>

      {/* Document checklist */}
      {requiredDocumentTypes.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {requiredDocumentTypes.map((docType) => {
            const hasDoc = attachments.some(
              (a) => a.documentType === docType
            );
            return (
              <div
                key={docType}
                className={cn(
                  "flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors",
                  hasDoc
                    ? "border-green-500/30 bg-green-500/5 text-green-700 dark:text-green-400"
                    : "border-border/60 text-muted-foreground"
                )}
              >
                {hasDoc ? (
                  <CheckCircle2 className="size-4" />
                ) : (
                  <Circle className="size-4" />
                )}
                {DOCUMENT_TYPE_LABELS[docType]}
              </div>
            );
          })}
        </div>
      )}

      {/* Drop zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragOver(true);
        }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-10 transition-colors",
          isDragOver
            ? "border-primary bg-primary/5"
            : "border-border/60 hover:border-primary/40 hover:bg-muted/30"
        )}
      >
        <CloudUpload
          className={cn(
            "size-10",
            isDragOver ? "text-primary" : "text-muted-foreground"
          )}
        />
        <p className="text-sm text-muted-foreground">
          Arraste documentos ou clique para selecionar
        </p>
        <p className="text-xs text-muted-foreground/60">
          PDF, DOCX, DOC, Excel, CSV, TXT, ODT
        </p>
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED_FILE_ACCEPT}
          multiple
          className="hidden"
          onChange={handleFileChange}
        />
      </div>

      {/* Upload queue */}
      {uploadQueue.length > 0 && (
        <div className="flex flex-col gap-2">
          {uploadQueue.map((item) => (
            <div
              key={item.id}
              className="flex items-center gap-3 rounded-lg border border-border/60 px-3 py-2 text-sm"
            >
              <FileText className="size-4 text-muted-foreground" />
              <span className="flex-1 truncate">{item.label}</span>
              <span className="text-xs text-muted-foreground">
                {item.percent > 0 && item.phase === "uploading"
                  ? `${item.percent}%`
                  : PHASE_LABELS[item.phase]}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Attached files */}
      {attachments.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-medium text-muted-foreground">
            Documentos ({attachments.length})
          </h3>
          {attachments.map((att) => (
            <div
              key={att.url}
              className="flex items-center gap-3 rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-sm"
            >
              <FileText className="size-4 shrink-0 text-muted-foreground" />
              <span className="flex-1 truncate">{att.name}</span>
              {att.documentType && (
                <span className="rounded bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary">
                  {att.documentType === "pi" ? "PI" : "Cont."}
                </span>
              )}
              {att.pageCount !== undefined && (
                <span className="text-xs text-muted-foreground">
                  {att.pageCount}p
                </span>
              )}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  removeAttachment(att.url);
                }}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Continue button */}
      <Button
        size="lg"
        disabled={!validation.valid || isUploading}
        onClick={onReady}
        className="w-full"
      >
        {isUploading
          ? "A enviar…"
          : validation.valid
            ? "Continuar"
            : (validation.error ?? "Documentos em falta")}
      </Button>
    </div>
  );
}
