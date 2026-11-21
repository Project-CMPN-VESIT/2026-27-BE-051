"use client";
import { ShieldCheck, Timer, TrendingUp, Code2, Users, Crown, Award } from "lucide-react";
import type { BuilderTier } from "@/types";
import { useReputation } from "@/lib/hooks";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const TIER_STYLE: Record<BuilderTier, { label: string; className: string }> = {
  elite: { label: "Elite", className: "bg-gradient-to-r from-purple-500 to-fuchsia-500 text-white" },
  trusted: { label: "Trusted", className: "bg-score-high text-white" },
  rising: { label: "Rising", className: "bg-primary/100 text-white" },
  newcomer: { label: "Newcomer", className: "bg-secondary text-secondary-foreground" },
};

const BADGE_META: Record<string, { label: string; icon: React.ReactNode }> = {
  verified_builder: { label: "Verified Builder", icon: <ShieldCheck className="w-3.5 h-3.5" /> },
  reliable_deliverer: { label: "Reliable Deliverer", icon: <Timer className="w-3.5 h-3.5" /> },
  top_earner: { label: "Top Earner", icon: <TrendingUp className="w-3.5 h-3.5" /> },
  quality_code: { label: "Quality Code", icon: <Code2 className="w-3.5 h-3.5" /> },
  great_collaborator: { label: "Great Collaborator", icon: <Users className="w-3.5 h-3.5" /> },
  elite: { label: "Elite Builder", icon: <Crown className="w-3.5 h-3.5" /> },
};

export function TierBadge({ tier, className }: { tier: BuilderTier; className?: string }) {
  const t = TIER_STYLE[tier] ?? TIER_STYLE.newcomer;
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold", t.className, className)}>
      <Crown className="w-3 h-3" /> {t.label}
    </span>
  );
}

function rupeesShort(paise: number): string {
  const r = paise / 100;
  if (r >= 100000) return "\u20b9" + (r / 100000).toFixed(1) + "L";
  if (r >= 1000) return "\u20b9" + (r / 1000).toFixed(0) + "k";
  return "\u20b9" + r.toFixed(0);
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="text-center">
      <div className="text-xl font-bold tabular-nums">{value}</div>
      <div className="text-[10px] text-muted-foreground mt-0.5">{label}</div>
    </div>
  );
}

export function ReputationPanel({ userId }: { userId: string }) {
  const { data: rep, isLoading } = useReputation(userId);

  if (isLoading) return <Skeleton className="h-52 w-full rounded-xl" />;
  if (!rep) return null;

  const dr = rep.delivery_rate;
  return (
    <div className="rounded-xl border bg-card p-6">
      <div className="flex items-center justify-between mb-5">
        <h2 className="font-semibold flex items-center gap-2">
          <Award className="w-4 h-4 text-text-warning" /> Builder Reputation
        </h2>
        <div className="flex items-center gap-2">
          <TierBadge tier={rep.tier} />
          <span className="text-sm font-bold tabular-nums text-muted-foreground">{rep.reputation_points} pts</span>
        </div>
      </div>

      <div className="grid grid-cols-3 sm:grid-cols-6 gap-4">
        <Stat label="Trust" value={rep.trust_score} />
        <Stat label="Verified" value={rep.verified_projects} />
        <Stat label="Delivered" value={rep.contracts_completed} />
        <Stat label="On-time" value={dr == null ? "\u2014" : `${Math.round(dr * 100)}%`} />
        <Stat label="Avg build" value={rep.avg_build_score ?? "\u2014"} />
        <Stat label="Earned" value={rupeesShort(rep.revenue_earned_paise)} />
      </div>

      {rep.badges.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-5 pt-5 border-t">
          {rep.badges.map((b) => {
            const meta = BADGE_META[b];
            if (!meta) return null;
            return (
              <span key={b} className="inline-flex items-center gap-1.5 rounded-full border bg-secondary/40 px-3 py-1 text-xs font-medium">
                {meta.icon} {meta.label}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
