"use client";

import { useControllableState } from "@radix-ui/react-use-controllable-state";
import { BrainIcon, ChevronDownIcon } from "lucide-react";
import type { ComponentProps } from "react";
import {
  createContext,
  memo,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { Response } from "./response";

interface ReasoningContextValue {
  isStreaming: boolean;
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  duration: number;
  stepCount: number;
}

const ReasoningContext = createContext<ReasoningContextValue | null>(null);

const useReasoning = () => {
  const context = useContext(ReasoningContext);
  if (!context) {
    throw new Error("Reasoning components must be used within Reasoning");
  }
  return context;
};

export type ReasoningProps = ComponentProps<typeof Collapsible> & {
  isStreaming?: boolean;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  duration?: number;
  /** Número de passos do pensamento (para o trigger: "3 passos" em vez de "Thinking steps"). */
  stepCount?: number;
};

const AUTO_CLOSE_DELAY = 500;
const MS_IN_S = 1000;

export const Reasoning = memo(
  ({
    className,
    isStreaming = false,
    open,
    defaultOpen = true,
    onOpenChange,
    duration: durationProp,
    stepCount = 0,
    children,
    ...props
  }: ReasoningProps) => {
    const [isOpen, setIsOpen] = useControllableState({
      prop: open,
      defaultProp: defaultOpen,
      onChange: onOpenChange,
    });
    const [duration, setDuration] = useControllableState({
      prop: durationProp,
      defaultProp: 0,
    });

    const [hasAutoClosedRef, setHasAutoClosedRef] = useState(false);
    const [startTime, setStartTime] = useState<number | null>(null);

    // Track duration when streaming starts and ends
    useEffect(() => {
      if (isStreaming) {
        if (startTime === null) {
          setStartTime(Date.now());
        }
      } else if (startTime !== null) {
        setDuration(Math.round((Date.now() - startTime) / MS_IN_S));
        setStartTime(null);
      }
    }, [isStreaming, startTime, setDuration]);

    // Auto-open when streaming starts, auto-close when streaming ends (once only)
    useEffect(() => {
      if (defaultOpen && !isStreaming && isOpen && !hasAutoClosedRef) {
        // Add a small delay before closing to allow user to see the content
        const timer = setTimeout(() => {
          setIsOpen(false);
          setHasAutoClosedRef(true);
        }, AUTO_CLOSE_DELAY);

        return () => clearTimeout(timer);
      }
    }, [isStreaming, isOpen, defaultOpen, setIsOpen, hasAutoClosedRef]);

    const handleOpenChange = (newOpen: boolean) => {
      setIsOpen(newOpen);
    };

    const contextValue = useMemo(
      () => ({ isStreaming, isOpen, setIsOpen, duration, stepCount }),
      [isStreaming, isOpen, setIsOpen, duration, stepCount]
    );
    return (
      <ReasoningContext.Provider value={contextValue}>
        <Collapsible
          className={cn("not-prose", className)}
          onOpenChange={handleOpenChange}
          open={isOpen}
          {...props}
        >
          {children}
        </Collapsible>
      </ReasoningContext.Provider>
    );
  }
);

export type ReasoningTriggerProps = ComponentProps<typeof CollapsibleTrigger>;

export const ReasoningTrigger = memo(
  ({ className, children, ...props }: ReasoningTriggerProps) => {
    const { isStreaming, isOpen, duration, stepCount } = useReasoning();

    let label: string;
    if (isStreaming || duration === 0) {
      label = stepCount > 1 ? `${stepCount} passos` : "Thinking steps";
    } else {
      label = `${duration}s`;
    }

    return (
      <CollapsibleTrigger
        className={cn(
          "flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
          className
        )}
        {...props}
      >
        {children ?? (
          <>
            <BrainIcon aria-hidden className="size-3" />
            <span>{label}</span>
            <ChevronDownIcon
              className={cn(
                "size-2.5 transition-transform",
                isOpen ? "rotate-180" : "rotate-0"
              )}
            />
          </>
        )}
      </CollapsibleTrigger>
    );
  }
);

export type ReasoningContentProps = ComponentProps<
  typeof CollapsibleContent
> & {
  /** Texto único (comportamento clássico). */
  children?: string;
  /** Quando definido, mostra a estrutura do pensamento em passos (Passo 1, Passo 2, …). */
  steps?: string[];
};

export const ReasoningContent = memo(
  ({ className, children, steps, ...props }: ReasoningContentProps) => {
    const hasSteps = Array.isArray(steps) && steps.length > 0;
    return (
      <CollapsibleContent
        className={cn(
          "mt-1.5 text-[11px] text-muted-foreground leading-relaxed",
          "data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-top-2 data-[state=open]:slide-in-from-top-2 outline-hidden data-[state=closed]:animate-out data-[state=open]:animate-in",
          className
        )}
        {...props}
      >
        <div className="max-h-48 overflow-y-auto rounded-md border border-border/50 bg-muted/30 p-2.5">
          {hasSteps ? (
            <ol
              aria-label="Estrutura do pensamento"
              className="grid list-none gap-2 pl-0"
            >
              {steps.map((stepText, i) => (
                <li
                  className="grid gap-0.5"
                  key={
                    stepText.trim().slice(0, 200) ||
                    `step-empty-${stepText.length}`
                  }
                >
                  <span className="font-medium text-muted-foreground/90">
                    Passo {i + 1}
                  </span>
                  <Response className="grid gap-1 text-[11px] **:text-[11px] [&_li]:my-0 [&_ol]:my-1 [&_p]:my-0 [&_ul]:my-1">
                    {stepText.trim() || "\u00A0"}
                  </Response>
                </li>
              ))}
            </ol>
          ) : (
            <Response className="grid gap-1 text-[11px] **:text-[11px] [&_li]:my-0 [&_ol]:my-1 [&_p]:my-0 [&_ul]:my-1">
              {children ?? ""}
            </Response>
          )}
        </div>
      </CollapsibleContent>
    );
  }
);

Reasoning.displayName = "Reasoning";
ReasoningTrigger.displayName = "ReasoningTrigger";
ReasoningContent.displayName = "ReasoningContent";
