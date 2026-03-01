"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface DocumentPageLayoutProps {
  /** Conteúdo do documento (editor, diff, skeleton ou estado vazio). */
  children: ReactNode;
  /** Classes CSS adicionais (fundidas com as do layout). */
  className?: string;
  /**
   * Elemento raiz do layout.
   * - `"div"`: neutro (padrão).
   * - `"article"`: semântico para conteúdo de documento (melhor para a11y/leitores de ecrã).
   */
  as?: "div" | "article";
  /**
   * Nome da região para leitores de ecrã (ex.: "Conteúdo do documento").
   * Recomendado quando `as="article"` ou quando esta área é a principal do painel.
   */
  "aria-label"?: string;
}

/**
 * Layout tipo "página" para o preview do documento: largura máxima de leitura,
 * centralizado, fundo e tipografia adequados a texto longo (prose).
 * Usado no artefacto de texto para loading, diff, editor e estado vazio.
 */
export function DocumentPageLayout({
  children,
  className,
  as = "div",
  "aria-label": ariaLabel,
}: Readonly<DocumentPageLayoutProps>) {
  const Root = as;

  return (
    <Root
      className={cn(
        "mx-auto min-h-full w-full max-w-3xl px-4 py-8 md:px-12 md:py-12",
        "bg-background text-foreground",
        "prose prose-neutral dark:prose-invert",
        "prose-headings:font-semibold prose-headings:tracking-tight",
        "prose-li:leading-relaxed prose-p:leading-relaxed",
        "prose-blockquote:border-primary prose-blockquote:not-italic",
        "prose-pre:border prose-pre:bg-muted",
        "[&_.ProseMirror]:min-h-48 [&_.ProseMirror]:outline-none",
        className
      )}
      {...(ariaLabel ? { "aria-label": ariaLabel } : {})}
    >
      {children}
    </Root>
  );
}
