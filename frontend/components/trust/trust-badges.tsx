"use client";
import * as React from "react";
import { AlertTriangle, HelpCircle, Info, ShieldCheck, ShieldQuestion } from "lucide-react";
import { Badge } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";
import type { ScoreConfidence, ScoreFlag } from "@/types";

const CONFIDENCE_COPY: Record<ScoreConfidence, { label: string; explains: string; variant: "success" | "warning" | "info" }> = {
  high: {
    label: "High confidence",
    explains:
      "Commit history, contributor data and README were all readable, and ownership is proved. The score rests on real evidence.",
    variant: "success",
  },
  medium: {
    label: "Medium confidence",
    explains:
      "Some signals were available but not all. The score is indicative — treat the components with missing data cautiously.",
    variant: "info",
  },
  low: {
    label: "Low confidence",
    explains:
      "Few signals could be read, usually because the repository was not reachable or ownership is unproved. Not enough evidence to rely on.",
    variant: "warning",
  },
};

/**
 * Confidence is shown next to every score on purpose: a 82 computed from three
 * signals and a 82 computed from thirty are not the same claim, and hiding the
 * difference is how scores become untrustworthy.
 */
export function ConfidenceBadge({
  confidence,
  className,
  withTooltip = true,
}: {
  confidence: ScoreConfidence | null | undefined;
  className?: string;
  withTooltip?: boolean;
}) {
  if (!confidence) {
    return (
      <Badge variant="ghost" className={className}>
        <HelpCircle className="w-3 h-3" /> Confidence unknown
      </Badge>
    );
  }
  const copy = CONFIDENCE_COPY[confidence];
  return (
    <Badge
      variant={copy.variant}
      className={cn(withTooltip && "cursor-help", className)}
      title={withTooltip ? copy.explains : undefined}
    >
      <Info className="w-3 h-3" />
      {copy.label}
    </Badge>
  );
}

export function confidenceExplanation(confidence: ScoreConfidence | null | undefined): string | null {
  return confidence ? CONFIDENCE_COPY[confidence].explains : null;
}

/**
 * The verification moment. When `celebrate` is set the tick draws itself and a
 * single ring pulses outward — used once, right after a score lands, never on
 * every render of a already-verified project.
 */
export function VerifiedSeal({
  verified,
  score,
  threshold = 70,
  celebrate = false,
  size = "md",
  className,
}: {
  verified: boolean;
  score?: number | null;
  threshold?: number;
  celebrate?: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const dim = size === "lg" ? "w-14 h-14" : size === "md" ? "w-10 h-10" : "w-7 h-7";
  const icon = size === "lg" ? "w-7 h-7" : size === "md" ? "w-5 h-5" : "w-4 h-4";

  if (!verified) {
    const shortBy = score != null ? Math.max(0, threshold - score) : null;
    return (
      <div className={cn("inline-flex items-center gap-2.5", className)}>
        <span
          className={cn(
            dim,
            "rounded-full bg-background-warning border border-border-warning flex items-center justify-center flex-shrink-0"
          )}
        >
          <ShieldQuestion className={cn(icon, "text-text-warning")} strokeWidth={2} />
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-text-warning">Not yet verified</span>
          <span className="block text-xs text-muted-foreground">
            {shortBy != null && shortBy > 0
              ? `${shortBy} point${shortBy === 1 ? "" : "s"} short of the ${threshold} threshold`
              : `Needs proved ownership and a score of ${threshold}+`}
          </span>
        </span>
      </div>
    );
  }

  return (
    <div className={cn("inline-flex items-center gap-2.5", className)}>
      <span className={cn(dim, "relative flex items-center justify-center flex-shrink-0")}>
        {celebrate && (
          <span
            className="absolute inset-0 rounded-full bg-[hsl(var(--score-high))]/30 ripple-once"
            aria-hidden
          />
        )}
        <span
          className={cn(
            "absolute inset-0 rounded-full bg-background-success border border-border-success",
            celebrate && "seal-in"
          )}
          aria-hidden
        />
        {celebrate ? (
          // Hand-drawn tick so the stroke can animate. lucide renders instantly.
          <svg
            viewBox="0 0 24 24"
            className={cn(icon, "relative text-text-success")}
            fill="none"
            stroke="currentColor"
            strokeWidth={2.6}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path className="check-draw" d="M4.5 12.5l4.5 4.5L19.5 6.5" />
          </svg>
        ) : (
          <ShieldCheck className={cn(icon, "relative text-text-success")} strokeWidth={2} />
        )}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-text-success">Verified build</span>
        <span className="block text-xs text-muted-foreground">
          Ownership proved, score {score ?? threshold}+, no disqualifying flags
        </span>
      </span>
    </div>
  );
}

/** A single fraud/trust flag, rendered with its real penalty and explanation. */
export function FlagRow({ flag }: { flag: ScoreFlag }) {
  const critical = flag.severity === "critical";
  return (
    <li
      className={cn(
        "rounded-lg border p-3",
        critical
          ? "border-border-danger bg-background-danger/50"
          : "border-border-warning bg-background-warning/50"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2 min-w-0">
          <AlertTriangle
            className={cn(
              "w-3.5 h-3.5 mt-0.5 flex-shrink-0",
              critical ? "text-text-danger" : "text-text-warning"
            )}
          />
          <div className="min-w-0">
            <p
              className={cn(
                "text-xs font-semibold",
                critical ? "text-text-danger" : "text-text-warning"
              )}
            >
              {flag.label}
            </p>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{flag.explains}</p>
          </div>
        </div>
        {flag.penalty > 0 && (
          <span
            className={cn(
              "text-xs font-semibold tabular-nums flex-shrink-0",
              critical ? "text-text-danger" : "text-text-warning"
            )}
            title="Points subtracted from the composite score"
          >
            −{flag.penalty}
          </span>
        )}
      </div>
    </li>
  );
}

/** Compact score chip for cards and list rows. */
export function BuildScoreChip({
  score,
  verified,
  className,
}: {
  score: number | null | undefined;
  verified?: boolean;
  className?: string;
}) {
  if (score == null) {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 text-xs font-medium text-muted-foreground",
          className
        )}
        title="This project has not been scored yet"
      >
        <ShieldQuestion className="w-3.5 h-3.5" />
        Unscored
      </span>
    );
  }
  const tone = score >= 70 ? "score-high" : score >= 40 ? "score-mid" : "score-low";
  const Icon = verified ? ShieldCheck : ShieldQuestion;
  return (
    <span
      className={cn("inline-flex items-center gap-1 text-xs font-semibold tabular-nums", tone, className)}
      title={verified ? "Verified Build Score" : "Verified Build Score (not yet verified)"}
    >
      <Icon className="w-3.5 h-3.5" />
      {score}
    </span>
  );
}
