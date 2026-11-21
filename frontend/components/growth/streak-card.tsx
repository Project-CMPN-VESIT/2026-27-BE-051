"use client";
import { Award, Flame, Info } from "lucide-react";
import { Badge } from "@/components/ui/primitives";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { Streak, StreakCalendarDay } from "@/types/advanced";

/**
 * Commit-consistency streak.
 *
 * Two honesty rules the UI enforces:
 *
 * 1. **No data is not zero.** When `has_data` is false the component says the
 *    streak isn't tracked yet rather than rendering a confident "0 days", which
 *    would read as "this builder does nothing".
 *
 * 2. **A lapsed streak is shown as lapsed.** `current_streak_days` can be 0 while
 *    milestone badges remain — because "sustained 30 days once" stays true
 *    forever, but "on a 30-day streak" does not.
 */
export function StreakCard({
  streak,
  calendar,
  isLoading,
  compact = false,
  className,
}: {
  streak: Streak | undefined;
  calendar?: StreakCalendarDay[];
  isLoading?: boolean;
  compact?: boolean;
  className?: string;
}) {
  if (isLoading) {
    return <Skeleton className={cn("h-40 w-full rounded-xl", className)} />;
  }
  if (!streak) return null;

  if (!streak.has_data) {
    return (
      <div className={cn("rounded-xl border bg-card p-5", className)}>
        <div className="flex items-center gap-2 mb-1.5">
          <Flame className="w-4 h-4 text-muted-foreground" />
          <h3 className="font-semibold text-sm">Commit streak</h3>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Not tracked yet. Streaks are computed from the commit history CodeBazaar
          reads when it scores a project — import and score a repo and your streak
          appears here.
        </p>
      </div>
    );
  }

  const live = streak.is_live;
  const remaining =
    streak.next_milestone != null
      ? streak.next_milestone - streak.current_streak_days
      : null;

  return (
    <div className={cn("rounded-xl border bg-card overflow-hidden", className)}>
      <div className="px-4 sm:px-5 py-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <div className="flex items-center gap-2">
              <Flame
                className={cn(
                  "w-4 h-4",
                  live ? "text-[hsl(var(--cta))]" : "text-muted-foreground",
                )}
              />
              <h3 className="font-semibold text-sm">Commit streak</h3>
            </div>
            <div className="flex items-baseline gap-2 mt-2">
              <span
                className={cn(
                  "text-3xl font-semibold tabular-nums",
                  live ? "text-foreground" : "text-muted-foreground",
                )}
              >
                {streak.current_streak_days}
              </span>
              <span className="text-sm text-muted-foreground">
                {streak.current_streak_days === 1 ? "day" : "days"}
                {!live && " — lapsed"}
              </span>
            </div>
            {live && remaining != null && remaining > 0 && (
              <p className="text-xs text-muted-foreground mt-1">
                {remaining} more day{remaining === 1 ? "" : "s"} to the{" "}
                {streak.next_milestone}-day badge
              </p>
            )}
            {!live && streak.last_active_on && (
              <p className="text-xs text-muted-foreground mt-1">
                Last commit{" "}
                {new Date(streak.last_active_on).toLocaleDateString("en-IN", {
                  day: "numeric",
                  month: "short",
                })}
              </p>
            )}
          </div>

          <dl className="text-right text-xs space-y-1 flex-shrink-0">
            <div>
              <dt className="text-muted-foreground">Longest ever</dt>
              <dd className="font-semibold tabular-nums text-sm">
                {streak.longest_streak_days} days
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Active days</dt>
              <dd className="font-semibold tabular-nums text-sm">
                {streak.total_active_days}
              </dd>
            </div>
          </dl>
        </div>
      </div>

      {/* Milestone badges */}
      {streak.milestone_details.length > 0 && (
        <div className="px-4 sm:px-5 pb-4 flex flex-wrap gap-1.5">
          {streak.milestone_details.map((m) => (
            <span
              key={m.days}
              title={m.blurb}
              className={cn(
                "inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium",
                "bg-[hsl(var(--cta))]/12 text-[hsl(var(--cta-foreground-on-surface,var(--foreground)))]",
                "border border-[hsl(var(--cta))]/25",
              )}
            >
              <Award className="w-3 h-3" />
              {m.days}-day
            </span>
          ))}
        </div>
      )}

      {calendar && calendar.length > 0 && !compact && (
        <div className="px-4 sm:px-5 pb-4">
          <ActivityCalendar days={calendar} />
        </div>
      )}

      {!compact && (
        <p className="px-4 sm:px-5 py-3 border-t bg-surface/50 text-[11px] text-muted-foreground flex items-start gap-2">
          <Info className="w-3.5 h-3.5 flex-shrink-0 mt-px" />
          Computed from the commit dates the scoring engine already read — the same
          history behind the activity-consistency component of the Verified Build
          Score. Consecutive means consecutive: there are no freezes or weekend
          exemptions.
        </p>
      )}
    </div>
  );
}

/**
 * Contribution-graph style heatmap.
 *
 * Dense by construction: every day in the window renders, so a gap is visibly a
 * gap. A sparse graph would silently close its own holes.
 */
export function ActivityCalendar({ days }: { days: StreakCalendarDay[] }) {
  // Group into columns of 7 so it reads as weeks.
  const weeks: StreakCalendarDay[][] = [];
  for (let i = 0; i < days.length; i += 7) {
    weeks.push(days.slice(i, i + 7));
  }
  const activeCount = days.filter((d) => d.active).length;

  return (
    <div>
      <div className="flex gap-[3px] overflow-x-auto pb-1" role="img"
        aria-label={`${activeCount} active days out of the last ${days.length}`}>
        {weeks.map((week, wi) => (
          <div key={wi} className="flex flex-col gap-[3px] flex-shrink-0">
            {week.map((day) => (
              <div
                key={day.day}
                title={`${day.day}${day.active ? " — committed" : " — no commits"}`}
                className={cn(
                  "w-[9px] h-[9px] rounded-[2px]",
                  day.active
                    ? "bg-[hsl(var(--score-high))]"
                    : "bg-border",
                )}
              />
            ))}
          </div>
        ))}
      </div>
      <p className="text-[11px] text-muted-foreground mt-1.5">
        {activeCount} active day{activeCount === 1 ? "" : "s"} in the last{" "}
        {Math.round(days.length / 7)} weeks
      </p>
    </div>
  );
}

/** Inline chip for profile headers and leaderboard rows. */
export function StreakChip({
  streak,
  className,
}: {
  streak: Streak | undefined;
  className?: string;
}) {
  if (!streak?.has_data || streak.current_streak_days <= 0) return null;
  return (
    <Badge variant="ghost" size="sm" className={className} title="Consecutive days with commits">
      <Flame className="w-3 h-3 text-[hsl(var(--cta))]" />
      {streak.current_streak_days}-day streak
    </Badge>
  );
}
