import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, ArrowRight, Ban, Scale, ShieldCheck } from "lucide-react";
import { Badge, Card, CardContent } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/ui/layout";
import { Alert } from "@/components/ui/alert";
import { fetchMethodology } from "@/lib/public-server";

export const metadata: Metadata = {
  title: "How verification works",
  description:
    "The full methodology behind the Verified Build Score: the six weighted components, the fraud signals and their penalties, and an honest account of what the score cannot prove.",
};

/**
 * The published methodology.
 *
 * Weights and flag definitions are fetched from the API rather than written here,
 * so this page cannot drift from the engine. If someone retunes a weight in
 * Python, this page updates on the next revalidation.
 */
export default async function HowVerificationWorksPage() {
  const methodology = await fetchMethodology();

  return (
    <Container className="py-12 sm:py-16 max-w-3xl">
      <div className="text-eyebrow mb-4 flex items-center gap-2">
        <Scale className="w-3.5 h-3.5 text-primary" /> Methodology
      </div>
      <h1 className="text-display-xl">How verification works</h1>
      <p className="mt-5 text-lg text-muted-foreground leading-relaxed">
        A Verified Build Score is computed from a repository&apos;s actual commit
        history and metadata. No part of it is self-reported by the builder, and
        every component is published below — including the ones we deliberately
        cap because we can&apos;t prove them.
      </p>

      {!methodology ? (
        <Alert
          variant="warning"
          className="mt-10"
          title="Couldn't load the live rulebook"
          description="The methodology is served from the scoring engine so it can never fall out of date. That request failed just now — please refresh. The summary below still applies: six weighted components, minus penalties for fraud signals, with a threshold of 70 for verified status."
        />
      ) : (
        <>
          {/* ── The six components ─────────────────────────────────────── */}
          <section className="mt-12">
            <h2 className="text-display-md">The six components</h2>
            <p className="mt-3 text-muted-foreground leading-relaxed">
              The composite is a weighted sum. Weights add up to 100% and are
              tuned so that things which are cheap to fake count for little.
            </p>

            <div className="mt-6 space-y-3">
              {methodology.components.map((c) => (
                <Card key={c.key}>
                  <CardContent className="pt-5">
                    <div className="flex items-baseline justify-between gap-3 mb-2">
                      <h3 className="font-semibold">{c.label}</h3>
                      <Badge variant="brand" className="tabular-nums flex-shrink-0">
                        {Math.round(c.weight * 100)}%
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {c.explains}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>

          {/* ── Fraud signals ──────────────────────────────────────────── */}
          <section className="mt-14">
            <h2 className="text-display-md">Fraud signals and penalties</h2>
            <p className="mt-3 text-muted-foreground leading-relaxed">
              Some patterns don&apos;t just fail to earn points, they actively
              subtract them. A repository can look polished and still be a code
              dump, so penalties apply on top of the weighted sum.
            </p>

            <div className="mt-6 space-y-3">
              {methodology.flags.map((f) => {
                const critical = f.severity === "critical";
                return (
                  <div
                    key={f.key}
                    className={`rounded-xl border p-4 ${
                      critical
                        ? "border-border-danger bg-background-danger/40"
                        : "border-border-warning bg-background-warning/40"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-2.5 min-w-0">
                        <AlertTriangle
                          className={`w-4 h-4 mt-0.5 flex-shrink-0 ${
                            critical ? "text-text-danger" : "text-text-warning"
                          }`}
                        />
                        <div className="min-w-0">
                          <p className="font-semibold text-sm">{f.label}</p>
                          <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                            {f.explains}
                          </p>
                          <code className="text-[11px] text-muted-foreground mt-1.5 inline-block font-mono">
                            {f.key}
                          </code>
                        </div>
                      </div>
                      <span
                        className={`text-sm font-semibold tabular-nums flex-shrink-0 ${
                          critical ? "text-text-danger" : "text-text-warning"
                        }`}
                      >
                        {f.penalty > 0 ? `−${f.penalty}` : "0"}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* ── The verified bar ───────────────────────────────────────── */}
          <section className="mt-14">
            <h2 className="text-display-md">What earns the verified badge</h2>
            <Card className="mt-5 border-border-success bg-background-success/40">
              <CardContent className="pt-5">
                <p className="text-sm font-semibold text-text-success flex items-center gap-2 mb-3">
                  <ShieldCheck className="w-4 h-4" /> All three must hold
                </p>
                <ol className="space-y-2.5 text-sm">
                  <li className="flex gap-2.5">
                    <span className="font-semibold tabular-nums text-text-success">1.</span>
                    <span>
                      A composite score of{" "}
                      <strong>{methodology.verified_threshold} or above</strong>.
                    </span>
                  </li>
                  <li className="flex gap-2.5">
                    <span className="font-semibold tabular-nums text-text-success">2.</span>
                    <span>
                      <strong>Proved repository ownership</strong> — the builder
                      demonstrates control of the GitHub account. A high score
                      alone is never enough.
                    </span>
                  </li>
                  <li className="flex gap-2.5">
                    <span className="font-semibold tabular-nums text-text-success">3.</span>
                    <span>
                      <strong>No disqualifying flag.</strong> These override the
                      score entirely:{" "}
                      {methodology.disqualifying_flags.map((f, i) => (
                        <span key={f}>
                          <code className="font-mono text-xs">{f}</code>
                          {i < methodology.disqualifying_flags.length - 1 ? ", " : ""}
                        </span>
                      ))}
                      .
                    </span>
                  </li>
                </ol>
              </CardContent>
            </Card>
          </section>
        </>
      )}

      {/* ── Honest limits ────────────────────────────────────────────── */}
      <section className="mt-14">
        <h2 className="text-display-md flex items-center gap-2">
          <Ban className="w-5 h-5 text-muted-foreground" />
          What this score does not prove
        </h2>
        <p className="mt-3 text-muted-foreground leading-relaxed">
          Being specific about the limits is what makes the rest worth trusting.
        </p>

        <div className="mt-6 space-y-4">
          <Limit title="It is not a plagiarism scan.">
            Real originality checking requires code-similarity analysis against a
            corpus, and we have not built that. The originality component is a
            proxy inferred from fork status, description and README depth, and it
            is <strong>capped at 90</strong> so it can never masquerade as a
            certainty.
          </Limit>
          <Limit title="It is not a code audit or a security review.">
            The score measures how the code was <em>developed</em>, not whether it
            is well-architected or free of vulnerabilities. A carefully-built
            project with a SQL injection bug can still score highly.
          </Limit>
          <Limit title="It is not a guarantee of commercial value.">
            Sustained development history says nothing about whether anyone wants
            the product.
          </Limit>
          <Limit title="A private or unreachable repository can't be scored.">
            When GitHub signals can&apos;t be read, the result is an explicit
            &ldquo;signals unavailable&rdquo; state with low confidence — not a
            zero, and not a guess.
          </Limit>
        </div>
      </section>

      {/* ── Gaming ───────────────────────────────────────────────────── */}
      <section className="mt-14">
        <h2 className="text-display-md">Could someone game it?</h2>
        <p className="mt-3 text-muted-foreground leading-relaxed">
          Partly, and it is worth being precise about where.
        </p>
        <ul className="mt-5 space-y-3 text-sm text-muted-foreground">
          <li className="flex gap-3">
            <ArrowRight className="w-4 h-4 mt-0.5 flex-shrink-0 text-primary" />
            <span>
              <strong className="text-foreground">Stars and forks barely move the score.</strong>{" "}
              They are cheap to buy, so they carry almost no weight. Popularity is
              not evidence of authorship.
            </span>
          </li>
          <li className="flex gap-3">
            <ArrowRight className="w-4 h-4 mt-0.5 flex-shrink-0 text-primary" />
            <span>
              <strong className="text-foreground">Back-dated commits are detectable.</strong>{" "}
              Git lets you set author dates freely, but a history whose commits all
              land inside a single day trips the burst penalty. Manufacturing a
              plausible year of distributed activity is substantially harder than
              rewriting timestamps.
            </span>
          </li>
          <li className="flex gap-3">
            <ArrowRight className="w-4 h-4 mt-0.5 flex-shrink-0 text-primary" />
            <span>
              <strong className="text-foreground">Documentation is gameable, and only worth 15%.</strong>{" "}
              You can write a long README for code you didn&apos;t write. That is
              why the two heaviest components — commit cadence and activity
              consistency, 20% each — are behavioural rather than cosmetic.
            </span>
          </li>
          <li className="flex gap-3">
            <ArrowRight className="w-4 h-4 mt-0.5 flex-shrink-0 text-primary" />
            <span>
              <strong className="text-foreground">Ownership is the hard gate.</strong>{" "}
              Without proving control of the account, a project cannot be verified
              at any score.
            </span>
          </li>
        </ul>
      </section>

      <Alert
        variant="info"
        className="mt-12"
        title="Audit it yourself"
        description={
          <>
            The rulebook on this page is served from the scoring engine at{" "}
            <code className="font-mono text-xs">GET /verification/methodology</code>{" "}
            and requires no authentication, so it cannot drift from what the code
            applies. Any project&apos;s full derivation is available the same way —
            see the <Link href="/docs/api" className="underline underline-offset-2">API docs</Link>.
          </>
        }
      />

      <div className="mt-10 flex flex-wrap gap-3">
        <Button asChild>
          <Link href="/projects?verified=true">
            Browse verified projects <ArrowRight className="w-4 h-4" />
          </Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href="/import">Get your repo verified</Link>
        </Button>
      </div>
    </Container>
  );
}

function Limit({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border bg-surface/60 p-4">
      <p className="font-semibold text-sm">{title}</p>
      <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">{children}</p>
    </div>
  );
}
