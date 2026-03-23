"use client";

// Custom hooks extracted from components/multimodal-input.tsx

import { useCallback, useState } from "react";
import { toast } from "sonner";

interface ImproveTextOptions {
  emptyError: string;
  genericError: string;
  successTitle: string;
}

export function usePromptImprovement() {
  const [isImproving, setIsImproving] = useState(false);
  const improveText = useCallback(
    async (
      text: string,
      setResult: (value: string) => void,
      options: ImproveTextOptions
    ) => {
      const trimmed = text.trim();
      if (trimmed.length === 0) {
        toast.error(options.emptyError);
        return;
      }
      setIsImproving(true);
      try {
        const res = await fetch("/api/prompt/improve", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: trimmed }),
        });
        const data = (await res.json()) as
          | { improvedPrompt: string; diagnosis?: string; notes?: string }
          | { error?: string };
        if (!res.ok) {
          const msg =
            "error" in data && typeof data.error === "string"
              ? data.error
              : options.genericError;
          toast.error(msg);
          return;
        }
        if (
          "improvedPrompt" in data &&
          typeof data.improvedPrompt === "string"
        ) {
          setResult(data.improvedPrompt);
          const parts: string[] = [];
          if (data.diagnosis?.trim()) {
            parts.push(data.diagnosis.trim());
          }
          if (data.notes?.trim()) {
            parts.push(`Alterações: ${data.notes.trim()}`);
          }
          const description =
            parts.length > 0
              ? parts.join("\n\n").slice(0, 400) +
                (parts.join("\n\n").length > 400 ? "…" : "")
              : undefined;
          toast.success(options.successTitle, { description });
        }
      } catch {
        toast.error("Erro de ligação. Tente novamente.");
      } finally {
        setIsImproving(false);
      }
    },
    []
  );
  return { improveText, isImproving };
}
