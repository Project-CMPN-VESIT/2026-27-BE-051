"use client";
import { useState } from "react";
import { Trophy, ShieldCheck, ShieldAlert, ShieldQuestion, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardContent, CardHeader, CardTitle, Input, Label } from "@/components/ui/primitives";
import { useProjectHackathonClaim, useCreateHackathonClaim, useAnalyzeHackathonClaim } from "@/lib/hooks";
import { getErrorMessage } from "@/lib/api/client";
import type { HackathonPlatform, HackathonVerdict } from "@/types";
import { cn } from "@/lib/utils";

const VERDICT: Record<HackathonVerdict, { label: string; variant: "success" | "warning" | "destructive"; icon: React.ReactNode }> = {
  likely_authentic: { label: "Likely authentic", variant: "success", icon: <ShieldCheck className="w-3.5 h-3.5" /> },
  needs_review: { label: "Needs review", variant: "warning", icon: <ShieldQuestion className="w-3.5 h-3.5" /> },
  likely_inauthentic: { label: "Likely inauthentic", variant: "destructive", icon: <ShieldAlert className="w-3.5 h-3.5" /> },
};

const FLAG_LABEL: Record<string, string> = {
  prebuilt_before_event: "Built mostly before the event",
  no_activity_during_event: "No commits during the event",
  built_after_event: "Built mostly after the event",
  forked_repo: "Repository is a fork",
  no_commit_history: "No commit history",
  signals_unavailable: "GitHub signals unavailable",
};

function scoreTone(s: number | null) {
  if (s == null) return "text-muted-foreground";
  if (s >= 70) return "text-text-success";
  if (s >= 40) return "text-text-warning";
  return "text-text-danger";
}

export function HackathonAuthenticity({ projectId, isOwner, githubToken }: {
  projectId: string; isOwner?: boolean; githubToken?: string;
}) {
  const { data: claim, isLoading } = useProjectHackathonClaim(projectId);
  const analyze = useAnalyzeHackathonClaim(projectId);
  const [err, setErr] = useState<string | null>(null);

  if (isLoading) return null;

  // No claim yet → owners can create one.
  if (!claim) {
    if (!isOwner) return null;
    return <ClaimForm projectId={projectId} onError={setErr} err={err} />;
  }

  const s = claim.signals;
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <Trophy className="w-4 h-4 text-text-warning" /> Hackathon Authenticity
        </CardTitle>
        {claim.verdict && (
          <Badge variant={VERDICT[claim.verdict].variant} className="gap-1">
            {VERDICT[claim.verdict].icon} {VERDICT[claim.verdict].label}
          </Badge>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-4">
          <div className="text-center">
            <div className={cn("text-3xl font-bold tabular-nums", scoreTone(claim.authenticity_score))}>
              {claim.authenticity_score ?? "\u2014"}
            </div>
            <div className="text-[10px] text-muted-foreground">authenticity</div>
          </div>
          <div className="text-sm min-w-0">
            <p className="font-medium truncate">{claim.event_name}</p>
            <p className="text-xs text-muted-foreground">
              {new Date(claim.event_start).toLocaleDateString()} – {new Date(claim.event_end).toLocaleDateString()}
              {" · "}<span className="capitalize">{claim.platform}</span>
            </p>
            <Badge variant="ghost" className="mt-1 text-[10px] capitalize">{claim.status}</Badge>
          </div>
        </div>

        {s && (
          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            <div className="rounded-md bg-background-success/60 py-2">
              <div className="font-bold text-text-success">{s.commits_in_window}</div>
              <div className="text-[10px] text-muted-foreground">during event</div>
            </div>
            <div className="rounded-md bg-secondary/50 py-2">
              <div className="font-bold">{s.commits_before_event}</div>
              <div className="text-[10px] text-muted-foreground">before</div>
            </div>
            <div className="rounded-md bg-secondary/50 py-2">
              <div className="font-bold">{s.commits_after_event}</div>
              <div className="text-[10px] text-muted-foreground">after</div>
            </div>
          </div>
        )}

        {s && s.flags.length > 0 && (
          <ul className="space-y-0.5">
            {s.flags.map((f) => (
              <li key={f} className="text-xs text-text-warning">• {FLAG_LABEL[f] ?? f}</li>
            ))}
          </ul>
        )}

        {claim.reasoning && <p className="text-xs text-muted-foreground leading-relaxed">{claim.reasoning}</p>}

        {isOwner && (claim.status === "pending" || claim.status === "analyzed" || claim.status === "flagged") && (
          <Button size="sm" variant="ghost" className="gap-1.5 h-7 text-xs"
            loading={analyze.isPending}
            disabled={!githubToken}
            onClick={() => githubToken && analyze.mutate({ claimId: claim.id, githubToken }, { onError: (e) => setErr(getErrorMessage(e)) })}>
            <RefreshCw className="w-3 h-3" /> {claim.status === "pending" ? "Analyze timeline" : "Re-analyze"}
          </Button>
        )}
        {isOwner && !githubToken && (
          <p className="text-[11px] text-muted-foreground">Connect GitHub to analyze the commit timeline.</p>
        )}
        {err && <p className="text-xs text-destructive">{err}</p>}
      </CardContent>
    </Card>
  );
}

function ClaimForm({ projectId, onError, err }: {
  projectId: string; onError: (m: string | null) => void; err: string | null;
}) {
  const create = useCreateHackathonClaim();
  const [eventName, setEventName] = useState("");
  const [platform, setPlatform] = useState<HackathonPlatform>("devfolio");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [proofUrl, setProofUrl] = useState("");
  const [open, setOpen] = useState(false);

  const submit = () => {
    onError(null);
    if (!eventName.trim() || !start || !end) {
      onError("Event name and both dates are required");
      return;
    }
    create.mutate({
      project_id: projectId,
      event_name: eventName.trim(),
      platform,
      event_start: `${start}T00:00:00Z`,
      event_end: `${end}T23:59:59Z`,
      proof_url: proofUrl.trim() || undefined,
    }, { onError: (e) => onError(getErrorMessage(e)) });
  };

  if (!open) {
    return (
      <Card>
        <CardContent className="p-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm">
            <Trophy className="w-4 h-4 text-text-warning" />
            <span>Built this at a hackathon? Claim it and get authenticity-verified.</span>
          </div>
          <Button size="sm" variant="outline" onClick={() => setOpen(true)}>Claim hackathon</Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader><CardTitle className="text-base flex items-center gap-2"><Trophy className="w-4 h-4 text-text-warning" /> Claim hackathon</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="ev">Event name</Label>
          <Input id="ev" value={eventName} onChange={(e) => setEventName(e.target.value)} placeholder="e.g. HackMIT 2026" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pf">Platform</Label>
          <select id="pf" value={platform} onChange={(e) => setPlatform(e.target.value as HackathonPlatform)}
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm">
            <option value="devfolio">Devfolio</option>
            <option value="unstop">Unstop</option>
            <option value="mlh">MLH</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="st">Start date</Label>
            <Input id="st" type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="en">End date</Label>
            <Input id="en" type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pu">Proof URL (optional)</Label>
          <Input id="pu" value={proofUrl} onChange={(e) => setProofUrl(e.target.value)} placeholder="Certificate / event page link" />
        </div>
        {err && <p className="text-xs text-destructive">{err}</p>}
        <div className="flex gap-2">
          <Button size="sm" onClick={submit} loading={create.isPending}>Submit claim</Button>
          <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
        </div>
      </CardContent>
    </Card>
  );
}
