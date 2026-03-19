"use client";

import { useEffect } from "react";
import { toast } from "sonner";
import { useSWRConfig } from "swr";
import { unstable_serialize } from "swr/infinite";
import type { PipelineDashboardData } from "@/components/pipeline-quality-dashboard";
import { initialArtifactData, useArtifact } from "@/hooks/use-artifact";
import { storeMasterDoc } from "@/lib/master-content-store";
import {
  resetMasterProgress,
  setMasterCompletedCount,
  setMasterDocTitle,
  setMasterTotalCount,
} from "@/lib/master-progress-store";
import { setPipelineDashboardData } from "@/lib/pipeline-dashboard-store";
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

// Acumuladores de conteúdo do stream para o revisor-content-store
let _docId = "";
let _docTitle = "";
let _docContent = "";

// Acumuladores de conteúdo do stream para o master-content-store
let _mdocId = "";
let _mdocTitle = "";
let _mdocContent = "";

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
      // Acumulação de conteúdo para o revisor-content-store (sem DB).
      // Usa prefixo rdoc — estes eventos NÃO chegam ao setArtifact abaixo,
      // pelo que o painel artifact.tsx nunca faz GET /api/document para docs do Revisor.
      if (delta.type === "data-rdocId") {
        _docId = delta.data as string;
        continue;
      }
      if (delta.type === "data-rdocTitle") {
        _docTitle = delta.data as string;
        continue;
      }
      if (delta.type === "data-rdocKind") {
        continue; // ignorar kind (sempre "text")
      }
      if (delta.type === "data-rdocClear") {
        _docContent = "";
        continue;
      }
      if (delta.type === "data-rdocDelta") {
        _docContent += delta.data as string;
        continue;
      }
      if (delta.type === "data-rdocFinish") {
        if (_docId) {
          storeRevisorDoc(_docId, _docTitle, _docContent);
        }
        _docId = "";
        _docContent = "";
        continue;
      }

      // Acumulação de conteúdo para o master-content-store (sem DB).
      // Usa prefixo mdoc — estes eventos NÃO activam o painel artifact.
      if (delta.type === "data-mdocId") {
        _mdocId = delta.data as string;
        continue;
      }
      if (delta.type === "data-mdocTitle") {
        _mdocTitle = delta.data as string;
        continue;
      }
      if (delta.type === "data-mdocClear") {
        _mdocContent = "";
        continue;
      }
      if (delta.type === "data-mdocDelta") {
        _mdocContent += delta.data as string;
        continue;
      }
      if (delta.type === "data-mdocFinish") {
        if (_mdocId) {
          storeMasterDoc(_mdocId, _mdocTitle, _mdocContent);
        }
        _mdocId = "";
        _mdocContent = "";
        continue;
      }
      if (delta.type === "data-mdocStart") {
        // Captura total de documentos e regista timestamp de início para ETA.
        setMasterTotalCount(delta.data as number);
        continue;
      }
      if (delta.type === "data-mdocDone") {
        continue; // Apenas sinalização — tratamento no UI component
      }
      if (delta.type === "data-rdocStart") {
        // Regista timestamp de início para o timer e ETA do loading state.
        setRevisorStarted();
        continue;
      }
      if (delta.type === "data-rdocDone") {
        continue; // Apenas sinalização — tratamento no UI component
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
      if (delta.type === "data-masterProgress") {
        const completedCount = delta.data as number;
        if (completedCount === 1) {
          resetMasterProgress();
        }
        setMasterCompletedCount(completedCount);
        continue;
      }

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
        // Mensagem de conclusão (✅) → toast de sucesso com duração normal.
        // Restantes → toast loading persistente que actualiza em cada bloco.
        const isComplete = msg.startsWith("✅");
        if (isComplete) {
          toast.success(msg, { id: "pipeline-progress", duration: 6000 });
        } else {
          toast.loading(msg, { id: "pipeline-progress" });
        }
        continue;
      }
      if (delta.type === "data-revisorProgress") {
        const completedCount = delta.data as number;
        if (completedCount === 1) {
          // Primeiro doc concluído: reinicia contagem (nova geração iniciada)
          resetRevisorProgress();
        }
        setRevisorCompletedCount(completedCount);
        continue;
      }
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
