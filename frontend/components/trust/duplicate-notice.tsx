"use client";
import Link from "next/link";
import { CopyCheck, EyeOff, ShieldQuestion } from "lucide-react";
import { Badge } from "@/components/ui/primitives";
import { Alert } from "@/components/ui/alert";
import { useProjectDuplicates } from "@/lib/hooks/advanced";
import { cn } from "@/lib/utils";
import type { DuplicateFlag } from "@/types/advanced";

/**
 * Similarity flags on a project, shown to its owner (and to admins).
 *
 * The design principle: a builder whose listing has been held back is entitled to
 * see exactly what it was matched against and which signals fired. Withholding a
 * listing without telling the owner why isn't moderation, it's a black box — and
 * a false positive would be impossible for them to contest.
 */
export function DuplicateNotice({
  projectId,
  duplicateStatus,
  canSee,
  className,
}: {
  projectId: string;
  duplicateStatus: string | null | undefined;
  canSee: boolean;
  className?: string;
}) {
  const { data: flags } = useProjectDuplicates(projectId, canSee);

  if (!canSee) return null;
  if (!duplicateStatus || duplicateStatus === "clear") return null;

  const withheld = duplicateStatus === "withheld";
  const pending = (flags ?? []).filter((f) => f.status === "pending");
  const confirmed = (flags ?? []).filter((f) => f.status === "confirmed");
  const relevant = [...confirmed, ...pending];

  return (
    <div className={cn("space-y-3", className)}>
      <Alert
        variant={withheld ? "danger" : "warning"}
        title={
          withheld
            ? "This listing is hidden from the marketplace pending review"
            : "This listing has been flagged as possibly duplicating another"
        }
        description={
          withheld
            ? "It stays fully visible to you and can still be scored, but it won't appear in browse, search or the for-sale rails until a reviewer looks at it. If you believe the match is wrong, reply to the notification we sent you."
            : "A reviewer will check it. Your listing remains fully visible in the meantime."
        }
      />

      {relevant.length > 0 && (
        <div className="rounded-xl border bg-card overflow-hidden">
          <div className="px-4 py-3 border-b flex items-center gap-2 flex-wrap">
            <CopyCheck className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            <h4 className="font-semibold text-sm">What it was matched against</h4>
            <Badge variant="ghost" size="sm">
              {relevant.length} match{relevant.length === 1 ? "" : "es"}
            </Badge>
          </div>
          <ul className="divide-y">
            {relevant.map((flag) => (
              <li key={flag.id} className="px-4 py-3">
                <DuplicateFlagBody flag={flag} />
              </li>
            ))}
          </ul>
          <p className="px-4 py-3 border-t bg-surface/50 text-[11px] text-muted-foreground leading-relaxed">
            This check compares listing content and repository shape — titles,
            descriptions, dependency sets, directory layout. It is{" "}
            <span className="font-medium">not</span> code-similarity scanning, so it
            cannot prove plagiarism and never rejects a project automatically. Every
            flag goes to a human.
          </p>
        </div>
      )}
    </div>
  );
}

export function DuplicateFlagBody({
  flag,
  showProject = false,
}: {
  flag: DuplicateFlag;
  showProject?: boolean;
}) {
  return (
    <div>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          {showProject && (
            <p className="text-xs text-muted-foreground mb-0.5">
              Flagged listing:{" "}
              <Link
                href={`/projects/${flag.project_id}`}
                className="font-medium text-foreground hover:text-primary transition-colors"
              >
                {flag.project_title ?? "Project"}
              </Link>
            </p>
          )}
          <p className="text-sm font-medium">
            {flag.matched_project_title ?? "Existing listing"}
          </p>
          {flag.matched_repo_full_name && (
            <p className="text-xs font-mono text-muted-foreground mt-0.5">
              {flag.matched_repo_full_name}
              {flag.matched_owner_name && ` · ${flag.matched_owner_name}`}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <Badge
            variant={
              flag.similarity >= 72
                ? "destructive"
                : flag.similarity >= 55
                  ? "warning"
                  : "ghost"
            }
            size="sm"
          >
            {flag.similarity}% similar
          </Badge>
          {flag.status !== "pending" && (
            <Badge variant={flag.status === "confirmed" ? "destructive" : "success"} size="sm">
              {flag.status}
            </Badge>
          )}
        </div>
      </div>

      {flag.signals.length > 0 && (
        <ul className="mt-2 space-y-1">
          {flag.signals.map((signal) => (
            <li key={signal.signal} className="flex items-start gap-2 text-xs">
              <ShieldQuestion className="w-3 h-3 text-muted-foreground flex-shrink-0 mt-0.5" />
              <span className="flex-1 text-muted-foreground">{signal.detail}</span>
              <span className="font-mono text-muted-foreground flex-shrink-0">
                +{signal.weight}
              </span>
            </li>
          ))}
        </ul>
      )}

      {flag.review_note && (
        <p className="mt-2 text-xs italic text-muted-foreground border-l-2 border-border pl-2.5">
          Reviewer: {flag.review_note}
        </p>
      )}
    </div>
  );
}

/** Badge for admin lists and project cards. */
export function DuplicateStatusBadge({ status }: { status: string | null | undefined }) {
  if (!status || status === "clear") return null;
  const withheld = status === "withheld";
  return (
    <Badge variant={withheld ? "destructive" : "warning"} size="sm">
      {withheld ? <EyeOff className="w-3 h-3" /> : <CopyCheck className="w-3 h-3" />}
      {withheld ? "Withheld" : "Under review"}
    </Badge>
  );
}
