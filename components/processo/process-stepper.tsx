"use client";

import { createContext, type ReactNode, useContext, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import {
  StepperIndicator,
  StepperItem,
  StepperRoot,
  StepperSeparator,
  StepperTitle,
  type StepStatus,
} from "@/components/ui/stepper";
import { useAuditEventsRealtime } from "@/hooks/use-audit-events-realtime";
import { PIPELINE_LABELS, PIPELINE_STEPS } from "@/lib/ai/pipeline-progress";
import type { AuditEvent } from "@/lib/db/schema";

// ─── Types ──────────────────────────────────────────────────────────────────

interface StepData {
  id: string;
  label: string;
  status: StepStatus;
  confidence: number | null;
}

interface ProcessStepperContextValue {
  events: AuditEvent[];
  steps: StepData[];
  isConnected: boolean;
}

// ─── Context ────────────────────────────────────────────────────────────────

const ProcessStepperContext = createContext<ProcessStepperContextValue>({
  events: [],
  steps: [],
  isConnected: false,
});

export function useProcessStepper() {
  return useContext(ProcessStepperContext);
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Mapeia confidence numérica para variante de badge. */
function confidenceVariant(
  confidence: number | null
): "confidence-high" | "confidence-medium" | "confidence-low" | null {
  if (confidence == null) {
    return null;
  }
  if (confidence >= 0.8) {
    return "confidence-high";
  }
  if (confidence >= 0.5) {
    return "confidence-medium";
  }
  return "confidence-low";
}

/** Formata confidence como percentagem. */
function formatConfidence(confidence: number | null): string {
  if (confidence == null) {
    return "";
  }
  return `${Math.round(confidence * 100)}%`;
}

/** Steps do pipeline na ordem de execução (sem COMPLETE e ERROR). */
const ORDERED_STEPS = [
  PIPELINE_STEPS.READING_DOCUMENT,
  PIPELINE_STEPS.EXTRACTING_METADATA,
  PIPELINE_STEPS.MAPPING_LANDMARKS,
  PIPELINE_STEPS.ANALYZING_PEDIDOS,
  PIPELINE_STEPS.AUDITING_FLAGS,
  PIPELINE_STEPS.SEARCHING_JURISPRUDENCIA,
  PIPELINE_STEPS.GENERATING_DOCX,
  PIPELINE_STEPS.GENERATING_XLSX,
] as const;

/** Deriva status de cada step a partir dos audit events. */
function deriveSteps(events: AuditEvent[]): StepData[] {
  // Mapa: action → evento mais recente
  const eventMap = new Map<string, AuditEvent>();
  for (const event of events) {
    if (!eventMap.has(event.action)) {
      eventMap.set(event.action, event);
    }
  }

  // Verificar se houve erro
  const hasError = eventMap.has(PIPELINE_STEPS.ERROR);

  let foundActive = false;

  return ORDERED_STEPS.map((stepId) => {
    const event = eventMap.get(stepId);
    let status: StepStatus;

    if (event) {
      status = "completed";
    } else if (hasError && !foundActive) {
      status = "error";
      foundActive = true;
    } else if (foundActive) {
      status = "pending";
    } else {
      status = "active";
      foundActive = true;
    }

    return {
      id: stepId,
      label: PIPELINE_LABELS[stepId] ?? stepId,
      status,
      confidence: event?.confidence ?? null,
    };
  });
}

// ─── Provider ───────────────────────────────────────────────────────────────

interface ProcessStepperProviderProps {
  processoId: string | null;
  children: ReactNode;
}

export function ProcessStepperProvider({
  processoId,
  children,
}: ProcessStepperProviderProps) {
  const { events, isConnected } = useAuditEventsRealtime(processoId);
  const steps = useMemo(() => deriveSteps(events), [events]);

  const value = useMemo(
    () => ({ events, steps, isConnected }),
    [events, steps, isConnected]
  );

  return (
    <ProcessStepperContext value={value}>{children}</ProcessStepperContext>
  );
}

// ─── Component ──────────────────────────────────────────────────────────────

interface ProcessStepperProps {
  processoId: string;
  className?: string;
}

export function ProcessStepper({ processoId, className }: ProcessStepperProps) {
  return (
    <ProcessStepperProvider processoId={processoId}>
      <ProcessStepperInner className={className} />
    </ProcessStepperProvider>
  );
}

function ProcessStepperInner({ className }: { className?: string }) {
  const { steps } = useProcessStepper();

  return (
    <StepperRoot className={className}>
      {steps.map((step, index) => (
        <div key={step.id}>
          <StepperItem status={step.status}>
            <StepperIndicator status={step.status} step={index + 1} />
            <div className="flex flex-col gap-0.5 pb-4">
              <div className="flex items-center gap-2">
                <StepperTitle>{step.label}</StepperTitle>
                {(() => {
                  const variant = confidenceVariant(step.confidence);
                  return variant ? (
                    <Badge variant={variant}>
                      {formatConfidence(step.confidence)}
                    </Badge>
                  ) : null;
                })()}
              </div>
            </div>
          </StepperItem>
          {index < steps.length - 1 && (
            <StepperSeparator status={step.status} />
          )}
        </div>
      ))}
    </StepperRoot>
  );
}
