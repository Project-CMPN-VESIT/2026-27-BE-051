import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight, Calendar, ExternalLink, GitCommit, ShieldCheck, ShieldQuestion,
  Sparkles, Star, Users,
} from "lucide-react";
import { Badge, Card, CardContent, EmptyState } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/ui/layout";
import { Alert } from "@/components/ui/alert";
import { ScoreRing } from "@/components/trust/score-ring";
import { PublicScoreBreakdown } from "@/components/trust/public-score-breakdown";
import { PublicScoreHistory } from "@/components/trust/public-score-history";
import { fetchPublicReport, formatRupees } from "@/lib/public-server";

/**
 * The shareable, no-login verification report.
 *
 * This is the page a README badge links to, and the page a buyer, recruiter or
 * incubator lands on before they have an account. So it is a server component:
 * it renders without JavaScript, produces real link previews, and does not gate
 * anything behind a session.
 */

type Params = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  const report = await fetchPublicReport(id);

  if (!report) {
    return {
      title: "Verification report not found",
      robots: { index: false },
    };
  }

  const score = report.verified_build_score ?? 0;
  const headline = report.is_verified
    ? `${report.title} — Verified Build Score ${score}/100`
    : `${report.title} — Build Score ${score}/100`;
  const description =
    `Independently computed from ${report.commits_analyzed ?? "the"} commits across ` +
    `${report.repo_full_name}. ${report.is_verified
      ? "Ownership proved, no disqualifying fraud signals."
      : "See the full component breakdown and any trust flags."}`;

  return {
    title: headline,
    description,
    openGraph: {
      title: headline,
      description,
      type: "article",
      // The badge doubles as the social preview — it already encodes the score.
      images: [{ url: report.badge_url, width: 200, height: 20, alt: headline }],
    },
    twitter: { card: "summary", title: headline, description },
  };
}

const TIER_COPY: Record<string, string> = {
  elite: "Elite builder",
  trusted: "Trusted builder",
  rising: "Rising builder",
  newcomer: "Newcomer",
};

export default async function PublicVerifyPage({ params }: Params) {
  const { id } = await params;
  const report = await fetchPublicReport(id);

  if (!report) {
    return (
      <Container className="py-20">
        <div className="max-w-lg mx-auto">
          <EmptyState
            icon={<ShieldQuestion />}
            title="No verification report here"
            description="This project either doesn't exist, was removed, or hasn't been through verification yet. If you followed a badge from a README, the link may be out of date."
            action={
              <Button asChild>
                <Link href="/projects">Browse verified projects</Link>
              </Button>
            }
          />
        </div>
      </Container>
    );
  }

  const score = report.verified_build_score;
  const shortBy = score != null ? report.verified_threshold - score : null;

  return (
    <Container className="py-10 sm:py-14 max-w-4xl">
      {/* Provenance line — says what this page is before anything else. */}
      <div className="flex items-center gap-2 text-eyebrow mb-5">
        <ShieldCheck className="w-3.5 h-3.5 text-primary" />
        Independent verification report
      </div>

      <div className="flex flex-col-reverse sm:flex-row sm:items-start gap-6 sm:gap-8">
        <div className="min-w-0 flex-1">
          <h1 className="text-display-lg">{report.title}</h1>
          <a
            href={report.repo_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 mt-2 font-mono text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            {report.repo_full_name}
            <ExternalLink className="w-3 h-3" />
          </a>

          {report.description && (
            <p className="mt-4 text-muted-foreground leading-relaxed max-w-2xl">
              {report.description}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-1.5 mt-5">
            {report.is_verified ? (
              <Badge variant="success">
                <ShieldCheck className="w-3 h-3" /> Verified build
              </Badge>
            ) : (
              <Badge variant="warning">Not verified</Badge>
            )}
            {report.ownership_verified && (
              <Badge variant="info">Ownership proved</Badge>
            )}
            {report.hackathon_verified && (
              <Badge variant="info">Hackathon verified</Badge>
            )}
            {report.primary_language && (
              <Badge variant="ghost">{report.primary_language}</Badge>
            )}
            <Badge variant="ghost" className="capitalize">{report.stage}</Badge>
          </div>
        </div>

        <div className="flex-shrink-0 self-center sm:self-start">
          <ScoreRing
            score={score}
            size="xl"
            threshold={report.verified_threshold}
            caption={
              report.is_verified
                ? "Meets the verified bar"
                : shortBy != null && shortBy > 0
                  ? `${shortBy} short of the ${report.verified_threshold} bar`
                  : `Bar is ${report.verified_threshold}`
            }
          />
        </div>
      </div>

      {/* Evidence strip — the facts the score was computed from. */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-10">
        <Fact
          icon={<GitCommit className="w-3.5 h-3.5" />}
          label="Commits analysed"
          value={report.commits_analyzed?.toLocaleString("en-IN") ?? "—"}
        />
        <Fact
          icon={<Users className="w-3.5 h-3.5" />}
          label="Contributors"
          value={report.contributors_count?.toString() ?? "—"}
        />
        <Fact
          icon={<Calendar className="w-3.5 h-3.5" />}
          label="Repo age"
          value={report.repo_age_days != null ? `${report.repo_age_days} days` : "—"}
        />
        <Fact
          icon={<Star className="w-3.5 h-3.5" />}
          label="GitHub stars"
          value={report.stars.toLocaleString("en-IN")}
        />
      </div>

      {/* The derivation. */}
      <div className="mt-10">
        <h2 className="text-display-sm mb-1">How this score was derived</h2>
        <p className="text-sm text-muted-foreground mb-4 max-w-2xl leading-relaxed">
          Six weighted components, computed from the repository&apos;s real commit
          history and metadata. Nothing here is self-reported by the builder.
        </p>
        <PublicScoreBreakdown report={report} />
      </div>

      {/* Builder. */}
      <div className="mt-10">
        <h2 className="text-display-sm mb-4">Built by</h2>
        <Card>
          <CardContent className="pt-5 flex items-center gap-4 flex-wrap">
            <span className="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center text-lg font-semibold flex-shrink-0">
              {report.owner.display_name.charAt(0).toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{report.owner.display_name}</p>
              <p className="text-sm text-muted-foreground">
                {[
                  report.owner.college,
                  report.owner.tier ? TIER_COPY[report.owner.tier] : null,
                  report.owner.verified_projects != null
                    ? `${report.owner.verified_projects} verified project${report.owner.verified_projects === 1 ? "" : "s"}`
                    : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>
            <Button variant="outline" size="sm" asChild>
              <Link href={`/u/${report.owner.id}`}>
                View profile <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Commercial call to action, only when there is one. */}
      {report.is_for_sale && report.price_paise != null && (
        <Card className="mt-8 border-cta/40 bg-cta-subtle/60">
          <CardContent className="pt-5 flex items-center justify-between gap-4 flex-wrap">
            <div className="min-w-0">
              <p className="font-semibold flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-cta" />
                Available to buy — {formatRupees(report.price_paise)}
              </p>
              {report.price_label && (
                <p className="text-sm text-muted-foreground mt-0.5">
                  {report.price_label}
                </p>
              )}
            </div>
            <Button variant="cta" asChild>
              <Link href={`/projects/${report.project_id}`}>
                View listing <ArrowRight className="w-4 h-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Score history — public, because a trend only visible to the owner
          isn't evidence to anyone else. */}
      <div className="mt-10">
        <h2 className="text-display-sm mb-4">Score over time</h2>
        <PublicScoreHistory projectId={report.project_id} threshold={report.verified_threshold} />
      </div>

      {/* Honest limits. Stated on the page, not buried in a FAQ. */}
      <Alert
        variant="neutral"
        className="mt-10"
        title="What this report does and doesn't prove"
        description={
          <>
            It proves the repository&apos;s development history is consistent with
            genuine, sustained work, and that the builder controls the account.
            It is <strong>not</strong> a code audit, a security review, or a
            plagiarism scan — the originality component is an explicitly capped
            proxy. Read the{" "}
            <Link href="/how-verification-works" className="underline underline-offset-2">
              full methodology
            </Link>
            , including how someone might try to game it.
          </>
        }
      />

      <p className="mt-8 text-xs text-muted-foreground">
        Report generated by CodeBazaar from public GitHub data.{" "}
        {report.verified_at && (
          <>Last computed {new Date(report.verified_at).toLocaleDateString("en-IN", {
            day: "numeric", month: "short", year: "numeric",
          })}. </>
        )}
        <Link href="/" className="underline underline-offset-2">
          What is CodeBazaar?
        </Link>
      </p>
    </Container>
  );
}

function Fact({
  icon, label, value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        {icon} {label}
      </div>
      <div className="mt-1.5 text-display-sm font-display tabular-nums">{value}</div>
    </div>
  );
}
