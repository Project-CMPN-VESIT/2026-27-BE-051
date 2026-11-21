"use client";
import { useState } from "react";
import { Flag, X, CheckCircle2 } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/primitives";
import { reportsApi } from "@/lib/api";
import { getErrorMessage } from "@/lib/api/client";
import type { ReportReason } from "@/types";

const REASONS: { value: ReportReason; label: string }[] = [
  { value: "plagiarism", label: "Plagiarism / stolen work" },
  { value: "copied_repo", label: "Copied GitHub repository" },
  { value: "fake_hackathon", label: "Fake hackathon claim" },
  { value: "misleading", label: "Misleading or false info" },
  { value: "spam", label: "Spam" },
  { value: "inappropriate", label: "Inappropriate content" },
  { value: "other", label: "Something else" },
];

export function ReportProjectButton({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<ReportReason>("plagiarism");
  const [details, setDetails] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const { mutate, isPending } = useMutation({
    mutationFn: () => reportsApi.create({ target_id: projectId, reason, details: details || undefined }),
    onSuccess: () => { setDone(true); setError(null); },
    onError: (err) => setError(getErrorMessage(err)),
  });

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-destructive transition-colors"
      >
        <Flag className="w-3.5 h-3.5" /> Report
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setOpen(false)}>
          <div className="w-full max-w-md rounded-xl border bg-card p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="font-semibold flex items-center gap-2"><Flag className="w-4 h-4 text-destructive" /> Report project</h3>
              <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
            </div>

            {done ? (
              <div className="py-6 text-center space-y-2">
                <CheckCircle2 className="w-8 h-8 text-text-success mx-auto" />
                <p className="text-sm font-medium">Report submitted</p>
                <p className="text-xs text-muted-foreground">Our team will review it. Thanks for helping keep CodeBazaar trustworthy.</p>
                <Button size="sm" variant="outline" onClick={() => { setOpen(false); }}>Close</Button>
              </div>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">
                  Tell us what&apos;s wrong with this project. False reports may affect your account.
                </p>
                <div className="space-y-1.5">
                  <Label>Reason</Label>
                  <select
                    className="w-full h-9 px-3 text-sm rounded-md border bg-background focus-visible:outline-none focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-primary/12"
                    value={reason}
                    onChange={(e) => setReason(e.target.value as ReportReason)}
                  >
                    {REASONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label>Details (optional)</Label>
                  <textarea
                    className="w-full min-h-[80px] px-3 py-2 text-sm rounded-md border bg-background resize-none focus-visible:outline-none focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-primary/12"
                    placeholder="Add any evidence or context (links, original repo, etc.)"
                    value={details}
                    onChange={(e) => setDetails(e.target.value)}
                    maxLength={1000}
                  />
                </div>
                {error && <p className="text-xs text-destructive bg-destructive/10 px-3 py-2 rounded-md">{error}</p>}
                <div className="flex gap-2 justify-end">
                  <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
                  <Button size="sm" variant="destructive" loading={isPending} onClick={() => mutate()}>Submit report</Button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
