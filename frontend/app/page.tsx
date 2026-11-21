import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CheckCircle2, GitBranch, Scale, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Container, Section } from "@/components/ui/layout";
import { HeroVisual } from "@/components/marketing/hero-visual";
import { StatsTicker } from "@/components/marketing/stats-ticker";
import { DiscoveryRails } from "@/components/marketing/discovery-rails";
import {
  ClosingCTA, FAQ, HowItWorks, PricingPreview, SocialProof, TransparencyDemo,
} from "@/components/marketing/landing-sections";
import { fetchPlatformStats, fetchShowcase } from "@/lib/public-server";

export const metadata: Metadata = {
  title: "CodeBazaar — Proof that the code is real",
  description:
    "Student projects die after the semester, and nobody trusts a stranger's repo enough to pay for it. CodeBazaar scores every project from its real commit history, so builders can prove their work and buyers can act on evidence.",
};

/**
 * Landing page.
 *
 * A server component: the pitch, the live figures and the transparency demo are
 * all in the initial HTML, so this page reads correctly to a crawler, unfurls
 * properly when shared, and paints its argument before any JavaScript runs. The
 * discovery rails hydrate separately on the client.
 */
export default async function HomePage() {
  // Fetched in parallel — one shouldn't wait on the other, and both degrade to
  // null rather than throwing, so a cold backend still renders the pitch.
  const [stats, showcase] = await Promise.all([
    fetchPlatformStats(),
    fetchShowcase(),
  ]);

  return (
    <>
      {/* ══ HERO ═══════════════════════════════════════════════════════════ */}
      <section className="relative overflow-hidden border-b">
        <div className="hero-aura" aria-hidden="true" />
        <div
          className="absolute inset-0 bg-grid mask-fade-edges opacity-60"
          aria-hidden="true"
        />

        <Container className="relative pt-12 pb-14 sm:pt-20 sm:pb-20">
          <div className="grid lg:grid-cols-[1.05fr_1fr] gap-10 lg:gap-16 items-center">
            <div className="max-w-xl">
              {/* The problem, first and in full. Leading with the solution
                  assumes the reader already agrees there's a problem. */}
              <p className="text-base sm:text-lg text-foreground/80 leading-relaxed animate-fade-in">
                Student projects die after the semester.
                <br className="hidden sm:block" />{" "}
                Nobody trusts a stranger&apos;s repo enough to pay for it.
              </p>

              <h1 className="text-display-xl mt-5 animate-fade-in-delay-1">
                Proof that the{" "}
                <span className="text-gradient-brand">code is real</span>
              </h1>

              <p className="text-base sm:text-lg text-muted-foreground mt-5 leading-relaxed animate-fade-in-delay-2">
                CodeBazaar scores every project from its actual commit history and
                publishes the full breakdown — so builders can prove what they
                built, and buyers, recruiters and investors can act on evidence
                instead of a screenshot.
              </p>

              <div className="flex flex-col sm:flex-row gap-3 mt-8 animate-fade-in-delay-3">
                <Button size="xl" variant="cta" asChild>
                  <Link href="/import">
                    <GitBranch className="w-4 h-4" /> Import your GitHub repo
                  </Link>
                </Button>
                <Button size="xl" variant="outline" asChild>
                  <Link href="#transparency">
                    <Scale className="w-4 h-4" /> See how scoring works
                  </Link>
                </Button>
              </div>

              <div className="flex flex-wrap items-center gap-x-5 gap-y-2 mt-8 text-xs text-muted-foreground animate-fade-in-delay-4">
                <span className="inline-flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-text-success" />
                  Free to list
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <GitBranch className="w-3.5 h-3.5 text-text-success" />
                  Reads your real git history
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-text-success" />
                  Public, auditable scoring
                </span>
              </div>
            </div>

            <div className="relative lg:pl-4 animate-fade-in-delay-2 hidden sm:block">
              <HeroVisual />
            </div>
          </div>
        </Container>

        {/* Live figures, queried from the database on every request. */}
        <div className="relative border-t bg-surface/60">
          <Container className="py-6 sm:py-7">
            <StatsTicker />
          </Container>
        </div>
      </section>

      {/* ══ HOW IT WORKS ═══════════════════════════════════════════════════ */}
      <HowItWorks featured={showcase?.featured ?? null} />

      {/* ══ TRANSPARENCY — a real score, broken down, before signup ════════ */}
      <TransparencyDemo featured={showcase?.featured ?? null} />

      {/* ══ SOCIAL PROOF ═══════════════════════════════════════════════════ */}
      <SocialProof showcase={showcase} />

      {/* ══ AUDIENCE SPLIT ═════════════════════════════════════════════════ */}
      <Section space="lg" width="lg">
        <div className="grid md:grid-cols-2 gap-4 sm:gap-5">
          {[
            {
              title: "For builders",
              blurb:
                "Turn work you've already done into revenue, reputation and proof you can show anyone.",
              points: [
                "Sell source code or license it",
                "Take paid build requests",
                "Earn a reputation tier from real delivery",
              ],
              cta: { label: "Import a repo", href: "/import" },
              variant: "cta" as const,
            },
            {
              title: "For buyers, recruiters & investors",
              blurb:
                "Evaluate a stranger's code in minutes instead of taking a demo video on faith.",
              points: [
                "Buy verified projects outright",
                "Commission a build with escrowed milestones",
                "Screen candidates on provable output",
              ],
              cta: { label: "Browse verified projects", href: "/projects?verified=true" },
              variant: "outline" as const,
            },
          ].map(({ title, blurb, points, cta, variant }) => (
            <div key={title} className="rounded-2xl border bg-card p-6 sm:p-8 flex flex-col">
              <h3 className="text-display-sm mb-2.5">{title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed mb-6">
                {blurb}
              </p>
              <ul className="space-y-2.5 mb-7 flex-1 list-none">
                {points.map((p) => (
                  <li key={p} className="flex items-start gap-2.5 text-sm">
                    <CheckCircle2 className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                    <span className="text-muted-foreground">{p}</span>
                  </li>
                ))}
              </ul>
              <Button variant={variant} asChild>
                <Link href={cta.href}>
                  {cta.label} <ArrowRight className="w-4 h-4" />
                </Link>
              </Button>
            </div>
          ))}
        </div>
      </Section>

      {/* ══ PRICING ════════════════════════════════════════════════════════ */}
      <PricingPreview />

      {/* ══ LIVE FEEDS ═════════════════════════════════════════════════════ */}
      <Section space="none" bordered tint="surface" bare>
        <DiscoveryRails />
      </Section>

      {/* ══ FAQ ════════════════════════════════════════════════════════════ */}
      <FAQ />

      {/* ══ CLOSING CTA ════════════════════════════════════════════════════ */}
      <ClosingCTA verifiedCount={stats?.projects_verified} />
    </>
  );
}
