"use client";
import * as React from "react";
import Link from "next/link";
import { Calendar, ExternalLink, RefreshCw, ShieldAlert, ShieldCheck, ShieldQuestion } from "lucide-react";
import { Badge, Card, CardContent, CardHeader, CardTitle, EmptyState } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ScoreRing } from "@/components/trust/score-ring";
import { ScoreBreakdown } from "@/components/trust/score-breakdown";
import { VerifiedSeal } from "@/components/trust/trust-badges";
import { useBuildScore, useTriggerBuildScore } from "@/lib/hooks";
import { getErrorMessage } from "@/lib/api/client";
import { Alert } from "@/components/ui/alert";

export { BuildScoreChip as BuildScoreBadge } from "@/components/trust/trust-badges";

/**
 * Full Verified Build Score™ panel for the project detail page.
 *
 * The score is the product's core claim, so the panel is built to be argued
 * with: the composite, the six components that produced it, the penalties, the
 * confidence level and the evidence are all on screen or one click away.
 */
export function VerifiedBuildScorePanel({
  projectId,
  isOwner,
  githubToken,
  publicReportHref,
}: {
  projectId: string;
  isOwner?: boolean;
  githubToken?: string;
  /** Link to the shareable no-login report, when one applies. */
  publicReportHref?: string;
}) {
  const { data, isLoading, isError, error } = useBuildScore(projectId);
  const { mutate: recompute, isPending, isSuccess: justRecomputed } = useTriggerBuildScore();

  const onRecompute = () => recompute({ projectId, githubToken });

  // Celebrate the transition, not the steady state: the tick only animates for
  // a few seconds after a recompute lands.
  const [celebrate, setCelebrate] = React.useState(false);
  React.useEffect(() => {
    if (!justRecomputed) return;
    const frame = requestAnimationFrame(() => setCelebrate(true));
    const timeout = setTimeout(() => setCelebrate(false), 2600);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(timeout);
    };
  }, [justRecomputed]);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldQuestion className="w-4 h-4 text-muted-foreground" />
            Verified Build Score™
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-5">
            <Skeleton className="w-28 h-28 rounded-full flex-shrink-0" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-56" />
              <Skeleton className="h-3 w-32" />
            </div>
          </div>
          <Skeleton className="h-11 w-full rounded-xl" />
        </CardContent>
      </Card>
    );
  }

  // A missing verification record is the normal "not scored yet" case, not a
  // failure — so it gets a designed empty state, never a raw error.
  if (isError || !data) {
    const notFound = (error as { response?: { status?: number } })?.response?.status === 404;
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldQuestion className="w-4 h-4 text-muted-foreground" />
            Verified Build Score™
          </CardTitle>
        </CardHeader>
        <CardContent>
          {notFound || !error ? (
            <EmptyState
              icon={<ShieldQuestion />}
              title="Not scored yet"
              description={
                isOwner
                  ? "Run verification to compute this project's score from its real commit history. It takes a few seconds."
                  : "This project hasn't been through verification yet, so there's no score to show."
              }
              action={
                isOwner ? (
                  <Button variant="cta" onClick={onRecompute} loading={isPending} loadingText="Verifying…">
                    <ShieldCheck className="w-4 h-4" /> Run verification
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <Alert
              variant="danger"
              title="Couldn't load the score"
              description={getErrorMessage(error)}
              action={
                <Button size="sm" variant="outline" onClick={() => location.reload()}>
                  Try again
                </Button>
              }
            />
          )}
        </CardContent>
      </Card>
    );
  }

  const score = data.verified_build_score;
  const verified = data.is_verified;

  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          {verified ? (
            <ShieldCheck className="w-4 h-4 text-text-success" />
          ) : (
            <ShieldAlert className="w-4 h-4 text-text-warning" />
          )}
          Verified Build Score™
        </CardTitle>
        <div className="flex items-center gap-1.5">
          {publicReportHref && (
            <Button size="sm" variant="ghost" asChild className="h-7 text-xs gap-1.5">
              <Link href={publicReportHref}>
                <ExternalLink className="w-3 h-3" /> Public report
              </Link>
            </Button>
          )}
          {isOwner && (
            <Button
              size="sm"
              variant="ghost"
              onClick={onRecompute}
              loading={isPending}
              loadingText="Verifying…"
              className="gap-1.5 h-7 text-xs"
            >
              <RefreshCw className="w-3 h-3" /> Recompute
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-5">
          <ScoreRing
            score={score}
            size="lg"
            threshold={data.verified_threshold}
            className="flex-shrink-0 self-center sm:self-auto"
          />
          <div className="space-y-3 min-w-0 flex-1">
            <VerifiedSeal
              verified={verified}
              score={score}
              threshold={data.verified_threshold}
              celebrate={celebrate}
            />
            <div className="flex flex-wrap gap-1.5">
              {data.ownership_verified ? (
                <Badge variant="success" size="sm">
                  <ShieldCheck className="w-3 h-3" /> Ownership proved
                </Badge>
              ) : (
                <Badge variant="warning" size="sm">
                  Ownership unproved
                </Badge>
              )}
              {data.hackathon_verified && (
                <Badge variant="info" size="sm">
                  <ShieldCheck className="w-3 h-3" /> Hackathon verified
                </Badge>
              )}
              {data.repo_age_days != null && (
                <Badge variant="ghost" size="sm">
                  <Calendar className="w-3 h-3" /> {data.repo_age_days} days old
                </Badge>
              )}
            </div>
          </div>
        </div>

        <ScoreBreakdown data={data} />
      </CardContent>
    </Card>
  );
}
