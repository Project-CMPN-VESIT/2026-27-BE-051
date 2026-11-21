"use client";
import Link from "next/link";
import { Check, Gavel, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/primitives";
import { StreakCard } from "@/components/growth/streak-card";
import {
  useMyMemberships, useMyOffers, useMyStreak, useMyStreakCalendar,
  useReceivedOffers, useRespondToTeamInvite,
} from "@/lib/hooks/advanced";
import { cn } from "@/lib/utils";

const OPEN = ["pending", "countered"];

/**
 * Dashboard strip: commit streak, co-ownership invites, and anything waiting on
 * the user's decision.
 *
 * Every block self-hides when it has nothing to say. A dashboard that renders
 * five empty cards teaches people to scroll past it.
 */
export function BuilderRetentionRow({ className }: { className?: string }) {
  const { data: streak, isLoading: streakLoading } = useMyStreak();
  const { data: calendar } = useMyStreakCalendar(18);
  const { data: memberships } = useMyMemberships();
  const { data: received } = useReceivedOffers();
  const { data: sent } = useMyOffers();

  const pendingInvites = (memberships ?? []).filter((m) => m.status === "pending");
  const needsAsSeller = (received ?? []).filter(
    (o) => OPEN.includes(o.status) && o.awaiting === "seller",
  ).length;
  const needsAsBuyer = (sent ?? []).filter(
    (o) => OPEN.includes(o.status) && o.awaiting === "buyer",
  ).length;
  const acceptedForMe = (sent ?? []).filter((o) => o.status === "accepted").length;

  const hasStreak = streak?.has_data && streak.total_active_days > 0;
  const hasAnything =
    hasStreak ||
    pendingInvites.length > 0 ||
    needsAsSeller > 0 ||
    needsAsBuyer > 0 ||
    acceptedForMe > 0;

  if (!hasAnything && !streakLoading) return null;

  return (
    <div className={cn("grid gap-4 lg:grid-cols-2", className)}>
      {(hasStreak || streakLoading) && (
        <StreakCard
          streak={streak}
          calendar={calendar}
          isLoading={streakLoading}
        />
      )}

      {(needsAsSeller > 0 || needsAsBuyer > 0 || acceptedForMe > 0) && (
        <div className="rounded-xl border bg-card p-5">
          <div className="flex items-center gap-2 mb-3">
            <Gavel className="w-4 h-4 text-primary" />
            <h3 className="font-semibold text-sm">Offers needing your attention</h3>
          </div>
          <ul className="space-y-2 text-sm">
            {needsAsSeller > 0 && (
              <li className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">
                  On your listings, awaiting you
                </span>
                <Badge variant="warning" size="sm">{needsAsSeller}</Badge>
              </li>
            )}
            {needsAsBuyer > 0 && (
              <li className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">
                  Countered — your move
                </span>
                <Badge variant="warning" size="sm">{needsAsBuyer}</Badge>
              </li>
            )}
            {acceptedForMe > 0 && (
              <li className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">
                  Accepted — ready to pay
                </span>
                <Badge variant="success" size="sm">{acceptedForMe}</Badge>
              </li>
            )}
          </ul>
          <Button size="sm" variant="outline" className="mt-4 w-full" asChild>
            <Link href="/offers">Open offers</Link>
          </Button>
        </div>
      )}

      {pendingInvites.length > 0 && (
        <div className="rounded-xl border bg-card p-5 lg:col-span-2">
          <div className="flex items-center gap-2 mb-1">
            <Users className="w-4 h-4 text-primary" />
            <h3 className="font-semibold text-sm">Co-ownership invites</h3>
          </div>
          <p className="text-xs text-muted-foreground mb-3 leading-relaxed">
            Accepting makes the revenue share binding — future sales pay you
            automatically.
          </p>
          <ul className="space-y-2.5">
            {pendingInvites.map((invite) => (
              <InviteRow key={invite.project_id} invite={invite} />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function InviteRow({
  invite,
}: {
  invite: {
    project_id: string;
    project_title: string | null;
    revenue_share_bps: number;
    contribution: string | null;
  };
}) {
  const respond = useRespondToTeamInvite(invite.project_id);
  const share = invite.revenue_share_bps / 100;

  return (
    <li className="rounded-lg border bg-surface/50 px-3 py-2.5 flex items-start justify-between gap-3 flex-wrap">
      <div className="min-w-0">
        <Link
          href={`/projects/${invite.project_id}`}
          className="text-sm font-medium hover:text-primary transition-colors"
        >
          {invite.project_title ?? "Project"}
        </Link>
        <p className="text-xs text-muted-foreground mt-0.5">
          {Number.isInteger(share) ? `${share}%` : `${share.toFixed(2)}%`} of revenue
          {invite.contribution && ` · ${invite.contribution}`}
        </p>
      </div>
      <div className="flex gap-1.5 flex-shrink-0">
        <Button
          size="sm"
          variant="cta"
          className="h-7 text-xs"
          loading={respond.isPending}
          onClick={() => respond.mutate(true)}
        >
          <Check className="w-3 h-3" /> Accept
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 text-xs"
          disabled={respond.isPending}
          onClick={() => respond.mutate(false)}
        >
          <X className="w-3 h-3" />
        </Button>
      </div>
    </li>
  );
}
