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
import { getRevisorDoc, getRevisorDocs } from "@/lib/revisor-content-store";
import {
  getRevisorStartedAt,
  useRevisorCompletedCount,
} from "@/lib/revisor-progress-store";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { Skeleton } from "./ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";

/** Formata segundos em "Xs" ou "Xm Ys". */
function formatDuration(seconds: number): string {
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

/** Total de documentos do Revisor — sempre 3 (fixo). */
const REVISOR_TOTAL = 3;

export interface RevisorDefesaDocumentsOutput {
  ids?: string[];
  titles?: string[];
  error?: unknown;
}

interface RevisorDefesaDocumentsResultProps {
  output: RevisorDefesaDocumentsOutput | undefined;
  isReadonly: boolean;
}

const DOC_LABELS = [
  "Avaliação",
  "Roteiro Advogado",
  "Roteiro Preposto",
] as const;

async function downloadRevisorDocx(
  id: string,
  layout?: DocxLayout
): Promise<void> {
  const doc = getRevisorDoc(id);
  if (doc) {
    // Conteúdo disponível em memória (sessão atual)
    await downloadDocxFromPost(doc.title, doc.content, layout);
  } else {
    // Fallback: buscar da BD via GET (sessão nova / reload de página)
    await downloadDocxFromGet(id, layout);
  }
}

async function downloadRevisorZip(
  ids: string[],
  layout?: DocxLayout
): Promise<void> {
  const docs = getRevisorDocs(ids);
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
 * Renderiza o resultado da tool createRevisorDefesaDocuments:
 * - Estado de carregamento com skeleton por doc (usa revisorProgress store)
 * - 3 docs em tabs com preview markdown directo (sem iframe/DB) e downloads sem DB
 */
export function RevisorDefesaDocumentsResult({
  output,
  isReadonly,
}: Readonly<RevisorDefesaDocumentsResultProps>) {
  const completedCount = useRevisorCompletedCount();

  // Timer: segundos decorridos desde data-rdocStart
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const ids_check = output?.ids ?? [];
  const isLoading_check = ids_check.length === 0;

  useEffect(() => {
    if (!isLoading_check) {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      return;
    }
    const startedAt = getRevisorStartedAt();
    if (startedAt === 0) {
      return;
    }
    setElapsed(Math.floor((Date.now() - startedAt) / 1000));
    timerRef.current = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [isLoading_check]);

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
        Erro ao criar os 3 documentos: {String(output.error)}
      </div>
    );
  }

  const ids = output?.ids ?? [];
  const titles = output?.titles ?? [];
  const isLoading = ids.length === 0;

  // Estado de carregamento com skeleton por doc, timer e ETA
  if (isLoading) {
    // ETA: só disponível após pelo menos 1 doc concluído
    let etaText: string | null = null;
    if (completedCount > 0 && elapsed > 0) {
      const secsPerDoc = elapsed / completedCount;
      const remaining = Math.round(
        secsPerDoc * (REVISOR_TOTAL - completedCount)
      );
      etaText = remaining > 0 ? `~${formatDuration(remaining)} restante` : null;
    }

    return (
      <div className="flex flex-col gap-2 rounded-xl border bg-muted/50 p-3">
        {/* Cabeçalho com progresso e timer */}
        <div className="flex items-center justify-between">
          <p className="font-medium text-muted-foreground text-xs">
            A criar documentos… {completedCount}/{REVISOR_TOTAL}
          </p>
          <div className="flex items-center gap-2 text-muted-foreground/70 text-xs">
            {etaText && (
              <span className="text-amber-600 dark:text-amber-400">
                {etaText}
              </span>
            )}
            {elapsed > 0 && <span>{formatDuration(elapsed)}</span>}
          </div>
        </div>

        {/* Barra de progresso */}
        <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary/50 transition-all duration-500"
            style={{ width: `${(completedCount / REVISOR_TOTAL) * 100}%` }}
          />
        </div>

        {/* Slots por documento */}
        {DOC_LABELS.map((label, i) => {
          const isDone = i < completedCount;
          const isActive = i === completedCount;
          return (
            <div
              className="flex items-center gap-2 rounded-lg border bg-background px-3 py-2"
              key={label}
            >
              {isActive ? (
                <Loader2 className="size-4 shrink-0 animate-spin text-primary/70" />
              ) : isDone ? (
                <span className="size-4 shrink-0 text-green-500 text-sm leading-none">
                  ✓
                </span>
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
              {!(isDone || isActive) && (
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

  // Documentos prontos
  const tabLabels = titles.length === 3 ? titles : DOC_LABELS;

  function openPreviewAt(index: number) {
    setPreviewState({ ids, titles: tabLabels as string[], index });
  }

  const previewContent =
    previewState !== null
      ? (getRevisorDoc(previewState.ids[previewState.index])?.content ?? "")
      : "";

  return (
    <>
      <div className="flex flex-col gap-2">
        <Tabs onValueChange={setActiveTab} value={activeTab}>
          <TabsList className="w-full">
            {tabLabels.map((label, i) => (
              <TabsTrigger
                className="flex-1 truncate text-xs"
                key={ids[i] ?? i}
                value={String(i)}
              >
                {DOC_LABELS[i] ?? label}
              </TabsTrigger>
            ))}
          </TabsList>

          {ids.map((id, i) => (
            <TabsContent key={id} value={String(i)}>
              {/* Card estático — sem chamadas à BD; conteúdo disponível via store em memória */}
              <div className="flex items-center gap-2 rounded-lg border bg-background px-3 py-2 text-muted-foreground text-sm">
                <FileText className="size-4 shrink-0" />
                <span className="truncate font-medium text-foreground">
                  {tabLabels[i] ?? `Documento ${i + 1}`}
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
                  disabled={downloadingId === `${id}:default`}
                  onClick={async () => {
                    setDownloadingId(`${id}:default`);
                    await downloadRevisorDocx(id);
                    setDownloadingId(null);
                  }}
                  size="sm"
                  variant="outline"
                >
                  {downloadingId === `${id}:default` ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : (
                    <Download className="size-3" />
                  )}
                  DOCX
                </Button>
                <Button
                  className="h-7 gap-1 px-2 text-xs"
                  disabled={downloadingId === `${id}:master`}
                  onClick={async () => {
                    setDownloadingId(`${id}:master`);
                    await downloadRevisorDocx(id, "assistjur-master");
                    setDownloadingId(null);
                  }}
                  size="sm"
                  variant="outline"
                >
                  {downloadingId === `${id}:master` ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : (
                    <Download className="size-3" />
                  )}
                  Master
                </Button>
              </div>
            </TabsContent>
          ))}
        </Tabs>

        {ids.length > 0 && (
          <div className="flex gap-2 pt-1">
            <Button
              className="h-7 gap-1 px-2 text-xs"
              disabled={downloadingZip}
              onClick={async () => {
                setDownloadingZip(true);
                await downloadRevisorZip(ids);
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
            <Button
              className="h-7 gap-1 px-2 text-xs"
              disabled={downloadingZip}
              onClick={async () => {
                setDownloadingZip(true);
                await downloadRevisorZip(ids, "assistjur-master");
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
              ZIP Master
            </Button>
          </div>
        )}
      </div>

      {/* Modal de preview com conteúdo markdown directo (sem iframe/DB) */}
      <Dialog
        onOpenChange={(open) => {
          if (!open) {
            setPreviewState(null);
          }
        }}
        open={previewState !== null}
      >
        <DialogContent
          aria-describedby="revisor-preview-desc"
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
                      downloadingId ===
                      `${previewState.ids[previewState.index]}:default`
                    }
                    onClick={async () => {
                      const id = previewState.ids[previewState.index];
                      setDownloadingId(`${id}:default`);
                      await downloadRevisorDocx(id);
                      setDownloadingId(null);
                    }}
                    size="sm"
                    variant="outline"
                  >
                    {downloadingId ===
                    `${previewState.ids[previewState.index]}:default` ? (
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
            id="revisor-preview-desc"
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
    </>
  );
}
