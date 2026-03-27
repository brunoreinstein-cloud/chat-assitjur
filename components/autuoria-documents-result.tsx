"use client";

import { Archive, Download, FileText, Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { getAutuoriaDoc, getAutuoriaDocs } from "@/lib/autuoria-content-store";
import {
  getAutuoriaStartedAt,
  useAutuoriaCompletedCount,
} from "@/lib/autuoria-progress-store";
import {
  type DocxLayout,
  downloadDocxFromGet,
  downloadDocxFromPost,
  downloadZipFromGet,
  downloadZipFromPost,
} from "@/lib/document-download-utils";
import { Button } from "./ui/button";

function formatDuration(seconds: number): string {
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

const AUTUORIA_TOTAL = 2;

export interface AutuoriaDocumentsOutput {
  ids?: string[];
  titles?: string[];
  error?: unknown;
}

interface AutuoriaDocumentsResultProps {
  output: AutuoriaDocumentsOutput | undefined;
  isReadonly: boolean;
}

const DOC_LABELS = ["Quadro de Correções", "Contestação Revisada"] as const;
const DOC_LAYOUTS: DocxLayout[] = ["autuoria-quadro", "autuoria-revisada"];

async function downloadAutuoriaDocx(id: string, index: number): Promise<void> {
  const layout = DOC_LAYOUTS[index];
  const doc = getAutuoriaDoc(id);
  if (doc) {
    await downloadDocxFromPost(doc.title, doc.content, layout);
  } else {
    await downloadDocxFromGet(id, layout);
  }
}

async function downloadAutuoriaZip(ids: string[]): Promise<void> {
  const docs = getAutuoriaDocs(ids);
  if (docs.length > 0) {
    await downloadZipFromPost(
      docs.map(({ title, content }) => ({ title, content })),
      "autuoria-quadro" // Layout for zip defaults to quadro, individual downloads use specific layouts
    );
  } else {
    await downloadZipFromGet(ids);
  }
}

export function AutuoriaDocumentsResult({
  output,
  isReadonly,
}: Readonly<AutuoriaDocumentsResultProps>) {
  const completedCount = useAutuoriaCompletedCount();
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const ids = output?.ids ?? [];
  const titles = output?.titles ?? [];
  const isLoading = ids.length === 0;

  useEffect(() => {
    if (isLoading && completedCount < AUTUORIA_TOTAL) {
      const started = getAutuoriaStartedAt();
      if (started > 0 && !timerRef.current) {
        timerRef.current = setInterval(() => {
          setElapsed(Math.floor((Date.now() - started) / 1000));
        }, 1000);
      }
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [isLoading, completedCount]);

  // Loading state
  if (isLoading) {
    const secsPerDoc = completedCount > 0 ? elapsed / completedCount : 0;
    const remaining = AUTUORIA_TOTAL - completedCount;
    const eta = secsPerDoc > 0 ? Math.ceil(secsPerDoc * remaining) : 0;

    return (
      <div className="flex flex-col gap-3 rounded-xl border p-4">
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>
            AutuorIA gerando documentos ({completedCount}/{AUTUORIA_TOTAL})
            {elapsed > 0 && ` — ${formatDuration(elapsed)}`}
            {eta > 0 && ` (ETA ~${formatDuration(eta)})`}
          </span>
        </div>
        {Array.from({ length: AUTUORIA_TOTAL }).map((_, i) => (
          <div
            className={`flex items-center gap-2 rounded-lg border p-3 ${
              i < completedCount
                ? "border-green-500/30 bg-green-50/50 dark:bg-green-950/20"
                : ""
            }`}
            key={`skeleton-${DOC_LABELS[i]}`}
          >
            <FileText className="h-4 w-4 shrink-0" />
            <span className="text-sm">{DOC_LABELS[i]}</span>
            {i < completedCount && (
              <span className="ml-auto text-green-600 text-xs">Pronto</span>
            )}
          </div>
        ))}
      </div>
    );
  }

  // Completed state
  return (
    <div className="flex flex-col gap-3 rounded-xl border p-4">
      <div className="flex items-center justify-between">
        <span className="font-medium text-sm">
          AutuorIA — {AUTUORIA_TOTAL} documentos gerados
        </span>
        {!isReadonly && ids.length > 1 && (
          <Button
            className="gap-1.5"
            onClick={() => downloadAutuoriaZip(ids)}
            size="sm"
            variant="outline"
          >
            <Archive className="h-3.5 w-3.5" />
            ZIP
          </Button>
        )}
      </div>

      {ids.map((id, i) => (
        <div
          className="flex items-center justify-between rounded-lg border p-3"
          key={id}
        >
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 shrink-0" />
            <div className="flex flex-col">
              <span className="font-medium text-sm">{DOC_LABELS[i]}</span>
              {titles[i] && (
                <span className="max-w-[300px] truncate text-muted-foreground text-xs">
                  {titles[i]}
                </span>
              )}
            </div>
          </div>
          {!isReadonly && (
            <Button
              className="gap-1.5"
              onClick={() => downloadAutuoriaDocx(id, i)}
              size="sm"
              variant="outline"
            >
              <Download className="h-3.5 w-3.5" />
              DOCX
            </Button>
          )}
        </div>
      ))}
    </div>
  );
}
