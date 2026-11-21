"use client";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Code2, ShoppingBag, Rocket, Mail, Lock, User, Gift } from "lucide-react";
import { cn } from "@/lib/utils";
import { GithubIcon } from "@/components/shared/icons";
import { Button } from "@/components/ui/button";
import { Input, Label, Badge } from "@/components/ui/primitives";
import { AuthShell, AuthDivider, AuthError, GoogleIcon } from "@/components/auth/auth-shell";
import { authApi } from "@/lib/api";
import { useAuthStore } from "@/stores/auth";
import { getErrorMessage, isConflictError } from "@/lib/api/client";
import { useSlowRequest } from "@/lib/hooks";
import {
  applyServerFieldErrors,
  conflictFieldFor,
  displayNameSchema,
  emailSchema,
  passwordSchema,
} from "@/lib/validation";

const schema = z.object({
  display_name: displayNameSchema,
  email: emailSchema,
  password: passwordSchema,
});
type FormData = z.infer<typeof schema>;
const FIELDS = ["display_name", "email", "password"] as const;

const INTENTS = [
  {
    key: "builder" as const,
    label: "Sell",
    icon: Code2,
    blurb: "I build and sell software — get verified, list projects, take paid build requests.",
  },
  {
    key: "founder" as const,
    label: "Buy",
    icon: ShoppingBag,
    blurb: "I buy projects or commission builds from verified student builders.",
  },
  {
    key: "incubator" as const,
    label: "Fund",
    icon: Rocket,
    blurb: "I mentor, fund or acquire promising early-stage projects.",
  },
];

/** Lightweight strength meter — guidance, not gatekeeping. */
function PasswordStrength({ value }: { value: string }) {
  if (!value) return null;
  let score = 0;
  if (value.length >= 8) score++;
  if (value.length >= 12) score++;
  if (/[A-Z]/.test(value) && /[a-z]/.test(value)) score++;
  if (/\d/.test(value) || /[^\w\s]/.test(value)) score++;

  const meta = [
    { label: "Too short", tone: "bg-score-low" },
    { label: "Weak", tone: "bg-score-low" },
    { label: "Fair", tone: "bg-score-mid" },
    { label: "Good", tone: "bg-score-mid" },
    { label: "Strong", tone: "bg-score-high" },
  ][score];

  return (
    <div className="flex items-center gap-2 pt-1">
      <div className="flex gap-1 flex-1" aria-hidden="true">
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            className={cn(
              "h-1 flex-1 rounded-full transition-colors",
              i < score ? meta.tone : "bg-secondary"
            )}
          />
        ))}
      </div>
      <span className="text-[11px] text-muted-foreground">{meta.label}</span>
    </div>
  );
}

export default function RegisterPage() {
  const router = useRouter();
  const { setTokens } = useAuthStore();
  const [serverError, setServerError] = useState<string | null>(null);
  const [referralCode, setReferralCode] = useState<string | undefined>();
  const [intent, setIntent] = useState<"builder" | "founder" | "incubator">("builder");

  // Capture ?ref=CODE from the invite link (client-only to keep this route static).
  useEffect(() => {
    const ref = new URLSearchParams(window.location.search).get("ref");
    if (ref) setReferralCode(ref);
  }, []);

  const { register, handleSubmit, watch, setError, formState: { errors, isSubmitting } } =
    useForm<FormData>({ resolver: zodResolver(schema), mode: "onBlur" });

  const password = watch("password") ?? "";
  const waking = useSlowRequest(isSubmitting);

  const onSubmit = async (data: FormData) => {
    setServerError(null);
    try {
      const res = await authApi.register({ ...data, referral_code: referralCode, role: intent });
      setTokens(res.access_token);
      router.push("/dashboard");
    } catch (err) {
      // "An account with this email already exists" belongs under the email
      // input, not in a detached banner at the bottom of the form.
      if (isConflictError(err)) {
        const message = getErrorMessage(err);
        const field = conflictFieldFor(message);
        if (field === "email") {
          setError("email", { type: "server", message });
          return;
        }
        setServerError(message);
        return;
      }
      setServerError(applyServerFieldErrors<FormData>(err, setError, FIELDS));
    }
  };

  return (
    <AuthShell
      width="md"
      title="Create your account"
      subtitle="Free to join. List projects, get verified, start earning."
      notice={
        referralCode ? (
          <Badge variant="success" className="gap-1.5">
            <Gift className="w-3 h-3" /> You were invited — welcome!
          </Badge>
        ) : undefined
      }
      footer={
        <>
          Already have an account?{" "}
          <Link href="/auth/login" className="text-primary hover:underline font-medium">
            Sign in
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

      <AuthDivider label="or continue with email" />

      {/* Intent selector */}
      <fieldset className="mb-5">
        <legend className="text-sm font-medium text-foreground/90 mb-2.5">I&apos;m here to…</legend>
        <div className="grid grid-cols-3 gap-2">
          {INTENTS.map(({ key, label, icon: Icon }) => {
            const active = intent === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setIntent(key)}
                aria-pressed={active}
                className={cn(
                  "flex flex-col items-center gap-1.5 rounded-xl border p-3 text-xs font-medium transition-all",
                  "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20",
                  active
                    ? "border-primary bg-primary/8 text-primary shadow-xs"
                    : "text-muted-foreground hover:border-border-strong hover:text-foreground"
                )}
              >
                <Icon className="w-4 h-4" />
                {label}
              </button>
            );
          })}
        </div>
        <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
          {INTENTS.find((i) => i.key === intent)?.blurb}
        </p>
      </fieldset>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <div className="space-y-1.5">
          <Label htmlFor="display_name">Full name</Label>
          <Input
            id="display_name"
            placeholder="Your name"
            icon={<User />}
            error={errors.display_name?.message}
            autoComplete="name"
            {...register("display_name")}
          />
        </div>

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
          <Label htmlFor="password" hint="8+ chars, incl. a letter and a number">Password</Label>
          <Input
            id="password"
            type="password"
            placeholder="Create a password"
            icon={<Lock />}
            error={errors.password?.message}
            autoComplete="new-password"
            {...register("password")}
          />
          <PasswordStrength value={password} />
        </div>

        {serverError && <AuthError message={serverError} />}

        <Button type="submit" block size="lg" loading={isSubmitting} loadingText="Creating account…">
          Create account
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

        <p className="text-center text-xs text-muted-foreground leading-relaxed">
          By creating an account you agree to our{" "}
          <Link href="/terms" className="underline hover:text-foreground">Terms</Link> and{" "}
          <Link href="/privacy" className="underline hover:text-foreground">Privacy Policy</Link>.
        </p>
      </form>
    </AuthShell>
  );
}
