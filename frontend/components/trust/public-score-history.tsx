import { Badge } from "@/components/ui/primitives";
import { ScoreTrend } from "@/components/charts/sparkline";
import { fetchScoreHistory } from "@/lib/public-server";

/**
 * Server-rendered score history for the public report.
 *
 * Fetches on the server so the trend is in the initial HTML — this page is
 * shared as a link and must stand up without client JavaScript running first.
 */
export async function PublicScoreHistory({
  projectId,
  threshold = 70,
}: {
  projectId: string;
  threshold?: number;
}) {
  const snapshots = await fetchScoreHistory(projectId);

  if (snapshots.length < 2) {
    return (
      <div className="rounded-xl border border-dashed bg-surface/60 p-5">
        <p className="text-sm text-muted-foreground leading-relaxed">
          {snapshots.length === 0
            ? "No score history recorded yet. A snapshot is written every time verification runs, so a trend builds up over time."
            : "Only one verification run so far, so there's no trend to plot yet. A second run will produce one."}
        </p>
      </div>
    );
  }

  const points = snapshots.map((s) => ({
    label: new Date(s.recorded_at).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
    }),
    value: s.verified_build_score ?? 0,
  }));

  const first = snapshots[0].verified_build_score ?? 0;
  const last = snapshots[snapshots.length - 1].verified_build_score ?? 0;

  return (
    <div className="rounded-xl border bg-card p-4 sm:p-5">
      <div className="flex items-center gap-2 flex-wrap mb-4">
        <Badge variant="ghost" size="sm">{snapshots.length} verification runs</Badge>
        {last > first && <Badge variant="success" size="sm">Improving</Badge>}
        {last < first && <Badge variant="warning" size="sm">Declined</Badge>}
        {last === first && <Badge variant="ghost" size="sm">Stable</Badge>}
      </div>
      <ScoreTrend points={points} threshold={threshold} />
      <p className="text-xs text-muted-foreground mt-3 leading-relaxed">
        Snapshots are append-only — a score that fell stays on the record. Nothing
        on this chart can be edited or removed by the builder.
      </p>
    </div>
  );
}
