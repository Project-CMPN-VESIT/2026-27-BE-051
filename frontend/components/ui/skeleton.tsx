import { cn } from "@/lib/utils";

function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("skeleton", className)} aria-hidden="true" {...props} />;
}

/** Wrapper that announces loading state to screen readers. */
export function LoadingRegion({
  label = "Loading", className, children,
}: { label?: string; className?: string; children: React.ReactNode }) {
  return (
    <div role="status" aria-label={label} aria-live="polite" className={className}>
      {children}
      <span className="sr-only">{label}…</span>
    </div>
  );
}

export function ProjectCardSkeleton() {
  return (
    <div className="rounded-xl border bg-card p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-2 flex-1">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
        </div>
        <Skeleton className="h-6 w-14 rounded-full" />
      </div>
      <div className="space-y-2">
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-5/6" />
      </div>
      <div className="flex gap-1.5">
        <Skeleton className="h-5 w-14 rounded-full" />
        <Skeleton className="h-5 w-16 rounded-full" />
      </div>
      <div className="flex items-center gap-3 pt-1 border-t">
        <Skeleton className="h-3 w-12" />
        <Skeleton className="h-3 w-12" />
        <Skeleton className="h-3 w-16 ml-auto" />
      </div>
    </div>
  );
}

export function ProjectGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <LoadingRegion label="Loading projects">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: count }).map((_, i) => (
          <ProjectCardSkeleton key={i} />
        ))}
      </div>
    </LoadingRegion>
  );
}

export function ProjectDetailSkeleton() {
  return (
    <LoadingRegion label="Loading project" className="space-y-6 max-w-4xl mx-auto">
      <div className="space-y-3">
        <Skeleton className="h-9 w-2/3" />
        <Skeleton className="h-4 w-1/3" />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-20 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-48 w-full rounded-xl" />
      <Skeleton className="h-64 w-full rounded-xl" />
    </LoadingRegion>
  );
}

export function ProfileSkeleton() {
  return (
    <div className="flex items-center gap-3">
      <Skeleton className="h-10 w-10 rounded-full" />
      <div className="space-y-1.5">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-3 w-20" />
      </div>
    </div>
  );
}

export function StatGridSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className="h-[5.5rem] rounded-xl" />
      ))}
    </div>
  );
}

export function ListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <LoadingRegion label="Loading" className="rounded-xl border bg-card divide-y">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="p-4 flex items-center gap-3">
          <Skeleton className="h-9 w-9 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-1/3" />
            <Skeleton className="h-3 w-1/2" />
          </div>
          <Skeleton className="h-7 w-16 rounded-md" />
        </div>
      ))}
    </LoadingRegion>
  );
}

export function TableSkeleton({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <LoadingRegion label="Loading table" className="rounded-xl border bg-card overflow-hidden">
      <div className="border-b bg-surface px-4 py-3 flex gap-4">
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} className="h-3 flex-1" />
        ))}
      </div>
      <div className="divide-y">
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className="px-4 py-3.5 flex gap-4">
            {Array.from({ length: cols }).map((_, c) => (
              <Skeleton key={c} className="h-3.5 flex-1" />
            ))}
          </div>
        ))}
      </div>
    </LoadingRegion>
  );
}

export { Skeleton };
