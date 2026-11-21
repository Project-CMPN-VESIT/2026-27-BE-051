"use client";
import * as React from "react";
import { Building2, IndianRupee, ShieldCheck, Users } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { usePlatformStats } from "@/lib/hooks/public";
import { cn } from "@/lib/utils";

/**
 * Counts from `value` up on first view.
 *
 * Respects prefers-reduced-motion by jumping straight to the final number — an
 * animated statistic is decoration, and the number is the point.
 */
function useCountUp(value: number, durationMs = 1100) {
  const [shown, setShown] = React.useState(0);

  React.useEffect(() => {
    if (value <= 0) {
      return;
    }
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      return;
    }

    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      // Ease-out cubic: fast to begin, settles rather than stopping dead.
      setShown(Math.round(value * (1 - Math.pow(1 - t, 3))));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, durationMs]);

  return value <= 0 ? 0 : shown;
}

function formatCompactRupees(paise: number): string {
  const rupees = paise / 100;
  if (rupees >= 10_000_000) return `₹${(rupees / 10_000_000).toFixed(1)} Cr`;
  if (rupees >= 100_000) return `₹${(rupees / 100_000).toFixed(1)} L`;
  if (rupees >= 1_000) return `₹${Math.round(rupees / 1_000)}k`;
  return `₹${Math.round(rupees)}`;
}

function Stat({
  icon: Icon, value, label, render,
}: {
  icon: React.ElementType;
  value: number;
  label: string;
  render?: (n: number) => string;
}) {
  const shown = useCountUp(value);
  return (
    <div className="flex items-center gap-3 min-w-0">
      <span className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
        <Icon className="w-4 h-4" />
      </span>
      <div className="min-w-0">
        <div className="font-display text-xl font-semibold tabular-nums leading-none">
          {render ? render(shown) : shown.toLocaleString("en-IN")}
        </div>
        <div className="text-xs text-muted-foreground mt-1 truncate">{label}</div>
      </div>
    </div>
  );
}

/**
 * Live platform figures on the landing page.
 *
 * Every number is queried from the database on request — nothing here is
 * hardcoded, so the page is honest about how much has actually happened. If the
 * API is unreachable the strip renders nothing rather than showing zeros, since
 * "0 projects verified" reads as a failed product rather than a failed request.
 */
export function StatsTicker({ className }: { className?: string }) {
  const { data, isLoading, isError } = usePlatformStats();

  if (isLoading) {
    return (
      <div className={cn("grid grid-cols-2 lg:grid-cols-4 gap-5", className)}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="w-9 h-9 rounded-xl flex-shrink-0" />
            <div className="space-y-1.5 flex-1">
              <Skeleton className="h-5 w-16" />
              <Skeleton className="h-3 w-24" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (isError || !data) return null;

  return (
    <div className={cn("grid grid-cols-2 lg:grid-cols-4 gap-5", className)}>
      <Stat
        icon={ShieldCheck}
        value={data.projects_verified}
        label="projects verified"
      />
      <Stat
        icon={IndianRupee}
        value={data.transacted_paise}
        label="transacted through escrow & sales"
        render={formatCompactRupees}
      />
      <Stat icon={Users} value={data.builders_total} label="builders onboarded" />
      <Stat
        icon={Building2}
        value={data.colleges_represented}
        label="colleges represented"
      />
    </div>
  );
}
