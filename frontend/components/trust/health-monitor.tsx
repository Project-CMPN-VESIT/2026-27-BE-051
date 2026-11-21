"use client";
import Link from "next/link";
import {
  Activity, ArrowDownRight, ArrowRight, ArrowUpRight, Clock, Minus,
  RefreshCw, TriangleAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, EmptyState } from "@/components/ui/primitives";
import { Alert } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { useRecheckHealth } from "@/lib/hooks/advanced";
import { cn } from "@/lib/utils";
import type { HealthTrend } from "@/types/advanced";

const DIRECTION = {
  up: {
    icon: ArrowUpRight,
    label: "Improving",
    tone: "text-text-success",
    bg: "bg-[hsl(var(--score-high))]/10",
  },
  down: {
    icon: ArrowDownRight,
    label: "Declining",
    tone: "text-destructive",
    bg: "bg-destructive/10",
  },
  flat: {
    icon: Minus,
    label: "Stable",
    tone: "text-muted-foreground",
    bg: "bg-muted/40",
  },
  unknown: {
    icon: Minus,
    label: "Not enough readings",
    tone: "text-muted-foreground",
    bg: "bg-muted/40",
  },
} as const;

/**
 * A purchased project's score over time since the buyer paid for it.
 *
 * The chart is drawn from `score_snapshots`, which the verification engine
 * appends on every run. That means the line is a record of measurements, not a
 * smoothed projection — so gaps between readings are shown as the real intervals
 * they are rather than evenly spaced points.
 */
export function HealthTrendCard({
  trend,
  showLink = true,
  className,
}: {
  trend: HealthTrend;
  showLink?: boolean;
  className?: string;
}) {
  const recheck = useRecheckHealth(trend.project_id);
  const dir = DIRECTION[trend.direction] ?? DIRECTION.unknown;
  const DirIcon = dir.icon;

  const scores = trend.series
    .map((r) => r.score)
    .filter((s): s is number => s != null);
  const hasSeries = scores.length >= 2;

  return (
    <div className={cn("rounded-xl border bg-card overflow-hidden", className)}>
      <div className="px-4 sm:px-5 py-4 flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Activity className="w-4 h-4 text-primary flex-shrink-0" />
            <h3 className="font-semibold text-sm truncate">
              {trend.project_title ?? "Purchased project"}
            </h3>
          </div>
          {trend.repo_full_name && (
            <p className="text-xs font-mono text-muted-foreground mt-1 truncate">
              {trend.repo_full_name}
            </p>
          )}
        </div>
        <div
          className={cn(
            "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold flex-shrink-0",
            dir.bg,
            dir.tone,
          )}
        >
          <DirIcon className="w-3.5 h-3.5" />
          {dir.label}
        </div>
      </div>

      {/* Baseline → now */}
      <div className="px-4 sm:px-5 pb-4 flex items-center gap-3 sm:gap-5 flex-wrap">
        <Reading label="At purchase" value={trend.baseline_score} />
        <ArrowRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
        <Reading label="Latest reading" value={trend.latest_score} emphasise />
        {trend.delta != null && trend.delta !== 0 && (
          <span
            className={cn(
              "text-sm font-semibold tabular-nums",
              trend.delta > 0 ? "text-text-success" : "text-destructive",
            )}
          >
            {trend.delta > 0 ? "+" : ""}
            {trend.delta}
          </span>
        )}
      </div>

      {/* Sparkline */}
      {hasSeries ? (
        <div className="px-4 sm:px-5 pb-4">
          <Sparkline series={trend.series} />
          <div className="flex items-center justify-between mt-1.5 text-[11px] text-muted-foreground">
            <span>
              {new Date(trend.purchased_at).toLocaleDateString("en-IN", {
                day: "numeric",
                month: "short",
              })}
            </span>
            <span>
              {trend.readings} weekly reading{trend.readings === 1 ? "" : "s"}
            </span>
            <span>Now</span>
          </div>
        </div>
      ) : (
        <p className="px-4 sm:px-5 pb-4 text-xs text-muted-foreground leading-relaxed">
          Only one reading so far. The trend appears after the next weekly check —
          a single point is a snapshot, not a trend, and drawing a line through it
          would be inventing data.
        </p>
      )}

      {/* Staleness — the actual thing a buyer cares about */}
      {trend.days_since_push != null && trend.days_since_push >= 60 && (
        <div className="px-4 sm:px-5 pb-4">
          <Alert
            variant={trend.days_since_push >= 180 ? "danger" : "warning"}
            title={`No commits in ${trend.days_since_push} days`}
            description={
              trend.days_since_push >= 180
                ? "This repo has effectively stopped. Dependencies will have drifted and upstream APIs may have changed since you bought it."
                : "Activity has slowed since your purchase. Worth checking whether the maintainer has moved on."
            }
          />
        </div>
      )}

      <div className="px-4 sm:px-5 py-3 border-t flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Clock className="w-3 h-3" />
          {trend.last_checked_at
            ? `Checked ${new Date(trend.last_checked_at).toLocaleDateString("en-IN", {
                day: "numeric",
                month: "short",
              })}`
            : "Not yet re-checked"}
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs"
            loading={recheck.isPending}
            onClick={() => recheck.mutate(null)}
          >
            <RefreshCw className="w-3 h-3" /> Check now
          </Button>
          {showLink && (
            <Button size="sm" variant="outline" className="h-7 text-xs" asChild>
              <Link href={`/purchases/${trend.project_id}`}>Details</Link>
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function Reading({
  label,
  value,
  emphasise,
}: {
  label: string;
  value: number | null;
  emphasise?: boolean;
}) {
  return (
    <div>
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p
        className={cn(
          "font-semibold tabular-nums",
          emphasise ? "text-xl" : "text-lg text-muted-foreground",
        )}
      >
        {value ?? "—"}
        {value != null && (
          <span className="text-xs font-normal text-muted-foreground">/100</span>
        )}
      </p>
    </div>
  );
}

/**
 * Inline SVG sparkline. Positioned by real elapsed time, not by index, so two
 * readings a month apart don't render as adjacent steps.
 */
function Sparkline({ series }: { series: HealthTrend["series"] }) {
  const points = series
    .filter((r) => r.score != null)
    .map((r) => ({ t: new Date(r.recorded_at).getTime(), score: r.score as number }));

  if (points.length < 2) return null;

  const W = 100;
  const H = 28;
  const minT = points[0].t;
  const maxT = points[points.length - 1].t;
  const spanT = Math.max(1, maxT - minT);
  // Fixed 0-100 domain: an auto-scaled y-axis makes a 3-point wobble look like
  // a collapse, which would misrepresent the data it exists to report.
  const coords = points.map((p) => ({
    x: ((p.t - minT) / spanT) * W,
    y: H - (Math.max(0, Math.min(100, p.score)) / 100) * H,
  }));

  const path = coords
    .map((c, i) => `${i === 0 ? "M" : "L"}${c.x.toFixed(2)},${c.y.toFixed(2)}`)
    .join(" ");
  const area = `${path} L${W},${H} L0,${H} Z`;
  const last = points[points.length - 1].score;
  const first = points[0].score;
  const rising = last >= first;
  const stroke = rising ? "hsl(var(--score-high))" : "hsl(var(--destructive))";

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      className="w-full h-12"
      role="img"
      aria-label={`Score moved from ${first} to ${last} across ${points.length} readings`}
    >
      <path d={area} fill={stroke} opacity={0.12} />
      <path
        d={path}
        fill="none"
        stroke={stroke}
        strokeWidth={1.5}
        vectorEffect="non-scaling-stroke"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {coords.map((c, i) => (
        <circle
          key={i}
          cx={c.x}
          cy={c.y}
          r={1.6}
          fill={stroke}
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </svg>
  );
}

/** The buyer's whole monitored portfolio. */
export function PurchaseHealthList({
  trends,
  isLoading,
}: {
  trends: HealthTrend[] | undefined;
  isLoading: boolean;
}) {
  if (isLoading) {
    return (
      <div className="space-y-4">
        {[0, 1].map((i) => (
          <Skeleton key={i} className="h-56 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  if (!trends || trends.length === 0) {
    return (
      <EmptyState
        icon={<Activity className="w-6 h-6" />}
        title="Nothing to monitor yet"
        description="When you buy a project, CodeBazaar keeps re-scoring it weekly so you can see whether it's still being maintained. Your purchases will appear here."
        action={
          <Button asChild>
            <Link href="/projects?for_sale=true">Browse projects for sale</Link>
          </Button>
        }
      />
    );
  }

  const declining = trends.filter((t) => t.direction === "down");

  return (
    <div className="space-y-4">
      {declining.length > 0 && (
        <Alert
          variant="warning"
          title={`${declining.length} purchased project${declining.length === 1 ? "" : "s"} declining`}
          description="Their Verified Build Score has dropped since you bought them, usually because the repo has gone quiet. They're listed first below."
        />
      )}
      {trends.map((trend) => (
        <HealthTrendCard key={trend.project_id} trend={trend} />
      ))}
    </div>
  );
}
