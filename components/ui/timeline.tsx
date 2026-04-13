import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ChevronDownIcon } from "lucide-react";
import * as React from "react";

import { cn } from "@/lib/utils";

// ─── TimelineRoot ───────────────────────────────────────────────────────────

function TimelineRoot({
  className,
  ...props
}: React.OlHTMLAttributes<HTMLOListElement>) {
  return <ol className={cn("relative space-y-0", className)} {...props} />;
}

// ─── TimelineItem ───────────────────────────────────────────────────────────

function TimelineItem({
  className,
  ...props
}: React.LiHTMLAttributes<HTMLLIElement>) {
  return (
    <li
      className={cn(
        "relative ml-4 border-border border-l pb-6 pl-6 last:pb-0",
        className
      )}
      {...props}
    />
  );
}

// ─── TimelineDot ────────────────────────────────────────────────────────────

type ActorVariant = "ai_agent" | "human" | "system";

const actorColorMap: Record<ActorVariant, string> = {
  ai_agent: "bg-actor-ai",
  human: "bg-actor-human",
  system: "bg-actor-system",
};

interface TimelineDotProps extends React.HTMLAttributes<HTMLDivElement> {
  actor?: ActorVariant;
}

function TimelineDot({
  className,
  actor = "system",
  ...props
}: TimelineDotProps) {
  return (
    <div
      className={cn(
        "absolute top-1 -left-[5px] h-2.5 w-2.5 rounded-full border-2 border-background",
        actorColorMap[actor] ?? "bg-muted-foreground",
        className
      )}
      {...props}
    />
  );
}

// ─── TimelineContent ────────────────────────────────────────────────────────

function TimelineContent({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("space-y-1", className)} {...props} />;
}

// ─── TimelineTitle ──────────────────────────────────────────────────────────

function TimelineTitle({
  className,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      className={cn("font-medium text-sm leading-tight", className)}
      {...props}
    />
  );
}

// ─── TimelineTime ───────────────────────────────────────────────────────────

interface TimelineTimeProps extends React.HTMLAttributes<HTMLTimeElement> {
  dateTime: string | Date;
}

function TimelineTime({ dateTime, className, ...props }: TimelineTimeProps) {
  const date = typeof dateTime === "string" ? new Date(dateTime) : dateTime;
  const relative = formatDistanceToNow(date, {
    addSuffix: true,
    locale: ptBR,
  });

  return (
    <time
      className={cn("text-muted-foreground text-xs", className)}
      dateTime={date.toISOString()}
      {...props}
    >
      {relative}
    </time>
  );
}

// ─── TimelineDescription ────────────────────────────────────────────────────

function TimelineDescription({
  className,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p className={cn("text-muted-foreground text-xs", className)} {...props} />
  );
}

// ─── TimelineMetadata ───────────────────────────────────────────────────────

interface TimelineMetadataProps {
  data: Record<string, unknown>;
  className?: string;
}

function TimelineMetadata({ data, className }: TimelineMetadataProps) {
  const [open, setOpen] = React.useState(false);
  const keys = Object.keys(data);

  if (keys.length === 0) {
    return null;
  }

  return (
    <div className={cn("mt-1", className)}>
      <button
        className="flex items-center gap-1 text-muted-foreground text-xs transition-colors hover:text-foreground"
        onClick={() => setOpen(!open)}
        type="button"
      >
        <ChevronDownIcon
          className={cn("h-3 w-3 transition-transform", open && "rotate-180")}
        />
        Detalhes ({keys.length})
      </button>
      {open && (
        <pre className="mt-1 max-h-40 overflow-auto rounded bg-muted p-2 font-mono text-[10px] text-muted-foreground">
          {JSON.stringify(data, null, 2)}
        </pre>
      )}
    </div>
  );
}

// ─── Exports ────────────────────────────────────────────────────────────────

export {
  TimelineRoot,
  TimelineItem,
  TimelineDot,
  TimelineContent,
  TimelineTitle,
  TimelineTime,
  TimelineDescription,
  TimelineMetadata,
};
