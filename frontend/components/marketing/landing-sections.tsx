import Link from "next/link";
import {
  ArrowRight, Building2, Check, GitBranch, HandCoins, Quote, ShieldCheck,
  Sparkles, Store, Trophy,
} from "lucide-react";
import { Badge, Card, CardContent } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { Container, Section, SectionHeading } from "@/components/ui/layout";
import { ScoreRing } from "@/components/trust/score-ring";
import { cn } from "@/lib/utils";
import type { Showcase, ShowcaseProject } from "@/types";

function rupees(paise: number | null | undefined): string {
  if (paise == null) return "—";
  return "₹" + (paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

/* ═══════════════════════════════════════════════════════════════════════════
   How it works — uses the real score ring and badge, not stock icons
   ═══════════════════════════════════════════════════════════════════════════ */

export function HowItWorks({ featured }: { featured: ShowcaseProject | null }) {
  const demoScore = featured?.verified_build_score ?? 88;

  const steps = [
    {
      n: 1,
      icon: GitBranch,
      title: "Import your repo",
      desc: "Connect a GitHub repository. We read its commit history, contributors, documentation and structure.",
      visual: (
        <div className="font-mono text-[11px] text-muted-foreground bg-surface-2/70 rounded-lg p-3 border">
          <span className="text-primary">$</span> reading commit history…
          <br />
          <span className="text-text-success">✓</span> 251 commits, 6 contributors
        </div>
      ),
    },
    {
      n: 2,
      icon: ShieldCheck,
      title: "Get scored",
      desc: "Six weighted components produce a Verified Build Score. Every point is traceable to a signal in your repo.",
      visual: (
        <div className="flex justify-center py-1">
          <ScoreRing score={demoScore} size="md" threshold={70} showDenominator={false} />
        </div>
      ),
    },
    {
      n: 3,
      icon: Trophy,
      title: "Prove it anywhere",
      desc: "Paste a live badge into your README. It links to a public report anyone can audit without an account.",
      visual: (
        <div className="flex justify-center py-2">
          <span className="inline-flex overflow-hidden rounded text-[10px] font-semibold shadow-sm">
            <span className="bg-[#3d3833] text-white px-2 py-1">verified build</span>
            <span className="bg-[#2f6b4f] text-white px-2 py-1 tabular-nums">
              {demoScore}/100
            </span>
          </span>
        </div>
      ),
    },
    {
      n: 4,
      icon: HandCoins,
      title: "Sell, fund or hand over",
      desc: "List it for sale, take a build request, accept an incubation offer, or pass it to someone who'll continue it.",
      visual: (
        <div className="flex flex-wrap gap-1.5 justify-center py-2">
          <Badge variant="success" size="sm">sold</Badge>
          <Badge variant="info" size="sm">funded</Badge>
          <Badge variant="ghost" size="sm">adopted</Badge>
        </div>
      ),
    },
  ];

  return (
    <Section space="lg" width="xl" id="how-it-works">
      <SectionHeading
        eyebrow="How it works"
        title="From a dormant repo to something someone will pay for"
        description="Four steps. No manual review queue, no self-reported claims, nothing you have to take on trust."
      />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 stagger">
        {steps.map(({ n, icon: Icon, title, desc, visual }) => (
          <div key={n} className="rounded-2xl border bg-card p-5 sm:p-6 flex flex-col">
            <div className="flex items-center gap-2.5 mb-4">
              <span className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
                <Icon className="w-4 h-4" />
              </span>
              <span className="text-eyebrow">Step {n}</span>
            </div>
            <h3 className="text-display-sm mb-2">{title}</h3>
            <p className="text-sm text-muted-foreground leading-relaxed mb-4 flex-1">
              {desc}
            </p>
            {visual}
          </div>
        ))}
      </div>
    </Section>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   Transparency demo — a real seeded score, broken down, before signup
   ═══════════════════════════════════════════════════════════════════════════ */

function bandBar(score: number | null) {
  if (score == null) return "bg-muted-foreground/25";
  if (score >= 70) return "bg-[hsl(var(--score-high))]";
  if (score >= 40) return "bg-[hsl(var(--score-mid))]";
  return "bg-[hsl(var(--score-low))]";
}

export function TransparencyDemo({ featured }: { featured: ShowcaseProject | null }) {
  if (!featured) return null;

  const subtotal = featured.components.reduce((s, c) => s + (c.contribution ?? 0), 0);

  return (
    <Section space="lg" tint="surface" bordered width="lg" id="transparency">
      <SectionHeading
        eyebrow="No black box"
        title="See exactly how a score is calculated"
        description="This is a real project on the platform, with its actual breakdown. Nothing here is illustrative — open the full report and check it yourself."
      />

      <Card className="overflow-hidden">
        <CardContent className="pt-6">
          {/* Header: the project and its score */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-5 pb-6 border-b">
            <ScoreRing
              score={featured.verified_build_score}
              size="lg"
              threshold={featured.verified_threshold}
              className="self-center sm:self-auto flex-shrink-0"
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-display-sm">{featured.title}</h3>
                {featured.is_verified && (
                  <Badge variant="success" size="sm">
                    <ShieldCheck className="w-3 h-3" /> Verified
                  </Badge>
                )}
              </div>
              <p className="font-mono text-xs text-muted-foreground mt-1">
                {featured.repo_full_name}
              </p>
              <p className="text-sm text-muted-foreground mt-2.5 leading-relaxed">
                Built by {featured.owner_name}
                {featured.owner_college ? ` · ${featured.owner_college}` : ""}
                {featured.commits_analyzed != null
                  ? ` · ${featured.commits_analyzed} commits analysed`
                  : ""}
              </p>
            </div>
          </div>

          {/* The six components */}
          <ul className="divide-y list-none">
            {featured.components.map((c) => (
              <li key={c.key} className="py-3">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium flex-1 min-w-0 truncate">
                    {c.label}
                  </span>
                  <Badge variant="ghost" size="sm" className="tabular-nums flex-shrink-0">
                    {Math.round(c.weight * 100)}%
                  </Badge>
                  <span className="text-sm font-semibold tabular-nums w-9 text-right flex-shrink-0">
                    {c.score ?? "—"}
                  </span>
                </div>
                <div className="flex items-center gap-3 mt-2">
                  <div className="h-1.5 flex-1 rounded-full bg-secondary overflow-hidden">
                    <div
                      className={cn("h-full rounded-full", bandBar(c.score))}
                      style={{ width: `${c.score ?? 0}%` }}
                    />
                  </div>
                  <span className="text-[11px] text-muted-foreground tabular-nums w-20 text-right flex-shrink-0">
                    {c.contribution != null ? `+${c.contribution.toFixed(1)} pts` : "—"}
                  </span>
                </div>
              </li>
            ))}
          </ul>

          {/* The arithmetic */}
          <dl className="mt-5 rounded-xl border bg-surface/60 p-4 space-y-2 text-sm">
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted-foreground">Weighted subtotal</dt>
              <dd className="font-semibold tabular-nums">{subtotal.toFixed(1)}</dd>
            </div>
            {featured.total_penalty > 0 && (
              <div className="flex items-center justify-between gap-3">
                <dt className="text-text-danger">Fraud-signal penalties</dt>
                <dd className="font-semibold tabular-nums text-text-danger">
                  −{featured.total_penalty}
                </dd>
              </div>
            )}
            <div className="flex items-center justify-between gap-3 pt-2 border-t">
              <dt className="font-semibold">Verified Build Score</dt>
              <dd className="font-display text-lg font-semibold tabular-nums">
                {featured.verified_build_score}
                <span className="text-muted-foreground font-sans text-xs font-normal">
                  {" "}/ 100
                </span>
              </dd>
            </div>
          </dl>

          <div className="mt-5 flex flex-wrap gap-2.5">
            <Button asChild>
              <Link href={`/verify/${featured.id}`}>
                Open the full public report <ArrowRight className="w-4 h-4" />
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/how-verification-works">Read the methodology</Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground mt-4 text-center">
        Originality is a deliberately capped proxy — we don&apos;t claim to do
        plagiarism scanning. The methodology page says exactly what the score
        can and cannot prove.
      </p>
    </Section>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   Social proof
   ═══════════════════════════════════════════════════════════════════════════ */

const ROLE_LABEL: Record<string, string> = {
  founder: "Founder",
  mentor: "Mentor",
  contributor: "Contributor",
  user: "Buyer",
};

export function SocialProof({ showcase }: { showcase: Showcase | null }) {
  const testimonials = showcase?.testimonials ?? [];
  const campus = showcase?.campus ?? [];

  if (testimonials.length === 0 && campus.length === 0) return null;

  return (
    <Section space="lg" width="xl" id="proof">
      <SectionHeading
        eyebrow="Who's using it"
        title="Buyers, recruiters and incubators are already here"
        description="Every quote below is a published review on a real listing, linked to the reviewer's profile."
      />

      {testimonials.length > 0 && (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 stagger">
          {testimonials.slice(0, 3).map((t) => (
            <figure
              key={t.id}
              className="rounded-2xl border bg-card p-6 flex flex-col"
            >
              <Quote className="w-5 h-5 text-primary/40 mb-3" aria-hidden />
              <blockquote className="flex-1">
                <p className="font-medium text-sm mb-2">{t.headline}</p>
                <p className="text-sm text-muted-foreground leading-relaxed line-clamp-5">
                  {t.body}
                </p>
              </blockquote>
              <figcaption className="mt-5 pt-4 border-t flex items-center gap-3">
                <span className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-semibold flex-shrink-0">
                  {t.reviewer_name.charAt(0).toUpperCase()}
                </span>
                <span className="min-w-0">
                  <Link
                    href={`/u/${t.reviewer_id}`}
                    className="block text-sm font-medium truncate hover:text-primary transition-colors"
                  >
                    {t.reviewer_name}
                  </Link>
                  <span className="block text-xs text-muted-foreground truncate">
                    {ROLE_LABEL[t.reviewer_role] ?? t.reviewer_role} · reviewed{" "}
                    <Link
                      href={`/projects/${t.project_id}`}
                      className="hover:text-foreground transition-colors underline underline-offset-2"
                    >
                      {t.project_title}
                    </Link>
                  </span>
                </span>
              </figcaption>
            </figure>
          ))}
        </div>
      )}

      {campus.length > 0 && (
        <Card className="mt-6">
          <CardContent className="pt-5">
            <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
              <h3 className="font-display text-lg font-semibold flex items-center gap-2">
                <Building2 className="w-4 h-4 text-primary" /> Campus leaderboard
              </h3>
              <Button variant="ghost" size="sm" asChild className="gap-1">
                <Link href="/campus">
                  Full leaderboard <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </Button>
            </div>
            <ol className="divide-y list-none">
              {campus.map((row, i) => (
                <li key={row.college} className="py-2.5 flex items-center gap-3">
                  <span className="w-6 text-sm font-semibold tabular-nums text-muted-foreground flex-shrink-0">
                    {i + 1}
                  </span>
                  <span className="text-sm font-medium flex-1 min-w-0 truncate">
                    {row.college}
                  </span>
                  <span className="hidden sm:inline text-xs text-muted-foreground tabular-nums flex-shrink-0">
                    {row.builders} builders · {row.verified_projects} verified
                  </span>
                  <span className="text-sm font-semibold tabular-nums w-16 text-right flex-shrink-0">
                    {row.total_points.toLocaleString("en-IN")}
                  </span>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      )}
    </Section>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   Pricing preview
   ═══════════════════════════════════════════════════════════════════════════ */

const PLANS = [
  {
    name: "Builders",
    price: "Free",
    sub: "10% only when you sell",
    icon: GitBranch,
    features: [
      "Unlimited repo imports",
      "Verified Build Score + public report",
      "Embeddable README badge",
      "Sell, take build requests, accept offers",
    ],
    cta: { label: "Start free", href: "/auth/register" },
    featured: false,
  },
  {
    name: "Recruiter Pro",
    price: "₹1,999",
    sub: "per month",
    icon: Store,
    features: [
      "Unlock any builder's contact details",
      "Full builder directory",
      "Saved searches and shortlists",
      "Unlimited build requests",
    ],
    cta: { label: "See details", href: "/pricing" },
    featured: true,
  },
  {
    name: "Incubator Pro",
    price: "₹4,999",
    sub: "per month",
    icon: Sparkles,
    features: [
      "Everything in Recruiter Pro",
      "Premium discovery feed",
      "Unlimited incubation offers",
      "Early access to verified launches",
    ],
    cta: { label: "See details", href: "/pricing" },
    featured: false,
  },
];

export function PricingPreview() {
  return (
    <Section space="lg" tint="surface" bordered width="xl" id="pricing">
      <SectionHeading
        eyebrow="Pricing"
        title="Free to build. Paid to hire and invest."
        description="Builders never pay to list — the platform takes 10% only on a completed sale. Buyers who want direct access subscribe."
      />
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {PLANS.map(({ name, price, sub, icon: Icon, features, cta, featured }) => (
          <div
            key={name}
            className={cn(
              "rounded-2xl border bg-card p-6 flex flex-col",
              featured && "border-primary/40 ring-1 ring-primary/20 shadow-md"
            )}
          >
            {featured && (
              <Badge variant="brand" size="sm" className="self-start mb-3">
                Most popular
              </Badge>
            )}
            <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center mb-4">
              <Icon className="w-4 h-4" />
            </div>
            <h3 className="text-display-sm">{name}</h3>
            <p className="mt-2 mb-1">
              <span className="font-display text-2xl font-semibold">{price}</span>{" "}
              <span className="text-xs text-muted-foreground">{sub}</span>
            </p>
            <ul className="space-y-2 mt-4 mb-6 flex-1 list-none">
              {features.map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm">
                  <Check className="w-3.5 h-3.5 mt-1 flex-shrink-0 text-text-success" />
                  <span className="text-muted-foreground leading-relaxed">{f}</span>
                </li>
              ))}
            </ul>
            <Button variant={featured ? "cta" : "outline"} asChild block>
              <Link href={cta.href}>{cta.label}</Link>
            </Button>
          </div>
        ))}
      </div>
      <p className="text-center text-xs text-muted-foreground mt-6">
        Per-project add-ons (AI audit, pitch deck, featured placement) start at ₹299.{" "}
        <Link href="/pricing" className="underline underline-offset-2">
          Full pricing
        </Link>
      </p>
    </Section>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   FAQ — answers the obvious scepticism head-on
   ═══════════════════════════════════════════════════════════════════════════ */

const FAQS = [
  {
    q: "How do you stop people gaming the score?",
    a: "By weighting the things that are expensive to fake. Stars and forks barely count because they're cheap to buy. Commit cadence and activity consistency carry the most weight (20% each) because manufacturing a year of distributed commit history is much harder than rewriting timestamps — and a history that lands entirely inside one day trips a penalty. Ownership must be proved via GitHub or a project cannot be verified at any score.",
  },
  {
    q: "What happens if a seller doesn't deliver?",
    a: "For marketplace sales, delivery details unlock on payment and the transaction is visible to admins for dispute handling. For commissioned work, escrow holds funds against milestones: the client approves each one before it's credited, and either party can raise a dispute that an admin resolves — including a partial split. Every resolution is recorded with its reasoning.",
  },
  {
    q: "Does a high score mean the code is good?",
    a: "No, and we're explicit about that. The score measures how the code was developed, not how well it's written. A carefully-built project can still contain a security bug. It's a provenance signal, not a code audit — the methodology page lists exactly what it does and doesn't prove.",
  },
  {
    q: "Is the scoring auditable, or do I have to trust you?",
    a: "Auditable. The full rulebook — weights, penalties, thresholds — is served from the scoring engine itself at a public endpoint, so the published methodology can't drift from the code. Every project's complete derivation is available without an account, and score history is append-only, so a score that dropped stays on the record.",
  },
  {
    q: "Why would a builder sell a project instead of keeping it?",
    a: "Most student projects stop being worked on after the semester ends. The realistic alternatives are that it rots in a repo nobody opens, or someone who needs exactly that thing pays for it and continues it. Builders can also keep ownership and just license it, take paid build requests, or accept funding.",
  },
];

export function FAQ() {
  return (
    <Section space="lg" width="md" id="faq">
      <SectionHeading
        eyebrow="Questions"
        title="The obvious objections"
        description="If you're sceptical about any of this, these are probably the reasons."
      />
      <div className="space-y-3">
        {FAQS.map(({ q, a }) => (
          <details key={q} className="group rounded-xl border bg-card overflow-hidden">
            <summary
              className={cn(
                "cursor-pointer list-none px-5 py-4 flex items-center justify-between gap-3",
                "hover:bg-accent/40 transition-colors",
                "[&::-webkit-details-marker]:hidden"
              )}
            >
              <span className="font-medium text-sm">{q}</span>
              <ArrowRight
                className="w-4 h-4 text-muted-foreground flex-shrink-0 transition-transform duration-200 group-open:rotate-90"
                aria-hidden
              />
            </summary>
            <p className="px-5 pb-4 text-sm text-muted-foreground leading-relaxed">
              {a}
            </p>
          </details>
        ))}
      </div>
      <p className="text-center text-sm text-muted-foreground mt-8">
        Still unsure?{" "}
        <Link href="/how-verification-works" className="underline underline-offset-2">
          Read the full methodology
        </Link>{" "}
        or{" "}
        <Link href="/docs/api" className="underline underline-offset-2">
          query the API directly
        </Link>
        .
      </p>
    </Section>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   Closing CTA
   ═══════════════════════════════════════════════════════════════════════════ */

export function ClosingCTA({ verifiedCount }: { verifiedCount?: number }) {
  return (
    <Section space="lg" width="md">
      <div className="rounded-3xl border bg-gradient-brand text-white p-8 sm:p-12 text-center relative overflow-hidden">
        <div className="absolute inset-0 bg-dot-grid opacity-10" aria-hidden />
        <div className="relative">
          <h2 className="text-display-lg text-white">
            Your repo already has the evidence.
          </h2>
          <p className="mt-4 text-white/85 leading-relaxed max-w-lg mx-auto">
            It takes about two minutes to import a repository and get a score you
            can put in front of a buyer, a recruiter or an investor.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
            <Button size="xl" variant="cta" asChild>
              <Link href="/import">
                <GitBranch className="w-4 h-4" /> Import your GitHub repo
              </Link>
            </Button>
            <Button
              size="xl"
              variant="outline"
              asChild
              className="bg-white/10 border-white/25 text-white hover:bg-white/20 hover:border-white/40"
            >
              <Link href="/projects">Browse projects first</Link>
            </Button>
          </div>
          {verifiedCount ? (
            <p className="mt-6 text-xs text-white/70">
              {verifiedCount} projects verified so far. Free to list, always.
            </p>
          ) : (
            <p className="mt-6 text-xs text-white/70">Free to list, always.</p>
          )}
        </div>
      </div>
    </Section>
  );
}
