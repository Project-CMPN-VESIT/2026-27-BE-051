"use client";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Mail, Lock, ShieldCheck } from "lucide-react";
import { GithubIcon } from "@/components/shared/icons";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/primitives";
import { AuthShell, AuthDivider, AuthError, GoogleIcon } from "@/components/auth/auth-shell";
import { authApi } from "@/lib/api";
import { useAuthStore } from "@/stores/auth";
import { safeNextPath } from "@/components/auth/require-auth";
import { getErrorMessage } from "@/lib/api/client";
import { useSlowRequest } from "@/lib/hooks";
import { emailSchema } from "@/lib/validation";

const schema = z.object({
  email: emailSchema,
  // No strength rules on sign-in — the stored password may predate any policy
  // change, and hinting at rules here would only leak them.
  password: z.string().min(1, "Password required"),
  totp_code: z.string().optional(),
});
type FormData = z.infer<typeof schema>;

/** Messages for ?error= values set by the OAuth callback routes. */
const OAUTH_ERRORS: Record<string, string> = {
  github_cancelled: "GitHub sign-in was cancelled.",
  github_no_code: "GitHub didn't return an authorisation code. Please try again.",
  github_failed: "We couldn't complete GitHub sign-in. Please try again.",
  google_cancelled: "Google sign-in was cancelled.",
  google_no_code: "Google didn't return an authorisation code. Please try again.",
  google_no_email: "Your Google account didn't share an email address, which we need to create your account.",
  google_failed: "We couldn't complete Google sign-in. Please try again.",
};

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { setTokens } = useAuthStore();
  const [serverError, setServerError] = useState<string | null>(null);
  const [needs2FA, setNeeds2FA] = useState(false);

  // Derived, not stored in state: the OAuth outcome is fixed by the URL, so an
  // effect that copied it into state would only cause an extra render.
  const oauthCode = params.get("error");
  const oauthError = oauthCode
    ? OAUTH_ERRORS[oauthCode] ?? "Sign-in failed. Please try again."
    : null;
  // A submit error is newer information, so it takes precedence.
  const shownError = serverError ?? oauthError;

  const { register, handleSubmit, formState: { errors, isSubmitting } } =
    useForm<FormData>({ resolver: zodResolver(schema) });
  const waking = useSlowRequest(isSubmitting);

  const onSubmit = async (data: FormData) => {
    setServerError(null);
    try {
      const res = await authApi.login(data);
      setTokens(res.access_token);
      // Return the user to whatever they were trying to reach. Validated against
      // open redirects — `next` comes straight from the URL.
      router.push(safeNextPath(params.get("next"), "/dashboard"));
    } catch (err: unknown) {
      const msg = getErrorMessage(err);
      if (msg.toLowerCase().includes("2fa") || msg.toLowerCase().includes("totp")) {
        setNeeds2FA(true);
      }
      setServerError(msg);
    }
  };

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in to your CodeBazaar account"
      highlights={["Verified builds", "Escrow-free payouts", "GitHub-native"]}
      footer={
        <>
          Don&apos;t have an account?{" "}
          <Link href="/auth/register" className="text-primary hover:underline font-medium">
            Create one
          </Link>
        </>
      }
    >
      <div className="space-y-2.5">
        <Button variant="outline" block asChild>
          <a href={authApi.githubOAuthUrl()}>
            <GithubIcon className="w-4 h-4" /> Continue with GitHub
          </a>
        </Button>
        <Button variant="outline" block asChild>
          <a href={`${process.env.NEXT_PUBLIC_API_URL}/auth/google`}>
            <GoogleIcon className="w-4 h-4" /> Continue with Google
          </a>
        </Button>
      </div>

      <AuthDivider label="or sign in with email" />

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            placeholder="you@example.com"
            icon={<Mail />}
            error={errors.email?.message}
            autoComplete="email"
            {...register("email")}
          />
        </div>

        <div className="space-y-1.5">
          <Label
            htmlFor="password"
            className="w-full"
          >
            Password
          </Label>
          <Input
            id="password"
            type="password"
            placeholder="Your password"
            icon={<Lock />}
            error={errors.password?.message}
            autoComplete="current-password"
            {...register("password")}
          />
          <div className="flex justify-end pt-0.5">
            <Link href="/auth/reset-password" className="text-xs text-primary hover:underline">
              Forgot password?
            </Link>
          </div>
        </div>

        {needs2FA && (
          <div className="space-y-1.5 rounded-xl border bg-surface p-3.5 animate-fade-in">
            <Label htmlFor="totp_code" hint="From your authenticator app">
              <span className="inline-flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-primary" /> Two-factor code
              </span>
            </Label>
            <Input
              id="totp_code"
              placeholder="123456"
              maxLength={6}
              inputMode="numeric"
              className="tracking-[0.4em] font-mono text-center"
              error={errors.totp_code?.message}
              {...register("totp_code")}
            />
          </div>
        )}

        {shownError && <AuthError message={shownError} />}

        <Button type="submit" block size="lg" loading={isSubmitting} loadingText="Signing in…">
          Sign in
        </Button>

        {waking && (
          <p
            role="status"
            className="text-center text-xs text-muted-foreground leading-relaxed"
          >
            Still working — the server may be waking up from idle. This can take
            up to a minute on the first request.
          </p>
        )}
      </form>
    </AuthShell>
  );
}

// useSearchParams() requires a Suspense boundary for this route to stay
// statically prerendered.
export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <AuthShell
          title="Welcome back"
          subtitle="Sign in to your CodeBazaar account"
          highlights={["Verified builds", "Escrow-free payouts", "GitHub-native"]}
        >
          <div className="h-64" />
        </AuthShell>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
