import { Container } from "@/components/ui/layout";
import { Skeleton, StatGridSkeleton, TableSkeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <Container className="py-10 space-y-8">
      <div className="space-y-3">
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-4 w-full max-w-lg" />
      </div>
      <StatGridSkeleton count={3} />
      <TableSkeleton rows={6} cols={4} />
    </Container>
  );
}
