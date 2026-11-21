"use client";
import { useState } from "react";
import Link from "next/link";
import { Trophy, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardContent, Input } from "@/components/ui/primitives";
import { Skeleton } from "@/components/ui/skeleton";
import { useHackathonPending, useReviewHackathonClaim } from "@/lib/hooks";
import type { HackathonVerdict } from "@/types";
import { cn } from "@/lib/utils";

const VERDICT_VARIANT: Record<HackathonVerdict, "success" | "warning" | "destructive"> = {
  likely_authentic: "success",
  needs_review: "warning",
  likely_inauthentic: "destructive",
};

export default function AdminHackathonsPage() {
  const { data: claims, isLoading } = useHackathonPending();
  const review = useReviewHackathonClaim();
  const [notes, setNotes] = useState<Record<string, string>>({});

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-6">
      <div>
        <h1 className="text-display-md flex items-center gap-2">
          <Trophy className="w-6 h-6 text-text-warning" /> Hackathon review queue
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Confirm or reject hackathon claims. The engine flags suspicious timelines; you make the call.
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-28 w-full rounded-lg" />)}</div>
      ) : !claims?.length ? (
        <Card className="border-dashed"><CardContent className="p-10 text-center text-sm text-muted-foreground">Nothing to review right now.</CardContent></Card>
      ) : (
        <div className="space-y-3">
          {claims.map((c) => (
            <Card key={c.id}>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{c.event_name}</span>
                      <Badge variant="ghost" className="text-[10px] capitalize">{c.platform}</Badge>
                      {c.verdict && <Badge variant={VERDICT_VARIANT[c.verdict]} className="text-[10px]">{c.verdict.replace(/_/g, " ")}</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {new Date(c.event_start).toLocaleDateString()} – {new Date(c.event_end).toLocaleDateString()}
                    </p>
                    <Link href={`/projects/${c.project_id}`} className="text-xs text-primary hover:underline inline-flex items-center gap-1 mt-1">
                      View project <ExternalLink className="w-3 h-3" />
                    </Link>
                  </div>
                  <div className={cn("text-display-md tabular-nums flex-shrink-0",
                    (c.authenticity_score ?? 0) >= 70 ? "text-text-success" :
                    (c.authenticity_score ?? 0) >= 40 ? "text-text-warning" : "text-destructive")}>
                    {c.authenticity_score ?? "—"}
                  </div>
                </div>

                {c.signals && (
                  <p className="text-xs text-muted-foreground">
                    {c.signals.commits_in_window}/{c.signals.total_commits} commits during event
                    {c.signals.flags.length > 0 && ` · flags: ${c.signals.flags.join(", ")}`}
                  </p>
                )}
                {c.reasoning && <p className="text-xs text-muted-foreground leading-relaxed">{c.reasoning}</p>}
                {c.proof_url && (
                  <a href={c.proof_url} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline">View proof →</a>
                )}

                <Input placeholder="Review notes (optional)" value={notes[c.id] ?? ""}
                  onChange={(e) => setNotes((n) => ({ ...n, [c.id]: e.target.value }))} />
                <div className="flex gap-2">
                  <Button size="sm" className="h-7 text-xs" loading={review.isPending}
                    onClick={() => review.mutate({ claimId: c.id, approve: true, notes: notes[c.id] })}>Verify</Button>
                  <Button size="sm" variant="ghost" className="h-7 text-xs" loading={review.isPending}
                    onClick={() => review.mutate({ claimId: c.id, approve: false, notes: notes[c.id] })}>Reject</Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
