import { Container } from "@/components/ui/layout";
import { ProjectDetailSkeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <Container className="py-10">
      <ProjectDetailSkeleton />
    </Container>
  );
}
