import { Container } from "@/components/ui/layout";
import { Skeleton, TableSkeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <Container className="py-10 space-y-8">
      <div className="space-y-3">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-4 w-full max-w-lg" />
      </div>
      <TableSkeleton rows={10} cols={5} />
    </Container>
  );
}
