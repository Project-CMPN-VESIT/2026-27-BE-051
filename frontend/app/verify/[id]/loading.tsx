import { Container } from "@/components/ui/layout";
import { LoadingRegion, Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <Container className="py-10 sm:py-14 max-w-4xl">
      <LoadingRegion label="Loading verification report" className="space-y-10">
        <Skeleton className="h-3 w-48" />
        <div className="flex flex-col-reverse sm:flex-row sm:items-start gap-8">
          <div className="flex-1 space-y-3">
            <Skeleton className="h-10 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-4 w-full max-w-xl" />
            <div className="flex gap-2 pt-2">
              <Skeleton className="h-6 w-28 rounded-full" />
              <Skeleton className="h-6 w-32 rounded-full" />
            </div>
          </div>
          <Skeleton className="w-[152px] h-[152px] rounded-full flex-shrink-0 self-center sm:self-start" />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-[5.5rem] rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-72 w-full rounded-xl" />
      </LoadingRegion>
    </Container>
  );
}
