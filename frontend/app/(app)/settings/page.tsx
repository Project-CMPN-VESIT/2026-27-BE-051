"use client";
import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Shield, CreditCard, User as UserIcon, ShieldCheck, Wrench, Repeat, Code2, ShoppingBag, Rocket, Check, Wallet, ShieldCheck as ShieldCheckIcon } from "lucide-react";
import { GithubIcon } from "@/components/shared/icons";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea, Badge } from "@/components/ui/primitives";
import { Skeleton } from "@/components/ui/skeleton";
import { useMe, useUpdateProfile, usePaymentHistory, useUpdateMyRole } from "@/lib/hooks";
import { cn } from "@/lib/utils";
import { UserSkillsManager } from "@/components/skills/skills-manager";
import { authApi, usersApi } from "@/lib/api";
import { getErrorMessage } from "@/lib/api/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { PayoutDetailInput } from "@/types";

const profileSchema = z.object({
  display_name: z.string().min(1).max(120),
  bio: z.string().max(500).optional(),
  location: z.string().max(120).optional(),
  college: z.string().max(200).optional(),
  graduation_year: z.number().min(1990).max(2035).optional(),
  linkedin_url: z.string().url().or(z.literal("")).optional(),
  website_url: z.string().url().or(z.literal("")).optional(),
});
type ProfileForm = z.infer<typeof profileSchema>;

function ProfileSection() {
  const { data: user, isLoading } = useMe();
  const { mutateAsync, isPending } = useUpdateProfile();
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { register, handleSubmit, formState: { errors } } = useForm<ProfileForm>({
    resolver: zodResolver(profileSchema),
    values: user?.profile ? {
      display_name: user.profile.display_name,
      bio: user.profile.bio ?? "",
      location: user.profile.location ?? "",
      college: user.profile.college ?? "",
      graduation_year: user.profile.graduation_year ?? undefined,
      linkedin_url: user.profile.linkedin_url ?? "",
      website_url: user.profile.website_url ?? "",
    } : undefined,
  });

  if (isLoading) return <Skeleton className="h-96 w-full rounded-lg" />;

  const onSubmit = async (data: ProfileForm) => {
    setError(null);
    setSuccess(false);
    try {
      await mutateAsync(data);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="rounded-xl border bg-card p-5 space-y-4">
      <div className="flex items-center gap-3 pb-3 border-b">
        <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-lg font-semibold text-primary">
          {user?.profile?.display_name?.[0]?.toUpperCase() ?? "U"}
        </div>
        <div>
          <p className="font-medium text-sm">{user?.email}</p>
          <div className="flex items-center gap-2 mt-0.5">
            <Badge variant="outline" className="text-[10px] capitalize">{user?.role}</Badge>
            {user?.profile?.github_username && (
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <GithubIcon className="w-3 h-3" /> {user.profile.github_username}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5 sm:col-span-2">
          <Label>Display name</Label>
          <Input error={errors.display_name?.message} {...register("display_name")} />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label>Bio</Label>
          <Textarea rows={3} error={errors.bio?.message} {...register("bio")} />
        </div>
        <div className="space-y-1.5">
          <Label>Location</Label>
          <Input placeholder="Mumbai, India" error={errors.location?.message} {...register("location")} />
        </div>
        <div className="space-y-1.5">
          <Label>College</Label>
          <Input placeholder="VESIT Mumbai" error={errors.college?.message} {...register("college")} />
        </div>
        <div className="space-y-1.5">
          <Label>Graduation year</Label>
          <Input type="number" error={errors.graduation_year?.message} {...register("graduation_year", { valueAsNumber: true })} />
        </div>
        <div className="space-y-1.5">
          <Label>LinkedIn</Label>
          <Input placeholder="https://linkedin.com/in/…" error={errors.linkedin_url?.message} {...register("linkedin_url")} />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label>Website</Label>
          <Input placeholder="https://…" error={errors.website_url?.message} {...register("website_url")} />
        </div>
      </div>

      {error && <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-md">{error}</p>}
      {success && <p className="text-sm text-text-success bg-background-success px-3 py-2 rounded-md">Profile updated.</p>}

      <Button type="submit" loading={isPending}>Save profile</Button>
    </form>
  );
}

function SecuritySection() {
  const { data: user } = useMe();
  const [setup, setSetup] = useState<{ secret: string; qr_code_url: string } | null>(null);
  const [code, setCode] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const startSetup = async () => {
    setLoading(true);
    try {
      const data = await authApi.setup2fa();
      setSetup(data);
    } catch (err) {
      setStatus(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const verify = async () => {
    setLoading(true);
    try {
      await authApi.verify2fa(code);
      setStatus("2FA enabled successfully!");
      setSetup(null);
    } catch (err) {
      setStatus(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-xl border bg-card p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-medium text-sm flex items-center gap-2">
            <Shield className="w-4 h-4 text-primary" /> Two-Factor Authentication
          </h3>
          <p className="text-sm text-muted-foreground mt-0.5">
            {user?.totp_enabled ? "2FA is enabled on your account." : "Add an extra layer of security with TOTP."}
          </p>
        </div>
        {user?.totp_enabled && <ShieldCheck className="w-5 h-5 text-text-success" />}
      </div>

      {!user?.totp_enabled && !setup && (
        <Button variant="outline" size="sm" onClick={startSetup} loading={loading}>
          Set up 2FA
        </Button>
      )}

      {setup && (
        <div className="space-y-3 pt-2 border-t">
          <img src={setup.qr_code_url} alt="2FA QR Code" className="w-40 h-40 rounded-xl border" />
          <p className="text-xs text-muted-foreground">
            Scan with Google Authenticator or Authy, then enter the 6-digit code.
          </p>
          <div className="flex gap-2">
            <Input placeholder="123456" maxLength={6} value={code} onChange={(e) => setCode(e.target.value)} className="w-32" />
            <Button size="sm" onClick={verify} loading={loading} disabled={code.length !== 6}>Verify & Enable</Button>
          </div>
        </div>
      )}

      {status && <p className="text-sm text-muted-foreground">{status}</p>}
    </div>
  );
}

function PaymentsSection() {
  const { data: payments, isLoading } = usePaymentHistory();

  const TYPE_LABELS: Record<string, string> = {
    premium_listing: "Premium Listing",
    ai_audit: "AI Audit",
    startup_report: "Startup Report",
    featured_placement: "Featured Placement",
    project_access: "Project Purchase",
    pitch_deck: "AI Pitch Deck",
    recruiter_pro: "Recruiter Pro",
    incubator_pro: "Incubator Pro",
  };

  return (
    <div className="rounded-xl border bg-card p-5 space-y-3">
      <h3 className="font-medium text-sm flex items-center gap-2">
        <CreditCard className="w-4 h-4 text-primary" /> Payment History
      </h3>
      {isLoading ? (
        <Skeleton className="h-20 w-full" />
      ) : !payments?.length ? (
        <p className="text-sm text-muted-foreground">No payments yet.</p>
      ) : (
        <div className="space-y-2">
          {payments.map((p) => (
            <div key={p.id} className="flex items-center justify-between text-sm py-2 border-b last:border-0">
              <div>
                <p className="font-medium">{TYPE_LABELS[p.payment_type] ?? p.payment_type}</p>
                <p className="text-xs text-muted-foreground">{new Date(p.created_at).toLocaleDateString()}</p>
              </div>
              <div className="text-right">
                <p className="font-medium">₹{(p.amount_paise / 100).toFixed(2)}</p>
                <Badge variant={p.status === "paid" ? "success" : p.status === "failed" ? "destructive" : "ghost"} className="text-[10px]">
                  {p.status}
                </Badge>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const MODES = [
  {
    key: "builder",
    label: "Sell",
    icon: <Code2 className="w-4 h-4" />,
    desc: "Build and sell software — list projects, get verified, take build requests.",
  },
  {
    key: "founder",
    label: "Buy",
    icon: <ShoppingBag className="w-4 h-4" />,
    desc: "Buy verified projects or commission builds from students.",
  },
  {
    key: "incubator",
    label: "Fund",
    icon: <Rocket className="w-4 h-4" />,
    desc: "Mentor, fund or acquire promising early-stage projects.",
  },
] as const;

function ModeSection() {
  const { data: user, isLoading } = useMe();
  const { mutate: updateRole, isPending } = useUpdateMyRole();
  const [status, setStatus] = useState<string | null>(null);

  if (isLoading) return <Skeleton className="h-64 w-full rounded-lg" />;

  // Map non-primary roles (contributor/mentor/admin) to a sensible default view.
  const current = MODES.some((m) => m.key === user?.role) ? user?.role : "builder";

  const switchTo = (role: string) => {
    if (role === current) return;
    setStatus(null);
    updateRole(role, {
      onSuccess: () => setStatus("Mode updated — your dashboard now reflects this."),
      onError: () => setStatus("Could not update mode. Please try again."),
    });
  };

  return (
    <div className="rounded-xl border bg-card p-5 space-y-4">
      <div>
        <h3 className="font-medium text-sm flex items-center gap-2">
          <Repeat className="w-4 h-4 text-primary" /> Your mode
        </h3>
        <p className="text-sm text-muted-foreground mt-0.5">
          This tailors your dashboard and default actions. You can switch anytime — it doesn&apos;t change your projects or history.
        </p>
      </div>

      <div className="grid sm:grid-cols-3 gap-3">
        {MODES.map((m) => {
          const active = current === m.key;
          return (
            <button
              key={m.key}
              type="button"
              onClick={() => switchTo(m.key)}
              disabled={isPending}
              className={cn(
                "text-left rounded-xl border p-4 transition-colors relative",
                active ? "border-primary bg-primary/5" : "hover:border-primary/40",
                isPending && "opacity-60"
              )}
            >
              {active && <Check className="w-4 h-4 text-primary absolute top-3 right-3" />}
              <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center mb-2",
                active ? "bg-primary/15 text-primary" : "bg-secondary text-muted-foreground")}>
                {m.icon}
              </div>
              <div className="text-sm font-medium">{m.label}</div>
              <p className="text-xs text-muted-foreground mt-0.5">{m.desc}</p>
            </button>
          );
        })}
      </div>

      {status && <p className="text-sm text-muted-foreground">{status}</p>}
    </div>
  );
}

const payoutSchema = z.object({
  method: z.enum(["upi", "bank"]),
  upi_id: z.string().max(120).optional(),
  account_holder_name: z.string().max(120).optional(),
  account_number: z.string().max(34).optional(),
  ifsc: z.string().max(16).optional(),
  pan: z.string().max(10).optional(),
});
type PayoutForm = z.infer<typeof payoutSchema>;

function PayoutSection() {
  const queryClient = useQueryClient();
  const { data: payout, isLoading } = useQuery({
    queryKey: ["payout-details"],
    queryFn: () => usersApi.getPayoutDetails(),
    retry: false,
  });
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { register, handleSubmit, watch, reset } = useForm<PayoutForm>({
    resolver: zodResolver(payoutSchema),
    defaultValues: { method: "upi" },
  });

  const method = watch("method");

  // Prefill non-sensitive fields (account number / PAN are masked server-side).
  useEffect(() => {
    if (payout) {
      reset({
        method: payout.method,
        upi_id: payout.upi_id ?? "",
        account_holder_name: payout.account_holder_name ?? "",
        ifsc: payout.ifsc ?? "",
      });
    }
  }, [payout, reset]);

  const { mutateAsync, isPending } = useMutation({
    mutationFn: (data: PayoutDetailInput) => usersApi.updatePayoutDetails(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payout-details"] });
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    },
  });

  const onSubmit = async (data: PayoutForm) => {
    setError(null);
    setSuccess(false);
    try {
      await mutateAsync(data as PayoutDetailInput);
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  if (isLoading) return <Skeleton className="h-72 w-full rounded-lg" />;

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="rounded-xl border bg-card p-5 space-y-4">
      <div>
        <h3 className="font-medium text-sm flex items-center gap-2">
          <Wallet className="w-4 h-4 text-primary" /> Payout details
        </h3>
        <p className="text-sm text-muted-foreground mt-0.5">
          Where you receive your earnings after a sale. We deduct a platform fee and settle the rest to you.
          Your details are stored securely and account/PAN numbers are always masked.
        </p>
      </div>

      {payout && (
        <div className="flex items-center gap-2 text-xs">
          <Badge variant={payout.is_verified ? "success" : "warning"} className="text-[10px] gap-1">
            {payout.is_verified ? <><ShieldCheckIcon className="w-3 h-3" /> Verified</> : "Pending verification"}
          </Badge>
          {payout.account_number_masked && (
            <span className="text-muted-foreground">A/C {payout.account_number_masked}</span>
          )}
          {payout.pan_masked && <span className="text-muted-foreground">PAN {payout.pan_masked}</span>}
        </div>
      )}

      <div className="space-y-1.5">
        <Label>Method</Label>
        <select className="w-full h-9 px-3 text-sm rounded-md border bg-background focus-visible:outline-none focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-primary/12" {...register("method")}>
          <option value="upi">UPI</option>
          <option value="bank">Bank account</option>
        </select>
      </div>

      {method === "upi" ? (
        <div className="space-y-1.5">
          <Label>UPI ID</Label>
          <Input placeholder="yourname@upi" {...register("upi_id")} />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Account holder name</Label>
            <Input placeholder="As per bank records" {...register("account_holder_name")} />
          </div>
          <div className="space-y-1.5">
            <Label>Account number</Label>
            <Input placeholder={payout?.account_number_masked ?? "Account number"} {...register("account_number")} />
          </div>
          <div className="space-y-1.5">
            <Label>IFSC</Label>
            <Input placeholder="HDFC0001234" {...register("ifsc")} />
          </div>
        </div>
      )}

      <div className="space-y-1.5">
        <Label>PAN (optional, for tax compliance)</Label>
        <Input placeholder={payout?.pan_masked ?? "ABCDE1234F"} {...register("pan")} />
      </div>

      {error && <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-md">{error}</p>}
      {success && <p className="text-sm text-text-success bg-background-success px-3 py-2 rounded-md">Payout details saved.</p>}

      <Button type="submit" loading={isPending}>Save payout details</Button>
    </form>
  );
}

export default function SettingsPage() {
  const [tab, setTab] = useState<"profile" | "mode" | "security" | "skills" | "billing" | "payouts">("profile");

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-6">
      <h1 className="text-display-md">Settings</h1>

      <div className="flex gap-1 border-b">
        {[
          { id: "profile" as const, label: "Profile", icon: <UserIcon className="w-3.5 h-3.5" /> },
          { id: "mode" as const, label: "Mode", icon: <Repeat className="w-3.5 h-3.5" /> },
          { id: "security" as const, label: "Security", icon: <Shield className="w-3.5 h-3.5" /> },
          { id: "skills" as const, label: "Skills", icon: <Wrench className="w-3.5 h-3.5" /> },
          { id: "payouts" as const, label: "Payouts", icon: <Wallet className="w-3.5 h-3.5" /> },
          { id: "billing" as const, label: "Billing", icon: <CreditCard className="w-3.5 h-3.5" /> },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === t.id ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {tab === "profile" && <ProfileSection />}
      {tab === "mode" && <ModeSection />}
      {tab === "security" && <SecuritySection />}
      {tab === "skills" && (
        <div className="rounded-xl border bg-card p-5 space-y-3">
          <h3 className="font-medium text-sm">Your Skills</h3>
          <p className="text-sm text-muted-foreground">Add skills to help project owners find the right contributors.</p>
          <UserSkillsManager />
        </div>
      )}
      {tab === "payouts" && <PayoutSection />}
      {tab === "billing" && <PaymentsSection />}
    </div>
  );
}
