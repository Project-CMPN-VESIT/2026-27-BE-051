import { cn } from "@/lib/utils";

interface ScoreBadgeProps {
  label: string;
  score: number | null;
  size?: "sm" | "md" | "lg";
  showBar?: boolean;
}

/** Score colour bands, driven by the --score-* theme tokens. */
function scoreColor(score: number | null) {
  if (score === null) return "text-muted-foreground";
  if (score >= 70) return "score-high";
  if (score >= 40) return "score-mid";
  return "score-low";
}

function scoreBg(score: number | null) {
  if (score === null) return "bg-muted-foreground/30";
  if (score >= 70) return "bg-[hsl(var(--score-high))]";
  if (score >= 40) return "bg-[hsl(var(--score-mid))]";
  return "bg-[hsl(var(--score-low))]";
}

function scoreSurface(score: number | null) {
  if (score === null) return "border-border";
  if (score >= 70) return "border-border-success bg-background-success/40";
  if (score >= 40) return "border-border-warning bg-background-warning/40";
  return "border-destructive/30 bg-background-danger/40";
}

export function ScoreBadge({ label, score, size = "md", showBar = false }: ScoreBadgeProps) {
  const pad = {
    sm: "px-2 py-1.5",
    md: "px-3 py-2.5",
    lg: "px-4 py-3",
  };
  const numeral = {
    sm: "text-base",
    md: "text-xl",
    lg: "text-2xl",
  };

  return (
    <div
      className={cn(
        "flex flex-col items-center rounded-xl border transition-colors",
        scoreSurface(score),
        pad[size]
      )}
    >
      <span
        className={cn(
          "font-display font-bold leading-none tabular-nums",
          numeral[size],
          scoreColor(score)
        )}
      >
        {score !== null ? score : "—"}
      </span>
      <span className="text-[11px] text-muted-foreground mt-1.5 text-center leading-tight">
        {label}
      </span>
      {showBar && score !== null && (
        <div
          className="w-full h-1 bg-secondary rounded-full mt-2 overflow-hidden"
          role="progressbar"
          aria-valuenow={score}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${label} score`}
        >
          <div
            className={cn("h-full rounded-full transition-[width] duration-500 ease-out", scoreBg(score))}
            style={{ width: `${score}%` }}
          />
        </div>
      )}
    </div>
  );
}

export function ScoreRow({ analysis }: {
  analysis?: {
    health_score: number | null;
    completion_score: number | null;
    startup_potential: number | null;
    impact_potential: number | null;
  } | null
}) {
  if (!analysis) return null;
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <ScoreBadge label="Health" score={analysis.health_score} showBar />
      <ScoreBadge label="Completion" score={analysis.completion_score} showBar />
      <ScoreBadge label="Startup" score={analysis.startup_potential} showBar />
      <ScoreBadge label="Impact" score={analysis.impact_potential} showBar />
    </div>
  );
}

export function ScorePill({ score, label }: { score: number | null; label?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs font-semibold tabular-nums", scoreColor(score))}>
      <span className={cn("w-1.5 h-1.5 rounded-full", scoreBg(score))} aria-hidden />
      {score !== null ? `${score}` : "—"}
      {label && <span className="text-muted-foreground font-normal">{label}</span>}
    </span>
  );
}

/**
 * Circular score gauge — used where a single score is the hero of the panel
 * (e.g. Verified Build Score).
 */
export function ScoreRing({
  score,
  size = 96,
  label,
  sublabel,
}: {
  score: number | null;
  size?: number;
  label?: string;
  sublabel?: string;
}) {
  const stroke = size >= 96 ? 8 : 6;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const pct = score ?? 0;
  const offset = circumference - (pct / 100) * circumference;

  const strokeColor =
    score === null ? "hsl(var(--muted-foreground) / 0.3)"
      : score >= 70 ? "hsl(var(--score-high))"
      : score >= 40 ? "hsl(var(--score-mid))"
      : "hsl(var(--score-low))";

  return (
    <div className="inline-flex flex-col items-center gap-2">
      <div className="relative" style={{ width: size, height: size }}>
        <svg
          width={size}
          height={size}
          className="-rotate-90"
          role="img"
          aria-label={`${label ?? "Score"}: ${score ?? "not available"} out of 100`}
        >
          <circle
            cx={size / 2} cy={size / 2} r={radius}
            fill="none" stroke="hsl(var(--secondary))" strokeWidth={stroke}
          />
          <circle
            cx={size / 2} cy={size / 2} r={radius}
            fill="none" stroke={strokeColor} strokeWidth={stroke}
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            // --ease-out is not a defined token; the theme exposes
            // --ease-out-quint, so the previous value silently fell back to the
            // browser default easing.
            style={{ transition: "stroke-dashoffset 0.8s var(--ease-out-quint)" }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={cn("font-display font-bold leading-none tabular-nums", size >= 96 ? "text-2xl" : "text-lg", scoreColor(score))}>
            {score !== null ? score : "—"}
          </span>
          {sublabel && (
            <span className="text-[10px] text-muted-foreground mt-0.5">{sublabel}</span>
          )}
        </div>
      </div>
      {label && <span className="text-xs font-medium text-muted-foreground">{label}</span>}
    </div>
  );
}
