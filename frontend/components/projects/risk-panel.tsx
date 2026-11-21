"use client";
import { useState } from "react";
import {
  ShieldAlert, ChevronDown, ChevronUp, AlertTriangle, Bug, Info, ShieldCheck,
  FileCode, Check, X,
} from "lucide-react";
import { Badge } from "@/components/ui/primitives";
import { Skeleton } from "@/components/ui/skeleton";
import { DependencyAuditPanel } from "@/components/projects/dependency-audit";
import { useProjectRisk } from "@/lib/hooks";
import { cn } from "@/lib/utils";
import type { RiskBand, RiskSeverity } from "@/types";

const BAND_STYLES: Record<RiskBand, { text: string; bar: string; bg: string; label: string }> = {
  low: {
    text: "text-text-success",
    bar: "bg-score-high",
    bg: "border-border-success bg-background-success/50",
    label: "Low risk",
  },
  moderate: {
    text: "text-primary",
    bar: "bg-primary/100",
    bg: "border-primary/30 bg-primary/[0.07]",
    label: "Moderate risk",
  },
  elevated: {
    text: "text-text-warning",
    bar: "bg-score-mid",
    bg: "border-border-warning bg-background-warning/50",
    label: "Elevated risk",
  },
  high: {
    text: "text-text-danger",
    bar: "bg-score-low",
    bg: "border-destructive/30 bg-background-danger/50",
    label: "High risk",
  },
};

const SEVERITY_STYLES: Record<RiskSeverity, string> = {
  high: "bg-background-danger text-text-danger",
  medium: "bg-background-warning text-text-warning",
  low: "bg-secondary text-secondary-foreground",
};

export function RiskPanel({ projectId }: { projectId: string }) {
  const { data: risk, isLoading, isError } = useProjectRisk(projectId);
  const [open, setOpen] = useState(false);

  if (isLoading) return <Skeleton className="h-32 w-full rounded-xl" />;
  if (isError || !risk) return null;

  const style = BAND_STYLES[risk.band] ?? BAND_STYLES.moderate;
  const positiveFactors = risk.factors.filter((f) => f.points > 0);
  const mitigating = risk.factors.filter((f) => f.points < 0);

  return (
    <div className={cn("rounded-xl border-2 p-5 space-y-4", style.bg)}>
      <div className="flex items-start gap-3">
        {risk.band === "low"
          ? <ShieldCheck className={cn("w-5 h-5 flex-shrink-0 mt-0.5", style.text)} />
          : <ShieldAlert className={cn("w-5 h-5 flex-shrink-0 mt-0.5", style.text)} />}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-sm">Bug Risk Assessment</h3>
            <Badge variant="ghost" className="text-[10px] capitalize">
              {risk.confidence} confidence
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">{risk.summary}</p>
        </div>
        <div className="text-right flex-shrink-0">
          <div className={cn("text-display-md leading-none", style.text)}>{risk.risk_score}</div>
          <div className="text-[10px] text-muted-foreground">/100 risk</div>
        </div>
      </div>

      {/* Risk meter */}
      <div>
        <div className="h-2 rounded-full bg-secondary overflow-hidden">
          <div
            className={cn("h-full rounded-full transition-all", style.bar)}
            style={{ width: `${Math.max(3, risk.risk_score)}%` }}
            role="progressbar"
            aria-valuenow={risk.risk_score}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Bug risk score"
          />
        </div>
        <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
          <span>Lower is safer</span>
          <span>{style.label}</span>
        </div>
      </div>

      {/* Hard code signals — read from the actual repo tree */}
      {risk.code_signals && (
        <div className="space-y-2">
          <h4 className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
            <FileCode className="w-3.5 h-3.5" /> Code evidence
            {risk.code_reviewed && (
              <Badge variant="success" className="text-[10px]">source reviewed</Badge>
            )}
          </h4>
          <div className="flex flex-wrap gap-1.5">
            {[
              { ok: risk.code_signals.has_tests, label: "Tests" },
              { ok: risk.code_signals.has_ci, label: "CI" },
              { ok: risk.code_signals.has_lockfile, label: "Lockfile" },
              { ok: risk.code_signals.has_docker, label: "Docker" },
              { ok: risk.code_signals.has_readme, label: "README" },
            ].filter((c) => c.ok !== null).map((c) => (
              <span
                key={c.label}
                className={cn(
                  "inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full font-medium",
                  c.ok
                    ? "bg-background-success text-text-success"
                    : "bg-secondary text-muted-foreground line-through decoration-1",
                )}
              >
                {c.ok ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />} {c.label}
              </span>
            ))}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
            {risk.code_signals.source_file_count != null && (
              <span>{risk.code_signals.source_file_count} source files</span>
            )}
            {risk.code_signals.test_file_count != null && (
              <span>{risk.code_signals.test_file_count} test files</span>
            )}
            {risk.code_signals.dependency_count ? (
              <span>~{risk.code_signals.dependency_count} dependencies</span>
            ) : null}
          </div>
        </div>
      )}

      {/* Dependency + licence audit — folded into this report rather than a
          separate page, because a buyer weighing risk shouldn't have to visit
          two screens to learn the project is GPL-licensed. */}
      {risk.dependency_audit?.scanned && (
        <DependencyAuditPanel audit={risk.dependency_audit} />
      )}

      {/* AI-identified risk areas */}
      {risk.risk_areas.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
            <Bug className="w-3.5 h-3.5" /> Likely defect areas
          </h4>
          <div className="space-y-2">
            {risk.risk_areas.map((a, i) => (
              <div key={i} className="rounded-lg border bg-card px-3 py-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium">{a.area}</span>
                  <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full font-medium capitalize", SEVERITY_STYLES[a.severity] ?? SEVERITY_STYLES.medium)}>
                    {a.severity}
                  </span>
                </div>
                {a.reason && <p className="text-xs text-muted-foreground mt-0.5">{a.reason}</p>}
              </div>
            ))}
          </div>
          <p className="text-[10px] text-muted-foreground flex items-start gap-1">
            <Info className="w-3 h-3 flex-shrink-0 mt-0.5" />
            {risk.code_reviewed
              ? "Based on the repository structure and excerpts from real source files. These are likely defect areas, not a guarantee of bugs."
              : "Predicted from repo metadata, README and project maturity — no source files were read."}
          </p>
        </div>
      )}

      {/* Factor breakdown */}
      {risk.factors.length > 0 && (
        <div>
          <button
            onClick={() => setOpen(!open)}
            className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
            aria-expanded={open}
          >
            {open ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            How this score was calculated ({risk.factors.length} factor{risk.factors.length === 1 ? "" : "s"})
          </button>

          {open && (
            <div className="mt-2 space-y-1.5">
              {positiveFactors.map((f) => (
                <div key={f.label} className="flex items-start gap-2 text-xs">
                  <AlertTriangle className="w-3 h-3 text-text-warning flex-shrink-0 mt-0.5" />
                  <span className="flex-1">
                    <span className="font-medium">{f.label}</span>
                    <span className="text-muted-foreground"> — {f.detail}</span>
                  </span>
                  <span className="text-muted-foreground font-mono flex-shrink-0">+{f.points}</span>
                </div>
              ))}
              {mitigating.map((f) => (
                <div key={f.label} className="flex items-start gap-2 text-xs">
                  <ShieldCheck className="w-3 h-3 text-text-success flex-shrink-0 mt-0.5" />
                  <span className="flex-1">
                    <span className="font-medium">{f.label}</span>
                    <span className="text-muted-foreground"> — {f.detail}</span>
                  </span>
                  <span className="text-text-success font-mono flex-shrink-0">{f.points}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
