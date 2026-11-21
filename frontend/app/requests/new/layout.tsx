import { Suspense } from "react";
import { RequireAuth } from "@/components/auth/require-auth";

/**
 * Posting a build request is transactional, but it lives under the public
 * /requests browse path — so it is gated here rather than by a route group.
 */
export default function NewRequestLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={null}>
      <RequireAuth>{children}</RequireAuth>
    </Suspense>
  );
}
