import { Container } from "@/components/ui/layout";
import { LoadingRegion, Skeleton, StatGridSkeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <Container className="py-10">
      <LoadingRegion label="Loading builder profile" className="space-y-8 max-w-4xl mx-auto">
        <div className="flex items-center gap-4">
          <Skeleton className="h-20 w-20 rounded-full flex-shrink-0" />
          <div className="space-y-2.5 flex-1">
            <Skeleton className="h-7 w-52" />
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-3 w-64" />
          </div>
        </div>
        <StatGridSkeleton />
        <Skeleton className="h-40 w-full rounded-xl" />
        <Skeleton className="h-56 w-full rounded-xl" />
      </LoadingRegion>
    </Container>
  );
}
