"use client";
import { useState } from "react";
import Link from "next/link";
import {
  HeartHandshake, X, CheckCircle2, XCircle, Sparkles, AlertTriangle, Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, Label } from "@/components/ui/primitives";
import {
  useAdoptionRequests, useMyAdoptionRequest, useRequestAdoption,
  useSetAdoptionStatus, useResolveAdoption,
} from "@/lib/hooks";
import { getErrorMessage } from "@/lib/api/client";
import type { Project, AdoptionRequest } from "@/types";

// ── Requester side ───────────────────────────────────────────────────────────

function RequestAdoptionModal({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const { mutateAsync, isPending } = useRequestAdoption(projectId);
  const [message, setMessage] = useState("");
  const [plan, setPlan] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    if (message.trim().length < 20) {
      setError("Tell the owner a bit more — at least 20 characters.");
      return;
    }
    try {
      await mutateAsync({ message, continuation_plan: plan || undefined });
      onClose();
    } catch (err) { setError(getErrorMessage(err)); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl border bg-card p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="font-semibold flex items-center gap-2">
            <HeartHandshake className="w-4 h-4 text-primary" /> Request to adopt
          </h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
        </div>
        <p className="text-sm text-muted-foreground">
          If the owner approves, this project transfers to you. You become the owner and they stay on as the original author.
        </p>
        <div className="space-y-1.5">
          <Label>Why do you want to continue this?</Label>
          <textarea
            className="w-full min-h-[90px] px-3 py-2 text-sm rounded-md border bg-background resize-none focus-visible:outline-none focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-primary/12"
            placeholder="Your background, why this project matters to you…"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            maxLength={2000}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Continuation plan (optional)</Label>
          <textarea
            className="w-full min-h-[70px] px-3 py-2 text-sm rounded-md border bg-background resize-none focus-visible:outline-none focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-primary/12"
            placeholder="What you'll ship first, how you'll maintain it…"
            value={plan}
            onChange={(e) => setPlan(e.target.value)}
            maxLength={2000}
          />
        </div>
        {error && <p className="text-xs text-destructive bg-destructive/10 px-3 py-2 rounded-md">{error}</p>}
        <div className="flex gap-2 justify-end">
          <Button size="sm" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button size="sm" loading={isPending} onClick={submit}>Send request</Button>
        </div>
      </div>
    </div>
  );
}

function AdoptCTA({ project }: { project: Project }) {
  const [open, setOpen] = useState(false);
  const { data: mine } = useMyAdoptionRequest(project.id, true);
  const { withdraw } = useResolveAdoption(project.id);

  if (mine && mine.status === "pending") {
    return (
      <div className="rounded-xl border border-primary/30 bg-primary/5 p-5 flex items-start gap-4">
        <HeartHandshake className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
        <div className="flex-1">
          <h3 className="font-semibold text-sm">Adoption request pending</h3>
          <p className="text-sm text-muted-foreground mt-0.5">
            The owner is reviewing your request to take over this project.
          </p>
        </div>
        <Button size="sm" variant="ghost" loading={withdraw.isPending} onClick={() => withdraw.mutate(mine.id)}>
          Withdraw
        </Button>
      </div>
    );
  }

  return (
    <>
      <div className="rounded-xl border border-primary/30 bg-primary/5 p-5 flex items-start gap-4">
        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
          <HeartHandshake className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1">
          <h3 className="font-semibold text-sm flex items-center gap-2">
            Open for adoption
            <Badge variant="success" className="text-[10px]">Available</Badge>
          </h3>
          <p className="text-sm text-muted-foreground mt-0.5 mb-3">
            The owner is looking for someone to take this over and keep building it. Ownership transfers to you on approval.
          </p>
          {mine && mine.status === "rejected" && (
            <p className="text-xs text-muted-foreground mb-2">Your previous request was declined — you can apply again.</p>
          )}
          <Button size="sm" className="gap-1.5" onClick={() => setOpen(true)}>
            <Sparkles className="w-3.5 h-3.5" /> Request to adopt
          </Button>
        </div>
      </div>
      {open && <RequestAdoptionModal projectId={project.id} onClose={() => setOpen(false)} />}
    </>
  );
}

// ── Owner side ───────────────────────────────────────────────────────────────

function AdoptionRequestRow({ req, projectId }: { req: AdoptionRequest; projectId: string }) {
  const { resolve } = useResolveAdoption(projectId);
  const [error, setError] = useState<string | null>(null);
  const name = req.requester?.profile?.display_name ?? "Builder";

  const act = (approve: boolean) => {
    setError(null);
    resolve.mutate({ requestId: req.id, approve }, { onError: (e) => setError(getErrorMessage(e)) });
  };

  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link href={`/u/${req.requester_id}`} className="font-medium text-sm hover:text-primary transition-colors">{name}</Link>
          <p className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap">{req.message}</p>
          {req.continuation_plan && (
            <div className="mt-2">
              <span className="text-xs font-medium text-muted-foreground">Plan</span>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">{req.continuation_plan}</p>
            </div>
          )}
        </div>
        <div className="flex flex-col items-end gap-2 flex-shrink-0">
          <Badge
            variant={req.status === "approved" ? "success" : req.status === "pending" ? "warning" : "ghost"}
            className="text-[10px] capitalize"
          >
            {req.status}
          </Badge>
          {req.status === "pending" && (
            <div className="flex gap-1">
              <Button size="sm" className="h-7 text-xs gap-1" loading={resolve.isPending} onClick={() => act(true)}>
                <CheckCircle2 className="w-3 h-3" /> Transfer
              </Button>
              <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" loading={resolve.isPending} onClick={() => act(false)}>
                <XCircle className="w-3 h-3" /> Decline
              </Button>
            </div>
          )}
        </div>
      </div>
      {error && <p className="text-xs text-destructive mt-2">{error}</p>}
    </div>
  );
}

function OwnerAdoptionManager({ project }: { project: Project }) {
  const { mutate: setStatus, isPending } = useSetAdoptionStatus(project.id);
  const isOpen = !!project.is_open_for_adoption;
  const { data: requests } = useAdoptionRequests(project.id, isOpen);
  const pending = (requests ?? []).filter((r) => r.status === "pending");

  return (
    <div className="rounded-xl border bg-card p-5 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="font-semibold text-sm flex items-center gap-2">
            <HeartHandshake className="w-4 h-4 text-primary" /> Adoption
          </h3>
          <p className="text-sm text-muted-foreground mt-0.5">
            {isOpen
              ? "Your project is listed as open for adoption. Builders can request to take it over."
              : "Not planning to continue this? Open it for adoption so another builder can revive it."}
          </p>
        </div>
        <Button
          size="sm"
          variant={isOpen ? "outline" : "default"}
          loading={isPending}
          onClick={() => setStatus(!isOpen)}
        >
          {isOpen ? "Close adoption" : "Open for adoption"}
        </Button>
      </div>

      {isOpen && (
        <div className="rounded-md bg-background-warning/60 border border-border-warning px-3 py-2 flex items-start gap-2">
          <AlertTriangle className="w-3.5 h-3.5 text-text-warning flex-shrink-0 mt-0.5" />
          <p className="text-xs text-muted-foreground">
            Approving a request <span className="font-medium text-foreground">permanently transfers ownership</span>. You&apos;ll stay
            credited as the original author, and the project&apos;s verified badge resets until the new owner re-verifies GitHub ownership.
          </p>
        </div>
      )}

      {isOpen && (
        <div className="space-y-3">
          <h4 className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5" /> Requests ({pending.length} pending)
          </h4>
          {!requests?.length ? (
            <p className="text-sm text-muted-foreground">No adoption requests yet.</p>
          ) : (
            <div className="space-y-2">
              {requests.map((r) => <AdoptionRequestRow key={r.id} req={r} projectId={project.id} />)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Entry point ──────────────────────────────────────────────────────────────

export function AdoptionPanel({
  project, isOwner, isLoggedIn,
}: { project: Project; isOwner: boolean; isLoggedIn: boolean }) {
  if (isOwner) return <OwnerAdoptionManager project={project} />;
  if (!project.is_open_for_adoption) return null;
  if (!isLoggedIn) {
    return (
      <div className="rounded-xl border border-primary/30 bg-primary/5 p-5 text-center">
        <HeartHandshake className="w-6 h-6 text-primary mx-auto mb-2" />
        <p className="text-sm font-medium mb-1">This project is open for adoption</p>
        <p className="text-sm text-muted-foreground mb-3">Sign in to request to take it over and continue building.</p>
        <Button size="sm" asChild><Link href="/auth/login">Sign in</Link></Button>
      </div>
    );
  }
  return <AdoptCTA project={project} />;
}
