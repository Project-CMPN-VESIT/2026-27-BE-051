import { Suspense } from "react";
import { RequireAuth } from "@/components/auth/require-auth";
import { VerifyEmailBanner } from "@/components/auth/verify-email-banner";

/**
 * Layout for the authenticated area.
 *
 * Every route in this group requires a session. Gating here rather than in each
 * page means a new page cannot be added and accidentally left public, which is
 * how the previous per-page guards drifted.
 *
 * RequireAuth reads useSearchParams, so it needs a Suspense boundary to keep
 * these routes prerenderable.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={null}>
      <RequireAuth>
        <VerifyEmailBanner />
        {children}
      </RequireAuth>
    </Suspense>
  );
}
