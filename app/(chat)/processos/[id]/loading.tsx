import { Skeleton } from "@/components/ui/skeleton";

export default function ProcessoDetailLoading() {
  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center gap-3">
        <Skeleton className="size-9 rounded-md" />
        <div className="flex flex-col gap-1.5">
          <Skeleton className="h-6 w-64" />
          <Skeleton className="h-4 w-40" />
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            className="rounded-lg border border-border/60 bg-muted/20 p-4"
            // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton list
            key={i}
          >
            <Skeleton className="mb-3 h-4 w-24" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="mt-1.5 h-3 w-3/4" />
          </div>
        ))}
      </div>
      <div className="rounded-lg border border-border/60 bg-muted/20 p-4">
        <Skeleton className="mb-3 h-5 w-32" />
        <div className="grid gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              className="flex items-center justify-between"
              // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton list
              key={i}
            >
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-6 w-20 rounded-full" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
