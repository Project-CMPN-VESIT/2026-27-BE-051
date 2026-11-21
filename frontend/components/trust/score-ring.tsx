"use client";
import * as React from "react";
import { cn } from "@/lib/utils";

export type RingSize = "sm" | "md" | "lg" | "xl";

const SIZES: Record<RingSize, { px: number; stroke: number; numeral: string; denom: string }> = {
  sm: { px: 48, stroke: 5, numeral: "text-sm", denom: "text-[8px]" },
  md: { px: 72, stroke: 6, numeral: "text-xl", denom: "text-[9px]" },
  lg: { px: 112, stroke: 8, numeral: "text-display-md", denom: "text-[10px]" },
  xl: { px: 152, stroke: 10, numeral: "text-display-lg", denom: "text-[11px]" },
};

/** Score → semantic band. Kept in one place so every ring agrees. */
export function scoreBand(score: number | null | undefined): "none" | "low" | "mid" | "high" {
  if (score == null) return "none";
  if (score >= 70) return "high";
  if (score >= 40) return "mid";
  return "low";
}

const BAND_STROKE: Record<string, string> = {
  none: "hsl(var(--muted-foreground) / 0.25)",
  low: "hsl(var(--score-low))",
  mid: "hsl(var(--score-mid))",
  high: "hsl(var(--score-high))",
};

const BAND_TEXT: Record<string, string> = {
  none: "text-muted-foreground",
  low: "score-low",
  mid: "score-mid",
  high: "score-high",
};

/**
 * Radial progress ring for a 0–100 score.
 *
 * The arc animates from empty on mount, which is what makes a score feel
 * measured rather than asserted. `animate={false}` opts out for dense lists
 * where a dozen rings sweeping at once is noise.
 */
export function ScoreRing({
  score,
  size = "lg",
  label,
  caption,
  showDenominator = true,
  animate = true,
  className,
  threshold,
}: {
  score: number | null | undefined;
  size?: RingSize;
  label?: string;
  caption?: string;
  showDenominator?: boolean;
  animate?: boolean;
  className?: string;
  /** Draws a faint tick at the verified threshold, e.g. 70. */
  threshold?: number;
}) {
  const { px, stroke, numeral, denom } = SIZES[size];
  const band = scoreBand(score);
  const radius = (px - stroke) / 2;
  const circumference = 2 * Math.PI * radius;

  // Start at zero so the first paint has an empty ring to animate away from.
  const [shown, setShown] = React.useState(animate ? 0 : (score ?? 0));
  React.useEffect(() => {
    if (!animate) return;
    const raf = requestAnimationFrame(() => setShown(score ?? 0));
    return () => cancelAnimationFrame(raf);
  }, [score, animate]);

  const displayedScore = animate ? shown : (score ?? 0);
  const offset = circumference - (Math.max(0, Math.min(100, displayedScore)) / 100) * circumference;
  const thresholdAngle = threshold != null ? (threshold / 100) * 360 : null;

  return (
    <div className={cn("inline-flex flex-col items-center gap-2", className)}>
      <div className="relative flex-shrink-0" style={{ width: px, height: px }}>
        <svg
          width={px}
          height={px}
          className="-rotate-90"
          role="img"
          aria-label={`${label ?? "Score"}: ${score ?? "not scored"} out of 100`}
        >
          <circle
            cx={px / 2}
            cy={px / 2}
            r={radius}
            fill="none"
            stroke="hsl(var(--secondary))"
            strokeWidth={stroke}
          />
          <circle
            cx={px / 2}
            cy={px / 2}
            r={radius}
            fill="none"
            stroke={BAND_STROKE[band]}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            style={{
              transition: "stroke-dashoffset 0.9s var(--ease-out-quint)",
            }}
          />
          {thresholdAngle != null && (
            // Faint marker showing where "verified" begins, so a 68 reads as
            // "just short" rather than an arbitrary number.
            <line
              x1={px / 2}
              y1={stroke / 2 + 1}
              x2={px / 2}
              y2={stroke + 3}
              stroke="hsl(var(--foreground) / 0.35)"
              strokeWidth={1.5}
              strokeLinecap="round"
              transform={`rotate(${thresholdAngle} ${px / 2} ${px / 2})`}
            />
          )}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span
            className={cn(
              "font-display font-semibold leading-none tabular-nums",
              numeral,
              BAND_TEXT[band]
            )}
          >
            {score ?? "—"}
          </span>
          {showDenominator && score != null && (
            <span className={cn("text-muted-foreground mt-0.5", denom)}>/ 100</span>
          )}
        </div>
      </div>
      {label && <span className="text-xs font-medium text-muted-foreground">{label}</span>}
      {caption && (
        <span className="text-[11px] text-muted-foreground text-center max-w-[9rem] leading-snug">
          {caption}
        </span>
      )}
    </div>
  );
}
