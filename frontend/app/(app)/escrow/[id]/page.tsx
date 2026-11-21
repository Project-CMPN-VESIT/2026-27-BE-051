"use client";
import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, ShieldCheck, Wallet, CheckCircle2, XCircle, AlertTriangle, Scale } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardContent, Textarea, Input } from "@/components/ui/primitives";
import { Alert } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useEscrowContract, useMe, useFundContract, useCancelContract,
  useSubmitMilestone, useApproveMilestone, useRejectMilestone,
  useRaiseDispute, useResolveDispute,
} from "@/lib/hooks";
import {
  contractStatusVariant, milestoneStatusVariant, milestoneStatusLabel,
  disputeStatusVariant, humanize, rupees,
} from "@/lib/escrow";
import type { Dispute, EscrowContractDetail, LedgerEntry, Milestone } from "@/types";
import { getErrorMessage } from "@/lib/api/client";
import { cn } from "@/lib/utils";

export default function ContractDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const { data: me } = useMe();
  const { data: contract, isLoading } = useEscrowContract(id);
  const { mutate: fund, isPending: funding } = useFundContract(id);
  const { mutate: cancel, isPending: cancelling } = useCancelContract(id);
  const [banner, setBanner] = useState<string | null>(null);

  if (isLoading) return <div className="max-w-3xl mx-auto px-4 py-10"><Skeleton className="h-64 w-full rounded-lg" /></div>;
  if (!contract) return <div className="max-w-3xl mx-auto px-4 py-10 text-sm text-muted-foreground">Contract not found.</div>;

  const isClient = me?.id === contract.client_id;
  const isBuilder = me?.id === contract.builder_id;
  const isAdmin = me?.role === "admin";
  const released = contract.milestones.filter((m) => m.status === "released").length;
  const progress = contract.milestones.length ? (released / contract.milestones.length) * 100 : 0;

  const onFund = () =>
    fund(id, {
      onSuccess: (r) => setBanner(r.dev_mode
        ? "Funded in demo mode — funds are now held in escrow."
        : "Funding order created — complete payment to activate."),
      onError: (e) => setBanner(getErrorMessage(e)),
    });

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-6">
      <Link href="/escrow" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="w-4 h-4" /> Back to escrow
      </Link>

      <div className="space-y-3">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-display-md flex items-center gap-2">
              <ShieldCheck className="w-6 h-6 text-text-success flex-shrink-0" />
              <span className="truncate">{contract.title}</span>
            </h1>
            {contract.description && <p className="text-sm text-muted-foreground mt-1">{contract.description}</p>}
          </div>
          <Badge variant={contractStatusVariant[contract.status]}>{humanize(contract.status)}</Badge>
        </div>

        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
          <span className="font-semibold text-lg tabular-nums">{rupees(contract.total_amount_paise)}</span>
          <span className="text-muted-foreground">Commission {(contract.commission_bps / 100).toFixed(1)}%</span>
          <span className="text-muted-foreground">{released}/{contract.milestones.length} released</span>
          <Badge variant="ghost">{isClient ? "You are the client" : isBuilder ? "You are the builder" : isAdmin ? "Admin view" : "Observer"}</Badge>
        </div>

        <div className="h-2 rounded-full bg-secondary overflow-hidden">
          <div className="h-full bg-score-high transition-all duration-500" style={{ width: `${progress}%` }} />
        </div>
      </div>

      {banner && (
        <div className="rounded-md border bg-secondary/40 p-3 text-sm">{banner}</div>
      )}

      {isClient && contract.status === "awaiting_funding" && (
        <div className="flex gap-2">
          <Button onClick={onFund} loading={funding} className="gap-2">
            <Wallet className="w-4 h-4" /> Fund contract ({rupees(contract.total_amount_paise)})
          </Button>
          <Button variant="ghost" onClick={() => cancel(id)} loading={cancelling}>Cancel</Button>
        </div>
      )}

      <section className="space-y-3">
        <h2 className="font-semibold">Milestones</h2>
        {contract.milestones.map((m) => (
          <MilestoneCard key={m.id} contractId={id} milestone={m} contract={contract}
            isClient={isClient} isBuilder={isBuilder} onError={setBanner} />
        ))}
      </section>

      <LedgerSection entries={contract.ledger_entries} />
      <DisputeSection contract={contract} isAdmin={isAdmin} onError={setBanner} />
    </div>
  );
}

function MilestoneCard({
  contractId, milestone, contract, isClient, isBuilder, onError,
}: {
  contractId: string;
  milestone: Milestone;
  contract: EscrowContractDetail;
  isClient: boolean;
  isBuilder: boolean;
  onError: (msg: string) => void;
}) {
  const [mode, setMode] = useState<null | "submit" | "reject" | "dispute">(null);
  const [note, setNote] = useState("");
  const [proofUrl, setProofUrl] = useState("");

  const submit = useSubmitMilestone(contractId);
  const approve = useApproveMilestone(contractId);
  const reject = useRejectMilestone(contractId);
  const dispute = useRaiseDispute(contractId);
  const busy = submit.isPending || approve.isPending || reject.isPending || dispute.isPending;

  const contractActive = contract.status === "active";
  const canSubmit = isBuilder && contractActive && (milestone.status === "funded" || milestone.status === "rejected");
  const canReview = isClient && contractActive && milestone.status === "submitted";
  const canDispute =
    (isClient || isBuilder) && contractActive &&
    !["released", "pending", "disputed"].includes(milestone.status);

  const err = (e: unknown) => onError(getErrorMessage(e));
  const reset = () => { setMode(null); setNote(""); setProofUrl(""); };

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-muted-foreground">#{milestone.sequence}</span>
              <span className="font-medium text-sm">{milestone.title}</span>
              <Badge variant={milestoneStatusVariant[milestone.status]} className="text-[10px]">
                {milestoneStatusLabel[milestone.status]}
              </Badge>
            </div>
            {milestone.description && <p className="text-xs text-muted-foreground mt-1">{milestone.description}</p>}
            {milestone.proof_note && (
              <p className="text-xs text-muted-foreground mt-1.5 italic border-l-2 pl-2">{milestone.proof_note}</p>
            )}
            {milestone.proof_url && (
              <a href={milestone.proof_url} target="_blank" rel="noreferrer"
                className="text-xs text-primary hover:underline mt-1 inline-block">View proof of work →</a>
            )}
            {milestone.status === "released" && (
              <p className="text-xs text-muted-foreground mt-1.5">
                Approved and recorded as owed to the builder. The bank transfer is
                made separately and isn&apos;t automated yet.
              </p>
            )}
          </div>
          <span className="text-sm font-semibold tabular-nums flex-shrink-0">{rupees(milestone.amount_paise)}</span>
        </div>

        {(canSubmit || canReview || canDispute) && !mode && (
          <div className="flex flex-wrap gap-2 pt-1">
            {canSubmit && <Button size="sm" className="h-7 text-xs" onClick={() => setMode("submit")}>Submit work</Button>}
            {canReview && (
              <>
                <Button size="sm" className="h-7 text-xs gap-1"
                  onClick={() => approve.mutate(milestone.id, { onError: err })} loading={approve.isPending}>
                  <CheckCircle2 className="w-3 h-3" /> Approve milestone
                </Button>
                <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" onClick={() => setMode("reject")}>
                  <XCircle className="w-3 h-3" /> Request changes
                </Button>
              </>
            )}
            {canDispute && (
              <Button size="sm" variant="ghost" className="h-7 text-xs gap-1 text-text-warning" onClick={() => setMode("dispute")}>
                <AlertTriangle className="w-3 h-3" /> Dispute
              </Button>
            )}
          </div>
        )}

        {mode === "submit" && (
          <div className="space-y-2 pt-1">
            <Input value={proofUrl} onChange={(e) => setProofUrl(e.target.value)} placeholder="Proof URL (deploy, PR, demo)" />
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="What did you deliver?" />
            <div className="flex gap-2">
              <Button size="sm" className="h-7 text-xs" loading={busy}
                onClick={() => submit.mutate(
                  { milestoneId: milestone.id, proof_url: proofUrl || undefined, proof_note: note || undefined },
                  { onSuccess: reset, onError: err })}>Submit</Button>
              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={reset}>Cancel</Button>
            </div>
          </div>
        )}

        {mode === "reject" && (
          <ActionForm placeholder="What needs to change?" value={note} setValue={setNote} busy={busy} onCancel={reset}
            actionLabel="Send back" onAction={() => reject.mutate({ milestoneId: milestone.id, note }, { onSuccess: reset, onError: err })} />
        )}

        {mode === "dispute" && (
          <ActionForm placeholder="Describe the problem for admin review…" value={note} setValue={setNote} busy={busy} onCancel={reset}
            actionLabel="Raise dispute" onAction={() => dispute.mutate({ milestone_id: milestone.id, reason: note }, { onSuccess: reset, onError: err })} />
        )}
      </CardContent>
    </Card>
  );
}

function ActionForm({ placeholder, value, setValue, busy, onCancel, actionLabel, onAction }: {
  placeholder: string; value: string; setValue: (v: string) => void;
  busy: boolean; onCancel: () => void; actionLabel: string; onAction: () => void;
}) {
  return (
    <div className="space-y-2 pt-1">
      <Textarea value={value} onChange={(e) => setValue(e.target.value)} placeholder={placeholder} />
      <div className="flex gap-2">
        <Button size="sm" className="h-7 text-xs" loading={busy} onClick={onAction} disabled={value.trim().length < 3}>{actionLabel}</Button>
        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}

const LEDGER_ENTRY_COPY: Record<string, string> = {
  fund: "Client funded the contract",
  release: "Approved and credited to the builder",
  commission: "Platform commission",
  refund: "Returned to the client",
};

function LedgerSection({ entries }: { entries: LedgerEntry[] }) {
  if (!entries?.length) return null;
  // Tokens only — a hardcoded Tailwind purple here sat outside the palette.
  const tone: Record<string, string> = {
    fund: "text-primary",
    release: "text-text-success",
    commission: "text-text-info",
    refund: "text-text-warning",
  };

  const released = entries
    .filter((e) => e.entry_type === "release")
    .reduce((sum, e) => sum + e.amount_paise, 0);

  return (
    <section className="space-y-3">
      <h2 className="font-semibold">Payment ledger</h2>
      <Card>
        <CardContent className="p-0 divide-y">
          {entries.map((e) => (
            <div key={e.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
              <div className="min-w-0">
                <span className={cn("text-xs font-semibold uppercase", tone[e.entry_type])}>{e.entry_type}</span>
                <p className="text-xs text-muted-foreground truncate">
                  {e.note || LEDGER_ENTRY_COPY[e.entry_type]}
                </p>
              </div>
              <span className="text-sm font-medium tabular-nums flex-shrink-0">{rupees(e.amount_paise)}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      {/*
        The settlement model, stated where the money is shown rather than buried
        in terms. Approving a milestone writes a ledger entry; it does not move
        money. Implying an automated payout the platform does not have would be
        the single most damaging thing this screen could do.
      */}
      <Alert
        variant="info"
        title="How settlement works here"
        description={
          <>
            Approving a milestone records it in this ledger as{" "}
            <strong>owed to the builder</strong> — it does not trigger a bank
            transfer. There is no automated payout rail, by design: the ledger is
            the source of truth, and an admin settles it out of band and records
            the reference against the payout.
            {released > 0 && (
              <>
                {" "}
                <strong>{rupees(released)}</strong> has been credited on this
                contract so far.
              </>
            )}
          </>
        }
      />
    </section>
  );
}

function DisputeSection({ contract, isAdmin, onError }: {
  contract: EscrowContractDetail; isAdmin: boolean; onError: (m: string) => void;
}) {
  if (!contract.disputes?.length) return null;
  return (
    <section className="space-y-3">
      <h2 className="font-semibold flex items-center gap-2"><Scale className="w-4 h-4" /> Disputes</h2>
      {contract.disputes.map((d) => (
        <DisputeCard key={d.id} contractId={contract.id} dispute={d} isAdmin={isAdmin} onError={onError} />
      ))}
    </section>
  );
}

function DisputeCard({ contractId, dispute, isAdmin, onError }: {
  contractId: string; dispute: Dispute; isAdmin: boolean; onError: (m: string) => void;
}) {
  const [note, setNote] = useState("");
  const resolve = useResolveDispute(contractId);
  const err = (e: unknown) => onError(getErrorMessage(e));
  const act = (resolution: "resolved_release" | "resolved_refund" | "resolved_split") =>
    resolve.mutate({ disputeId: dispute.id, resolution, note: note || undefined }, { onError: err });

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm">{dispute.reason}</p>
          <Badge variant={disputeStatusVariant[dispute.status]} className="text-[10px] flex-shrink-0">{humanize(dispute.status)}</Badge>
        </div>
        {dispute.resolution_note && <p className="text-xs text-muted-foreground italic">Resolution: {dispute.resolution_note}</p>}
        {isAdmin && dispute.status === "open" && (
          <div className="space-y-2 pt-1 border-t">
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Resolution note (optional)" />
            <div className="flex flex-wrap gap-2">
              <Button size="sm" className="h-7 text-xs" loading={resolve.isPending} onClick={() => act("resolved_release")}>Release to builder</Button>
              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => act("resolved_refund")}>Refund client</Button>
              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => act("resolved_split")}>Split 50/50</Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
