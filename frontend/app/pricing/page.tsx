"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import {
  Check, Briefcase, Rocket, ShieldCheck, Sparkles, CheckCircle2, ArrowRight,
  Presentation, Star, Tag, Zap, HelpCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/primitives";
import { Container, Section, SectionHeading } from "@/components/ui/layout";
import { paymentsApi } from "@/lib/api";
import { useMySubscription } from "@/lib/hooks";
import { useAuthStore } from "@/stores/auth";
import { getErrorMessage } from "@/lib/api/client";
import { cn } from "@/lib/utils";
import type { PaymentType } from "@/types";

/* ── Plans ────────────────────────────────────────────────────────────────── */

const PLANS = [
  {
    id: "recruiter_pro" as const,
    name: "Recruiter Pro",
    price: 1999,
    icon: Briefcase,
    tagline: "For startups and companies hiring student builders",
    features: [
      "Unlock direct contact details of any builder",
      "Full builder directory access",
      "Reputation, delivery & verification signals",
      "Priority messaging to builders",
      "Unlimited build requests",
    ],
    featured: false,
  },
  {
    id: "incubator_pro" as const,
    name: "Incubator Pro",
    price: 4999,
    icon: Rocket,
    tagline: "For incubators and investors scouting projects",
    features: [
      "Everything in Recruiter Pro",
      "Unlock founder contact details",
      "Premium project discovery feed",
      "Unlimited incubation offers",
      "Early access to verified launches",
    ],
    featured: true,
  },
];

/* ── Per-project add-ons ──────────────────────────────────────────────────── */

const ADDONS = [
  { icon: Sparkles, name: "AI project audit", price: 299, desc: "Health, completion, startup potential, roadmap and risk areas." },
  { icon: Star, name: "Startup readiness report", price: 999, desc: "Investor-grade assessment with actionable next steps." },
  { icon: Presentation, name: "AI pitch deck", price: 499, desc: "8 slides with speaker notes, grounded in your real repo." },
  { icon: Tag, name: "Premium listing", price: 499, desc: "Boost ranking in search and discovery feeds." },
  { icon: Zap, name: "Featured placement", price: 1499, desc: "Front-page placement for 30 days." },
];

const FAQ = [
  {
    q: "Is it free to list a project?",
    a: "Yes. Listing and selling are free — we take a 10% commission only when a project actually sells.",
  },
  {
    q: "How does the commission work?",
    a: "When your project sells, the platform fee is deducted automatically and your net earnings appear on your earnings page, ready for settlement to your payout account.",
  },
  {
    q: "Can I cancel a membership?",
    a: "Memberships are billed monthly and are not auto-recurring — each payment simply extends your access by 30 days. Stop paying and it lapses.",
  },
  {
    q: "What do buyers actually get?",
    a: "Whatever the seller lists: source code, a license, or full ownership transfer. Delivery details unlock the moment payment clears.",
  },
];

function planLabel(plan: string | null | undefined): string {
  if (!plan) return "";
  return plan.replace("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function PricingPage() {
  const router = useRouter();
  const token = useAuthStore((s) => s.accessToken);
  const { data: sub } = useMySubscription();
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const { mutate: createOrder } = useMutation({
    mutationFn: (type: PaymentType) => paymentsApi.createOrder(type),
    onSuccess: (data) => {
      if (data.cf_order_token) {
        window.location.href = `https://sandbox.cashfree.com/pg/view/orders/${data.order_id}?orderToken=${data.cf_order_token}`;
      }
    },
    onError: (err) => {
      setError(getErrorMessage(err));
      setPendingId(null);
    },
  });

  const buy = (type: PaymentType) => {
    setError(null);
    if (!token) {
      router.push("/auth/login");
      return;
    }
    setPendingId(type);
    createOrder(type);
  };

  return (
    <>
      {/* ══ HEADER ════════════════════════════════════════════════════════ */}
      <section className="relative overflow-hidden border-b">
        <div className="hero-aura" aria-hidden="true" />
        <Container width="md" className="relative pt-14 pb-12 sm:pt-20 sm:pb-16 text-center">
          <Badge variant="brand" className="mb-5">Pricing</Badge>
          <h1 className="text-display-xl">
            Free to build.{" "}
            <span className="text-gradient-brand">Pay to scale.</span>
          </h1>
          <p className="text-[1.0625rem] text-muted-foreground mt-5 leading-relaxed max-w-xl mx-auto">
            Listing and selling are free — we only take a cut when you earn. Memberships
            unlock direct access to verified builders.
          </p>

          {sub?.is_active && (
            <div className="mt-8 inline-flex items-center gap-2.5 rounded-full border border-border-success bg-background-success px-4 py-2 text-sm">
              <ShieldCheck className="w-4 h-4 text-text-success flex-shrink-0" />
              <span className="text-text-success">
                <span className="font-semibold">{planLabel(sub.plan)}</span> active until{" "}
                {sub.expires_at ? new Date(sub.expires_at).toLocaleDateString("en-IN") : ""}
              </span>
            </div>
          )}

          {error && (
            <div
              role="alert"
              className="mt-6 mx-auto max-w-md rounded-xl border border-destructive/30 bg-destructive/8 px-4 py-3 text-sm text-destructive"
            >
              {error}
            </div>
          )}
        </Container>
      </section>

      {/* ══ SELLER TIER + MEMBERSHIPS ═════════════════════════════════════ */}
      <Section space="lg" width="lg">
        <div className="grid lg:grid-cols-3 gap-5 items-start">
          {/* Free / builders */}
          <div className="rounded-2xl border bg-card p-7 flex flex-col h-full">
            <div className="w-11 h-11 rounded-xl bg-secondary text-foreground flex items-center justify-center mb-5">
              <Tag className="w-5 h-5" />
            </div>
            <h2 className="text-display-sm">Builder</h2>
            <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">
              Everything you need to list, verify and sell.
            </p>
            <div className="mt-6 mb-7">
              <span className="text-4xl font-extrabold font-display tracking-tight">Free</span>
              <p className="text-xs text-muted-foreground mt-1.5">
                10% commission on sales only
              </p>
            </div>
            <ul className="space-y-2.5 flex-1">
              {[
                "Unlimited project listings",
                "Verified Build Score",
                "Hackathon authenticity checks",
                "Builder reputation & leaderboard",
                "Apply to paid build requests",
                "Earnings dashboard & payouts",
              ].map((f) => (
                <li key={f} className="flex items-start gap-2.5 text-sm">
                  <Check className="w-4 h-4 text-text-success flex-shrink-0 mt-0.5" />
                  <span className="text-muted-foreground">{f}</span>
                </li>
              ))}
            </ul>
            <Button variant="outline" block className="mt-7" asChild>
              <Link href="/auth/register">Start free</Link>
            </Button>
          </div>

          {/* Pro plans */}
          {PLANS.map((plan) => {
            const Icon = plan.icon;
            const isCurrent = sub?.is_active && sub.plan === plan.id;
            return (
              <div
                key={plan.id}
                className={cn(
                  "relative rounded-2xl border bg-card p-7 flex flex-col h-full",
                  plan.featured
                    ? "border-primary/45 shadow-lg ring-gradient lg:-mt-3 lg:pt-9 lg:pb-9"
                    : "card-interactive"
                )}
              >
                {plan.featured && (
                  <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 shadow-sm gap-1">
                    <Sparkles className="w-3 h-3" /> Most popular
                  </Badge>
                )}

                <div
                  className={cn(
                    "w-11 h-11 rounded-xl flex items-center justify-center mb-5",
                    plan.featured
                      ? "bg-gradient-brand text-white shadow-sm"
                      : "bg-primary/10 text-primary"
                  )}
                >
                  <Icon className="w-5 h-5" />
                </div>

                <div className="flex items-start justify-between gap-2">
                  <h2 className="text-display-sm">{plan.name}</h2>
                  {isCurrent && <Badge variant="success" size="sm">Active</Badge>}
                </div>
                <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">
                  {plan.tagline}
                </p>

                <div className="mt-6 mb-7">
                  <span className="text-4xl font-extrabold font-display tracking-tight tabular-nums">
                    ₹{plan.price.toLocaleString("en-IN")}
                  </span>
                  <span className="text-sm text-muted-foreground ml-1.5">/ month</span>
                </div>

                <ul className="space-y-2.5 flex-1">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2.5 text-sm">
                      <Check className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                      <span className="text-muted-foreground">{f}</span>
                    </li>
                  ))}
                </ul>

                <Button
                  block
                  size="lg"
                  className="mt-7"
                  variant={plan.featured ? "brand" : isCurrent ? "outline" : "default"}
                  loading={pendingId === plan.id}
                  onClick={() => buy(plan.id)}
                >
                  {isCurrent ? "Renew / extend" : `Get ${plan.name}`}
                </Button>
              </div>
            );
          })}
        </div>

        <p className="text-center text-xs text-muted-foreground mt-8">
          Payments processed securely via Cashfree. Billed monthly — each payment extends
          access by 30 days.
        </p>
      </Section>

      {/* ══ ADD-ONS ═══════════════════════════════════════════════════════ */}
      <Section space="lg" tint="surface" bordered width="lg">
        <SectionHeading
          eyebrow="Per-project add-ons"
          title="Boost an individual project"
          description="One-off purchases from any project's checkout page — no subscription needed."
        />
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 stagger">
          {ADDONS.map(({ icon: Icon, name, price, desc }) => (
            <div key={name} className="rounded-xl border bg-card p-5 card-interactive">
              <div className="flex items-start justify-between gap-3 mb-3.5">
                <span className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
                  <Icon className="w-4 h-4" />
                </span>
                <span className="text-lg font-bold font-display tabular-nums">
                  ₹{price.toLocaleString("en-IN")}
                </span>
              </div>
              <h3 className="font-semibold text-sm">{name}</h3>
              <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
        <div className="mt-8 text-center">
          <Button variant="outline" asChild>
            <Link href="/projects">Go to your projects <ArrowRight className="w-4 h-4" /></Link>
          </Button>
        </div>
      </Section>

      {/* ══ FAQ ═══════════════════════════════════════════════════════════ */}
      <Section space="lg" width="md">
        <SectionHeading eyebrow="FAQ" title="Common questions" />
        <div className="space-y-3">
          {FAQ.map(({ q, a }) => (
            <details
              key={q}
              className="group rounded-xl border bg-card px-5 py-4 [&_summary::-webkit-details-marker]:hidden"
            >
              <summary className="flex items-center justify-between gap-4 cursor-pointer list-none font-medium text-sm">
                <span className="flex items-start gap-2.5">
                  <HelpCircle className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                  {q}
                </span>
                <span className="text-muted-foreground transition-transform duration-200 group-open:rotate-45 text-lg leading-none flex-shrink-0">
                  +
                </span>
              </summary>
              <p className="text-sm text-muted-foreground leading-relaxed mt-3 pl-[1.625rem]">{a}</p>
            </details>
          ))}
        </div>
      </Section>

      {/* ══ CTA ═══════════════════════════════════════════════════════════ */}
      <Section space="lg" tint="surface" bordered width="md" className="text-center">
        <span className="inline-flex w-14 h-14 rounded-2xl bg-gradient-brand items-center justify-center mb-6 shadow-glow">
          <CheckCircle2 className="w-6 h-6 text-white" />
        </span>
        <h2 className="text-display-lg">Start free, upgrade when it pays off.</h2>
        <p className="text-muted-foreground mt-4 mb-8 leading-relaxed max-w-md mx-auto">
          List your first project in under two minutes. No card required.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Button size="xl" variant="brand" asChild>
            <Link href="/auth/register">Create free account <ArrowRight className="w-4 h-4" /></Link>
          </Button>
          <Button size="xl" variant="outline" asChild>
            <Link href="/projects?for_sale=true">Browse marketplace</Link>
          </Button>
        </div>
      </Section>
    </>
  );
}
