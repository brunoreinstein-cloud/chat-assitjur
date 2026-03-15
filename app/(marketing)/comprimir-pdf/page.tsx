"use client";

import Link from "next/link";
import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";

import { AssistJurLogo } from "@/components/assistjur-logo";

// ─── Types ───────────────────────────────────────────────────────────────────

type CompressState = "idle" | "processing" | "result" | "error";

interface PdfMetadata {
  cnj: string | null;
  docType: string | null;
  party: string | null;
}

interface CompressResult {
  pdfBase64: string;
  sizeBefore: number;
  sizeAfter: number;
  reductionPercent: number;
  method: string;
  durationMs: number;
  summary: string;
  suggestedName: string;
  metadata: PdfMetadata;
  sizeBeforeFormatted: string;
  sizeAfterFormatted: string;
}

/** Traduz labels internos para nomes legíveis. */
const DOC_TYPE_LABELS: Record<string, string> = {
  PI: "Petição Inicial",
  Contestacao: "Contestação",
  RO: "Recurso Ordinário",
  RR: "Recurso de Revista",
  Agravo: "Agravo",
  ED: "Embargos de Declaração",
  Sentenca: "Sentença",
  Acordao: "Acórdão",
  Laudo: "Laudo Pericial",
  Procuracao: "Procuração",
  Mandado: "Mandado",
  "Ata-Audiencia": "Ata de Audiência",
  Documento: "Documento",
};

const ASSISTJUR_CAPABILITIES = [
  {
    icon: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z",
    title: "Parecer Executivo",
    desc: "Análise completa da defesa: contexto, prescrição, quadro de pedidos e pontos de atenção.",
  },
  {
    icon: "M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z",
    title: "Roteiros de Audiência",
    desc: "Roteiro para advogado e roteiro confidencial para preposto, prontos para uso.",
  },
  {
    icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4",
    title: "Revisão Temática",
    desc: "Identificação de cada pedido com tese de defesa, riscos e sugestões de melhoria.",
  },
  {
    icon: "M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253",
    title: "Base de Conhecimento",
    desc: "Teses e precedentes do banco de teses integrado para enriquecer a análise.",
  },
];

type QualityMode = "screen" | "ebook" | "printer";

const QUALITY_OPTIONS: Array<{
  value: QualityMode;
  label: string;
  desc: string;
}> = [
  { value: "screen", label: "Máxima", desc: "72 DPI — menor tamanho" },
  {
    value: "ebook",
    label: "Recomendada",
    desc: "150 DPI — equilíbrio ideal",
  },
  { value: "printer", label: "Mínima", desc: "300 DPI — alta qualidade" },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function downloadBase64Pdf(base64: string, filename: string) {
  const byteChars = atob(base64);
  const byteNumbers = new Uint8Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) {
    byteNumbers[i] = byteChars.charCodeAt(i);
  }
  const blob = new Blob([byteNumbers], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Components ──────────────────────────────────────────────────────────────

function DropZone({
  onFile,
  mode,
  onModeChange,
}: Readonly<{
  onFile: (file: File) => void;
  mode: QualityMode;
  onModeChange: (m: QualityMode) => void;
}>) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file?.type === "application/pdf") {
        onFile(file);
      } else {
        toast.error("Apenas arquivos PDF são aceites.");
      }
    },
    [onFile]
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        onFile(file);
      }
    },
    [onFile]
  );

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <button
        className={`w-full cursor-pointer rounded-2xl border-2 border-dashed p-12 text-center transition-colors duration-200 ${
          isDragging
            ? "border-assistjur-gold bg-assistjur-gold/10"
            : "border-assistjur-purple/40 hover:border-assistjur-gold/60"
        }`}
        onClick={() => inputRef.current?.click()}
        onDragLeave={() => setIsDragging(false)}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDrop={handleDrop}
        type="button"
      >
        <input
          accept="application/pdf"
          className="hidden"
          onChange={handleChange}
          ref={inputRef}
          type="file"
        />
        <svg
          aria-hidden
          className="mx-auto mb-4 size-12 text-assistjur-gold/70"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          viewBox="0 0 24 24"
        >
          <title>Upload</title>
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="17 8 12 3 7 8" />
          <line x1="12" x2="12" y1="3" y2="15" />
        </svg>
        <p className="font-semibold text-lg text-white">Arraste seu PDF aqui</p>
        <p className="mt-1 text-assistjur-gray-light text-sm">
          ou clique para selecionar (max. 20 MB)
        </p>
      </button>

      {/* Seletor de qualidade */}
      <fieldset className="space-y-2">
        <legend className="mb-2 font-medium text-sm text-white">
          Nível de compressão
        </legend>
        <div className="grid grid-cols-3 gap-2">
          {QUALITY_OPTIONS.map((opt) => (
            <button
              className={`rounded-lg border px-3 py-2.5 text-left text-sm transition-colors ${
                mode === opt.value
                  ? "border-assistjur-gold bg-assistjur-gold/15 text-white"
                  : "border-assistjur-purple/30 text-assistjur-gray-light hover:border-assistjur-gold/40"
              }`}
              key={opt.value}
              onClick={() => onModeChange(opt.value)}
              type="button"
            >
              <span className="block font-semibold">{opt.label}</span>
              <span className="block text-xs opacity-70">{opt.desc}</span>
            </button>
          ))}
        </div>
      </fieldset>
    </div>
  );
}

function ProcessingView({ filename }: Readonly<{ filename: string }>) {
  return (
    <div className="mx-auto max-w-md space-y-6 text-center">
      <div className="mx-auto size-16 animate-spin rounded-full border-4 border-assistjur-purple/30 border-t-assistjur-gold" />
      <div>
        <p className="font-semibold text-lg text-white">Comprimindo...</p>
        <p className="mt-1 text-assistjur-gray-light text-sm">{filename}</p>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-assistjur-purple-dark">
        <div
          className="h-full animate-pulse rounded-full bg-assistjur-gold/70"
          style={{ width: "65%" }}
        />
      </div>
    </div>
  );
}

function ResultView({
  result,
  onReset,
}: Readonly<{
  result: CompressResult;
  onReset: () => void;
}>) {
  const [filename, setFilename] = useState(result.suggestedName);

  const handleDownload = useCallback(() => {
    const name = filename.endsWith(".pdf") ? filename : `${filename}.pdf`;
    downloadBase64Pdf(result.pdfBase64, name);
  }, [result.pdfBase64, filename]);

  const noReduction = result.reductionPercent <= 0;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Stats card */}
      <div className="rounded-xl border border-assistjur-purple/30 bg-assistjur-purple-dark/40 p-6">
        <div className="flex items-center gap-3">
          <div
            className={`flex size-12 items-center justify-center rounded-full ${
              noReduction ? "bg-amber-500/20" : "bg-green-500/20"
            }`}
          >
            {noReduction ? (
              <span className="text-2xl text-amber-400">—</span>
            ) : (
              <svg
                aria-hidden
                className="size-6 text-green-400"
                fill="none"
                stroke="currentColor"
                strokeWidth={2.5}
                viewBox="0 0 24 24"
              >
                <title>Sucesso</title>
                <path
                  d="M5 13l4 4L19 7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            )}
          </div>
          <div>
            <p className="font-bold text-lg text-white">
              {noReduction
                ? "PDF já está otimizado"
                : `Comprimido! -${result.reductionPercent}%`}
            </p>
            <p className="text-assistjur-gray-light text-sm">
              {result.sizeBeforeFormatted} → {result.sizeAfterFormatted}
              {" · "}
              {result.method === "resave"
                ? "Resave"
                : result.method === "render"
                  ? "Render"
                  : "Original"}
              {" · "}
              {(result.durationMs / 1000).toFixed(1)}s
            </p>
          </div>
        </div>
      </div>

      {/* Resumo do Documento — metadados + texto */}
      {(result.summary.length > 0 ||
        result.metadata.cnj ||
        result.metadata.docType) && (
        <div className="rounded-xl border border-assistjur-purple/30 bg-assistjur-purple-dark/40 p-6">
          <h3 className="mb-4 flex items-center gap-2 font-semibold text-white">
            <svg
              aria-hidden
              className="size-5 text-assistjur-gold"
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              viewBox="0 0 24 24"
            >
              <title>Documento</title>
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" x2="8" y1="13" y2="13" />
              <line x1="16" x2="8" y1="17" y2="17" />
              <polyline points="10 9 9 9 8 9" />
            </svg>
            Resumo do Documento
          </h3>

          {/* Metadados detectados */}
          {(result.metadata.cnj ||
            result.metadata.docType ||
            result.metadata.party) && (
            <div className="mb-4 grid gap-3 sm:grid-cols-3">
              {result.metadata.docType && (
                <div className="rounded-lg bg-assistjur-purple-darker/60 px-3 py-2.5">
                  <p className="text-assistjur-gray-light text-xs uppercase tracking-wide">
                    Tipo
                  </p>
                  <p className="mt-0.5 font-semibold text-sm text-white">
                    {DOC_TYPE_LABELS[result.metadata.docType] ??
                      result.metadata.docType}
                  </p>
                </div>
              )}
              {result.metadata.cnj && (
                <div className="rounded-lg bg-assistjur-purple-darker/60 px-3 py-2.5">
                  <p className="text-assistjur-gray-light text-xs uppercase tracking-wide">
                    Processo
                  </p>
                  <p className="mt-0.5 font-mono font-semibold text-sm text-white">
                    {result.metadata.cnj}
                  </p>
                </div>
              )}
              {result.metadata.party && (
                <div className="rounded-lg bg-assistjur-purple-darker/60 px-3 py-2.5">
                  <p className="text-assistjur-gray-light text-xs uppercase tracking-wide">
                    Parte
                  </p>
                  <p className="mt-0.5 font-semibold text-sm text-white">
                    {result.metadata.party}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Texto do resumo */}
          {result.summary.length > 0 && (
            <div className="rounded-lg bg-assistjur-purple-darker/40 p-4">
              <p className="mb-1 text-assistjur-gray-light text-xs uppercase tracking-wide">
                Conteúdo extraído
              </p>
              <p className="line-clamp-6 whitespace-pre-line text-assistjur-gray-light text-sm leading-relaxed">
                {result.summary}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Rename + Download */}
      {!noReduction && (
        <div className="rounded-xl border border-assistjur-purple/30 bg-assistjur-purple-dark/40 p-6">
          <label
            className="mb-2 block font-medium text-sm text-white"
            htmlFor="filename"
          >
            Nome do arquivo
          </label>
          <div className="flex gap-2">
            <input
              className="flex-1 rounded-lg border border-assistjur-purple/40 bg-assistjur-purple-darker/80 px-4 py-3 text-sm text-white placeholder:text-white/40 focus:border-assistjur-gold focus:outline-none focus:ring-1 focus:ring-assistjur-gold"
              id="filename"
              onChange={(e) => setFilename(e.target.value)}
              type="text"
              value={filename}
            />
          </div>
          <button
            className="landing-cta-hover mt-4 w-full rounded-xl bg-assistjur-gold px-8 py-3.5 font-bold text-assistjur-purple-darker text-base shadow-black/20 shadow-lg transition-[transform,opacity,box-shadow] duration-200 hover:opacity-95 hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-assistjur-gold active:scale-[0.98]"
            onClick={handleDownload}
            type="button"
          >
            Baixar PDF Comprimido
          </button>
        </div>
      )}

      {/* O que o AssistJur.IA pode fazer com este documento */}
      <div className="rounded-xl border border-assistjur-gold/20 bg-gradient-to-b from-assistjur-gold/5 to-transparent p-6">
        <div className="mb-5 text-center">
          <h3 className="font-bold text-lg text-white">
            O que o AssistJur.IA pode fazer
            {result.metadata.docType
              ? ` com esta ${DOC_TYPE_LABELS[result.metadata.docType] ?? result.metadata.docType}`
              : " com este documento"}
          </h3>
          <p className="mt-1 text-assistjur-gray-light text-sm">
            Análise jurídica completa com inteligência artificial
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {ASSISTJUR_CAPABILITIES.map((cap) => (
            <div
              className="flex gap-3 rounded-lg border border-assistjur-purple/20 bg-assistjur-purple-darker/40 p-4"
              key={cap.title}
            >
              <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-assistjur-gold/10">
                <svg
                  aria-hidden
                  className="size-5 text-assistjur-gold"
                  fill="none"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  viewBox="0 0 24 24"
                >
                  <title>{cap.title}</title>
                  <path d={cap.icon} />
                </svg>
              </div>
              <div>
                <p className="font-semibold text-sm text-white">{cap.title}</p>
                <p className="mt-0.5 text-assistjur-gray-light text-xs leading-relaxed">
                  {cap.desc}
                </p>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 text-center">
          <Link
            className="landing-cta-hover inline-flex min-h-[44px] items-center justify-center rounded-xl bg-assistjur-gold px-8 py-3 font-bold text-assistjur-purple-darker text-base shadow-black/20 shadow-lg transition-[transform,opacity,box-shadow] duration-200 hover:opacity-95 hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-assistjur-gold active:scale-[0.98]"
            href="/register"
          >
            Experimentar grátis
          </Link>
          <p className="mt-2 text-white/40 text-xs">
            Cadastro gratuito — sem cartão de crédito
          </p>
        </div>
      </div>

      {/* Reset */}
      <div className="text-center">
        <button
          className="text-assistjur-gray-light text-sm underline underline-offset-4 hover:text-white"
          onClick={onReset}
          type="button"
        >
          Comprimir outro PDF
        </button>
      </div>
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function ComprimirPdfPage() {
  const [state, setState] = useState<CompressState>("idle");
  const [mode, setMode] = useState<QualityMode>("ebook");
  const [filename, setFilename] = useState("");
  const [result, setResult] = useState<CompressResult | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  const handleFile = useCallback(
    async (file: File) => {
      setState("processing");
      setFilename(file.name);

      const formData = new FormData();
      formData.append("file", file);
      formData.append("mode", mode);

      try {
        const res = await fetch("/api/compress", {
          method: "POST",
          body: formData,
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "Erro ao comprimir.");
        }

        const data: CompressResult = await res.json();
        setResult(data);
        setState("result");

        if (data.reductionPercent > 0) {
          toast.success(
            `PDF comprimido: ${data.sizeBeforeFormatted} → ${data.sizeAfterFormatted} (-${data.reductionPercent}%)`
          );
        }
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : "Erro ao comprimir o PDF.";
        setErrorMsg(msg);
        setState("error");
        toast.error(msg);
      }
    },
    [mode]
  );

  const handleReset = useCallback(() => {
    setState("idle");
    setResult(null);
    setFilename("");
    setErrorMsg("");
  }, []);

  return (
    <div className="relative flex min-h-dvh flex-col overflow-x-hidden bg-[radial-gradient(ellipse_80%_60%_at_50%_0%,var(--assistjur-purple-dark)_0%,transparent_50%)] bg-assistjur-purple-darker pt-[env(safe-area-inset-top)]">
      <a className="skip-link" href="#main-content">
        Saltar para o conteúdo
      </a>

      {/* Header */}
      <header className="border-assistjur-purple-dark/50 border-b">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4 sm:h-14">
          <Link
            aria-label="AssistJur.IA — início"
            className="flex min-h-[44px] min-w-[44px] items-center gap-2 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-assistjur-gold"
            href="/"
          >
            <AssistJurLogo
              className="font-bold text-[17px]"
              iconSize={28}
              variant="full"
            />
          </Link>
          <nav aria-label="Navegação" className="flex items-center gap-1">
            <Link
              className="flex min-h-[44px] items-center justify-center rounded-md px-4 py-2 font-medium text-sm text-white transition-colors hover:bg-white/10"
              href="/login"
            >
              Entrar
            </Link>
            <Link
              className="flex min-h-[44px] items-center justify-center rounded-md bg-assistjur-gold px-4 py-2 font-bold text-assistjur-purple-darker text-sm transition-opacity hover:opacity-90"
              href="/register"
            >
              Cadastrar
            </Link>
          </nav>
        </div>
      </header>

      <main
        className="flex flex-1 flex-col items-center px-4 py-12 md:py-16"
        id="main-content"
        tabIndex={-1}
      >
        <div className="mx-auto w-full max-w-3xl space-y-8">
          {/* Title */}
          <div className="text-center">
            <p className="mb-4 inline-block rounded-full bg-assistjur-gold/15 px-4 py-1.5 font-semibold text-assistjur-gold text-xs uppercase tracking-wide">
              Ferramenta gratuita
            </p>
            <h1 className="font-bold text-3xl text-white tracking-tight md:text-4xl">
              Comprimir PDF
            </h1>
            <p className="mt-3 text-assistjur-gray-light text-lg">
              Reduza o tamanho dos seus PDFs e renomeie seguindo padrões de
              organização jurídica.
            </p>
          </div>

          {/* Content based on state */}
          {state === "idle" && (
            <DropZone mode={mode} onFile={handleFile} onModeChange={setMode} />
          )}

          {state === "processing" && <ProcessingView filename={filename} />}

          {state === "result" && result && (
            <ResultView onReset={handleReset} result={result} />
          )}

          {state === "error" && (
            <div className="mx-auto max-w-md space-y-4 text-center">
              <p className="text-red-400">{errorMsg}</p>
              <button
                className="text-assistjur-gray-light text-sm underline underline-offset-4 hover:text-white"
                onClick={handleReset}
                type="button"
              >
                Tentar novamente
              </button>
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-assistjur-purple-dark/50 border-t py-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
        <div className="mx-auto flex max-w-5xl flex-col items-center gap-3 px-4 text-center text-assistjur-gray-light text-sm">
          <nav aria-label="Rodapé" className="flex gap-6">
            <Link className="hover:text-white" href="/lp">
              Sobre
            </Link>
            <Link className="hover:text-white" href="/login">
              Entrar
            </Link>
            <Link className="hover:text-white" href="/register">
              Cadastrar
            </Link>
          </nav>
          <p className="text-white/30 text-xs">
            Seus arquivos são processados no servidor e não são armazenados.
          </p>
        </div>
      </footer>
    </div>
  );
}
