"use client";
import { use, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft, Hammer, IndianRupee, Clock, Users, CheckCircle2, XCircle,
  AlertTriangle, Send,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, Label } from "@/components/ui/primitives";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useBuildRequest, useMe, useBuildRequestApplications, useApplyToBuildRequest,
  useUpdateBuildRequestStatus, useResolveBuildApplication,
} from "@/lib/hooks";
import { getErrorMessage } from "@/lib/api/client";
import { useAuthStore } from "@/stores/auth";
import type { BuildApplication } from "@/types";

function inr(paise: number): string {
  return "\u20B9" + (paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

const STATUS_VARIANT: Record<string, "success" | "warning" | "ghost" | "destructive"> = {
  open: "success", in_progress: "warning", completed: "ghost", cancelled: "destructive",
};

function ApplyForm({ requestId }: { requestId: string }) {
  const { mutateAsync, isPending } = useApplyToBuildRequest(requestId);
  const [note, setNote] = useState("");
  const [quoteInr, setQuoteInr] = useState("");
  const [days, setDays] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    if (note.trim().length < 10) { setError("Add a short cover note (min 10 chars)."); return; }
    try {
      await mutateAsync({
        cover_note: note,
        quoted_paise: quoteInr ? Math.round(parseFloat(quoteInr) * 100) : undefined,
        estimated_days: days ? parseInt(days) : undefined,
      });
    } catch (err) { setError(getErrorMessage(err)); }
  };

  return (
    <div className="rounded-xl border bg-card p-5 space-y-3">
      <h3 className="font-semibold text-sm">Apply to build this</h3>
      <div className="space-y-1.5">
        <Label>Cover note</Label>
        <textarea
          className="w-full min-h-[90px] px-3 py-2 text-sm rounded-md border bg-background resize-none focus-visible:outline-none focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-primary/12"
          placeholder="Why you're a great fit, relevant work, approach…"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Your quote (₹, optional)</Label>
          <input type="number" className="w-full h-9 px-3 text-sm rounded-md border bg-background focus-visible:outline-none focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-primary/12"
            value={quoteInr} onChange={(e) => setQuoteInr(e.target.value)} placeholder="e.g. 20000" />
        </div>
        <div className="space-y-1.5">
          <Label>Est. days (optional)</Label>
          <input type="number" className="w-full h-9 px-3 text-sm rounded-md border bg-background focus-visible:outline-none focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-primary/12"
            value={days} onChange={(e) => setDays(e.target.value)} placeholder="e.g. 21" />
        </div>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
      <Button size="sm" className="gap-1.5" loading={isPending} onClick={submit}><Send className="w-3.5 h-3.5" /> Submit application</Button>
    </div>
  );
}

function ApplicationRow({ app, requestId, canManage }: { app: BuildApplication; requestId: string; canManage: boolean }) {
  const { accept, reject } = useResolveBuildApplication(requestId);
  const name = app.builder?.profile?.display_name ?? "Builder";
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link href={`/u/${app.builder_id}`} className="font-medium text-sm hover:text-primary transition-colors">{name}</Link>
          <p className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap">{app.cover_note}</p>
          <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
            {app.quoted_paise != null && <span className="flex items-center gap-1"><IndianRupee className="w-3 h-3" />{inr(app.quoted_paise)}</span>}
            {app.estimated_days != null && <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{app.estimated_days}d</span>}
          </div>
        </div>
        <div className="flex flex-col items-end gap-2 flex-shrink-0">
          <Badge variant={app.status === "accepted" ? "success" : app.status === "rejected" || app.status === "withdrawn" ? "ghost" : "warning"} className="text-[10px] capitalize">{app.status}</Badge>
          {canManage && app.status === "pending" && (
            <div className="flex gap-1">
              <Button size="sm" className="h-7 text-xs gap-1" loading={accept.isPending} onClick={() => accept.mutate(app.id)}>
                <CheckCircle2 className="w-3 h-3" /> Accept
              </Button>
              <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" loading={reject.isPending} onClick={() => reject.mutate(app.id)}>
                <XCircle className="w-3 h-3" /> Reject
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function BuildRequestDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const token = useAuthStore((s) => s.accessToken);
  const { data: req, isLoading } = useBuildRequest(id);
  const { data: me } = useMe();

  const isPoster = !!me && me.id === req?.poster_id;
  const { data: applications } = useBuildRequestApplications(id, isPoster);
  const { mutate: updateStatus, isPending: updating } = useUpdateBuildRequestStatus(id);
  const { withdraw } = useResolveBuildApplication(id);

  if (isLoading) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full rounded-lg" />
      </div>
    );
  }

  if (!req) {
    return (
      <div className="max-w-md mx-auto px-4 py-20 text-center">
        <AlertTriangle className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
        <p className="text-sm text-muted-foreground mb-4">Build request not found.</p>
        <Button asChild variant="outline"><Link href="/requests">Browse requests</Link></Button>
      </div>
    );
  }

  const mine = req.my_application;
  const canApply = token && !isPoster && req.status === "open" && !mine;

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-6">
      <Link href="/requests" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="w-3.5 h-3.5" /> Back to build requests
      </Link>

      <div className="rounded-xl border bg-card p-6 space-y-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Badge variant={STATUS_VARIANT[req.status]} className="text-[10px] capitalize">{req.status.replace("_", " ")}</Badge>
              <span className="text-xs text-muted-foreground flex items-center gap-1"><Users className="w-3 h-3" /> {req.application_count} applied</span>
            </div>
            <h1 className="text-display-md flex items-center gap-2"><Hammer className="w-5 h-5 text-primary" /> {req.title}</h1>
            <Link href={`/u/${req.poster_id}`} className="text-sm text-muted-foreground hover:text-primary transition-colors">
              by {req.poster?.profile?.display_name ?? "Founder"}
            </Link>
          </div>
          <div className="text-right">
            <div className="text-display-md text-primary">{inr(req.budget_paise)}</div>
            {req.timeline_days && <div className="text-xs text-muted-foreground flex items-center gap-1 justify-end"><Clock className="w-3 h-3" /> {req.timeline_days} days</div>}
          </div>
        </div>

        <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">{req.description}</p>

        {req.skills.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {req.skills.map((s) => <span key={s} className="text-xs px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground">{s}</span>)}
          </div>
        )}

        {/* Poster controls */}
        {isPoster && (req.status === "open" || req.status === "in_progress") && (
          <div className="flex gap-2 pt-2 border-t">
            {req.status === "in_progress" && (
              <Button size="sm" loading={updating} onClick={() => updateStatus("completed")} className="gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5" /> Mark completed
              </Button>
            )}
            <Button size="sm" variant="outline" loading={updating} onClick={() => updateStatus("cancelled")} className="gap-1.5">
              <XCircle className="w-3.5 h-3.5" /> Cancel request
            </Button>
          </div>
        )}
      </div>

      {/* Payment note */}
      <div className="rounded-md bg-secondary/40 px-4 py-3 text-xs text-muted-foreground">
        CodeBazaar connects founders and builders and surfaces trust signals. Payment is arranged directly between both parties — no funds are held on the platform.
      </div>

      {/* My application status */}
      {mine && (
        <div className="rounded-xl border bg-card p-5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-sm">Your application</h3>
              <p className="text-xs text-muted-foreground mt-0.5 capitalize">Status: {mine.status}</p>
            </div>
            {(mine.status === "pending" || mine.status === "accepted") && (
              <Button size="sm" variant="ghost" loading={withdraw.isPending} onClick={() => withdraw.mutate(mine.id)}>Withdraw</Button>
            )}
          </div>
          <p className="text-sm text-muted-foreground mt-2 whitespace-pre-wrap">{mine.cover_note}</p>
        </div>
      )}

      {/* Apply form */}
      {canApply && <ApplyForm requestId={id} />}
      {!token && req.status === "open" && (
        <div className="rounded-xl border bg-card p-5 text-center">
          <p className="text-sm text-muted-foreground mb-3">Sign in to apply to this build request.</p>
          <Button asChild size="sm"><Link href="/auth/login">Sign in</Link></Button>
        </div>
      )}

      {/* Applications (poster view) */}
      {isPoster && (
        <div className="space-y-3">
          <h2 className="font-semibold flex items-center gap-2"><Users className="w-4 h-4 text-primary" /> Applications ({applications?.length ?? 0})</h2>
          {!applications?.length ? (
            <div className="rounded-xl border border-dashed bg-card/50 p-8 text-center text-sm text-muted-foreground">
              No applications yet.
            </div>
          ) : (
            <div className="space-y-3">
              {applications.map((app) => (
                <ApplicationRow key={app.id} app={app} requestId={id} canManage={req.status === "open"} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
