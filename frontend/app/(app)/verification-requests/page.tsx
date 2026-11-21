"use client";
import { useState } from "react";
import Link from "next/link";
import {
  Briefcase, Building2, FileSearch, Lock, Send, ShieldCheck, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, EmptyState, Input, Label, Textarea } from "@/components/ui/primitives";
import { Alert, FormError } from "@/components/ui/alert";
import { Container, PageHeader } from "@/components/ui/layout";
import { Skeleton } from "@/components/ui/skeleton";
import { ScoreRing } from "@/components/trust/score-ring";
import {
  useDeclineVerificationRequest, useFulfilVerificationRequest,
  useVerificationRequests,
} from "@/lib/hooks/advanced";
import { useMe } from "@/lib/hooks";
import { getErrorMessage } from "@/lib/api/client";
import { cn } from "@/lib/utils";
import type { EmployerVerificationRequest } from "@/types/advanced";

const STATUS_BADGE: Record<
  string,
  { label: string; variant: "warning" | "success" | "ghost" }
> = {
  pending: { label: "Awaiting your decision", variant: "warning" },
  fulfilled: { label: "Report shared", variant: "success" },
  declined: { label: "Declined", variant: "ghost" },
  withdrawn: { label: "Withdrawn", variant: "ghost" },
  expired: { label: "Expired", variant: "ghost" },
};

/**
 * Employer verification requests — hiring signal on private repos.
 *
 * The builder holds all the power in this flow, and the UI says so: the recruiter
 * names a role, the builder picks which private repo answers it, and nothing is
 * read without the builder's own GitHub token. A recruiter cannot cause a scan.
 */
export default function VerificationRequestsPage() {
  const { data: me } = useMe();
  const { data: requests, isLoading } = useVerificationRequests();

  const asBuilder = (requests ?? []).filter((r) => r.builder_id === me?.id);
  const asRequester = (requests ?? []).filter((r) => r.requester_id === me?.id);
  const pendingForMe = asBuilder.filter((r) => r.status === "pending").length;

  return (
    <Container className="py-8 sm:py-10 max-w-3xl">
      <PageHeader
        title="Verification requests"
        description="A recruiter can ask you to verify a private repository for a hiring decision. You choose which repo, the code stays private, and only the resulting trust report is shared."
      />

      {isLoading ? (
        <Skeleton className="h-48 w-full rounded-xl" />
      ) : (requests ?? []).length === 0 ? (
        <EmptyState
          icon={<FileSearch className="w-6 h-6" />}
          title="No verification requests"
          description="When a recruiter asks you to verify private work for a role, it appears here. You can also request one from a builder's profile if you're hiring."
          action={
            <Button asChild>
              <Link href="/builders">Browse builders</Link>
            </Button>
          }
        />
      ) : (
        <div className="space-y-8">
          {asBuilder.length > 0 && (
            <section aria-labelledby="incoming-heading">
              <div className="flex items-center gap-2 mb-3 flex-wrap">
                <h2 id="incoming-heading" className="font-semibold text-sm">
                  Requests to you
                </h2>
                {pendingForMe > 0 && (
                  <Badge variant="warning" size="sm">{pendingForMe} awaiting you</Badge>
                )}
              </div>
              <div className="space-y-3">
                {asBuilder.map((request) => (
                  <BuilderRequestCard key={request.id} request={request} />
                ))}
              </div>
            </section>
          )}

          {asRequester.length > 0 && (
            <section aria-labelledby="sent-heading">
              <h2 id="sent-heading" className="font-semibold text-sm mb-3">
                Requests you sent
              </h2>
              <div className="space-y-3">
                {asRequester.map((request) => (
                  <RequesterRequestCard key={request.id} request={request} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </Container>
  );
}

/* ── Builder side ──────────────────────────────────────────────────────────── */

function BuilderRequestCard({ request }: { request: EmployerVerificationRequest }) {
  const fulfil = useFulfilVerificationRequest();
  const decline = useDeclineVerificationRequest();
  const [mode, setMode] = useState<"none" | "fulfil" | "decline">("none");
  const [repo, setRepo] = useState("");
  const [note, setNote] = useState("");
  // Entered per action rather than stored. A token with private-repo read scope
  // is not something to keep in client state longer than the one call needs it.
  const [githubToken, setGithubToken] = useState("");

  const badge = STATUS_BADGE[request.status] ?? STATUS_BADGE.pending;

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <div className="px-4 sm:px-5 py-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <Briefcase className="w-3.5 h-3.5 text-primary flex-shrink-0" />
              <h3 className="font-semibold text-sm">{request.role_title}</h3>
              <Badge variant={badge.variant} size="sm">{badge.label}</Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {request.company ?? "A recruiter"}
              {request.requester_name && ` · ${request.requester_name}`} ·{" "}
              {new Date(request.created_at).toLocaleDateString("en-IN", {
                day: "numeric",
                month: "short",
              })}
            </p>
          </div>
        </div>

        <p className="text-sm text-muted-foreground mt-3 leading-relaxed">
          {request.message}
        </p>
        {request.looking_for && (
          <p className="text-xs text-muted-foreground mt-2">
            <span className="font-medium text-foreground">Looking for:</span>{" "}
            {request.looking_for}
          </p>
        )}
      </div>

      {request.status === "fulfilled" && request.report && (
        <ReportBlock request={request} />
      )}

      {request.status === "declined" && request.builder_note && (
        <p className="px-4 sm:px-5 pb-4 text-xs italic text-muted-foreground">
          You replied: {request.builder_note}
        </p>
      )}

      {request.status === "pending" && (
        <div className="px-4 sm:px-5 pb-4 border-t pt-4">
          {mode === "none" && (
            <>
              <div className="flex gap-2 flex-wrap">
                <Button size="sm" variant="cta" onClick={() => setMode("fulfil")}>
                  <ShieldCheck className="w-3.5 h-3.5" /> Verify a private repo
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setMode("decline")}>
                  Decline
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground mt-2.5 leading-relaxed">
                <Lock className="w-3 h-3 inline mr-1" />
                We read the repo with your GitHub authorisation to compute the
                score, then share only the report — never the code, and never the
                repo contents. You pick which repository.
              </p>
            </>
          )}

          {mode === "fulfil" && (
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                if (!githubToken) return;
                fulfil.mutate(
                  {
                    id: request.id,
                    repo_full_name: repo.trim(),
                    note: note.trim() || undefined,
                    githubToken,
                  },
                  { onSuccess: () => setMode("none") },
                );
              }}
            >
              <div>
                <Label htmlFor={`token-${request.id}`}>
                  GitHub token (repo scope)
                </Label>
                <Input
                  id={`token-${request.id}`}
                  type="password"
                  required
                  autoComplete="off"
                  placeholder="ghp_…"
                  value={githubToken}
                  onChange={(e) => setGithubToken(e.target.value)}
                />
                <p className="text-[11px] text-muted-foreground mt-1">
                  Used once, for this scan, and never stored. A private repo can
                  only be read with your own authorisation — which is exactly why
                  nobody can produce this report about you without your involvement.
                </p>
              </div>
              <div>
                <Label htmlFor={`repo-${request.id}`}>Repository</Label>
                <Input
                  id={`repo-${request.id}`}
                  required
                  placeholder="your-username/private-repo"
                  value={repo}
                  onChange={(e) => setRepo(e.target.value)}
                />
                <p className="text-[11px] text-muted-foreground mt-1">
                  Must be a repo you own. We confirm ownership against your GitHub
                  account before scoring.
                </p>
              </div>
              <div>
                <Label htmlFor={`note-${request.id}`}>Note to the recruiter</Label>
                <Textarea
                  id={`note-${request.id}`}
                  rows={2}
                  placeholder="What this project is, and what you'd want them to notice."
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              </div>
              <FormError message={fulfil.isError ? getErrorMessage(fulfil.error) : null} />
              <div className="flex gap-2">
                <Button
                  type="submit"
                  size="sm"
                  loading={fulfil.isPending}
                  loadingText="Scoring…"
                  disabled={!githubToken || !repo.trim()}
                >
                  Run verification &amp; share
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setMode("none")}>
                  Cancel
                </Button>
              </div>
            </form>
          )}

          {mode === "decline" && (
            <form
              className="space-y-2"
              onSubmit={(e) => {
                e.preventDefault();
                decline.mutate(
                  { id: request.id, note: note.trim() || undefined },
                  { onSuccess: () => setMode("none") },
                );
              }}
            >
              <Textarea
                rows={2}
                placeholder="Optional reason — e.g. your private work is under NDA."
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
              <div className="flex gap-2">
                <Button type="submit" size="sm" variant="outline" loading={decline.isPending}>
                  <X className="w-3.5 h-3.5" /> Decline request
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setMode("none")}>
                  Cancel
                </Button>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Recruiter side ────────────────────────────────────────────────────────── */

function RequesterRequestCard({ request }: { request: EmployerVerificationRequest }) {
  const badge = STATUS_BADGE[request.status] ?? STATUS_BADGE.pending;
  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <div className="px-4 sm:px-5 py-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <Send className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
              <h3 className="font-semibold text-sm">{request.role_title}</h3>
              <Badge variant={badge.variant} size="sm">
                {request.status === "pending" ? "Awaiting the builder" : badge.label}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              To{" "}
              <Link
                href={`/u/${request.builder_id}`}
                className="font-medium text-foreground hover:text-primary transition-colors"
              >
                {request.builder_name ?? "a builder"}
              </Link>{" "}
              ·{" "}
              {new Date(request.created_at).toLocaleDateString("en-IN", {
                day: "numeric",
                month: "short",
              })}
            </p>
          </div>
        </div>
      </div>

      {request.status === "fulfilled" && request.report ? (
        <ReportBlock request={request} />
      ) : request.status === "declined" ? (
        <p className="px-4 sm:px-5 pb-4 text-xs text-muted-foreground italic">
          {request.builder_note ?? "The builder declined this request."}
        </p>
      ) : (
        <p className="px-4 sm:px-5 pb-4 text-xs text-muted-foreground leading-relaxed">
          The builder decides whether to respond and which repository to verify.
          Nothing is scanned without their authorisation.
        </p>
      )}
    </div>
  );
}

/* ── Shared report block ───────────────────────────────────────────────────── */

function ReportBlock({ request }: { request: EmployerVerificationRequest }) {
  const report = request.report!;
  return (
    <div className="border-t bg-surface/40 px-4 sm:px-5 py-4">
      <div className="flex items-start gap-4 flex-wrap">
        <ScoreRing score={report.verified_build_score} size="md" animate={false} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="ghost" size="sm">
              <Lock className="w-3 h-3" /> Private repository
            </Badge>
            {report.meets_threshold ? (
              <Badge variant="success" size="sm">
                <ShieldCheck className="w-3 h-3" /> Meets the {report.threshold} threshold
              </Badge>
            ) : (
              <Badge variant="warning" size="sm">
                Below the {report.threshold} threshold
              </Badge>
            )}
            {request.report_code && (
              <span className="text-[11px] font-mono text-muted-foreground">
                {request.report_code}
              </span>
            )}
          </div>
          {request.repo_full_name && (
            <p className="text-xs font-mono text-muted-foreground mt-1.5">
              {request.repo_full_name}
            </p>
          )}
          <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
            {report.reasoning}
          </p>
        </div>
      </div>

      {/* Component breakdown */}
      <ul className="mt-4 space-y-1.5">
        {report.components.map((component) => (
          <li key={component.key} className="flex items-center gap-3 text-xs">
            <span className="flex-1 text-muted-foreground">{component.label}</span>
            <span className="text-[11px] text-muted-foreground tabular-nums">
              {Math.round(component.weight * 100)}%
            </span>
            <div className="h-1.5 w-20 rounded-full bg-border overflow-hidden">
              <div
                className="h-full rounded-full bg-primary/60"
                style={{ width: `${Math.max(0, Math.min(100, component.score ?? 0))}%` }}
              />
            </div>
            <span className="tabular-nums font-medium w-7 text-right">
              {component.score ?? "—"}
            </span>
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-[11px] text-muted-foreground">
        <span>{report.commits_analyzed} commits analysed</span>
        <span>{report.contributors_count} contributors</span>
        {report.repo_age_days != null && <span>{report.repo_age_days} days old</span>}
        <span className="capitalize">{report.confidence} confidence</span>
      </div>

      {report.flags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {report.flags.map((flag) => (
            <Badge key={flag.key} variant="warning" size="sm">
              {flag.label ?? flag.key.replace(/_/g, " ")}
            </Badge>
          ))}
        </div>
      )}

      {request.builder_note && (
        <p className="mt-3 pt-3 border-t text-xs italic text-muted-foreground">
          Builder&apos;s note: {request.builder_note}
        </p>
      )}

      <p className="mt-3 text-[11px] text-muted-foreground leading-relaxed">
        Computed by the same scoring engine used for public listings — a hiring
        report is not a weaker second-class score. It simply isn&apos;t attached to
        a marketplace listing, because there isn&apos;t one.
      </p>
    </div>
  );
}
