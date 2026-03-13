import { ChevronDown } from "lucide-react";
import { type Dispatch, memo, type SetStateAction, useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { artifactDefinitions, type UIArtifact } from "./artifact";
import type { ArtifactAction, ArtifactActionContext } from "./create-artifact";
import { Button } from "./ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";

interface ArtifactActionsProps {
  artifact: UIArtifact;
  handleVersionChange: (type: "next" | "prev" | "toggle" | "latest") => void;
  currentVersionIndex: number;
  isCurrentVersion: boolean;
  mode: "edit" | "diff";
  metadata: unknown;
  setMetadata: Dispatch<SetStateAction<unknown>>;
  openDocxPreview?: (documentId: string) => void;
}

/** Agrupa as actions por dropdownGroup, preservando a ordem de aparição. */
function groupActions(
  actions: ArtifactAction<unknown>[]
): Array<
  ArtifactAction<unknown> | { group: string; items: ArtifactAction<unknown>[] }
> {
  const result: Array<
    | ArtifactAction<unknown>
    | { group: string; items: ArtifactAction<unknown>[] }
  > = [];
  const seen = new Map<
    string,
    { group: string; items: ArtifactAction<unknown>[] }
  >();

  for (const action of actions) {
    if (action.dropdownGroup) {
      const existing = seen.get(action.dropdownGroup);
      if (existing) {
        existing.items.push(action);
      } else {
        const entry = { group: action.dropdownGroup, items: [action] };
        seen.set(action.dropdownGroup, entry);
        result.push(entry);
      }
    } else {
      result.push(action);
    }
  }

  return result;
}

function PureArtifactActions({
  artifact,
  handleVersionChange,
  currentVersionIndex,
  isCurrentVersion,
  mode,
  metadata,
  setMetadata,
  openDocxPreview,
}: ArtifactActionsProps) {
  const [isLoading, setIsLoading] = useState(false);

  const artifactDefinition = artifactDefinitions.find(
    (definition) => definition.kind === artifact.kind
  );

  if (!artifactDefinition) {
    throw new Error("Artifact definition not found!");
  }

  const actionContext: ArtifactActionContext = {
    content: artifact.content,
    documentId: artifact.documentId,
    handleVersionChange,
    currentVersionIndex,
    isCurrentVersion,
    mode,
    metadata,
    setMetadata,
    openDocxPreview,
  };

  const rawActions = artifactDefinition.actions as ArtifactAction<unknown>[];
  const grouped = groupActions(rawActions);
  const isStreamingOrLoading = isLoading || artifact.status === "streaming";

  async function runAction(action: ArtifactAction<unknown>) {
    setIsLoading(true);
    try {
      await Promise.resolve(action.onClick(actionContext));
    } catch (_error) {
      toast.error("Falha ao executar a ação");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="flex flex-row gap-1">
      {grouped.map((entry) => {
        // Single action
        if ("onClick" in entry) {
          const action = entry;
          return (
            <Tooltip key={action.description}>
              <TooltipTrigger asChild>
                <Button
                  className={cn("h-fit dark:hover:bg-zinc-700", {
                    "p-2": !action.label,
                    "px-2 py-1.5": action.label,
                  })}
                  disabled={
                    isStreamingOrLoading
                      ? true
                      : (action.isDisabled?.(actionContext) ?? false)
                  }
                  onClick={() => runAction(action)}
                  variant="outline"
                >
                  {action.icon}
                  {action.label}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{action.description}</TooltipContent>
            </Tooltip>
          );
        }

        // Dropdown group
        const { group, items } = entry;
        const trigger = items[0];
        const isGroupDisabled =
          isStreamingOrLoading ||
          (trigger.isDisabled?.(actionContext) ?? false);

        return (
          <DropdownMenu key={group}>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <Button
                    className="h-fit gap-1 px-2 py-1.5 dark:hover:bg-zinc-700"
                    disabled={isGroupDisabled}
                    variant="outline"
                  >
                    {trigger.icon}
                    {trigger.label ?? group}
                    <ChevronDown className="size-3 opacity-70" />
                  </Button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent>{group}</TooltipContent>
            </Tooltip>
            <DropdownMenuContent align="end">
              {items.map((item) => (
                <DropdownMenuItem
                  disabled={
                    isStreamingOrLoading ||
                    (item.isDisabled?.(actionContext) ?? false)
                  }
                  key={item.description}
                  onSelect={() => runAction(item)}
                >
                  <span className="mr-2">{item.icon}</span>
                  {item.label ?? item.description}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        );
      })}
    </div>
  );
}

export const ArtifactActions = memo(
  PureArtifactActions,
  (prevProps, nextProps) => {
    if (prevProps.artifact.status !== nextProps.artifact.status) {
      return false;
    }
    if (prevProps.currentVersionIndex !== nextProps.currentVersionIndex) {
      return false;
    }
    if (prevProps.isCurrentVersion !== nextProps.isCurrentVersion) {
      return false;
    }
    if (prevProps.artifact.content !== nextProps.artifact.content) {
      return false;
    }

    return true;
  }
);
