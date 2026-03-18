"use client";

import { Archive, Download, Eye, FileText, Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  type DocxLayout,
  downloadDocxFromGet,
  downloadDocxFromPost,
  downloadZipFromGet,
  downloadZipFromPost,
} from "@/lib/document-download-utils";
import { getMasterDoc, getMasterDocs } from "@/lib/master-content-store";
import {
  getMasterStartedAt,
  useMasterCompletedCount,
  useMasterDocTitles,
  useMasterTotalCount,
} from "@/lib/master-progress-store";

/** Formata segundos em "Xs" ou "Xm Ys". */
function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}
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

async function downloadMasterDocx(
  id: string,
  layout?: DocxLayout
): Promise<void> {
  const doc = getMasterDoc(id);
  if (doc) {
    // Conteúdo disponível em memória (sessão atual)
    await downloadDocxFromPost(doc.title, doc.content, layout);
  } else {
    // Fallback: buscar da BD via GET (sessão nova / reload de página)
    await downloadDocxFromGet(id, layout);
  }
}

async function downloadMasterZip(
  ids: string[],
  layout?: DocxLayout
): Promise<void> {
  const docs = getMasterDocs(ids);
  if (docs.length > 0) {
    // Conteúdo disponível em memória (sessão atual)
    await downloadZipFromPost(
      docs.map(({ title, content }) => ({ title, content })),
      layout
    );
  } else {
    // Fallback: buscar da BD via GET (sessão nova / reload de página)
    await downloadZipFromGet(ids, layout);
  }
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
  const totalCount = useMasterTotalCount();
  const streamTitles = useMasterDocTitles();

  // Timer: segundos decorridos desde data-mdocStart
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const ids = output?.ids ?? [];
  const isLoading = ids.length === 0;

  useEffect(() => {
    if (!isLoading) {
      // Geração concluída — parar timer
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }
    const startedAt = getMasterStartedAt();
    if (startedAt === 0) return; // ainda não começou
    // Calcular elapsed actual ao montar (evita salto inicial de 0→1s)
    setElapsed(Math.floor((Date.now() - startedAt) / 1000));
    timerRef.current = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isLoading, totalCount]); // re-run quando totalCount chega (startedAt actualizado)

  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [downloadingZip, setDownloadingZip] = useState(false);
  const [previewState, setPreviewState] = useState<{
    ids: string[];
    titles: string[];
    index: number;
  } | null>(null);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("0");

  // Fetch rendered HTML from the preview API whenever the active preview doc changes
  const currentPreviewId = previewState?.ids[previewState.index] ?? null;
  useEffect(() => {
    if (!currentPreviewId) {
      setPreviewHtml(null);
      setPreviewLoading(false);
      return;
    }
    let cancelled = false;
    setPreviewLoading(true);
    setPreviewHtml(null);
    fetch(
      `/api/document/preview?id=${encodeURIComponent(currentPreviewId)}&layout=assistjur-master`
    )
      .then((res) => {
        if (!res.ok) {
          throw new Error("not_ok");
        }
        return res.text();
      })
      .then((html) => {
        if (!cancelled) {
          setPreviewHtml(html);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setPreviewHtml(null); // fallback para <pre>
        }
      })
      .finally(() => {
        if (!cancelled) {
          setPreviewLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [currentPreviewId]);

  if (output && typeof output === "object" && "error" in output) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-500 dark:bg-red-950/50">
        Erro ao criar documentos: {String(output.error)}
      </div>
    );
  }

  const titles = output?.titles ?? [];

  // Estado de carregamento com skeleton por doc
  if (isLoading) {
    // Usa totalCount (de data-mdocStart) para mostrar todos os slots imediatamente.
    // Fallback para completedCount+1 enquanto o evento ainda não chegou.
    const slotCount = totalCount > 0 ? totalCount : Math.max(1, completedCount + 1);

    // ETA: só disponível após pelo menos 1 doc concluído
    let etaText: string | null = null;
    if (completedCount > 0 && totalCount > 0 && elapsed > 0) {
      const secsPerDoc = elapsed / completedCount;
      const remaining = Math.round(secsPerDoc * (totalCount - completedCount));
      etaText = remaining > 0 ? `~${formatDuration(remaining)} restante` : null;
    }

    return (
      <div className="flex flex-col gap-2 rounded-xl border bg-muted/50 p-3">
        {/* Cabeçalho com progresso e timer */}
        <div className="flex items-center justify-between">
          <p className="font-medium text-muted-foreground text-xs">
            {totalCount > 0
              ? `A criar documentos… ${completedCount}/${totalCount}`
              : "A criar documentos…"}
          </p>
          <div className="flex items-center gap-2 text-muted-foreground/70 text-xs">
            {etaText && (
              <span className="text-amber-600 dark:text-amber-400">{etaText}</span>
            )}
            {elapsed > 0 && (
              <span>{formatDuration(elapsed)}</span>
            )}
          </div>
        </div>

        {/* Barra de progresso */}
        {totalCount > 1 && (
          <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary/50 transition-all duration-500"
              style={{ width: `${(completedCount / totalCount) * 100}%` }}
            />
          </div>
        )}

        {/* Slots por documento */}
        {Array.from({ length: slotCount }, (_, i) => {
          const isDone = i < completedCount;
          const isActive = i === completedCount;
          const label = streamTitles[i] ?? `Documento ${i + 1}`;
          return (
            <div
              className="flex items-center gap-2 rounded-lg border bg-background px-3 py-2"
              key={`slot-${i}`}
            >
              {isActive ? (
                <Loader2 className="size-4 shrink-0 animate-spin text-primary/70" />
              ) : isDone ? (
                <span className="size-4 shrink-0 text-green-500 text-sm leading-none">✓</span>
              ) : (
                <Skeleton className="size-4 shrink-0 rounded-md" />
              )}
              <span
                className={
                  isDone
                    ? "flex-1 truncate text-sm"
                    : isActive
                      ? "flex-1 truncate text-muted-foreground text-sm"
                      : "flex-1 truncate text-muted-foreground/40 text-sm"
                }
              >
                {label}
              </span>
              {isActive && (
                <span className="shrink-0 text-muted-foreground/60 text-xs">
                  a gerar…
                </span>
              )}
              {!isDone && !isActive && (
                <span className="shrink-0 text-muted-foreground/30 text-xs">
                  a aguardar
                </span>
              )}
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
          <div className="flex flex-wrap gap-2">
            {!isReadonly && (
              <Button
                className="h-7 gap-1 px-2 text-xs"
                onClick={() => openPreviewAt(0)}
                size="sm"
                variant="outline"
              >
                <Eye className="size-3" />
                Ver conteúdo
              </Button>
            )}
            <Button
              className="h-7 gap-1 px-2 text-xs"
              disabled={downloadingId === ids[0]}
              onClick={async () => {
                setDownloadingId(ids[0]);
                await downloadMasterDocx(ids[0], "assistjur-master");
                setDownloadingId(null);
              }}
              size="sm"
              variant="outline"
            >
              {downloadingId === ids[0] ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                <Download className="size-3" />
              )}
              DOCX
            </Button>
          </div>
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
              <div className="mt-2 flex flex-wrap gap-2">
                {!isReadonly && (
                  <Button
                    className="h-7 gap-1 px-2 text-xs"
                    onClick={() => openPreviewAt(i)}
                    size="sm"
                    variant="outline"
                  >
                    <Eye className="size-3" />
                    Ver conteúdo
                  </Button>
                )}
                <Button
                  className="h-7 gap-1 px-2 text-xs"
                  disabled={downloadingId === id}
                  onClick={async () => {
                    setDownloadingId(id);
                    await downloadMasterDocx(id, "assistjur-master");
                    setDownloadingId(null);
                  }}
                  size="sm"
                  variant="outline"
                >
                  {downloadingId === id ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : (
                    <Download className="size-3" />
                  )}
                  DOCX
                </Button>
              </div>
            </TabsContent>
          ))}
        </Tabs>

        {ids.length > 1 && (
          <div className="flex gap-2 pt-1">
            <Button
              className="h-7 gap-1 px-2 text-xs"
              disabled={downloadingZip}
              onClick={async () => {
                setDownloadingZip(true);
                await downloadMasterZip(ids, "assistjur-master");
                setDownloadingZip(false);
              }}
              size="sm"
              variant="outline"
            >
              {downloadingZip ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                <Archive className="size-3" />
              )}
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
                    disabled={
                      downloadingId === previewState.ids[previewState.index]
                    }
                    onClick={async () => {
                      const id = previewState.ids[previewState.index];
                      setDownloadingId(id);
                      await downloadMasterDocx(id, "assistjur-master");
                      setDownloadingId(null);
                    }}
                    size="sm"
                    variant="outline"
                  >
                    {downloadingId === previewState.ids[previewState.index] ? (
                      <Loader2 className="size-3 animate-spin" />
                    ) : (
                      <Download className="size-3" />
                    )}
                    DOCX
                  </Button>
                )}
              </div>
            </div>
          </DialogHeader>
          <div
            className="min-h-0 flex-1 overflow-hidden"
            id="master-preview-desc"
          >
            {previewLoading ? (
              <div className="flex h-full items-center justify-center py-12">
                <Loader2 className="size-5 animate-spin text-muted-foreground" />
              </div>
            ) : previewHtml ? (
              <iframe
                className="size-full border-0"
                sandbox="allow-popups"
                srcDoc={previewHtml}
                title="Pré-visualização do documento"
              />
            ) : (
              <div className="overflow-auto px-6 py-4">
                <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-relaxed">
                  {previewContent}
                </pre>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    );
  }
}
