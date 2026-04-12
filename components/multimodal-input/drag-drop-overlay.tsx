"use client";

import {
  FileSpreadsheetIcon,
  FileTextIcon,
  ImageIcon,
  UploadCloudIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface DragDropOverlayProps {
  isRevisorAgent: boolean;
  onDragLeave: (event: React.DragEvent) => void;
  onDrop: (
    event: React.DragEvent,
    preferredType?: "pi" | "contestacao"
  ) => void;
}

export function DragDropOverlay({
  isRevisorAgent,
  onDragLeave,
  onDrop,
}: Readonly<DragDropOverlayProps>) {
  return (
    <section
      aria-label="Zona de largar ficheiros para anexar"
      aria-live="polite"
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-5 bg-background/90 backdrop-blur-sm"
      onDragLeave={onDragLeave}
      onDrop={(e) => onDrop(e)}
    >
      <div className="flex flex-col items-center gap-4 rounded-2xl border-2 border-primary/50 border-dashed bg-background/90 px-14 py-10 shadow-xl">
        <UploadCloudIcon aria-hidden className="size-10 text-primary/60" />
        <p className="font-semibold text-foreground text-lg">
          Solte os ficheiros aqui
        </p>
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <FileTextIcon aria-hidden className="size-3.5 text-red-500" />
          <span>PDF</span>
          <span aria-hidden className="opacity-40">
            ·
          </span>
          <FileTextIcon aria-hidden className="size-3.5 text-blue-500" />
          <span>Word</span>
          <span aria-hidden className="opacity-40">
            ·
          </span>
          <FileSpreadsheetIcon
            aria-hidden
            className="size-3.5 text-green-600"
          />
          <span>Excel / CSV</span>
          <span aria-hidden className="opacity-40">
            ·
          </span>
          <ImageIcon aria-hidden className="size-3.5 text-purple-400" />
          <span>Imagem</span>
        </div>
        {isRevisorAgent && (
          <div className="mt-1 flex gap-3">
            <Button
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.stopPropagation();
                onDrop(e, "pi");
              }}
              size="sm"
              type="button"
              variant="secondary"
            >
              Marcar como Petição Inicial
            </Button>
            <Button
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.stopPropagation();
                onDrop(e, "contestacao");
              }}
              size="sm"
              type="button"
              variant="secondary"
            >
              Marcar como Contestação
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}
