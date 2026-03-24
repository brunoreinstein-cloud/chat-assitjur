"use client";

import { useFormStatus } from "react-dom";

export function AvancaFaseButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      className="rounded border border-border/60 px-3 py-1 font-medium text-[12px] text-foreground transition-colors hover:bg-muted/50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:hover:bg-white/5"
      disabled={pending}
      type="submit"
    >
      {pending ? "A avançar…" : label}
    </button>
  );
}
