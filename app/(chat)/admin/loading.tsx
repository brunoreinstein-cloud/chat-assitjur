import { Skeleton } from "@/components/ui/skeleton";

export default function AdminLoading() {
  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-9 w-32" />
      </div>
      <div className="grid gap-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/20 p-4"
            // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton list
            key={i}
          >
            <div className="flex flex-col gap-2">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-64" />
            </div>
            <div className="flex gap-2">
              <Skeleton className="h-8 w-16" />
              <Skeleton className="size-8" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
