"use client";
import { useState } from "react";
import Link from "next/link";
import {
  UserSearch, MessageSquare, ChevronDown, ChevronUp, Check, GraduationCap, Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/primitives";
import { Skeleton } from "@/components/ui/skeleton";
import { useContributorMatches } from "@/lib/hooks";
import { cn } from "@/lib/utils";
import type { ContributorMatch } from "@/types";

const TIER_STYLES: Record<string, string> = {
  elite: "bg-primary/12 text-primary",
  trusted: "bg-background-success text-text-success",
  rising: "bg-background-warning text-text-warning",
  newcomer: "bg-secondary text-secondary-foreground",
};

function scoreColor(score: number): string {
  if (score >= 70) return "text-text-success";
  if (score >= 45) return "text-text-warning";
  return "text-muted-foreground";
}

function MatchRow({ match }: { match: ContributorMatch }) {
  const [open, setOpen] = useState(false);
  const initials = match.display_name.slice(0, 2).toUpperCase();

  return (
    <div className="border-b last:border-0">
      <div className="px-5 py-3 flex items-center gap-3">
        {/* Avatar */}
        <div className="w-9 h-9 rounded-full bg-primary/10 text-primary text-xs font-semibold flex items-center justify-center flex-shrink-0 overflow-hidden">
          {match.avatar_url
            ? <img src={match.avatar_url} alt="" className="w-full h-full object-cover" />
            : initials}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <Link href={`/u/${match.user_id}`} className="font-medium text-sm hover:text-primary transition-colors truncate">
              {match.display_name}
            </Link>
            <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full font-medium capitalize", TIER_STYLES[match.tier] ?? TIER_STYLES.newcomer)}>
              {match.tier}
            </span>
          </div>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            {match.college && (
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <GraduationCap className="w-3 h-3" /> {match.college}
              </span>
            )}
            {match.matched_skills.slice(0, 3).map((s) => (
              <span key={s} className="text-[10px] px-1.5 py-0.5 rounded-full bg-secondary text-secondary-foreground">{s}</span>
            ))}
          </div>
        </div>

        {/* Score */}
        <div className="text-right flex-shrink-0">
          <div className={cn("text-lg font-bold leading-none", scoreColor(match.match_score))}>
            {match.match_score}
          </div>
          <div className="text-[10px] text-muted-foreground">match</div>
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
          <Button size="sm" variant="outline" className="h-7 text-xs gap-1" asChild>
            <Link href={`/messages?new=${match.user_id}`}>
              <MessageSquare className="w-3 h-3" /> Invite
            </Link>
          </Button>
          <button
            onClick={() => setOpen(!open)}
            aria-label={open ? "Hide match details" : "Show match details"}
            className="p-1 text-muted-foreground hover:text-foreground transition-colors"
          >
            {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Breakdown */}
      {open && (
        <div className="px-5 pb-4 pl-[4.25rem] space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              { label: "Skill fit", value: match.skill_fit, max: 55 },
              { label: "Reliability", value: match.reliability, max: 25 },
              { label: "Track record", value: match.track_record, max: 15 },
              { label: "Collaboration", value: match.collaboration, max: 5 },
            ].map((c) => (
              <div key={c.label} className="rounded-lg border bg-card px-2.5 py-2">
                <div className="text-[10px] text-muted-foreground">{c.label}</div>
                <div className="text-sm font-semibold">{c.value}<span className="text-[10px] text-muted-foreground font-normal">/{c.max}</span></div>
              </div>
            ))}
          </div>

          {match.reasons.length > 0 && (
            <ul className="space-y-1">
              {match.reasons.map((r, i) => (
                <li key={i} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                  <Check className="w-3 h-3 text-text-success flex-shrink-0 mt-0.5" /> {r}
                </li>
              ))}
            </ul>
          )}

          {match.missing_skills.length > 0 && (
            <p className="text-xs text-muted-foreground">
              <span className="font-medium">Gaps:</span> {match.missing_skills.join(", ")}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export function ContributorMatchesPanel({ projectId, isOwner }: { projectId: string; isOwner: boolean }) {
  const { data, isLoading, isError } = useContributorMatches(projectId, isOwner);

  if (!isOwner) return null;

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <div className="px-5 py-3 border-b">
        <h3 className="font-semibold text-sm flex items-center gap-2">
          <UserSearch className="w-4 h-4 text-primary" /> Suggested contributors
        </h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Ranked by skill fit, reliability and shipping history. Tag skills on your project for sharper matches.
        </p>
      </div>

      {isLoading ? (
        <div className="p-5 space-y-3">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-md" />)}
        </div>
      ) : isError ? (
        <div className="p-5 text-sm text-muted-foreground">Could not load suggestions right now.</div>
      ) : !data?.length ? (
        <div className="p-8 text-center">
          <Sparkles className="w-7 h-7 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm font-medium mb-1">No matches yet</p>
          <p className="text-sm text-muted-foreground">
            As more builders add skills to their profiles, we&apos;ll suggest the best fits for this project.
          </p>
        </div>
      ) : (
        <div>
          {data.map((m) => <MatchRow key={m.user_id} match={m} />)}
        </div>
      )}
    </div>
  );
}
