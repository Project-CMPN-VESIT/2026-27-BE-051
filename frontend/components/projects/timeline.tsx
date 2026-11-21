"use client";
import { useState } from "react";
import {
  GitBranch, ShieldCheck, Trophy, Sparkles, Users, HeartHandshake, Tag,
  IndianRupee, TrendingUp, Flag, Plus, X, Trash2, History, type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label, Badge } from "@/components/ui/primitives";
import { Skeleton } from "@/components/ui/skeleton";
import { useProjectTimeline, useAddTimelineUpdate } from "@/lib/hooks";
import { getErrorMessage } from "@/lib/api/client";
import { cn } from "@/lib/utils";
import type { TimelineEvent, ProjectEventType } from "@/types";

const EVENT_META: Record<ProjectEventType, { icon: LucideIcon; color: string; ring: string }> = {
  created: { icon: GitBranch, color: "text-primary", ring: "ring-primary/20 bg-primary/10" },
  progress_update: { icon: TrendingUp, color: "text-primary", ring: "ring-primary/20 bg-primary/10" },
  milestone: { icon: Flag, color: "text-violet-500", ring: "ring-violet-500/20 bg-violet-500/10" },
  verified: { icon: ShieldCheck, color: "text-text-success", ring: "ring-score-high/20 bg-score-high/10" },
  hackathon_verified: { icon: Trophy, color: "text-text-warning", ring: "ring-score-mid/20 bg-score-mid/10" },
  analysis_completed: { icon: Sparkles, color: "text-primary", ring: "ring-primary/20 bg-primary/10" },
  contributor_joined: { icon: Users, color: "text-cyan-500", ring: "ring-cyan-500/20 bg-cyan-500/10" },
  adopted: { icon: HeartHandshake, color: "text-pink-500", ring: "ring-pink-500/20 bg-pink-500/10" },
  listed_for_sale: { icon: Tag, color: "text-text-warning", ring: "ring-score-mid/20 bg-score-mid/10" },
  sold: { icon: IndianRupee, color: "text-text-success", ring: "ring-score-high/20 bg-score-high/10" },
  stage_changed: { icon: TrendingUp, color: "text-muted-foreground", ring: "ring-border bg-secondary" },
};

function relativeDate(iso: string): string {
  const then = new Date(iso).getTime();
  const days = Math.floor((Date.now() - then) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function AddUpdateForm({ projectId, onDone }: { projectId: string; onDone: () => void }) {
  const { add } = useAddTimelineUpdate(projectId);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [progress, setProgress] = useState("");
  const [isMilestone, setIsMilestone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    if (title.trim().length < 3) {
      setError("Give the update a short title.");
      return;
    }
    try {
      await add.mutateAsync({
        title,
        description: description || undefined,
        progress_percent: progress === "" ? undefined : Math.max(0, Math.min(100, Number(progress))),
        is_milestone: isMilestone,
      });
      onDone();
    } catch (err) { setError(getErrorMessage(err)); }
  };

  return (
    <div className="rounded-xl border bg-secondary/30 p-4 space-y-3">
      <div className="space-y-1.5">
        <Label>What changed?</Label>
        <Input placeholder="e.g. Shipped multi-tenant workspaces" value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label>Details (optional)</Label>
        <textarea
          className="w-full min-h-[70px] px-3 py-2 text-sm rounded-md border bg-background resize-none focus-visible:outline-none focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-primary/12"
          placeholder="What works now, what's next…"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={2000}
        />
      </div>
      <div className="flex items-end gap-3 flex-wrap">
        <div className="space-y-1.5">
          <Label>Progress %</Label>
          <Input
            type="number" min={0} max={100} className="w-24"
            placeholder="60" value={progress}
            onChange={(e) => setProgress(e.target.value)}
          />
        </div>
        <label className="flex items-center gap-2 text-sm cursor-pointer pb-2">
          <input
            type="checkbox" className="w-4 h-4 rounded border-input"
            checked={isMilestone} onChange={(e) => setIsMilestone(e.target.checked)}
          />
          Mark as milestone
        </label>
      </div>
      {error && <p className="text-xs text-destructive bg-destructive/10 px-3 py-2 rounded-md">{error}</p>}
      <div className="flex gap-2">
        <Button size="sm" loading={add.isPending} onClick={submit}>Post update</Button>
        <Button size="sm" variant="ghost" onClick={onDone}>Cancel</Button>
      </div>
    </div>
  );
}

function TimelineRow({
  event, projectId, canManage, isLast,
}: { event: TimelineEvent; projectId: string; canManage: boolean; isLast: boolean }) {
  const { remove } = useAddTimelineUpdate(projectId);
  const meta = EVENT_META[event.event_type] ?? EVENT_META.stage_changed;
  const Icon = meta.icon;

  return (
    <div className="relative pl-11 pb-5 last:pb-0 group">
      {/* Connector */}
      {!isLast && <span className="absolute left-[15px] top-8 bottom-0 w-px bg-border" aria-hidden />}
      {/* Node */}
      <span className={cn("absolute left-0 top-0 w-8 h-8 rounded-full flex items-center justify-center ring-4", meta.ring)}>
        <Icon className={cn("w-4 h-4", meta.color)} />
      </span>

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-medium leading-snug">{event.title}</p>
            {event.event_type === "milestone" && (
              <Badge variant="outline" className="text-[10px]">Milestone</Badge>
            )}
            {event.progress_percent != null && (
              <Badge variant="ghost" className="text-[10px]">{event.progress_percent}%</Badge>
            )}
          </div>
          {event.description && (
            <p className="text-sm text-muted-foreground mt-0.5 whitespace-pre-wrap">{event.description}</p>
          )}
          <p className="text-xs text-muted-foreground mt-1">
            {relativeDate(event.created_at)}
            {event.actor_name ? ` · ${event.actor_name}` : ""}
            {!event.is_manual ? " · automatic" : ""}
          </p>
        </div>
        {canManage && event.is_manual && (
          <button
            onClick={() => remove.mutate(event.id)}
            disabled={remove.isPending}
            aria-label="Delete update"
            className="opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity text-muted-foreground hover:text-destructive p-1"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

export function ProjectTimeline({
  projectId, canManage, progressPercent,
}: { projectId: string; canManage: boolean; progressPercent?: number }) {
  const { data: events, isLoading } = useProjectTimeline(projectId);
  const [adding, setAdding] = useState(false);

  if (isLoading) {
    return (
      <div className="rounded-xl border bg-card p-5 space-y-3">
        <Skeleton className="h-5 w-40" />
        {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
      </div>
    );
  }

  // Nothing to show and nothing the viewer can do about it.
  if (!events?.length && !canManage) return null;

  const progress = progressPercent ?? 0;

  return (
    <div className="rounded-xl border bg-card p-5 space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="font-semibold text-sm flex items-center gap-2">
            <History className="w-4 h-4 text-primary" /> Progress timeline
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Every milestone, verification and handover — recorded as it happened.
          </p>
        </div>
        {canManage && !adding && (
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setAdding(true)}>
            <Plus className="w-3.5 h-3.5" /> Post update
          </Button>
        )}
      </div>

      {/* Progress bar */}
      {progress > 0 && (
        <div>
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-muted-foreground">Build progress</span>
            <span className="font-medium">{progress}%</span>
          </div>
          <div className="h-2 rounded-full bg-secondary overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all"
              style={{ width: `${progress}%` }}
              role="progressbar"
              aria-valuenow={progress}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Build progress"
            />
          </div>
        </div>
      )}

      {adding && <AddUpdateForm projectId={projectId} onDone={() => setAdding(false)} />}

      {!events?.length ? (
        <p className="text-sm text-muted-foreground">
          No timeline entries yet. Post your first progress update to show momentum.
        </p>
      ) : (
        <div className="pt-1">
          {events.map((e, i) => (
            <TimelineRow
              key={e.id}
              event={e}
              projectId={projectId}
              canManage={canManage}
              isLast={i === events.length - 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}
