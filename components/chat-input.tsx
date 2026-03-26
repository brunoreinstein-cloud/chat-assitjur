"use client";

import { type FormEvent, type KeyboardEvent, useRef } from "react";
import { DataPolicyLink } from "@/components/data-policy-link";

interface ChatInputProps {
  readonly value: string;
  readonly onChange: (v: string) => void;
  readonly onSubmit: () => void;
  readonly onAttach?: () => void;
  readonly onKnowledgeRef?: () => void;
  readonly disabled?: boolean;
  readonly placeholder?: string;
}

export function ChatInput({
  value,
  onChange,
  onSubmit,
  onAttach,
  onKnowledgeRef,
  disabled,
  placeholder = "Enviar mensagem… ou cole aqui a peça para revisão",
}: ChatInputProps) {
  const ref = useRef<HTMLTextAreaElement>(null);

  const handleInput = () => {
    const el = ref.current;
    if (!el) {
      return;
    }
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  };

  const handleKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (value.trim()) {
        onSubmit();
      }
    }
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (value.trim()) {
      onSubmit();
    }
  };

  return (
    <div className="border-border border-t bg-background px-6 pt-4 pb-[18px] dark:border-white/8 dark:bg-[#0d0f12]">
      <form
        className={`overflow-hidden rounded-xl border border-border bg-muted/50 transition-all focus-within:border-gold-accent/40 focus-within:shadow-[0_0_0_3px_rgba(234,179,8,0.08)] dark:border-white/8 dark:bg-[#13161b] dark:focus-within:border-amber-400/35 dark:focus-within:shadow-[0_0_0_3px_rgba(201,168,76,0.06)] ${
          disabled ? "cursor-not-allowed opacity-60" : ""
        }`}
        onSubmit={handleSubmit}
      >
        {/* Text area row */}
        <div className="flex items-end gap-2.5 px-3.5 pt-3">
          <textarea
            aria-label="Mensagem"
            className="scrollbar-thin scrollbar-thumb-muted-foreground/30 dark:scrollbar-thumb-[#20252f] max-h-[160px] min-h-[44px] flex-1 resize-none overflow-y-auto border-none bg-transparent pb-3 text-[14px] text-foreground leading-relaxed outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed dark:text-[#e8eaf0] dark:placeholder:text-[#3d4451]"
            disabled={disabled}
            onChange={(e) => {
              onChange(e.target.value);
              handleInput();
            }}
            onKeyDown={handleKey}
            placeholder={placeholder}
            ref={ref}
            rows={1}
            value={value}
          />
          <button
            aria-label="Enviar mensagem"
            className="mb-3 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gold-accent transition-all hover:scale-105 hover:bg-gold-accent/90 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-amber-400 dark:hover:bg-amber-300"
            disabled={disabled || !value.trim()}
            type="submit"
          >
            <svg
              aria-hidden
              className="h-[15px] w-[15px] text-primary-foreground"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              viewBox="0 0 24 24"
            >
              <title>Enviar</title>
              <path d="M22 2L11 13M22 2L15 22l-4-9-9-4 20-7z" />
            </svg>
          </button>
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-1 border-border border-t bg-muted/30 px-3.5 py-1.5 dark:border-white/8 dark:bg-[#1a1e26]">
          <ToolBtn icon="attach" onClick={onAttach}>
            Anexar
          </ToolBtn>
          <Divider />
          <ToolBtn icon="artifact">Artefacto</ToolBtn>
          <Divider />
          <ToolBtn icon="base" onClick={onKnowledgeRef}>
            @ base
          </ToolBtn>
          <div className="flex-1" />
          <span className="text-[11px] text-muted-foreground dark:text-[#3d4451]">
            PDF · DOC · DOCX · TXT
          </span>
        </div>
      </form>

      <p className="mt-2 text-center text-[11px] text-muted-foreground [&_button]:text-muted-foreground [&_button]:underline [&_button]:hover:text-foreground dark:[&_button]:text-[#6b7280] dark:[&_button]:hover:text-[#e8eaf0]">
        Auto-identificação de agente ativa · <DataPolicyLink />
      </p>
    </div>
  );
}

type IconName = "attach" | "artifact" | "base";

const ICONS: Record<IconName, React.ReactNode> = {
  attach: (
    <svg
      aria-hidden
      className="h-3 w-3"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      viewBox="0 0 24 24"
    >
      <title>Anexar</title>
      <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
    </svg>
  ),
  artifact: (
    <svg
      aria-hidden
      className="h-3 w-3"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      viewBox="0 0 24 24"
    >
      <title>Artefacto</title>
      <rect height="14" rx="2" width="20" x="2" y="3" />
      <path d="M8 21h8M12 17v4" />
    </svg>
  ),
  base: (
    <svg
      aria-hidden
      className="h-3 w-3"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      viewBox="0 0 24 24"
    >
      <title>Base de conhecimento</title>
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </svg>
  ),
};

function ToolBtn({
  children,
  icon,
  onClick,
}: Readonly<{
  children: string;
  icon: IconName;
  onClick?: () => void;
}>) {
  return (
    <button
      className="flex items-center gap-1 rounded px-2 py-1 text-[12px] text-muted-foreground transition-all hover:bg-muted hover:text-foreground dark:text-[#6b7280] dark:hover:bg-[#20252f] dark:hover:text-[#e8eaf0]"
      onClick={onClick}
      type="button"
    >
      {ICONS[icon]}
      {children}
    </button>
  );
}

function Divider() {
  return <span aria-hidden className="mx-0.5 h-3.5 w-px shrink-0 bg-border" />;
}
