"use client";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { CheckCircle2, XCircle, ArrowRight, MailWarning } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/primitives";
import { AuthShell } from "@/components/auth/auth-shell";
import { authApi } from "@/lib/api";
import { getErrorMessage } from "@/lib/api/client";

type Status = "loading" | "success" | "error";

const COPY: Record<Status, { title: string; subtitle?: string }> = {
  loading: { title: "Verifying your email", subtitle: "This only takes a moment." },
  success: { title: "Email verified", subtitle: "Your account is fully active." },
  error: { title: "Verification failed", subtitle: "We couldn't verify this link." },
};

function VerifyEmailPageInner() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const [status, setStatus] = useState<Status>("loading");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let active = true;
    authApi
      .verifyEmail(token)
      .then(() => { if (active) setStatus("success"); })
      .catch((err) => {
        if (active) {
          setStatus("error");
          setError(getErrorMessage(err));
        }
      });
    return () => { active = false; };
  }, [token]);

  const visibleStatus: Status = token ? status : "error";
  const visibleError = token ? error : "This link is missing its verification token.";

  return (
    <AuthShell title={COPY[visibleStatus].title} subtitle={COPY[visibleStatus].subtitle}>
      <div className="text-center py-2" role="status" aria-live="polite">
        {visibleStatus === "loading" && (
          <>
            <span className="inline-flex w-12 h-12 rounded-2xl bg-primary/10 items-center justify-center mb-4">
              <Spinner className="w-5 h-5 text-primary" />
            </span>
            <p className="text-sm text-muted-foreground">Checking your verification link…</p>
          </>
        )}

        {visibleStatus === "success" && (
          <>
            <span className="inline-flex w-12 h-12 rounded-2xl bg-background-success items-center justify-center mb-4">
              <CheckCircle2 className="w-5 h-5 text-text-success" />
            </span>
            <p className="text-sm text-muted-foreground leading-relaxed mb-6">
              You can now import projects, list them for sale, and receive payouts.
            </p>
            <div className="space-y-2.5">
              <Button block size="lg" variant="brand" asChild>
                <Link href="/dashboard">Go to dashboard <ArrowRight className="w-4 h-4" /></Link>
              </Button>
              <Button block variant="outline" asChild>
                <Link href="/import">Import your first project</Link>
              </Button>
            </div>
          </>
        )}

        {visibleStatus === "error" && (
          <>
            <span className="inline-flex w-12 h-12 rounded-2xl bg-background-danger items-center justify-center mb-4">
              <XCircle className="w-5 h-5 text-text-danger" />
            </span>
            <p className="text-sm text-muted-foreground leading-relaxed mb-2">{visibleError}</p>
            <p className="text-xs text-muted-foreground mb-6 inline-flex items-center gap-1.5">
              <MailWarning className="w-3.5 h-3.5" />
              Links expire after 24 hours — request a fresh one from settings.
            </p>
            <div className="space-y-2.5">
              <Button block variant="outline" asChild>
                <Link href="/auth/login">Back to sign in</Link>
              </Button>
            </div>
          </>
        )}
      </div>
    </AuthShell>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-[calc(100dvh-4rem)] flex items-center justify-center">
          <Spinner className="w-6 h-6 text-primary" />
        </div>
      }
    >
      <VerifyEmailPageInner />
    </Suspense>
  );
}
