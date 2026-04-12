import { Skeleton } from "@/components/ui/skeleton";

export default function ProcessosLoading() {
  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-9 w-36" />
      </div>
      <div className="flex gap-2">
        <Skeleton className="h-9 w-28" />
        <Skeleton className="h-9 w-28" />
      </div>
      <div className="grid gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/20 p-4"
            // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton list
            key={i}
          >
            <div className="flex flex-col gap-2">
              <Skeleton className="h-4 w-56" />
              <Skeleton className="h-3 w-80" />
            </div>
            <div className="flex gap-2">
              <Skeleton className="h-6 w-20 rounded-full" />
              <Skeleton className="size-8" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
