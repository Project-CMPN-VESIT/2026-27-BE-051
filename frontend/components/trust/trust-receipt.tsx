"use client";
import { useState } from "react";
import Link from "next/link";
import {
  Award, ChevronDown, FileCheck2, Lock, ShieldAlert, ShieldCheck,
} from "lucide-react";
import { Badge } from "@/components/ui/primitives";
import { ScoreRing } from "@/components/trust/score-ring";
import { cn } from "@/lib/utils";
import type { TrustReceipt } from "@/types/advanced";

const COMPONENT_LABELS: Record<string, string> = {
  repo_maturity: "Repo maturity",
  commit_cadence: "Commit cadence",
  contributor_authenticity: "Contributor authenticity",
  documentation: "Documentation",
  activity_consistency: "Activity consistency",
  originality: "Originality (proxy)",
};

const RISK_TONE: Record<string, string> = {
  low: "text-text-success",
  moderate: "text-foreground",
  elevated: "text-[hsl(var(--score-mid))]",
  high: "text-destructive",
};

function rupees(paise: number | null | undefined) {
  if (paise == null) return "—";
  return `₹${(paise / 100).toLocaleString("en-IN")}`;
}

/**
 * The immutable record of what a buyer was shown at the moment they paid.
 *
 * Presented as a receipt rather than a live panel on purpose: everything here is
 * frozen, and the UI has to make that obvious or a reader will assume it's the
 * current score and conclude the platform is showing stale data.
 */
export function TrustReceiptCard({
  receipt,
  compact = false,
  className,
}: {
  receipt: TrustReceipt;
  compact?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const components = Object.entries(receipt.components ?? {}).filter(
    ([, v]) => v != null,
  );
  const issued = new Date(receipt.issued_at);

  return (
    <div
      className={cn(
        "rounded-xl border bg-card overflow-hidden",
        // A subtle notched top edge reads as "document", not "dashboard widget".
        "relative before:absolute before:inset-x-0 before:top-0 before:h-1",
        "before:bg-gradient-to-r before:from-primary/40 before:via-primary/10 before:to-transparent",
        className,
      )}
    >
      <div className="px-4 sm:px-5 pt-4 pb-3 flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <FileCheck2 className="w-4 h-4 text-primary flex-shrink-0" />
            <h3 className="font-semibold text-sm">Trust receipt</h3>
            <Badge variant="ghost" size="sm" className="font-mono tabular-nums">
              {receipt.receipt_code}
            </Badge>
            <Badge variant="ghost" size="sm">
              <Lock className="w-3 h-3" /> Immutable
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed max-w-prose">
            The verification state of{" "}
            <span className="font-medium text-foreground">
              {receipt.project_title ?? "this project"}
            </span>{" "}
            frozen at the moment of purchase on{" "}
            {issued.toLocaleDateString("en-IN", {
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
            . This is not the live score — it&apos;s the record of what was
            disclosed.
          </p>
        </div>
        {receipt.verified_build_score != null && (
          <div className="flex-shrink-0">
            <ScoreRing score={receipt.verified_build_score} size="sm" animate={false} />
          </div>
        )}
      </div>

      {/* Headline facts */}
      <dl className="px-4 sm:px-5 pb-3 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
        <div>
          <dt className="text-muted-foreground">Paid</dt>
          <dd className="font-semibold tabular-nums mt-0.5">
            {rupees(receipt.amount_paise)}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Score at purchase</dt>
          <dd className="font-semibold tabular-nums mt-0.5">
            {receipt.verified_build_score ?? "—"}
            {receipt.verified_build_score != null && (
              <span className="text-muted-foreground font-normal">/100</span>
            )}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Status then</dt>
          <dd className="mt-0.5">
            {receipt.was_verified ? (
              <span className="inline-flex items-center gap-1 font-semibold text-text-success">
                <ShieldCheck className="w-3.5 h-3.5" /> Verified
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 font-semibold text-muted-foreground">
                <ShieldAlert className="w-3.5 h-3.5" /> Not verified
              </span>
            )}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Risk band then</dt>
          <dd
            className={cn(
              "font-semibold mt-0.5 capitalize",
              RISK_TONE[receipt.risk_band ?? ""] ?? "text-foreground",
            )}
          >
            {receipt.risk_band ?? "—"}
            {receipt.risk_score != null && (
              <span className="text-muted-foreground font-normal tabular-nums">
                {" "}
                ({receipt.risk_score})
              </span>
            )}
          </dd>
        </div>
      </dl>

      {!compact && (
        <>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className={cn(
              "w-full px-4 sm:px-5 py-2.5 border-t flex items-center justify-between",
              "text-xs font-medium hover:bg-accent/50 transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/40",
            )}
          >
            <span>Full frozen breakdown &amp; evidence</span>
            <ChevronDown
              className={cn(
                "w-3.5 h-3.5 text-muted-foreground transition-transform",
                open && "rotate-180",
              )}
            />
          </button>

          {open && (
            <div className="px-4 sm:px-5 py-4 border-t bg-surface/40 space-y-4">
              {components.length > 0 && (
                <div>
                  <p className="text-xs font-semibold mb-2">
                    Component scores at purchase
                  </p>
                  <ul className="space-y-1.5">
                    {components.map(([key, value]) => (
                      <li key={key} className="flex items-center gap-3 text-xs">
                        <span className="flex-1 text-muted-foreground">
                          {COMPONENT_LABELS[key] ?? key}
                        </span>
                        <div
                          className="h-1.5 w-24 rounded-full bg-border overflow-hidden"
                          role="presentation"
                        >
                          <div
                            className="h-full rounded-full bg-primary/60"
                            style={{ width: `${Math.max(0, Math.min(100, value as number))}%` }}
                          />
                        </div>
                        <span className="tabular-nums font-medium w-8 text-right">
                          {value as number}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                <Fact label="Repository" value={receipt.repo_full_name} mono />
                <Fact
                  label="Commits analysed"
                  value={receipt.commits_analyzed?.toLocaleString("en-IN")}
                />
                <Fact label="Contributors" value={receipt.contributors_count} />
                <Fact
                  label="Repo age"
                  value={
                    receipt.repo_age_days != null
                      ? `${receipt.repo_age_days} days`
                      : null
                  }
                />
                <Fact label="Confidence" value={receipt.confidence} capitalize />
                <Fact label="Stars then" value={receipt.stars} />
                <Fact
                  label="Ownership proven"
                  value={receipt.ownership_verified ? "Yes" : "No"}
                />
                <Fact label="Platform fee" value={rupees(receipt.platform_fee_paise)} />
                <Fact label="Seller received" value={rupees(receipt.seller_net_paise)} />
              </div>

              {receipt.fraud_flags.length > 0 ? (
                <div>
                  <p className="text-xs font-semibold mb-1.5">
                    Flags disclosed at purchase
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {receipt.fraud_flags.map((flag) => (
                      <Badge key={flag} variant="warning" size="sm">
                        {flag.replace(/_/g, " ")}
                      </Badge>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  No trust flags were raised on this project at the time of sale.
                </p>
              )}

              <p className="text-[11px] text-muted-foreground leading-relaxed border-t pt-3">
                Both the buyer and the seller can read this receipt, and neither
                can change it. If a dispute is opened on this project, this record
                is what the platform reviews — which is the reason it is written
                at the moment of payment rather than reconstructed afterwards.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Fact({
  label,
  value,
  mono,
  capitalize,
}: {
  label: string;
  value: string | number | null | undefined;
  mono?: boolean;
  capitalize?: boolean;
}) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          "font-medium mt-0.5 truncate",
          mono && "font-mono text-[11px]",
          capitalize && "capitalize",
        )}
        title={value != null ? String(value) : undefined}
      >
        {value ?? "—"}
      </dd>
    </div>
  );
}

/** One-line reference for lists — payment history, dispute forms. */
export function TrustReceiptChip({
  receipt,
  href,
}: {
  receipt: Pick<TrustReceipt, "receipt_code" | "verified_build_score" | "id">;
  href?: string;
}) {
  const content = (
    <>
      <Award className="w-3 h-3" />
      <span className="font-mono">{receipt.receipt_code}</span>
      {receipt.verified_build_score != null && (
        <span className="text-muted-foreground">
          · scored {receipt.verified_build_score} at purchase
        </span>
      )}
    </>
  );
  const classes =
    "inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-md border bg-card";

  if (!href) return <span className={classes}>{content}</span>;
  return (
    <Link
      href={href}
      className={cn(
        classes,
        "hover:border-border-strong transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
      )}
    >
      {content}
    </Link>
  );
}
