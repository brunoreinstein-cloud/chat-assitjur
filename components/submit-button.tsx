"use client";

import { useFormStatus } from "react-dom";

import { LoaderIcon } from "@/components/icons";
import { cn } from "@/lib/utils";
import { Button } from "./ui/button";

export function SubmitButton({
  children,
  className,
  isSuccessful,
}: Readonly<{
  children: React.ReactNode;
  className?: string;
  isSuccessful: boolean;
}>) {
  const { pending } = useFormStatus();

  return (
    <Button
      aria-disabled={pending || isSuccessful}
      className={cn(
        "relative w-full bg-assistjur-purple-dark font-bold text-white hover:opacity-90 focus-visible:ring-assistjur-gold focus-visible:ring-offset-assistjur-purple-darker",
        className
      )}
      disabled={pending || isSuccessful}
      type={pending ? "button" : "submit"}
    >
      {children}
      {(pending || isSuccessful) && (
        <span className="absolute right-4 animate-spin">
          <LoaderIcon />
        </span>
      )}
      <output aria-live="polite" className="sr-only">
        {pending || isSuccessful ? "Carregando…" : "Enviar formulário"}
      </output>
    </Button>
  );
}
