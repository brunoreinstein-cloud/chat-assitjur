"use client";

import { ArrowUp, Paperclip, Wrench } from "lucide-react";
import { useRef } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// ——— Tipos ——————————————————————————————————————————————————————————

export interface SuggestionChip {
  label: string;
  text: string;
}

export interface PromptComposerProps {
  /** Valor do textarea */
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  /** Placeholder contextual */
  placeholder?: string;
  /** Nome do caso ativo */
  caseName?: string;
  /** Nome do agente ativo */
  agentName?: string;
  /** Contagem de docs: "4 PDFs · 120 páginas" */
  docSummary?: string;
  /** Chips de sugestão rápida */
  suggestions?: SuggestionChip[];
  /** Callback do botão de anexar */
  onAttach?: () => void;
  /** Desabilita o envio */
  disabled?: boolean;
  /** Está gerando resposta */
  isLoading?: boolean;
  className?: string;
}

// ——— Componente ——————————————————————————————————————————————————————

export function PromptComposer({
  value,
  onChange,
  onSubmit,
  placeholder = "Descreva o caso, envie documentos ou peça uma minuta…",
  caseName,
  agentName,
  docSummary,
  suggestions,
  onAttach,
  disabled,
  isLoading,
  className,
}: PromptComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!disabled && !isLoading && value.trim()) {
        onSubmit();
      }
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onChange(e.target.value);
    // Auto-resize
    const el = e.target;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  };

  const handleSuggestion = (text: string) => {
    onChange(text);
    textareaRef.current?.focus();
  };

  const hasContext = caseName || agentName || docSummary;
  const canSubmit = !disabled && !isLoading && value.trim().length > 0;

  return (
    <div
      className={cn(
        "flex flex-col rounded-xl border bg-card shadow-sm",
        "transition-shadow focus-within:shadow-md focus-within:ring-2 focus-within:ring-ring/40",
        className,
      )}
    >
      {/* Faixa de contexto */}
      {hasContext && (
        <div className="flex flex-wrap items-center gap-1.5 border-b px-3 py-2">
          {caseName && (
            <Badge variant="secondary" className="gap-1 text-xs">
              <span className="text-muted-foreground">Caso:</span>
              {caseName}
            </Badge>
          )}
          {agentName && (
            <Badge variant="brand" className="gap-1 text-xs">
              <span className="opacity-70">Agente:</span>
              {agentName}
            </Badge>
          )}
          {docSummary && (
            <span className="ml-auto text-muted-foreground text-xs">
              {docSummary}
            </span>
          )}
        </div>
      )}

      {/* Textarea */}
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleInput}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled || isLoading}
        rows={1}
        style={{ minHeight: "56px", maxHeight: "200px" }}
        className={cn(
          "w-full resize-none bg-transparent px-4 py-3.5",
          "text-foreground text-sm leading-relaxed placeholder:text-muted-foreground",
          "outline-none disabled:cursor-not-allowed disabled:opacity-50",
          "overflow-y-auto",
        )}
      />

      {/* Suggestion chips */}
      {suggestions && suggestions.length > 0 && !value && (
        <div className="flex flex-wrap gap-1.5 px-3 pb-2 pt-0">
          {suggestions.map((s) => (
            <button
              key={s.label}
              type="button"
              onClick={() => handleSuggestion(s.text)}
              className={cn(
                "rounded-full border bg-muted/60 px-3 py-1 text-muted-foreground text-xs",
                "transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-foreground",
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center gap-1.5 border-t px-3 py-2">
        {onAttach && (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onAttach}
            disabled={disabled || isLoading}
            aria-label="Anexar documento"
          >
            <Paperclip className="h-4 w-4" />
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon-sm"
          disabled
          aria-label="Ferramentas"
          title="Em breve"
        >
          <Wrench className="h-4 w-4" />
        </Button>

        <div className="ml-auto">
          <Button
            size="icon-sm"
            onClick={onSubmit}
            disabled={!canSubmit}
            aria-label="Enviar"
            className={cn(
              "rounded-full",
              canSubmit
                ? "bg-primary text-primary-foreground hover:bg-primary/90"
                : "bg-muted text-muted-foreground",
            )}
          >
            <ArrowUp className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
