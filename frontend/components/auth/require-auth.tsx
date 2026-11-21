"use client";
import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Container } from "@/components/ui/layout";
import { LoadingRegion, Skeleton } from "@/components/ui/skeleton";
import { useAuthStore } from "@/stores/auth";

/**
 * Only allow `next` targets that stay on this origin.
 *
 * A raw `?next=` value is attacker-controlled, so anything protocol-relative
 * ("//evil.com") or absolute would turn our own login page into an open redirect.
 * Only same-origin absolute paths are accepted.
 */
export function safeNextPath(raw: string | null | undefined, fallback = "/dashboard"): string {
  if (!raw) return fallback;
  if (!raw.startsWith("/")) return fallback;
  // "//host" and "/\host" are both treated as protocol-relative by browsers.
  if (raw.startsWith("//") || raw.startsWith("/\\")) return fallback;
  return raw;
}

/** Build the login URL that will return the user to where they were headed. */
export function loginHref(intendedPath: string): string {
  return `/auth/login?next=${encodeURIComponent(intendedPath)}`;
}

function GateSkeleton() {
  return (
    <Container className="py-10">
      <LoadingRegion label="Checking your session" className="space-y-6">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-4 w-full max-w-md" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-[5.5rem] rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-64 w-full rounded-xl" />
      </LoadingRegion>
    </Container>
  );
}

/**
 * Gate for authenticated routes.
 *
 * Two things this does that the previous per-page `if (!token) return null`
 * pattern did not:
 *
 *   1. It renders a skeleton instead of a blank screen while redirecting, so a
 *      signed-out visitor never sees an empty page flash.
 *   2. It records where the user was going, so after signing in they land on the
 *      page they asked for rather than being dumped on the dashboard.
 */
export function RequireAuth({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((s) => s.accessToken);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // The persisted token is read from localStorage after mount, so on the very
  // first client render it is always null. Redirecting during that render would
  // bounce signed-in users out of their own dashboard.
  const hydrated = React.useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  React.useEffect(() => {
    if (!hydrated || token) return;
    const query = searchParams.toString();
    const intended = query ? `${pathname}?${query}` : pathname;
    router.replace(loginHref(intended));
  }, [hydrated, token, pathname, searchParams, router]);

  if (!hydrated || !token) return <GateSkeleton />;
  return <>{children}</>;
}

/**
 * Wrapper for a gated action inside an otherwise public page.
 *
 * Renders `children` when signed in, and a prompt that preserves the intended
 * destination otherwise — so "Buy this project" sends a signed-out visitor to
 * login and then straight back to checkout.
 */
export function useAuthGate() {
  const token = useAuthStore((s) => s.accessToken);
  const router = useRouter();
  const pathname = usePathname();

  /**
   * Returns true when the caller may proceed. When not signed in, redirects to
   * login and returns false, so a handler can early-out on a falsy result.
   */
  const requireAuth = React.useCallback(
    (intendedPath?: string) => {
      if (token) return true;
      router.push(loginHref(intendedPath ?? pathname));
      return false;
    },
    [token, router, pathname]
  );

  return { isAuthenticated: !!token, requireAuth };
}
