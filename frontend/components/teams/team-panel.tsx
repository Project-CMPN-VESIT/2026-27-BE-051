"use client";
import { useState } from "react";
import Link from "next/link";
import { Check, Crown, IndianRupee, Info, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/primitives";
import { Alert, FormError } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { useRespondToTeamInvite, useTeam } from "@/lib/hooks/advanced";
import { getErrorMessage } from "@/lib/api/client";
import { cn } from "@/lib/utils";
import type { Team, TeamMember } from "@/types/advanced";

function pct(bps: number) {
  // Two decimals only when they carry information — 33.33% needs them, 50% doesn't.
  const value = bps / 100;
  return Number.isInteger(value) ? `${value}%` : `${value.toFixed(2)}%`;
}

const STATUS_BADGE: Record<string, { label: string; variant: "success" | "warning" | "ghost" }> = {
  accepted: { label: "Confirmed", variant: "success" },
  pending: { label: "Invite pending", variant: "warning" },
  declined: { label: "Declined", variant: "ghost" },
  removed: { label: "Removed", variant: "ghost" },
};

/**
 * Co-owners and their revenue splits on a team project.
 *
 * Public, because who built a project is part of what makes it credible — and a
 * buyer should know they're dealing with a team of three rather than one person
 * before they pay.
 *
 * Splits are shown as percentages of the *seller's net*, not of the sale price,
 * because that's what actually gets distributed. Presenting it as a share of
 * gross would overstate what each member receives.
 */
export function TeamPanel({
  projectId,
  currentUserId,
  className,
}: {
  projectId: string;
  currentUserId?: string | null;
  className?: string;
}) {
  const { data: team, isLoading } = useTeam(projectId);
  const respond = useRespondToTeamInvite(projectId);

  if (isLoading) return <Skeleton className={cn("h-40 w-full rounded-xl", className)} />;
  if (!team || team.members.length <= 1) return null;

  const active = team.members.filter(
    (m) => m.status === "accepted" || m.status === "pending",
  );
  const myInvite = currentUserId
    ? team.members.find((m) => m.user_id === currentUserId && m.status === "pending")
    : undefined;

  return (
    <div className={cn("rounded-xl border bg-card overflow-hidden", className)}>
      <div className="px-4 sm:px-5 py-4 border-b">
        <div className="flex items-center gap-2 flex-wrap">
          <Users className="w-4 h-4 text-primary flex-shrink-0" />
          <h3 className="font-semibold text-sm">Built by a team</h3>
          <Badge variant="ghost" size="sm">
            {active.filter((m) => m.status === "accepted").length} co-owners
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
          Revenue from this project is split between its co-owners according to the
          shares below. Each share is a percentage of the seller&apos;s net after
          the platform fee.
        </p>
      </div>

      <ul className="divide-y">
        {active.map((member) => (
          <MemberRow key={member.id} member={member} isMe={member.user_id === currentUserId} />
        ))}
      </ul>

      {/* Bar visualising the split */}
      <div className="px-4 sm:px-5 py-3 border-t">
        <div className="flex h-2 rounded-full overflow-hidden bg-border" role="presentation">
          {active
            .filter((m) => m.status === "accepted")
            .map((m, i) => (
              <div
                key={m.id}
                className={cn(
                  i % 3 === 0 && "bg-primary",
                  i % 3 === 1 && "bg-primary/60",
                  i % 3 === 2 && "bg-primary/35",
                )}
                style={{ width: `${m.revenue_share_bps / 100}%` }}
                title={`${m.display_name ?? "Member"} — ${pct(m.revenue_share_bps)}`}
              />
            ))}
        </div>
      </div>

      {!team.is_fully_accepted && (
        <div className="px-4 sm:px-5 pb-4">
          <Alert
            variant="warning"
            title="Not every share is confirmed yet"
            description="Until all co-owners accept, a sale distributes only the confirmed shares and the remainder stays with the lead owner. Nothing is lost — but the split isn't final."
          />
        </div>
      )}

      {myInvite && (
        <div className="px-4 sm:px-5 py-4 border-t bg-surface/50">
          <p className="text-sm font-semibold">
            You&apos;ve been offered {pct(myInvite.revenue_share_bps)} of revenue
          </p>
          {myInvite.contribution && (
            <p className="text-xs text-muted-foreground mt-0.5">
              For: {myInvite.contribution}
            </p>
          )}
          <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
            Accepting makes this binding — future sales will pay you this share
            automatically.
          </p>
          <div className="flex gap-2 mt-3">
            <Button
              size="sm"
              variant="cta"
              loading={respond.isPending}
              onClick={() => respond.mutate(true)}
            >
              <Check className="w-3.5 h-3.5" /> Accept {pct(myInvite.revenue_share_bps)}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => respond.mutate(false)}
              disabled={respond.isPending}
            >
              <X className="w-3.5 h-3.5" /> Decline
            </Button>
          </div>
          {respond.isError && (
            <FormError message={getErrorMessage(respond.error)} className="mt-2" />
          )}
        </div>
      )}
    </div>
  );
}

function MemberRow({ member, isMe }: { member: TeamMember; isMe?: boolean }) {
  const badge = STATUS_BADGE[member.status] ?? STATUS_BADGE.pending;
  return (
    <li className="px-4 sm:px-5 py-3 flex items-start justify-between gap-3 flex-wrap">
      <div className="min-w-0 flex items-start gap-2.5">
        <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 text-xs font-semibold text-primary">
          {(member.display_name ?? "?").charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <Link
              href={`/u/${member.user_id}`}
              className="text-sm font-medium hover:text-primary transition-colors truncate"
            >
              {member.display_name ?? "Builder"}
            </Link>
            {member.is_lead && (
              <Badge variant="brand" size="sm">
                <Crown className="w-3 h-3" /> Lead
              </Badge>
            )}
            {isMe && <Badge variant="ghost" size="sm">You</Badge>}
            {member.status !== "accepted" && (
              <Badge variant={badge.variant} size="sm">{badge.label}</Badge>
            )}
          </div>
          {member.contribution && (
            <p className="text-xs text-muted-foreground mt-0.5">{member.contribution}</p>
          )}
        </div>
      </div>
      <span className="text-sm font-semibold tabular-nums flex-shrink-0">
        {pct(member.revenue_share_bps)}
      </span>
    </li>
  );
}

/** Team earnings for the builder's own earnings page. */
export function SplitEarnings({
  earnings,
  isLoading,
}: {
  earnings:
    | {
        total_paise: number;
        sales_count: number;
        items: {
          project_id: string;
          project_title: string | null;
          amount_paise: number;
          revenue_share_bps: number;
          is_lead: boolean;
          created_at: string;
        }[];
      }
    | undefined;
  isLoading: boolean;
}) {
  if (isLoading) return <Skeleton className="h-32 w-full rounded-xl" />;
  if (!earnings || earnings.sales_count === 0) return null;

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <div className="px-4 sm:px-5 py-4 border-b flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-primary" />
            <h3 className="font-semibold text-sm">Team project earnings</h3>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Your share of sales on projects you co-own
          </p>
        </div>
        <p className="text-xl font-semibold tabular-nums">
          ₹{(earnings.total_paise / 100).toLocaleString("en-IN")}
        </p>
      </div>
      <ul className="divide-y">
        {earnings.items.map((item, i) => (
          <li
            key={`${item.project_id}-${i}`}
            className="px-4 sm:px-5 py-3 flex items-center justify-between gap-3 flex-wrap"
          >
            <div className="min-w-0">
              <Link
                href={`/projects/${item.project_id}`}
                className="text-sm font-medium hover:text-primary transition-colors"
              >
                {item.project_title ?? "Project"}
              </Link>
              <p className="text-xs text-muted-foreground mt-0.5">
                {pct(item.revenue_share_bps)} share
                {item.is_lead && " · you're the lead"} ·{" "}
                {new Date(item.created_at).toLocaleDateString("en-IN", {
                  day: "numeric",
                  month: "short",
                })}
              </p>
            </div>
            <span className="text-sm font-semibold tabular-nums flex items-center">
              <IndianRupee className="w-3 h-3" />
              {(item.amount_paise / 100).toLocaleString("en-IN")}
            </span>
          </li>
        ))}
      </ul>
      <p className="px-4 sm:px-5 py-3 border-t bg-surface/50 text-[11px] text-muted-foreground flex items-start gap-2">
        <Info className="w-3.5 h-3.5 flex-shrink-0 mt-px" />
        Split amounts are frozen at the moment of each sale. Changing a team&apos;s
        shares later never rewrites what was already paid out.
      </p>
    </div>
  );
}
