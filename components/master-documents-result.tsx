"use client";

import { Archive, Download, Eye, FileText, Loader2 } from "lucide-react";
import { useState } from "react";
import {
  type DocxLayout,
  downloadDocxFromPost,
  downloadZipFromPost,
} from "@/lib/document-download-utils";
import { getMasterDoc, getMasterDocs } from "@/lib/master-content-store";
import { useMasterCompletedCount } from "@/lib/master-progress-store";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { Skeleton } from "./ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";

export interface MasterDocumentsOutput {
  ids?: string[];
  titles?: string[];
  error?: unknown;
}

interface MasterDocumentsResultProps {
  output: MasterDocumentsOutput | undefined;
  isReadonly: boolean;
}

function downloadMasterDocx(id: string, layout?: DocxLayout): void {
  const doc = getMasterDoc(id);
  if (!doc) {
    return;
  }
  downloadDocxFromPost(doc.title, doc.content, layout);
}

function downloadMasterZip(ids: string[], layout?: DocxLayout): void {
  const docs = getMasterDocs(ids);
  downloadZipFromPost(
    docs.map(({ title, content }) => ({ title, content })),
    layout
  );
}

/**
 * Renderiza o resultado da tool createMasterDocuments:
 * - Estado de carregamento com skeleton por doc (usa masterProgress store)
 * - Docs em tabs (se >1) ou card simples (se 1) com preview e downloads
 * - Layout fixo assistjur-master para download DOCX
 */
export function MasterDocumentsResult({
  output,
  isReadonly,
}: Readonly<MasterDocumentsResultProps>) {
  const completedCount = useMasterCompletedCount();
  const [previewState, setPreviewState] = useState<{
    ids: string[];
    titles: string[];
    index: number;
  } | null>(null);
  const [activeTab, setActiveTab] = useState("0");

  if (output && typeof output === "object" && "error" in output) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-500 dark:bg-red-950/50">
        Erro ao criar documentos: {String(output.error)}
      </div>
    );
  }

  const ids = output?.ids ?? [];
  const titles = output?.titles ?? [];
  const isLoading = ids.length === 0;

  // Estado de carregamento com skeleton por doc
  if (isLoading) {
    const loadingTitles = Array.from(
      { length: Math.max(1, completedCount + 1) },
      (_, i) => `Documento ${i + 1}`
    );
    return (
      <div className="flex flex-col gap-2 rounded-xl border bg-muted/50 p-3">
        <p className="font-medium text-muted-foreground text-xs">
          A criar documentos…
        </p>
        {loadingTitles.map((label, i) => {
          const isDone = i < completedCount;
          const isActive = i === completedCount;
          return (
            <div
              className="flex items-center gap-2 rounded-lg border bg-background px-3 py-2"
              key={label}
            >
              {isActive ? (
                <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />
              ) : isDone ? (
                <span className="size-4 shrink-0 text-green-500 text-sm">
                  ✓
                </span>
              ) : (
                <Skeleton className="size-4 shrink-0 rounded-md" />
              )}
              <span
                className={
                  isDone
                    ? "text-sm"
                    : isActive
                      ? "text-muted-foreground text-sm"
                      : "text-muted-foreground/50 text-sm"
                }
              >
                {label}
                {isActive && <span className="ml-1 text-xs"> a gerar…</span>}
                {!(isDone || isActive) && (
                  <span className="ml-1 text-xs"> a aguardar…</span>
                )}
              </span>
            </div>
          );
        })}
      </div>
    );
  }

  function openPreviewAt(index: number) {
    setPreviewState({ ids, titles, index });
  }

  const previewContent =
    previewState !== null
      ? (getMasterDoc(previewState.ids[previewState.index])?.content ?? "")
      : "";

  // Documento único — card simples sem tabs
  if (ids.length === 1) {
    return (
      <>
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 rounded-lg border bg-background px-3 py-2 text-muted-foreground text-sm">
            <FileText className="size-4 shrink-0" />
            <span className="truncate font-medium text-foreground">
              {titles[0] ?? "Relatório"}
            </span>
          </div>
          {!isReadonly && (
            <div className="flex flex-wrap gap-2">
              <Button
                className="h-7 gap-1 px-2 text-xs"
                onClick={() => openPreviewAt(0)}
                size="sm"
                variant="outline"
              >
                <Eye className="size-3" />
                Ver conteúdo
              </Button>
              <Button
                className="h-7 gap-1 px-2 text-xs"
                onClick={() => downloadMasterDocx(ids[0], "assistjur-master")}
                size="sm"
                variant="outline"
              >
                <Download className="size-3" />
                DOCX
              </Button>
            </div>
          )}
        </div>
        {renderPreviewModal()}
      </>
    );
  }

  // Múltiplos documentos — tabs
  return (
    <>
      <div className="flex flex-col gap-2">
        <Tabs onValueChange={setActiveTab} value={activeTab}>
          <TabsList className="w-full">
            {titles.map((title, i) => (
              <TabsTrigger
                className="flex-1 truncate text-xs"
                key={ids[i] ?? i}
                value={String(i)}
              >
                {title}
              </TabsTrigger>
            ))}
          </TabsList>

          {ids.map((id, i) => (
            <TabsContent key={id} value={String(i)}>
              <div className="flex items-center gap-2 rounded-lg border bg-background px-3 py-2 text-muted-foreground text-sm">
                <FileText className="size-4 shrink-0" />
                <span className="truncate font-medium text-foreground">
                  {titles[i] ?? `Documento ${i + 1}`}
                </span>
              </div>
              {!isReadonly && (
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button
                    className="h-7 gap-1 px-2 text-xs"
                    onClick={() => openPreviewAt(i)}
                    size="sm"
                    variant="outline"
                  >
                    <Eye className="size-3" />
                    Ver conteúdo
                  </Button>
                  <Button
                    className="h-7 gap-1 px-2 text-xs"
                    onClick={() => downloadMasterDocx(id, "assistjur-master")}
                    size="sm"
                    variant="outline"
                  >
                    <Download className="size-3" />
                    DOCX
                  </Button>
                </div>
              )}
            </TabsContent>
          ))}
        </Tabs>

        {!isReadonly && ids.length > 1 && (
          <div className="flex gap-2 pt-1">
            <Button
              className="h-7 gap-1 px-2 text-xs"
              onClick={() => downloadMasterZip(ids, "assistjur-master")}
              size="sm"
              variant="outline"
            >
              <Archive className="size-3" />
              ZIP todos
            </Button>
          </div>
        )}
      </div>
      {renderPreviewModal()}
    </>
  );

  function renderPreviewModal() {
    return (
      <Dialog
        onOpenChange={(open) => {
          if (!open) {
            setPreviewState(null);
          }
        }}
        open={previewState !== null}
      >
        <DialogContent
          aria-describedby="master-preview-desc"
          className="flex max-h-[90dvh] max-w-4xl flex-col gap-0 p-0"
        >
          <DialogHeader className="shrink-0 border-b px-4 py-3">
            <div className="flex items-center justify-between gap-2">
              <DialogTitle className="truncate text-sm">
                {previewState
                  ? (previewState.titles[previewState.index] ??
                    `Documento ${previewState.index + 1}`)
                  : "Conteúdo"}
              </DialogTitle>
              <div className="flex shrink-0 items-center gap-1">
                {previewState && previewState.ids.length > 1 && (
                  <>
                    <Button
                      disabled={previewState.index === 0}
                      onClick={() =>
                        setPreviewState((s) =>
                          s ? { ...s, index: s.index - 1 } : s
                        )
                      }
                      size="sm"
                      variant="outline"
                    >
                      ◀
                    </Button>
                    <span className="text-muted-foreground text-xs">
                      {previewState.index + 1}/{previewState.ids.length}
                    </span>
                    <Button
                      disabled={
                        previewState.index === previewState.ids.length - 1
                      }
                      onClick={() =>
                        setPreviewState((s) =>
                          s ? { ...s, index: s.index + 1 } : s
                        )
                      }
                      size="sm"
                      variant="outline"
                    >
                      ▶
                    </Button>
                  </>
                )}
                {previewState && (
                  <Button
                    className="ml-1 h-7 gap-1 px-2 text-xs"
                    onClick={() =>
                      downloadMasterDocx(
                        previewState.ids[previewState.index],
                        "assistjur-master"
                      )
                    }
                    size="sm"
                    variant="outline"
                  >
                    <Download className="size-3" />
                    DOCX
                  </Button>
                )}
              </div>
            </div>
          </DialogHeader>
          <div
            className="min-h-0 flex-1 overflow-auto px-6 py-4"
            id="master-preview-desc"
          >
            <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-relaxed">
              {previewContent}
            </pre>
          </div>
        </DialogContent>
      </Dialog>
    );
  }
}
