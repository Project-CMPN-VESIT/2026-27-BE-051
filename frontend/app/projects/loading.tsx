import { Container } from "@/components/ui/layout";
import { ProjectGridSkeleton } from "@/components/ui/skeleton";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <Container className="py-10 space-y-8">
      <div className="space-y-3">
        <Skeleton className="h-9 w-72" />
        <Skeleton className="h-4 w-full max-w-xl" />
      </div>
      <Skeleton className="h-11 w-full rounded-xl" />
      <ProjectGridSkeleton count={9} />
    </Container>
  );
}
