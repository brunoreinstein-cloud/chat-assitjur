"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Layout tipo "página" para o preview do documento: largura máxima de leitura,
 * centralizado, fundo tipo papel e tipografia adequada.
 */
export function DocumentPageLayout({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mx-auto min-h-full w-full max-w-3xl px-4 py-8 md:px-12 md:py-12",
        "bg-background text-foreground",
        "prose prose-neutral dark:prose-invert",
        "prose-headings:font-semibold prose-headings:tracking-tight",
        "prose-p:leading-relaxed prose-li:leading-relaxed",
        "[&_.ProseMirror]:min-h-48 [&_.ProseMirror]:outline-none",
        className
      )}
    >
      {children}
    </div>
  );
}
