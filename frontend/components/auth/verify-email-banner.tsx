"use client";
import { MailCheck } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Container } from "@/components/ui/layout";
import { useMe } from "@/lib/hooks";

/**
 * Shown across the authenticated area while the signed-in user's email is
 * unconfirmed.
 *
 * Registration issues a session immediately, but when EMAIL_VERIFICATION_REQUIRED
 * is on (the default in production) the account starts unverified and every
 * acting endpoint is behind the verified-user guard. Without this banner that
 * state is invisible: the dashboard loads, and then each panel fails with a 403
 * the user has no way to interpret.
 *
 * Renders nothing in development, where signups are verified on creation.
 */
export function VerifyEmailBanner() {
  const { data: user } = useMe();

  if (!user || user.is_verified) return null;

  return (
    <Container className="pt-6">
      <Alert
        variant="warning"
        icon={<MailCheck className="w-4 h-4" />}
        title="Confirm your email to finish setting up"
        description={
          <>
            We sent a confirmation link to{" "}
            <span className="font-medium">{user.email}</span>. Until you open it,
            importing repos, listing projects, buying and payouts stay locked.
            Check your spam folder if it hasn&apos;t arrived.
          </>
        }
      />
    </Container>
  );
}
