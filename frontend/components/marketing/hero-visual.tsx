"use client";
import {
  ShieldCheck, CheckCircle2, GitCommit, FileCode, Star, TrendingUp, Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";

/* ═══════════════════════════════════════════════════════════════════════════
   Hero product visual.

   A static mock of the Verified Build Score panel — the product's core
   differentiator. Purely decorative (aria-hidden) so screen readers get the
   real copy instead of a fake UI.
   ═══════════════════════════════════════════════════════════════════════════ */

function ScoreGauge({ score = 87 }: { score?: number }) {
  const size = 108;
  const stroke = 9;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          fill="none" stroke="hsl(var(--secondary))" strokeWidth={stroke}
        />
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          fill="none"
          stroke="hsl(var(--score-high))"
          strokeWidth={stroke}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-extrabold font-display tabular-nums leading-none score-high">
          {score}
        </span>
        <span className="text-[10px] text-muted-foreground mt-1">/ 100</span>
      </div>
    </div>
  );
}

function SignalBar({ label, value }: { label: string; value: number }) {
  const tone =
    value >= 70 ? "bg-score-high" : value >= 40 ? "bg-score-mid" : "bg-score-low";
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[11px] text-muted-foreground">{label}</span>
        <span className="text-[11px] font-semibold tabular-nums">{value}</span>
      </div>
      <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
        <div className={cn("h-full rounded-full", tone)} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

export function HeroVisual() {
  return (
    <div className="relative select-none" aria-hidden="true">
      {/* Main panel */}
      <div className="relative rounded-2xl border bg-card shadow-xl overflow-hidden">
        {/* Window chrome */}
        <div className="flex items-center gap-2 px-4 py-3 border-b bg-surface">
          <span className="flex gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-border-strong" />
            <span className="w-2.5 h-2.5 rounded-full bg-border-strong" />
            <span className="w-2.5 h-2.5 rounded-full bg-border-strong" />
          </span>
          <span className="ml-2 text-[11px] font-mono text-muted-foreground truncate">
            aarav/studybuddy-ai
          </span>
          <span className="ml-auto inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-background-success text-text-success text-[10px] font-semibold">
            <CheckCircle2 className="w-2.5 h-2.5" /> Verified
          </span>
        </div>

        {/* Score header */}
        <div className="p-5 flex items-center gap-5">
          <ScoreGauge score={87} />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-primary mb-1">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span className="text-[11px] font-semibold uppercase tracking-wider">
                Verified Build Score
              </span>
            </div>
            <p className="text-sm font-semibold leading-snug">
              Strong, consistently-built project
            </p>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              14 months of history · 6 contributors · no fraud flags
            </p>
          </div>
        </div>

        {/* Signals */}
        <div className="px-5 pb-5 grid grid-cols-2 gap-x-5 gap-y-3">
          <SignalBar label="Commit cadence" value={91} />
          <SignalBar label="Contributor authenticity" value={84} />
          <SignalBar label="Documentation" value={73} />
          <SignalBar label="Originality" value={95} />
        </div>

        {/* Evidence footer */}
        <div className="px-5 py-3 border-t bg-surface flex items-center gap-3 flex-wrap">
          {[
            { icon: <GitCommit className="w-3 h-3" />, label: "412 commits" },
            { icon: <FileCode className="w-3 h-3" />, label: "Tests + CI" },
            { icon: <Star className="w-3 h-3" />, label: "128 stars" },
          ].map((s) => (
            <span
              key={s.label}
              className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground"
            >
              {s.icon} {s.label}
            </span>
          ))}
        </div>
      </div>

      {/* Floating price card */}
      <div className="absolute -right-3 sm:-right-8 top-20 rounded-xl border bg-elevated shadow-lg p-3.5 w-40 animate-float">
        <p className="text-[10px] text-eyebrow mb-1">Listed for</p>
        <p className="text-xl font-extrabold font-display tabular-nums">₹15,000</p>
        <p className="text-[10px] text-muted-foreground mt-1">Full source + license</p>
        <div className="mt-2.5 pt-2.5 border-t flex items-center gap-1 text-[10px] text-text-success font-medium">
          <TrendingUp className="w-3 h-3" /> Seller nets ₹13,500
        </div>
      </div>

      {/* Floating AI insight card */}
      <div
        className="absolute -left-3 sm:-left-10 bottom-8 rounded-xl border bg-elevated shadow-lg p-3.5 w-44 animate-float"
        style={{ animationDelay: "1.4s" }}
      >
        <div className="flex items-center gap-1.5 text-primary mb-1.5">
          <Sparkles className="w-3 h-3" />
          <span className="text-[10px] font-semibold uppercase tracking-wider">AI report</span>
        </div>
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          Missing: payment retries, rate limiting
        </p>
        <div className="mt-2 flex items-center gap-1">
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-background-warning text-text-warning font-medium">
            2 risk areas
          </span>
        </div>
      </div>
    </div>
  );
}
