"use client";

import { useEffect } from "react";
import { toast } from "sonner";
import { useSWRConfig } from "swr";
import { unstable_serialize } from "swr/infinite";
import type { PipelineDashboardData } from "@/components/pipeline-quality-dashboard";
import { initialArtifactData, useArtifact } from "@/hooks/use-artifact";
import { storeAutuoriaDoc } from "@/lib/autuoria-content-store";
import {
  setAutuoriaCompletedCount,
  setAutuoriaStarted,
} from "@/lib/autuoria-progress-store";
import { storeMasterDoc } from "@/lib/master-content-store";
import {
  resetMasterProgress,
  setMasterCompletedCount,
  setMasterDocTitle,
  setMasterTotalCount,
} from "@/lib/master-progress-store";
import { setPipelineDashboardData } from "@/lib/pipeline-dashboard-store";
import { storeRedatorDoc } from "@/lib/redator-content-store";
import {
  setRedatorCompletedCount,
  setRedatorStarted,
} from "@/lib/redator-progress-store";
import { storeRevisorDoc } from "@/lib/revisor-content-store";
import {
  resetRevisorProgress,
  setRevisorCompletedCount,
  setRevisorStarted,
} from "@/lib/revisor-progress-store";
import {
  type ArtifactKind,
  artifactDefinitions,
  type UIArtifact,
} from "./artifact";
import { useDataStream } from "./data-stream-provider";
import { useDbFallback } from "./db-fallback-context";
import { getChatHistoryPaginationKey } from "./sidebar-history";

// ---------------------------------------------------------------------------
// Table-driven document stream accumulator
// ---------------------------------------------------------------------------

/** Prefixos de streaming de documentos. Mesma lista de document-stream-types.ts. */
const DOC_PREFIXES = ["rdoc", "mdoc", "autuoria", "redator"] as const;
type DocPrefix = (typeof DOC_PREFIXES)[number];

/** Acumulador por prefixo (module-level — persiste durante a sessão). */
const acc: Record<DocPrefix, { id: string; title: string; content: string }> = {
  rdoc: { id: "", title: "", content: "" },
  mdoc: { id: "", title: "", content: "" },
  autuoria: { id: "", title: "", content: "" },
  redator: { id: "", title: "", content: "" },
};

/** Funções de store por prefixo. */
const storeHandlers: Record<
  DocPrefix,
  (id: string, title: string, content: string) => void
> = {
  rdoc: storeRevisorDoc,
  mdoc: storeMasterDoc,
  autuoria: storeAutuoriaDoc,
  redator: storeRedatorDoc,
};

/** Start handlers por prefixo. */
const startHandlers: Record<DocPrefix, (() => void) | null> = {
  rdoc: setRevisorStarted,
  mdoc: null, // Master usa setMasterTotalCount (com data)
  autuoria: setAutuoriaStarted,
  redator: setRedatorStarted,
};

/**
 * Tenta processar um delta como evento de documento (prefixado).
 * Retorna true se tratado, false se não reconhecido.
 */
function handleDocEvent(
  deltaType: string,
  deltaData: unknown,
  setArtifact: (fn: (draft: UIArtifact) => UIArtifact) => void
): boolean {
  for (const prefix of DOC_PREFIXES) {
    const p = `data-${prefix}`;
    if (!deltaType.startsWith(p)) {
      continue;
    }
    const suffix = deltaType.slice(p.length);

    switch (suffix) {
      case "Id":
        acc[prefix].id = deltaData as string;
        return true;
      case "Title":
        acc[prefix].title = deltaData as string;
        return true;
      case "Kind":
        return true; // ignorar (sempre "text")
      case "Clear":
        acc[prefix].content = "";
        return true;
      case "Delta":
        acc[prefix].content += deltaData as string;
        return true;
      case "Finish": {
        const a = acc[prefix];
        if (a.id) {
          storeHandlers[prefix](a.id, a.title, a.content);
          // Redator: popula artifact panel para compatibilidade com DocumentToolResult.
          if (prefix === "redator") {
            setArtifact((draft) => ({
              ...draft,
              documentId: a.id,
              title: a.title,
              content: a.content,
              kind: "text" as ArtifactKind,
              status: "idle",
            }));
          }
        }
        a.id = "";
        a.content = "";
        return true;
      }
      case "Start": {
        const handler = startHandlers[prefix];
        if (handler) {
          handler();
        }
        // Master start também captura o total
        if (prefix === "mdoc") {
          setMasterTotalCount(deltaData as number);
        }
        return true;
      }
      case "Done":
        return true; // Apenas sinalização — tratamento no UI component
      default:
        return false; // Sufixo desconhecido — não é evento de documento
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DataStreamHandler() {
  const { dataStream, setDataStream } = useDataStream();
  const { setDbFallbackUsed } = useDbFallback();
  const { mutate } = useSWRConfig();

  const { artifact, setArtifact, setMetadata } = useArtifact();

  useEffect(() => {
    if (!dataStream?.length) {
      return;
    }

    const newDeltas = dataStream.slice();
    setDataStream([]);

    for (const delta of newDeltas) {
      // 1. Document stream events (table-driven: rdoc, mdoc, autuoria, redator)
      if (handleDocEvent(delta.type, delta.data, setArtifact)) {
        continue;
      }

      // 2. Agent-specific progress events
      if (delta.type === "data-revisorProgress") {
        const completedCount = delta.data as number;
        if (completedCount === 1) {
          // Primeiro doc concluído: reinicia contagem (nova geração iniciada)
          resetRevisorProgress();
        }
        setRevisorCompletedCount(completedCount);
        continue;
      }
      if (delta.type === "data-masterProgress") {
        const completedCount = delta.data as number;
        if (completedCount === 1) {
          resetMasterProgress();
        }
        setMasterCompletedCount(completedCount);
        continue;
      }
      if (delta.type === "data-masterTitle") {
        try {
          const { index, title } = JSON.parse(delta.data as string) as {
            index: number;
            title: string;
          };
          setMasterDocTitle(index, title);
        } catch {
          // ignorar JSON inválido
        }
        continue;
      }
      if (delta.type === "data-autuoriaProgress") {
        const completedCount = delta.data as number;
        // Não resetar progresso no meio da geração — reset ocorre em data-autuoriaStart.
        setAutuoriaCompletedCount(completedCount);
        continue;
      }
      if (delta.type === "data-redatorProgress") {
        setRedatorCompletedCount(delta.data as number);
        continue;
      }

      // 3. Chat / status events
      if (delta.type === "data-chat-title") {
        mutate(unstable_serialize(getChatHistoryPaginationKey));
        continue;
      }
      if (delta.type === "data-db-fallback") {
        setDbFallbackUsed(true);
        toast.warning(
          "Alguns dados do historial podem estar incompletos — a base de dados demorou a responder.",
          { id: "db-fallback", duration: 8000 }
        );
        continue;
      }
      if (delta.type === "data-generationStatus") {
        const msg = delta.data as string;
        toast.info(msg, { duration: 4000, id: "revisor-generation-status" });
        continue;
      }
      if (delta.type === "data-pipeline-dashboard") {
        try {
          const parsed = JSON.parse(
            delta.data as string
          ) as PipelineDashboardData;
          setPipelineDashboardData(parsed);
        } catch {
          // ignore malformed JSON
        }
        continue;
      }
      if (delta.type === "data-pipeline-progress") {
        const msg = delta.data as string;
        const isComplete = msg.startsWith("✅");
        if (isComplete) {
          toast.success(msg, { id: "pipeline-progress", duration: 6000 });
        } else {
          toast.loading(msg, { id: "pipeline-progress" });
        }
        continue;
      }

      // 4. Artifact panel (legacy create-document.ts events: data-id, data-title, etc.)
      const artifactDefinition = artifactDefinitions.find(
        (currentArtifactDefinition) =>
          currentArtifactDefinition.kind === artifact.kind
      );

      if (artifactDefinition?.onStreamPart) {
        const handler = artifactDefinition.onStreamPart as (args: {
          streamPart: typeof delta;
          setArtifact: typeof setArtifact;
          setMetadata: typeof setMetadata;
        }) => void;
        handler({
          streamPart: delta,
          setArtifact,
          setMetadata,
        });
      }

      setArtifact((draftArtifact): UIArtifact => {
        if (!draftArtifact) {
          return { ...initialArtifactData, status: "streaming" };
        }

        switch (delta.type) {
          case "data-id":
            return {
              ...draftArtifact,
              documentId: delta.data as string,
              status: "streaming",
            };

          case "data-title":
            return {
              ...draftArtifact,
              title: delta.data as string,
              status: "streaming",
            };

          case "data-kind":
            return {
              ...draftArtifact,
              kind: delta.data as ArtifactKind,
              status: "streaming",
            };

          case "data-clear":
            return {
              ...draftArtifact,
              content: "",
              status: "streaming",
            };

          case "data-finish":
            return {
              ...draftArtifact,
              status: "idle",
            };

          default:
            return draftArtifact;
        }
      });
    }
  }, [
    dataStream,
    setArtifact,
    setMetadata,
    artifact,
    setDataStream,
    mutate,
    setDbFallbackUsed,
  ]);

  return null;
}
