"use client";
import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/primitives";
import { AuthShell } from "@/components/auth/auth-shell";
import { authApi } from "@/lib/api";
import { useAuthStore } from "@/stores/auth";

/**
 * Landing point after GitHub/Google sign-in.
 *
 * The API has already set an httpOnly refresh cookie and redirected here without
 * putting a token in the URL — so this page trades that cookie for an access
 * token via /auth/refresh. Keeping the token out of the query string keeps it out
 * of browser history, the Referer header and any proxy logs.
 */
function CallbackHandler() {
  const router = useRouter();
  const params = useSearchParams();
  const setTokens = useAuthStore((s) => s.setTokens);
  const [failed, setFailed] = useState(false);
  // React 18 StrictMode mounts effects twice in development; refresh tokens
  // rotate on use, so a second call would consume the rotated token and trip the
  // reuse guard.
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const isNewUser = params.get("new") === "1";

    authApi
      .refresh()
      .then((data) => {
        setTokens(data.access_token);
        router.replace(isNewUser ? "/settings?welcome=1" : "/dashboard");
      })
      .catch(() => setFailed(true));
  }, [params, router, setTokens]);

  if (failed) {
    return (
      <AuthShell
        title="Sign-in didn't complete"
        subtitle="We couldn't finish setting up your session."
      >
        <div className="space-y-4">
          <div
            role="alert"
            className="rounded-xl border border-destructive/30 bg-destructive/8 px-4 py-3 flex items-start gap-3"
          >
            <AlertCircle className="w-4 h-4 text-destructive flex-shrink-0 mt-0.5" />
            <p className="text-sm text-destructive leading-relaxed">
              Your sign-in was authorised but the session couldn&apos;t be
              established. This usually clears on a second attempt.
            </p>
          </div>
          <Button block asChild>
            <Link href="/auth/login">Back to sign in</Link>
          </Button>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Signing you in" subtitle="One moment while we finish up.">
      <div className="flex justify-center py-6" role="status" aria-live="polite">
        <Spinner />
        <span className="sr-only">Completing sign-in</span>
      </div>
    </AuthShell>
  );
}

export default function OAuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <AuthShell title="Signing you in" subtitle="One moment while we finish up.">
          <div className="flex justify-center py-6">
            <Spinner />
          </div>
        </AuthShell>
      }
    >
      <CallbackHandler />
    </Suspense>
  );
}
