"use client";

import { useEffect, useState } from "react";
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from "./elements/reasoning";

interface MessageReasoningProps {
  readonly isLoading: boolean;
  /** Texto do raciocínio (usado quando não há steps). */
  readonly reasoning: string;
  /** Estrutura do pensamento em passos; quando definido, mostra "Passo 1", "Passo 2", etc. */
  readonly steps?: string[];
}

export function MessageReasoning({
  isLoading,
  reasoning,
  steps,
}: Readonly<MessageReasoningProps>) {
  const [hasBeenStreaming, setHasBeenStreaming] = useState(isLoading);

  useEffect(() => {
    if (isLoading) {
      setHasBeenStreaming(true);
    }
  }, [isLoading]);

  const stepCount = Array.isArray(steps) ? steps.length : 0;
  const hasSteps = stepCount > 0;

  return (
    <Reasoning
      data-testid="message-reasoning"
      defaultOpen={hasBeenStreaming}
      isStreaming={isLoading}
      stepCount={stepCount}
    >
      <ReasoningTrigger />
      <ReasoningContent steps={hasSteps ? steps : undefined}>
        {reasoning}
      </ReasoningContent>
    </Reasoning>
  );
}
