"use client";
import * as React from "react";
import { ChevronRight, GitCommit, Minus, Sigma, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/primitives";
import { ConfidenceBadge, confidenceExplanation, FlagRow } from "@/components/trust/trust-badges";
import type { BuildScore, ScoreComponent } from "@/types";

function bandBar(score: number | null) {
  if (score == null) return "bg-muted-foreground/25";
  if (score >= 70) return "bg-[hsl(var(--score-high))]";
  if (score >= 40) return "bg-[hsl(var(--score-mid))]";
  return "bg-[hsl(var(--score-low))]";
}

/**
 * One component row. Collapsed it shows the arithmetic; expanded it explains
 * what the component actually measures. Both matter — the number alone invites
 * "says who?", and the prose alone invites "so how was it weighted?".
 */
function ComponentRow({ component }: { component: ScoreComponent }) {
  const [open, setOpen] = React.useState(false);
  const pct = Math.round(component.weight * 100);
  const missing = component.score == null;

  return (
    <li className="border-b last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={cn(
          "w-full text-left py-3 group",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded-md"
        )}
      >
        <div className="flex items-center gap-3">
          <ChevronRight
            className={cn(
              "w-3.5 h-3.5 text-muted-foreground transition-transform duration-200 flex-shrink-0",
              open && "rotate-90"
            )}
            aria-hidden
          />
          <span className="text-sm font-medium flex-1 min-w-0 truncate group-hover:text-primary transition-colors">
            {component.label}
          </span>
          <Badge variant="ghost" size="sm" className="flex-shrink-0 tabular-nums">
            {pct}% weight
          </Badge>
          <span
            className={cn(
              "text-sm font-semibold tabular-nums w-10 text-right flex-shrink-0",
              missing && "text-muted-foreground"
            )}
          >
            {missing ? "—" : component.score}
          </span>
        </div>

        <div className="flex items-center gap-3 mt-2 pl-[1.625rem]">
          <div className="h-1.5 flex-1 rounded-full bg-secondary overflow-hidden">
            <div
              className={cn("h-full rounded-full transition-[width] duration-700 ease-out", bandBar(component.score))}
              style={{ width: `${component.score ?? 0}%` }}
            />
          </div>
          <span
            className="text-[11px] text-muted-foreground tabular-nums w-24 text-right flex-shrink-0"
            title="This component's contribution to the composite (weight x score)"
          >
            {missing ? "not recorded" : `+${component.contribution?.toFixed(1)} pts`}
          </span>
        </div>
      </button>

      {open && (
        <p className="pl-[1.625rem] pr-2 pb-3 -mt-1 text-xs text-muted-foreground leading-relaxed animate-fade-in">
          {component.explains}
        </p>
      )}
    </li>
  );
}

/**
 * "Why this score?" — the full derivation.
 *
 * Shows the six weighted components, the arithmetic that turns them into the
 * composite, every penalty applied, the confidence level, and the evidence the
 * score was drawn from. Nothing is hidden, including the fact that originality
 * is a capped proxy rather than a real plagiarism scan.
 */
export function ScoreBreakdown({
  data,
  defaultOpen = false,
}: {
  data: BuildScore;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = React.useState(defaultOpen);

  const weightedSubtotal = data.components.reduce(
    (sum, c) => sum + (c.contribution ?? 0),
    0
  );

  if (!data.breakdown_available) {
    return (
      <div className="rounded-lg border border-dashed bg-surface/60 p-4">
        <p className="text-xs text-muted-foreground leading-relaxed">
          This score was recorded before the component breakdown was captured, so
          only the composite is available. Re-running verification will produce a
          full derivation.
        </p>
        {data.reasoning && (
          <p className="mt-2 text-xs text-muted-foreground leading-relaxed">{data.reasoning}</p>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-xl border bg-surface/50 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={cn(
          "w-full flex items-center justify-between gap-3 px-4 py-3 text-left",
          "hover:bg-accent/50 transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        )}
      >
        <span className="flex items-center gap-2 min-w-0">
          <Sigma className="w-4 h-4 text-primary flex-shrink-0" />
          <span className="text-sm font-semibold">Why this score?</span>
          <span className="hidden sm:inline text-xs text-muted-foreground truncate">
            six weighted components, shown in full
          </span>
        </span>
        <ChevronRight
          className={cn(
            "w-4 h-4 text-muted-foreground transition-transform duration-200 flex-shrink-0",
            open && "rotate-90"
          )}
          aria-hidden
        />
      </button>

      {open && (
        <div className="px-4 pb-4 animate-fade-in">
          <ul className="border-t">
            {data.components.map((c) => (
              <ComponentRow key={c.key} component={c} />
            ))}
          </ul>

          {/* The arithmetic, spelled out. */}
          <dl className="mt-4 space-y-1.5 text-xs rounded-lg border bg-card p-3">
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted-foreground">Weighted subtotal</dt>
              <dd className="font-semibold tabular-nums">{weightedSubtotal.toFixed(1)}</dd>
            </div>
            {data.total_penalty > 0 && (
              <div className="flex items-center justify-between gap-3">
                <dt className="text-text-danger flex items-center gap-1">
                  <Minus className="w-3 h-3" /> Fraud-signal penalties
                </dt>
                <dd className="font-semibold tabular-nums text-text-danger">
                  −{data.total_penalty}
                </dd>
              </div>
            )}
            <div className="flex items-center justify-between gap-3 pt-1.5 border-t">
              <dt className="font-semibold">Verified Build Score</dt>
              <dd className="font-display text-base font-semibold tabular-nums">
                {data.verified_build_score ?? "—"}
                <span className="text-muted-foreground font-sans text-xs font-normal"> / 100</span>
              </dd>
            </div>
            <p className="text-[11px] text-muted-foreground pt-1.5 leading-relaxed">
              Verified status needs a score of {data.verified_threshold}+, proved
              repository ownership, and no disqualifying flag.
            </p>
          </dl>

          {/* Confidence + evidence. */}
          <div className="mt-3 rounded-lg border bg-card p-3">
            <div className="flex items-center gap-2 flex-wrap">
              <ConfidenceBadge confidence={data.confidence} withTooltip={false} />
              {data.commits_analyzed != null && (
                <Badge variant="ghost" size="sm">
                  <GitCommit className="w-3 h-3" /> {data.commits_analyzed} commits analysed
                </Badge>
              )}
              {data.contributors_count != null && (
                <Badge variant="ghost" size="sm">
                  <Users className="w-3 h-3" /> {data.contributors_count} contributor
                  {data.contributors_count === 1 ? "" : "s"}
                </Badge>
              )}
            </div>
            {confidenceExplanation(data.confidence) && (
              <p className="text-[11px] text-muted-foreground mt-2 leading-relaxed">
                {confidenceExplanation(data.confidence)}
              </p>
            )}
          </div>

          {/* Flags, with their real penalties. */}
          {data.flags.length > 0 && (
            <div className="mt-3">
              <p className="text-xs font-semibold mb-2">
                Trust signals we found ({data.flags.length})
              </p>
              <ul className="space-y-2">
                {data.flags.map((f) => (
                  <FlagRow key={f.key} flag={f} />
                ))}
              </ul>
            </div>
          )}

          {data.flags.length === 0 && (
            <p className="mt-3 text-xs text-text-success bg-background-success border border-border-success rounded-lg px-3 py-2">
              No fraud signals detected on this repository.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
