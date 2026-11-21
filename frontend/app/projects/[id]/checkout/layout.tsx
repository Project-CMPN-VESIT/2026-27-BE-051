import { Suspense } from "react";
import { RequireAuth } from "@/components/auth/require-auth";

/**
 * Checkout sits under the public project page. Gating in a layout means a
 * signed-out visitor who clicks "Buy" is sent to login and returned here
 * afterwards, rather than landing on a blank screen or the dashboard.
 */
export default function CheckoutLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={null}>
      <RequireAuth>{children}</RequireAuth>
    </Suspense>
  );
}
