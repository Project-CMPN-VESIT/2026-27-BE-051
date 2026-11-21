"use client";
import { useState } from "react";
import {
  ShieldCheck, ExternalLink, Star, GitFork, CheckCircle2, XCircle, Calendar,
} from "lucide-react";
import { AdminPageHeader } from "@/components/admin/shared";

interface VerificationItem {
  id: string;
  title: string;
  repo_full_name: string;
  stage: string;
  stars: number;
  forks: number;
  description: string | null;
  verification?: {
    ownership_verified?: boolean;
    hackathon_verified?: boolean;
    originality_score?: number | null;
    activity_consistency?: number | null;
    repo_age_days?: number | null;
  };
}
import { Button } from "@/components/ui/button";
import { Textarea, Badge } from "@/components/ui/primitives";
import { Skeleton } from "@/components/ui/skeleton";
import { useVerificationQueue, useVerifyProject } from "@/lib/hooks/admin";

function VerificationCard({ project }: { project: VerificationItem }) {
  const { mutate, isPending } = useVerifyProject();
  const [notes, setNotes] = useState("");
  const [showNotes, setShowNotes] = useState(false);

  const v = project.verification ?? {};
  const checks = [
    { label: "Ownership verified", value: v.ownership_verified },
    { label: "Hackathon proof", value: v.hackathon_verified },
  ];

  return (
    <div className="rounded-xl border bg-card p-5 space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-semibold">{project.title}</h3>
            <Badge variant="ghost" className="capitalize text-[10px]">{project.stage}</Badge>
          </div>
          <a
            href={`https://github.com/${project.repo_full_name}`}
            target="_blank" rel="noopener noreferrer"
            className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
          >
            {project.repo_full_name} <ExternalLink className="w-3 h-3" />
          </a>
        </div>
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <span className="flex items-center gap-1"><Star className="w-3.5 h-3.5" />{project.stars}</span>
          <span className="flex items-center gap-1"><GitFork className="w-3.5 h-3.5" />{project.forks}</span>
        </div>
      </div>

      {project.description && (
        <p className="text-sm text-muted-foreground line-clamp-2">{project.description}</p>
      )}

      {/* Verification signals */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {checks.map(({ label, value }) => (
          <div key={label} className="flex items-center gap-2 text-sm">
            {value
              ? <CheckCircle2 className="w-4 h-4 text-text-success flex-shrink-0" />
              : <XCircle className="w-4 h-4 text-muted-foreground flex-shrink-0" />}
            <span className="text-muted-foreground text-xs">{label}</span>
          </div>
        ))}
        {v.originality_score !== null && v.originality_score !== undefined && (
          <div className="flex items-center gap-2 text-sm">
            <span className="font-semibold text-sm">{v.originality_score}</span>
            <span className="text-muted-foreground text-xs">Originality</span>
          </div>
        )}
        {v.activity_consistency !== null && v.activity_consistency !== undefined && (
          <div className="flex items-center gap-2 text-sm">
            <span className="font-semibold text-sm">{v.activity_consistency}</span>
            <span className="text-muted-foreground text-xs">Activity</span>
          </div>
        )}
      </div>

      {v.repo_age_days !== null && v.repo_age_days !== undefined && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Calendar className="w-3.5 h-3.5" />
          Repository age: {v.repo_age_days} days
        </div>
      )}

      {/* Notes */}
      {showNotes && (
        <Textarea
          placeholder="Add review notes (optional)…"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
        />
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 pt-2 border-t">
        <Button
          size="sm"
          loading={isPending}
          onClick={() => mutate({ projectId: project.id, verified: true, notes: notes || undefined })}
          className="gap-1.5"
        >
          <CheckCircle2 className="w-3.5 h-3.5" /> Approve
        </Button>
        <Button
          size="sm"
          variant="outline"
          loading={isPending}
          onClick={() => mutate({ projectId: project.id, verified: false, notes: notes || undefined })}
          className="gap-1.5"
        >
          <XCircle className="w-3.5 h-3.5" /> Reject
        </Button>
        {!showNotes && (
          <Button size="sm" variant="ghost" onClick={() => setShowNotes(true)}>
            Add notes
          </Button>
        )}
      </div>
    </div>
  );
}

export default function AdminVerificationPage() {
  const { data, isLoading } = useVerificationQueue();

  return (
    <div>
      <AdminPageHeader
        title="Verification Queue"
        subtitle={data ? `${data.total} project${data.total === 1 ? "" : "s"} awaiting review` : undefined}
      />

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-44 w-full rounded-lg" />)}
        </div>
      ) : !data?.items.length ? (
        <div className="rounded-xl border border-dashed bg-card/50 p-12 text-center">
          <div className="w-10 h-10 rounded-xl bg-background-success flex items-center justify-center mx-auto mb-3">
            <ShieldCheck className="w-5 h-5 text-text-success" />
          </div>
          <h3 className="font-medium mb-1">All caught up</h3>
          <p className="text-sm text-muted-foreground">No projects are currently awaiting verification.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {data.items.map((p: VerificationItem) => <VerificationCard key={p.id} project={p} />)}
        </div>
      )}
    </div>
  );
}
