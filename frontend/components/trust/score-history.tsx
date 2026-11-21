"use client";
import { History } from "lucide-react";
import { Badge, Card, CardContent, CardHeader, CardTitle } from "@/components/ui/primitives";
import { Skeleton } from "@/components/ui/skeleton";
import { ScoreTrend } from "@/components/charts/sparkline";
import { useProjectScoreHistory } from "@/lib/hooks/analytics";

/**
 * Score history for a project.
 *
 * Snapshots are append-only, so this is a record rather than a presentation —
 * a score that dropped stays dropped. That is the point: a trend nobody can
 * edit is worth more than a number that only ever goes up.
 */
export function ScoreHistoryPanel({
  projectId,
  threshold = 70,
}: {
  projectId: string;
  threshold?: number;
}) {
  const { data, isLoading } = useProjectScoreHistory(projectId);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <History className="w-4 h-4" /> Score history
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-28 w-full rounded-lg" />
        </CardContent>
      </Card>
    );
  }

  const snapshots = data ?? [];

  // A single point is not a trend. Showing one dot on an axis implies history
  // that doesn't exist, so say what's actually true instead.
  if (snapshots.length < 2) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <History className="w-4 h-4 text-muted-foreground" /> Score history
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {snapshots.length === 0
              ? "No snapshots recorded yet. One is written each time verification runs."
              : "Only one verification run so far — a trend appears after the next one."}
          </p>
        </CardContent>
      </Card>
    );
  }

  const points = snapshots.map((s) => ({
    label: new Date(s.recorded_at).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
    }),
    value: s.verified_build_score ?? 0,
  }));

  const latest = snapshots[snapshots.length - 1];

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base flex items-center gap-2">
          <History className="w-4 h-4 text-primary" /> Score history
        </CardTitle>
        <Badge variant="ghost" size="sm">
          {snapshots.length} runs
        </Badge>
      </CardHeader>
      <CardContent>
        <ScoreTrend points={points} threshold={threshold} />
        {latest.fraud_flags.length > 0 && (
          <p className="text-xs text-muted-foreground mt-3 leading-relaxed">
            The most recent run carried {latest.fraud_flags.length} trust flag
            {latest.fraud_flags.length === 1 ? "" : "s"} — see the score breakdown
            above for what they were and how much each cost.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
