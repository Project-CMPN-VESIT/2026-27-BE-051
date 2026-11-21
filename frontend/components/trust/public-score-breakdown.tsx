import { AlertTriangle, ChevronRight, GitCommit, Minus, Users } from "lucide-react";
import { Badge } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";
import type { PublicReport, ScoreComponent, ScoreFlag } from "@/types";

/**
 * Server-rendered score breakdown for the public report page.
 *
 * Uses native <details>/<summary> rather than React state so the whole
 * derivation is readable with JavaScript disabled, and so the content is present
 * in the initial HTML for crawlers and link unfurlers. The signed-in app uses the
 * interactive client version in `score-breakdown.tsx` instead.
 */

const CONFIDENCE_COPY: Record<string, string> = {
  high: "Commit history, contributor data and README were all readable, and ownership is proved.",
  medium: "Some signals were available but not all — treat components with missing data cautiously.",
  low: "Few signals could be read, so there isn't enough evidence to rely on this score.",
};

function bandBar(score: number | null) {
  if (score == null) return "bg-muted-foreground/25";
  if (score >= 70) return "bg-[hsl(var(--score-high))]";
  if (score >= 40) return "bg-[hsl(var(--score-mid))]";
  return "bg-[hsl(var(--score-low))]";
}

function ComponentRow({ component }: { component: ScoreComponent }) {
  const pct = Math.round(component.weight * 100);
  const missing = component.score == null;

  return (
    <details className="group border-b last:border-b-0">
      <summary
        className={cn(
          "cursor-pointer list-none py-3.5 px-1",
          "hover:bg-accent/40 transition-colors rounded-md",
          "[&::-webkit-details-marker]:hidden"
        )}
      >
        <div className="flex items-center gap-3">
          <ChevronRight
            className="w-3.5 h-3.5 text-muted-foreground transition-transform duration-200 group-open:rotate-90 flex-shrink-0"
            aria-hidden
          />
          <span className="text-sm font-medium flex-1 min-w-0 truncate">
            {component.label}
          </span>
          <Badge variant="ghost" size="sm" className="flex-shrink-0 tabular-nums">
            {pct}% weight
          </Badge>
          <span
            className={cn(
              "text-sm font-semibold tabular-nums w-9 text-right flex-shrink-0",
              missing && "text-muted-foreground"
            )}
          >
            {missing ? "—" : component.score}
          </span>
        </div>

        <div className="flex items-center gap-3 mt-2 pl-[1.625rem]">
          <div className="h-1.5 flex-1 rounded-full bg-secondary overflow-hidden">
            <div
              className={cn("h-full rounded-full", bandBar(component.score))}
              style={{ width: `${component.score ?? 0}%` }}
            />
          </div>
          <span className="text-[11px] text-muted-foreground tabular-nums w-24 text-right flex-shrink-0">
            {missing ? "not recorded" : `+${component.contribution?.toFixed(1)} pts`}
          </span>
        </div>
      </summary>
      <p className="pl-[1.625rem] pr-2 pb-3.5 text-xs text-muted-foreground leading-relaxed">
        {component.explains}
      </p>
    </details>
  );
}

function FlagCard({ flag }: { flag: ScoreFlag }) {
  const critical = flag.severity === "critical";
  return (
    <li
      className={cn(
        "rounded-lg border p-3",
        critical
          ? "border-border-danger bg-background-danger/50"
          : "border-border-warning bg-background-warning/50"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2 min-w-0">
          <AlertTriangle
            className={cn(
              "w-3.5 h-3.5 mt-0.5 flex-shrink-0",
              critical ? "text-text-danger" : "text-text-warning"
            )}
          />
          <div className="min-w-0">
            <p className={cn("text-xs font-semibold", critical ? "text-text-danger" : "text-text-warning")}>
              {flag.label}
            </p>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              {flag.explains}
            </p>
          </div>
        </div>
        {flag.penalty > 0 && (
          <span
            className={cn(
              "text-xs font-semibold tabular-nums flex-shrink-0",
              critical ? "text-text-danger" : "text-text-warning"
            )}
            title="Points subtracted from the composite score"
          >
            −{flag.penalty}
          </span>
        )}
      </div>
    </li>
  );
}

export function PublicScoreBreakdown({ report }: { report: PublicReport }) {
  const subtotal = report.components.reduce((sum, c) => sum + (c.contribution ?? 0), 0);

  if (!report.breakdown_available) {
    return (
      <div className="rounded-xl border border-dashed bg-surface/60 p-5">
        <p className="text-sm text-muted-foreground leading-relaxed">
          This score predates component-level recording, so only the composite is
          available. Re-running verification produces the full derivation.
        </p>
        {report.reasoning && (
          <p className="mt-3 text-xs text-muted-foreground leading-relaxed">
            {report.reasoning}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border bg-card px-4 py-1">
        <ul className="list-none">
          {report.components.map((c) => (
            <ComponentRow key={c.key} component={c} />
          ))}
        </ul>
      </div>

      {/* The arithmetic, in full. */}
      <dl className="rounded-xl border bg-surface/60 p-4 space-y-2 text-sm">
        <div className="flex items-center justify-between gap-3">
          <dt className="text-muted-foreground">Weighted subtotal</dt>
          <dd className="font-semibold tabular-nums">{subtotal.toFixed(1)}</dd>
        </div>
        {report.total_penalty > 0 && (
          <div className="flex items-center justify-between gap-3">
            <dt className="text-text-danger flex items-center gap-1.5">
              <Minus className="w-3 h-3" /> Fraud-signal penalties
            </dt>
            <dd className="font-semibold tabular-nums text-text-danger">
              −{report.total_penalty}
            </dd>
          </div>
        )}
        <div className="flex items-center justify-between gap-3 pt-2 border-t">
          <dt className="font-semibold">Verified Build Score</dt>
          <dd className="font-display text-lg font-semibold tabular-nums">
            {report.verified_build_score ?? "—"}
            <span className="text-muted-foreground font-sans text-xs font-normal"> / 100</span>
          </dd>
        </div>
        <p className="text-xs text-muted-foreground pt-1.5 leading-relaxed">
          Verified status requires a score of {report.verified_threshold}+, proved
          repository ownership, and no disqualifying flag. All three, not any one.
        </p>
      </dl>

      {/* Confidence and evidence. */}
      <div className="rounded-xl border bg-card p-4">
        <div className="flex flex-wrap items-center gap-2">
          {report.confidence && (
            <Badge
              variant={
                report.confidence === "high" ? "success"
                  : report.confidence === "medium" ? "info" : "warning"
              }
            >
              {report.confidence} confidence
            </Badge>
          )}
          {report.commits_analyzed != null && (
            <Badge variant="ghost" size="sm">
              <GitCommit className="w-3 h-3" /> {report.commits_analyzed} commits
            </Badge>
          )}
          {report.contributors_count != null && (
            <Badge variant="ghost" size="sm">
              <Users className="w-3 h-3" /> {report.contributors_count} contributor
              {report.contributors_count === 1 ? "" : "s"}
            </Badge>
          )}
        </div>
        {report.confidence && CONFIDENCE_COPY[report.confidence] && (
          <p className="text-xs text-muted-foreground mt-2.5 leading-relaxed">
            {CONFIDENCE_COPY[report.confidence]}
          </p>
        )}
      </div>

      {/* Flags. */}
      {report.flags.length > 0 ? (
        <div>
          <p className="text-sm font-semibold mb-2.5">
            Trust signals found ({report.flags.length})
          </p>
          <ul className="space-y-2 list-none">
            {report.flags.map((f) => (
              <FlagCard key={f.key} flag={f} />
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-sm text-text-success bg-background-success border border-border-success rounded-xl px-4 py-3">
          No fraud signals detected on this repository.
        </p>
      )}
    </div>
  );
}
