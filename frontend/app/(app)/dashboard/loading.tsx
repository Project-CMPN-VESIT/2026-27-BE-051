import { Container } from "@/components/ui/layout";
import { ListSkeleton, Skeleton, StatGridSkeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <Container className="py-10 space-y-8">
      <div className="space-y-3">
        <Skeleton className="h-9 w-72" />
        <Skeleton className="h-4 w-full max-w-md" />
      </div>
      <StatGridSkeleton />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <ListSkeleton rows={5} />
        </div>
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    </Container>
  );
}
