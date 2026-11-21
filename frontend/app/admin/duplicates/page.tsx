"use client";
import { useState } from "react";
import Link from "next/link";
import { CopyCheck, ShieldCheck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, EmptyState, Textarea } from "@/components/ui/primitives";
import { Alert, FormError } from "@/components/ui/alert";
import { Container, PageHeader } from "@/components/ui/layout";
import { Skeleton } from "@/components/ui/skeleton";
import { AdminGate } from "@/components/admin/gate";
import { DuplicateFlagBody } from "@/components/trust/duplicate-notice";
import { useDuplicateQueue, useReviewDuplicate } from "@/lib/hooks/advanced";
import { getErrorMessage } from "@/lib/api/client";
import type { DuplicateFlag } from "@/types/advanced";

/**
 * Moderation queue for suspected duplicate listings.
 *
 * Every flag here was raised by an automated similarity check that deliberately
 * does not auto-reject. A human decides, and both outcomes are explicit:
 * confirming keeps the listing out of the marketplace, dismissing releases it
 * fully. There is no "leave it in limbo" option, because a listing frozen by
 * indecision is worse for the builder than either verdict.
 */
export default function AdminDuplicatesPage() {
  return (
    <AdminGate>
      <DuplicatesBody />
    </AdminGate>
  );
}

function DuplicatesBody() {
  const { data: flags, isLoading } = useDuplicateQueue();

  return (
    <Container className="py-8 sm:py-10 max-w-3xl">
      <PageHeader
        title="Duplicate review"
        description="Listings the similarity screen flagged as substantially overlapping an existing project. Nothing was auto-rejected — each of these needs a decision."
      />

      {isLoading ? (
        <div className="space-y-3">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-40 rounded-xl" />
          ))}
        </div>
      ) : !flags || flags.length === 0 ? (
        <EmptyState
          icon={<ShieldCheck className="w-6 h-6" />}
          title="Queue is clear"
          description="No pending similarity flags. New imports are screened automatically, and anything above the review threshold lands here."
        />
      ) : (
        <>
          <Alert
            variant="info"
            title={`${flags.length} listing${flags.length === 1 ? "" : "s"} awaiting review`}
            description="Flags at 72% or above are already withheld from the marketplace. Below that, the listing stays visible while it waits."
            className="mb-5"
          />
          <div className="space-y-4">
            {flags.map((flag) => (
              <FlagCard key={flag.id} flag={flag} />
            ))}
          </div>
        </>
      )}
    </Container>
  );
}

function FlagCard({ flag }: { flag: DuplicateFlag }) {
  const review = useReviewDuplicate();
  const [mode, setMode] = useState<"none" | "confirm" | "dismiss">("none");
  const [note, setNote] = useState("");

  const submit = (confirm: boolean) => {
    review.mutate(
      { flagId: flag.id, confirm, note: note.trim() || undefined },
      { onSuccess: () => setMode("none") },
    );
  };

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <div className="px-4 sm:px-5 py-4">
        <DuplicateFlagBody flag={flag} showProject />
      </div>

      <div className="px-4 sm:px-5 py-3 border-t">
        {mode === "none" ? (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="destructive" onClick={() => setMode("confirm")}>
              <CopyCheck className="w-3.5 h-3.5" /> Confirm duplicate
            </Button>
            <Button size="sm" variant="outline" onClick={() => setMode("dismiss")}>
              <X className="w-3.5 h-3.5" /> Not a duplicate
            </Button>
            <Button size="sm" variant="ghost" asChild>
              <Link href={`/projects/${flag.project_id}`} target="_blank">
                Open listing
              </Link>
            </Button>
            <Button size="sm" variant="ghost" asChild>
              <Link href={`/projects/${flag.matched_project_id}`} target="_blank">
                Open the match
              </Link>
            </Button>
          </div>
        ) : (
          <div className="space-y-2.5">
            <p className="text-xs font-medium">
              {mode === "confirm"
                ? "Confirming keeps this listing hidden from the marketplace."
                : "Dismissing releases the listing fully and clears the flag."}
            </p>
            <Textarea
              rows={2}
              maxLength={1000}
              placeholder={
                mode === "confirm"
                  ? "What convinced you — e.g. same codebase re-uploaded under a new repo name."
                  : "Why it isn't a duplicate — e.g. both follow a common tutorial structure but diverge."
              }
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <p className="text-[11px] text-muted-foreground">
              This note is sent to the project owner. It&apos;s the only explanation
              they get, so make it usable.
            </p>
            {review.isError && <FormError message={getErrorMessage(review.error)} />}
            <div className="flex gap-2">
              <Button
                size="sm"
                variant={mode === "confirm" ? "destructive" : "cta"}
                loading={review.isPending}
                onClick={() => submit(mode === "confirm")}
              >
                {mode === "confirm" ? "Confirm and withhold" : "Dismiss and release"}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setMode("none")}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
