"use client";
import { useState } from "react";
import {
  ChevronDown, FileWarning, Info, PackageX, Scale, ShieldAlert,
} from "lucide-react";
import { Badge } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";
import type { DependencyAudit, DependencyFinding, LicenceClass } from "@/types/advanced";

const LICENCE_COPY: Record<
  LicenceClass,
  { label: string; tone: string; blurb: string }
> = {
  permissive: {
    label: "Permissive",
    tone: "text-text-success",
    blurb: "You can build a commercial product on this without publishing your source.",
  },
  weak_copyleft: {
    label: "Weak copyleft",
    tone: "text-[hsl(var(--score-mid))]",
    blurb:
      "Changes to the library itself must be published, but linking from closed source is fine.",
  },
  strong_copyleft: {
    label: "Strong copyleft",
    tone: "text-destructive",
    blurb:
      "Shipping a product built on this requires releasing your own source under the same licence.",
  },
  non_commercial: {
    label: "Non-commercial",
    tone: "text-destructive",
    blurb: "Commercial use is prohibited outright.",
  },
  unknown: {
    label: "No licence declared",
    tone: "text-destructive",
    blurb:
      "Absence of a licence is not permission — by default the code is all-rights-reserved.",
  },
};

const KIND_META = {
  licence: { icon: Scale, label: "Licence" },
  abandoned: { icon: PackageX, label: "Abandoned" },
  vulnerability: { icon: ShieldAlert, label: "Advisory" },
} as const;

const SEVERITY_TONE: Record<string, string> = {
  critical: "border-destructive/40 bg-destructive/5",
  high: "border-destructive/30 bg-destructive/5",
  moderate: "border-[hsl(var(--score-mid))]/30 bg-[hsl(var(--score-mid))]/5",
  low: "border-border bg-surface/40",
};

const SEVERITY_BADGE: Record<string, "destructive" | "warning" | "ghost"> = {
  critical: "destructive",
  high: "destructive",
  moderate: "warning",
  low: "ghost",
};

/**
 * Dependency and licence findings, rendered inside the existing risk report.
 *
 * Two things this component is careful about:
 *
 * 1. **It never implies a clean bill of health.** `is_complete_scan` is always
 *    false today, so the footer states what was and wasn't checked. "No findings"
 *    is presented as "nothing matched our checks", not "this project is safe".
 *
 * 2. **Licence risk leads.** A copyleft dependency can make a project legally
 *    unsellable, which matters more to a buyer than a moderate CVE — so licence
 *    obligations get the headline and advisories sit below.
 */
export function DependencyAuditPanel({
  audit,
  className,
}: {
  audit: DependencyAudit;
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  if (!audit?.scanned) return null;

  const licence = LICENCE_COPY[audit.project_licence_class] ?? LICENCE_COPY.unknown;
  const findings = audit.findings ?? [];
  const blocking = findings.filter(
    (f) => f.severity === "critical" || f.severity === "high",
  );
  const shown = open ? findings : findings.slice(0, 3);

  return (
    <div className={cn("rounded-lg border bg-card overflow-hidden", className)}>
      <div className="px-4 py-3 border-b">
        <div className="flex items-center gap-2 flex-wrap">
          <Scale className="w-4 h-4 text-primary flex-shrink-0" />
          <h4 className="font-semibold text-sm">Dependencies &amp; licence</h4>
          <Badge variant="ghost" size="sm" className="tabular-nums">
            {audit.dependencies_scanned} declared
          </Badge>
          {blocking.length > 0 && (
            <Badge variant="destructive" size="sm">
              {blocking.length} need attention
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-1.5">
          Read from{" "}
          <span className="font-mono">
            {audit.manifests_read.join(", ") || "the manifest"}
          </span>
        </p>
      </div>

      {/* Project's own licence — the decision that matters most */}
      <div className="px-4 py-3 border-b flex items-start gap-3">
        <div
          className={cn(
            "w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0",
            audit.project_licence_class === "permissive"
              ? "bg-[hsl(var(--score-high))]/10"
              : "bg-destructive/10",
          )}
        >
          <Scale className={cn("w-4 h-4", licence.tone)} />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold">
            {audit.project_licence ?? "No licence file"}{" "}
            <span className={cn("font-medium", licence.tone)}>
              · {licence.label}
            </span>
          </p>
          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
            {licence.blurb}
          </p>
        </div>
      </div>

      {/* Findings */}
      {findings.length > 0 ? (
        <div className="px-4 py-3 space-y-2">
          {shown.map((finding, i) => (
            <FindingRow key={`${finding.package}-${i}`} finding={finding} />
          ))}

          {findings.length > 3 && (
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              className={cn(
                "w-full text-xs font-medium py-1.5 rounded-md",
                "text-muted-foreground hover:text-foreground hover:bg-accent transition-colors",
                "flex items-center justify-center gap-1.5",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
              )}
            >
              {open ? "Show fewer" : `Show all ${findings.length} findings`}
              <ChevronDown className={cn("w-3 h-3 transition-transform", open && "rotate-180")} />
            </button>
          )}
        </div>
      ) : (
        <p className="px-4 py-3 text-xs text-muted-foreground leading-relaxed">
          Nothing matched our licence, abandonment or advisory checks across{" "}
          {audit.dependencies_scanned} declared dependencies.
        </p>
      )}

      {/* The honesty footer. Not optional. */}
      <div className="px-4 py-3 border-t bg-surface/50 flex items-start gap-2">
        <Info className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0 mt-0.5" />
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          <span className="font-medium text-foreground">What this does and doesn&apos;t cover.</span>{" "}
          Licence classification is derived from the declared licence identifiers,
          which is factual. Abandonment and vulnerability checks run against a{" "}
          <span className="font-medium">curated static set</span> of
          well-documented issues — not a live advisory feed. A dependency absent
          from our findings is <span className="font-medium">unknown</span>, not
          verified safe. Full coverage needs a subscribed advisory database, which
          isn&apos;t wired up yet.
        </p>
      </div>
    </div>
  );
}

function FindingRow({ finding }: { finding: DependencyFinding }) {
  const meta = KIND_META[finding.kind] ?? KIND_META.licence;
  const Icon = meta.icon;

  return (
    <div
      className={cn(
        "rounded-md border px-3 py-2.5",
        SEVERITY_TONE[finding.severity] ?? SEVERITY_TONE.low,
      )}
    >
      <div className="flex items-start gap-2.5">
        <Icon className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold font-mono">
              {finding.package}
              {finding.version && (
                <span className="text-muted-foreground font-normal">
                  @{finding.version}
                </span>
              )}
            </span>
            <Badge variant={SEVERITY_BADGE[finding.severity] ?? "ghost"} size="sm">
              {finding.severity}
            </Badge>
            {finding.advisory_id && (
              <span className="text-[11px] font-mono text-muted-foreground">
                {finding.advisory_id}
              </span>
            )}
            {finding.licence && (
              <Badge variant="ghost" size="sm">
                {finding.licence}
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
            {finding.detail}
          </p>
          {(finding.fixed_in || finding.replacement) && (
            <p className="text-[11px] mt-1.5 text-foreground/80">
              {finding.fixed_in && (
                <>
                  Fixed in{" "}
                  <span className="font-mono font-medium">{finding.fixed_in}</span>
                </>
              )}
              {finding.fixed_in && finding.replacement && " · "}
              {finding.replacement && (
                <>
                  Use <span className="font-medium">{finding.replacement}</span>{" "}
                  instead
                </>
              )}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

/** Compact licence chip for cards and comparison tables. */
export function LicenceChip({
  licenceClass,
  licence,
}: {
  licenceClass: LicenceClass | null | undefined;
  licence?: string | null;
}) {
  if (!licenceClass) return <span className="text-xs text-muted-foreground">—</span>;
  const copy = LICENCE_COPY[licenceClass] ?? LICENCE_COPY.unknown;
  const risky =
    licenceClass === "strong_copyleft" ||
    licenceClass === "non_commercial" ||
    licenceClass === "unknown";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-xs font-medium",
        risky ? "text-destructive" : copy.tone,
      )}
      title={copy.blurb}
    >
      {risky && <FileWarning className="w-3 h-3" />}
      {licence ?? copy.label}
    </span>
  );
}
