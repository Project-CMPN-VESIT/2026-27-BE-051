"use client";
import { Suspense, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import Link from "next/link";
import { CheckCircle2, Mail, Lock, MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label, Spinner } from "@/components/ui/primitives";
import { AuthShell, AuthError } from "@/components/auth/auth-shell";
import { authApi } from "@/lib/api";
import { getErrorMessage } from "@/lib/api/client";
import { emailSchema, passwordSchema } from "@/lib/validation";

const requestSchema = z.object({ email: emailSchema });
const resetSchema = z.object({ new_password: passwordSchema });

function RequestResetForm() {
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, getValues, formState: { errors, isSubmitting } } =
    useForm<{ email: string }>({ resolver: zodResolver(requestSchema) });

  const onSubmit = async (data: { email: string }) => {
    setError(null);
    try {
      await authApi.forgotPassword(data.email);
      setSent(true);
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  if (sent) {
    return (
      <div className="text-center py-2">
        <span className="inline-flex w-12 h-12 rounded-2xl bg-background-success items-center justify-center mb-4">
          <MailCheck className="w-5 h-5 text-text-success" />
        </span>
        <h2 className="font-semibold text-lg">Check your email</h2>
        <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
          If an account exists for{" "}
          <span className="font-medium text-foreground break-all">{getValues("email")}</span>,
          we&apos;ve sent a password reset link. It expires in 1 hour.
        </p>
        <Button variant="outline" block className="mt-6" asChild>
          <Link href="/auth/login">Back to sign in</Link>
        </Button>
      </div>
    );
  }

  return (
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
      {error && <AuthError message={error} />}
      <Button type="submit" block size="lg" loading={isSubmitting} loadingText="Sending…">
        Send reset link
      </Button>
    </form>
  );
}

function ResetForm({ token }: { token: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, formState: { errors, isSubmitting } } =
    useForm<{ new_password: string }>({ resolver: zodResolver(resetSchema) });

  const onSubmit = async (data: { new_password: string }) => {
    setError(null);
    try {
      await authApi.resetPassword(token, data.new_password);
      router.push("/auth/login?reset=success");
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <div className="space-y-1.5">
        <Label htmlFor="new_password" hint="8+ chars, incl. a letter and a number">New password</Label>
        <Input
          id="new_password"
          type="password"
          placeholder="Create a new password"
          icon={<Lock />}
          error={errors.new_password?.message}
          autoComplete="new-password"
          {...register("new_password")}
        />
      </div>
      {error && <AuthError message={error} />}
      <Button type="submit" block size="lg" loading={isSubmitting} loadingText="Updating…">
        <CheckCircle2 className="w-4 h-4" /> Reset password
      </Button>
    </form>
  );
}

function ResetPasswordPageInner() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  return (
    <AuthShell
      title={token ? "Set a new password" : "Reset your password"}
      subtitle={
        token
          ? "Choose a strong password you haven't used before."
          : "Enter your email and we'll send you a reset link."
      }
      footer={
        <Link href="/auth/login" className="text-primary hover:underline font-medium">
          Back to sign in
        </Link>
      }
    >
      {token ? <ResetForm token={token} /> : <RequestResetForm />}
    </AuthShell>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-[calc(100dvh-4rem)] flex items-center justify-center">
          <Spinner className="w-6 h-6 text-primary" />
        </div>
      }
    >
      <ResetPasswordPageInner />
    </Suspense>
  );
}
