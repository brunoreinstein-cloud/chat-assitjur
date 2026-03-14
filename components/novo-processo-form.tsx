"use client";

import { useRef, useState } from "react";
import type { Processo } from "@/lib/db/schema";

// ── CNJ ───────────────────────────────────────────────────────────────────────

/** Valida o formato CNJ: NNNNNNN-DD.AAAA.J.TT.OOOO */
const CNJ_REGEX = /^\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}$/;

/** Aplica máscara CNJ enquanto o utilizador digita. */
function applyCNJMask(raw: string): string {
  const d = raw.replace(/\D/g, "").slice(0, 20);
  if (d.length <= 7) {
    return d;
  }
  if (d.length <= 9) {
    return `${d.slice(0, 7)}-${d.slice(7)}`;
  }
  if (d.length <= 13) {
    return `${d.slice(0, 7)}-${d.slice(7, 9)}.${d.slice(9)}`;
  }
  if (d.length <= 14) {
    return `${d.slice(0, 7)}-${d.slice(7, 9)}.${d.slice(9, 13)}.${d.slice(13)}`;
  }
  if (d.length <= 16) {
    return `${d.slice(0, 7)}-${d.slice(7, 9)}.${d.slice(9, 13)}.${d.slice(13, 14)}.${d.slice(14)}`;
  }
  return `${d.slice(0, 7)}-${d.slice(7, 9)}.${d.slice(9, 13)}.${d.slice(13, 14)}.${d.slice(14, 16)}.${d.slice(16)}`;
}

// ── Types ─────────────────────────────────────────────────────────────────────

type Mode = "entry" | "extracting" | "review" | "saving";

interface FormFields {
  numeroAutos: string;
  reclamante: string;
  reclamada: string;
  vara: string;
  comarca: string;
  tribunal: string;
  rito: string;
}

const EMPTY_FORM: FormFields = {
  numeroAutos: "",
  reclamante: "",
  reclamada: "",
  vara: "",
  comarca: "",
  tribunal: "",
  rito: "ordinario",
};

interface NovoProcessoFormProps {
  readonly onCreated: (processo: Processo) => void;
  readonly onCancel: () => void;
}

// ── Styles ────────────────────────────────────────────────────────────────────

const inputClass =
  "w-full rounded-md border border-border bg-muted/50 px-2.5 py-1.5 text-[12px] text-foreground placeholder:text-muted-foreground/50 outline-none focus:border-assistjur-gold/50 focus:ring-1 focus:ring-assistjur-gold/30 dark:border-white/8 dark:bg-assistjur-purple-dark/60 dark:text-white dark:placeholder:text-assistjur-gray/50";

const labelClass =
  "mb-1 block text-[9px] font-semibold uppercase tracking-widest text-muted-foreground dark:text-assistjur-gray";

const btnSecondary =
  "flex-1 rounded-md border border-border bg-muted px-3 py-1.5 text-[12px] text-muted-foreground transition-colors hover:bg-muted/80 disabled:opacity-40 dark:border-white/8 dark:bg-assistjur-purple-dark dark:text-assistjur-gray-light";

const btnPrimary =
  "flex-1 rounded-md border border-assistjur-gold/40 bg-assistjur-gold/10 px-3 py-1.5 font-medium text-[12px] text-assistjur-gold transition-colors hover:bg-assistjur-gold/20 disabled:cursor-not-allowed disabled:opacity-40";

// ── Component ─────────────────────────────────────────────────────────────────

export function NovoProcessoForm({
  onCreated,
  onCancel,
}: NovoProcessoFormProps) {
  const [mode, setMode] = useState<Mode>("entry");
  const [form, setForm] = useState<FormFields>(EMPTY_FORM);
  /** Número CNJ digitado na entrada (antes de ir para review). */
  const [cnj, setCnj] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isValidCNJ = CNJ_REGEX.test(cnj);

  const setField =
    (field: keyof FormFields) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((prev) => ({ ...prev, [field]: e.target.value }));

  // ── Actions ─────────────────────────────────────────────────────────────────

  async function handleFile(file: File) {
    const isPdf =
      file.type === "application/pdf" ||
      file.name.toLowerCase().endsWith(".pdf");
    if (!isPdf) {
      setError("Apenas arquivos PDF são suportados.");
      return;
    }
    setMode("extracting");
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/processos/extract", {
        method: "POST",
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Erro ao extrair dados do PDF.");
        setMode("entry");
        return;
      }
      setForm({
        numeroAutos: data.numeroAutos || "",
        reclamante: data.reclamante || "",
        reclamada: data.reclamada || "",
        vara: data.vara || "",
        comarca: data.comarca || "",
        tribunal: data.tribunal || "",
        rito: data.rito || "ordinario",
      });
      setMode("review");
    } catch {
      setError("Erro de rede. Verifique a ligação e tente novamente.");
      setMode("entry");
    }
  }

  function handleCNJContinue() {
    setForm({ ...EMPTY_FORM, numeroAutos: cnj });
    setMode("review");
  }

  async function handleSave() {
    if (
      !(
        form.numeroAutos.trim() &&
        form.reclamante.trim() &&
        form.reclamada.trim()
      )
    ) {
      return;
    }
    setMode("saving");
    setError(null);
    try {
      const res = await fetch("/api/processos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          fase: "recebimento",
          prazoFatal: null,
        }),
      });
      if (!res.ok) {
        throw new Error("Erro ao criar processo");
      }
      const created = await res.json();
      onCreated(created);
    } catch {
      setError("Erro ao salvar o processo. Tente novamente.");
      setMode("review");
    }
  }

  // ── Entry mode ───────────────────────────────────────────────────────────────

  if (mode === "entry") {
    return (
      <div className="space-y-3 px-0.5">
        {/* Drop zone */}
        <button
          className={`flex w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed bg-transparent px-4 py-5 text-left text-inherit outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
            isDragging
              ? "border-assistjur-gold bg-assistjur-gold/5"
              : "border-border hover:border-assistjur-gold/50 hover:bg-muted/30 dark:border-white/15"
          }`}
          onClick={() => fileInputRef.current?.click()}
          onDragEnter={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            setIsDragging(false);
          }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragging(false);
            const file = e.dataTransfer.files?.[0];
            if (file) {
              handleFile(file);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              fileInputRef.current?.click();
            }
          }}
          type="button"
        >
          <input
            accept=".pdf,application/pdf"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                handleFile(file);
              }
            }}
            ref={fileInputRef}
            type="file"
          />
          {/* PDF icon */}
          <svg
            aria-hidden
            className={`h-8 w-8 transition-colors ${isDragging ? "text-assistjur-gold" : "text-muted-foreground/50"}`}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            viewBox="0 0 24 24"
          >
            <title>Ficheiro PDF</title>
            <path
              d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <div>
            <p className="font-medium text-[12px] text-foreground dark:text-white">
              {isDragging ? "Solte o PDF aqui" : "Arraste o PDF do processo"}
            </p>
            <p className="text-[11px] text-muted-foreground dark:text-assistjur-gray">
              ou clique para selecionar
            </p>
          </div>
        </button>

        {/* Divider */}
        <div className="flex items-center gap-2">
          <div className="h-px flex-1 bg-border dark:bg-white/10" />
          <span className="shrink-0 text-[10px] text-muted-foreground dark:text-assistjur-gray">
            ou insira o número
          </span>
          <div className="h-px flex-1 bg-border dark:bg-white/10" />
        </div>

        {/* CNJ input */}
        <input
          autoComplete="off"
          className={inputClass}
          maxLength={25}
          onChange={(e) => setCnj(applyCNJMask(e.target.value))}
          placeholder="0000000-00.0000.5.00.0000"
          type="text"
          value={cnj}
        />

        {/* Error */}
        {error && <p className="text-[11px] text-red-400">{error}</p>}

        {/* Actions */}
        <div className="flex gap-2 pt-0.5">
          <button className={btnSecondary} onClick={onCancel} type="button">
            Cancelar
          </button>
          <button
            className={btnPrimary}
            disabled={!isValidCNJ}
            onClick={handleCNJContinue}
            type="button"
          >
            Continuar →
          </button>
        </div>
      </div>
    );
  }

  // ── Extracting mode ──────────────────────────────────────────────────────────

  if (mode === "extracting") {
    return (
      <div className="flex flex-col items-center gap-3 py-8">
        <svg
          aria-hidden
          className="h-5 w-5 animate-spin text-assistjur-gold"
          fill="none"
          viewBox="0 0 24 24"
        >
          <title>A processar</title>
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            fill="currentColor"
          />
        </svg>
        <p className="text-[12px] text-muted-foreground dark:text-assistjur-gray">
          A extrair dados do PDF…
        </p>
      </div>
    );
  }

  // ── Review / Saving mode ─────────────────────────────────────────────────────

  const isSaving = mode === "saving";
  const canSave = !!(
    form.numeroAutos.trim() &&
    form.reclamante.trim() &&
    form.reclamada.trim()
  );

  return (
    <form
      className="space-y-2.5 px-0.5"
      onSubmit={(e) => {
        e.preventDefault();
        handleSave();
      }}
    >
      {/* Section header */}
      <div className="flex items-center gap-2">
        <span className="shrink-0 font-semibold text-[9px] text-assistjur-gold uppercase tracking-widest">
          Confirme os dados
        </span>
        <div className="h-px flex-1 bg-assistjur-gold/20" />
      </div>

      {/* Número dos autos */}
      <div>
        <label className={labelClass} htmlFor="np-numero">
          Número dos autos *
        </label>
        <input
          className={inputClass}
          id="np-numero"
          maxLength={25}
          onChange={(e) =>
            setForm((prev) => ({
              ...prev,
              numeroAutos: applyCNJMask(e.target.value),
            }))
          }
          placeholder="0000000-00.0000.5.00.0000"
          required
          type="text"
          value={form.numeroAutos}
        />
      </div>

      {/* Reclamante */}
      <div>
        <label className={labelClass} htmlFor="np-reclamante">
          Reclamante *
        </label>
        <input
          className={inputClass}
          id="np-reclamante"
          onChange={setField("reclamante")}
          placeholder="Nome completo"
          required
          type="text"
          value={form.reclamante}
        />
      </div>

      {/* Reclamada */}
      <div>
        <label className={labelClass} htmlFor="np-reclamada">
          Reclamada *
        </label>
        <input
          className={inputClass}
          id="np-reclamada"
          onChange={setField("reclamada")}
          placeholder="Razão social"
          required
          type="text"
          value={form.reclamada}
        />
      </div>

      {/* Vara */}
      <div>
        <label className={labelClass} htmlFor="np-vara">
          Vara
        </label>
        <input
          className={inputClass}
          id="np-vara"
          onChange={setField("vara")}
          placeholder="Ex: 1ª Vara do Trabalho de SP"
          type="text"
          value={form.vara}
        />
      </div>

      {/* Comarca + Tribunal (side by side) */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={labelClass} htmlFor="np-comarca">
            Comarca
          </label>
          <input
            className={inputClass}
            id="np-comarca"
            onChange={setField("comarca")}
            placeholder="Cidade"
            type="text"
            value={form.comarca}
          />
        </div>
        <div>
          <label className={labelClass} htmlFor="np-tribunal">
            Tribunal
          </label>
          <input
            className={inputClass}
            id="np-tribunal"
            onChange={setField("tribunal")}
            placeholder="TRT 2ª"
            type="text"
            value={form.tribunal}
          />
        </div>
      </div>

      {/* Rito */}
      <div>
        <label className={labelClass} htmlFor="np-rito">
          Rito
        </label>
        <select
          className={inputClass}
          id="np-rito"
          onChange={setField("rito")}
          value={form.rito}
        >
          <option value="ordinario">Ordinário</option>
          <option value="sumarissimo">Sumaríssimo</option>
        </select>
      </div>

      {/* Error */}
      {error && (
        <p className="text-[11px] text-red-400 dark:text-red-400">{error}</p>
      )}

      {/* Actions */}
      <div className="flex gap-2 pt-0.5">
        <button
          className={btnSecondary}
          disabled={isSaving}
          onClick={() => setMode("entry")}
          type="button"
        >
          ← Voltar
        </button>
        <button
          className={btnPrimary}
          disabled={isSaving || !canSave}
          type="submit"
        >
          {isSaving ? "Salvando…" : "✓ Salvar"}
        </button>
      </div>
    </form>
  );
}
