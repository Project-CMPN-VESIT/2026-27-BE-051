import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, GitBranch, Scale, ShieldCheck } from "lucide-react";
import { Card, CardContent } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/ui/layout";
import { fetchPlatformStats } from "@/lib/public-server";

export const metadata: Metadata = {
  title: "About",
  description:
    "Why CodeBazaar exists: student software dies after the semester, and nobody trusts a stranger's repo enough to pay for it. Two problems, one mechanism.",
};

export default async function AboutPage() {
  const stats = await fetchPlatformStats();

  return (
    <Container className="py-12 sm:py-16 max-w-3xl">
      <p className="text-eyebrow mb-4">About</p>
      <h1 className="text-display-xl">Two problems that turned out to be one</h1>

      <div className="mt-8 space-y-5 text-[1.0625rem] text-muted-foreground leading-relaxed">
        <p>
          Every semester, an enormous amount of genuinely useful software gets
          built by students and then abandoned. The demo goes well, the marks come
          in, and the repository stops changing. A year later it&apos;s a dead link
          on a CV.
        </p>
        <p>
          At the same time, there are founders who need exactly that thing built,
          recruiters who cannot tell which candidate actually wrote the code they
          submitted, and small investors who would back a student team if they
          could verify anything at all about them.
        </p>
        <p className="text-foreground font-medium">
          Both problems are the same problem wearing different clothes: there is no
          cheap, trustworthy way to prove who built a piece of software and how.
        </p>
      </div>

      <Card className="mt-10 border-primary/25 bg-primary-subtle/40">
        <CardContent className="pt-6">
          <h2 className="text-display-sm mb-3">What we actually do</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            We read a repository&apos;s real development history — commit cadence,
            how work is distributed over time, contributor patterns, documentation
            depth — and turn it into a Verified Build Score with the full derivation
            published alongside it. Ownership has to be proved through GitHub. The
            weights are public. The score history is append-only, so it cannot be
            quietly improved after the fact.
          </p>
          <p className="text-sm text-muted-foreground leading-relaxed mt-3">
            That single mechanism is what makes the rest possible: a builder can
            sell or license work with evidence attached, a buyer can evaluate a
            stranger&apos;s code in minutes, and a recruiter can screen on output
            rather than claims.
          </p>
        </CardContent>
      </Card>

      {/* Real figures, so the About page isn't making claims the DB can't back. */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-10">
          {[
            { label: "projects verified", value: stats.projects_verified.toLocaleString("en-IN") },
            { label: "builders onboarded", value: stats.builders_total.toLocaleString("en-IN") },
            { label: "colleges represented", value: stats.colleges_represented.toLocaleString("en-IN") },
            {
              label: "transacted",
              value: "₹" + Math.round(stats.transacted_paise / 100).toLocaleString("en-IN"),
            },
          ].map((s) => (
            <div key={s.label} className="rounded-xl border bg-card p-4">
              <div className="font-display text-xl font-semibold tabular-nums">
                {s.value}
              </div>
              <div className="text-xs text-muted-foreground mt-1">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      <h2 className="text-display-md mt-14">What we refuse to do</h2>
      <div className="mt-5 space-y-3">
        {[
          {
            title: "We don't score things we can't measure.",
            body: "Originality is a capped proxy, not a plagiarism scan, and it's labelled as one everywhere it appears. We would rather show a limitation than imply a capability.",
          },
          {
            title: "We don't hide the arithmetic.",
            body: "The weights, penalties and thresholds are served from the scoring engine itself at a public endpoint. If a weight changes in the code, the published methodology changes with it.",
          },
          {
            title: "We don't pretend money has moved when it hasn't.",
            body: "Approving an escrow milestone records what is owed in a ledger. It does not trigger a transfer, because there is no automated payout rail yet — and the interface says so instead of implying otherwise.",
          },
          {
            title: "We don't promote what we've flagged.",
            body: "A project carrying a fraud signal is never featured, never marked verified, and never surfaced as a recommendation, regardless of how polished it looks.",
          },
        ].map(({ title, body }) => (
          <div key={title} className="rounded-xl border bg-surface/60 p-4">
            <p className="font-semibold text-sm">{title}</p>
            <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">{body}</p>
          </div>
        ))}
      </div>

      <h2 className="text-display-md mt-14">Where we are</h2>
      <p className="mt-4 text-muted-foreground leading-relaxed">
        Early. The scoring engine, marketplace, escrow ledger and public
        verification reports all work end to end. Automated payouts, real
        plagiarism detection and scheduled alerting are not built yet, and the{" "}
        <Link href="/changelog" className="underline underline-offset-2">
          changelog
        </Link>{" "}
        is honest about which is which.
      </p>

      <div className="mt-10 flex flex-wrap gap-3">
        <Button asChild>
          <Link href="/import">
            <GitBranch className="w-4 h-4" /> Import your repo
          </Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href="/how-verification-works">
            <Scale className="w-4 h-4" /> Read the methodology
          </Link>
        </Button>
        <Button variant="ghost" asChild>
          <Link href="/projects?verified=true">
            <ShieldCheck className="w-4 h-4" /> See verified projects
            <ArrowRight className="w-4 h-4" />
          </Link>
        </Button>
      </div>

      <p className="mt-12 text-sm text-muted-foreground">
        Questions or feedback:{" "}
        <a href="mailto:hello@codebazaar.dev" className="underline underline-offset-2">
          hello@codebazaar.dev
        </a>
      </p>
    </Container>
  );
}
