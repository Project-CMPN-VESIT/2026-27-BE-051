"use client";
import Link from "next/link";
import { Trophy, ShieldCheck, CheckCircle2, Medal } from "lucide-react";
import { useLeaderboard } from "@/lib/hooks";
import { TierBadge } from "@/components/reputation/reputation-panel";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/primitives";
import { Container, PageHeader } from "@/components/ui/layout";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Podium styling for the top three. */
const PODIUM = [
  { ring: "ring-2 ring-[hsl(45_93%_47%/0.5)]", chip: "bg-[hsl(45_93%_47%/0.15)] text-[hsl(38_92%_35%)] dark:text-[hsl(45_93%_62%)]" },
  { ring: "ring-2 ring-muted-foreground/25", chip: "bg-secondary text-secondary-foreground" },
  { ring: "ring-2 ring-[hsl(25_75%_47%/0.4)]", chip: "bg-[hsl(25_75%_47%/0.14)] text-[hsl(25_75%_35%)] dark:text-[hsl(25_85%_62%)]" },
];

export default function LeaderboardPage() {
  const { data: rows, isLoading } = useLeaderboard(50);

  return (
    <Container width="md" className="py-10">
      <PageHeader
        eyebrow="Reputation"
        title="Builder leaderboard"
        icon={<Trophy />}
        description="Ranked by verified execution — shipped builds, delivered work, and accumulated trust. Not follower counts."
      />

      {isLoading ? (
        <div className="space-y-2.5">
          {[1, 2, 3, 4, 5, 6].map((i) => <Skeleton key={i} className="h-[4.5rem] w-full rounded-xl" />)}
        </div>
      ) : !rows?.length ? (
        <EmptyState
          icon={<Trophy />}
          title="No ranked builders yet"
          description="Ship a verified project or complete a build request to claim the first spot."
          action={<Button asChild><Link href="/import">Import a project</Link></Button>}
        />
      ) : (
        <ol className="space-y-2.5 stagger">
          {rows.map((row, i) => {
            const initials = row.display_name
              .split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
            const podium = i < 3 ? PODIUM[i] : null;

            return (
              <li key={row.user_id}>
                <Link
                  href={`/u/${row.user_id}`}
                  className={cn(
                    "flex items-center gap-3.5 sm:gap-4 p-4 rounded-xl border bg-card group card-interactive",
                    "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/25 focus-visible:border-primary",
                    i < 3 && "border-border-strong"
                  )}
                >
                  {/* Rank */}
                  <span
                    className={cn(
                      "w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 font-bold tabular-nums text-sm",
                      podium ? podium.chip : "text-muted-foreground"
                    )}
                  >
                    {i < 3 ? <Medal className="w-4 h-4" /> : i + 1}
                  </span>

                  {/* Avatar */}
                  <span
                    className={cn(
                      "w-11 h-11 rounded-full bg-primary/10 text-primary text-sm font-bold flex items-center justify-center flex-shrink-0 overflow-hidden",
                      podium?.ring
                    )}
                  >
                    {row.avatar_url
                      ? <img src={row.avatar_url} alt="" className="w-full h-full object-cover" />
                      : initials}
                  </span>

                  {/* Identity */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm truncate group-hover:text-primary transition-colors">
                        {row.display_name}
                      </span>
                      <TierBadge tier={row.tier} />
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                      <span className="inline-flex items-center gap-1 tabular-nums">
                        <ShieldCheck className="w-3 h-3 text-text-success" />
                        {row.verified_projects} verified
                      </span>
                      <span className="inline-flex items-center gap-1 tabular-nums">
                        <CheckCircle2 className="w-3 h-3" />
                        {row.contracts_completed} delivered
                      </span>
                    </div>
                  </div>

                  {/* Points */}
                  <div className="text-right flex-shrink-0">
                    <div className="font-bold font-display tabular-nums leading-none">
                      {row.reputation_points.toLocaleString()}
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-1">points</div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ol>
      )}
    </Container>
  );
}
