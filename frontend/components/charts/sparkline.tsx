"use client";
import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Dependency-free SVG charts.
 *
 * A charting library would add well over 100kB to render two small series, and
 * these shapes are simple enough that the maths is shorter than the config would
 * have been.
 */

export interface Point {
  label: string;
  value: number;
}

function buildPath(values: number[], width: number, height: number, pad: number) {
  if (values.length === 0) return { line: "", area: "", max: 0 };
  const max = Math.max(...values, 1);
  const usableW = width - pad * 2;
  const usableH = height - pad * 2;
  const step = values.length > 1 ? usableW / (values.length - 1) : 0;

  const coords = values.map((v, i) => {
    const x = pad + i * step;
    const y = pad + usableH - (v / max) * usableH;
    return [x, y] as const;
  });

  const line = coords
    .map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`)
    .join(" ");

  const area =
    coords.length > 1
      ? `${line} L${(pad + (values.length - 1) * step).toFixed(1)},${(height - pad).toFixed(1)} ` +
        `L${pad.toFixed(1)},${(height - pad).toFixed(1)} Z`
      : "";

  return { line, area, max };
}

/** Filled area chart for a dense daily series. */
export function Sparkline({
  points,
  height = 64,
  className,
  ariaLabel,
  formatValue = (n) => String(n),
  tone = "primary",
}: {
  points: Point[];
  height?: number;
  className?: string;
  ariaLabel: string;
  formatValue?: (n: number) => string;
  tone?: "primary" | "cta" | "success";
}) {
  const width = 600; // viewBox units; the SVG scales to its container.
  const pad = 4;
  const values = points.map((p) => p.value);
  const { line, area, max } = buildPath(values, width, height, pad);
  const gradientId = React.useId();

  const stroke =
    tone === "cta" ? "hsl(var(--cta))"
      : tone === "success" ? "hsl(var(--score-high))"
      : "hsl(var(--primary))";

  const allZero = values.every((v) => v === 0);

  if (points.length === 0) {
    return (
      <p className={cn("text-xs text-muted-foreground", className)}>
        No data for this period yet.
      </p>
    );
  }

  return (
    <div className={className}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        className="w-full"
        style={{ height }}
        role="img"
        aria-label={ariaLabel}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity="0.22" />
            <stop offset="100%" stopColor={stroke} stopOpacity="0" />
          </linearGradient>
        </defs>
        {area && <path d={area} fill={`url(#${gradientId})`} />}
        <path
          d={line}
          fill="none"
          stroke={stroke}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <div className="flex items-center justify-between mt-1.5 text-[11px] text-muted-foreground">
        <span>{points[0]?.label}</span>
        {/* A flat line at zero should say so rather than implying a scale. */}
        <span className="tabular-nums">
          {allZero ? "no activity" : `peak ${formatValue(max)}`}
        </span>
        <span>{points[points.length - 1]?.label}</span>
      </div>
    </div>
  );
}

/**
 * Score-over-time chart with the verified threshold marked.
 *
 * Uses a fixed 0–100 domain rather than fitting to the data: auto-scaling would
 * make a two-point wobble look like a collapse, which is exactly the kind of
 * misreading a trust graph must not invite.
 */
export function ScoreTrend({
  points,
  threshold = 70,
  height = 120,
  className,
}: {
  points: Point[];
  threshold?: number;
  height?: number;
  className?: string;
}) {
  const width = 600;
  const pad = 8;
  const gradientId = React.useId();

  if (points.length === 0) {
    return (
      <p className={cn("text-sm text-muted-foreground", className)}>
        No score history yet. A snapshot is recorded each time verification runs.
      </p>
    );
  }

  const usableW = width - pad * 2;
  const usableH = height - pad * 2;
  const step = points.length > 1 ? usableW / (points.length - 1) : 0;
  const toY = (v: number) => pad + usableH - (Math.max(0, Math.min(100, v)) / 100) * usableH;

  const coords = points.map((p, i) => [pad + i * step, toY(p.value)] as const);
  const line = coords
    .map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`)
    .join(" ");
  const area =
    coords.length > 1
      ? `${line} L${(pad + (points.length - 1) * step).toFixed(1)},${(height - pad).toFixed(1)} ` +
        `L${pad.toFixed(1)},${(height - pad).toFixed(1)} Z`
      : "";

  const first = points[0].value;
  const last = points[points.length - 1].value;
  const delta = last - first;

  return (
    <div className={className}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        className="w-full"
        style={{ height }}
        role="img"
        aria-label={`Verified Build Score over time: ${points.length} snapshots, from ${first} to ${last} out of 100`}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.2" />
            <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Verified threshold */}
        <line
          x1={pad} y1={toY(threshold)} x2={width - pad} y2={toY(threshold)}
          stroke="hsl(var(--score-high))" strokeWidth={1}
          strokeDasharray="4 4" opacity={0.7}
          vectorEffect="non-scaling-stroke"
        />

        {area && <path d={area} fill={`url(#${gradientId})`} />}
        <path
          d={line} fill="none" stroke="hsl(var(--primary))" strokeWidth={2}
          strokeLinecap="round" strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
        {coords.map(([x, y], i) => (
          <circle
            key={i} cx={x} cy={y} r={2.5}
            fill="hsl(var(--card))" stroke="hsl(var(--primary))" strokeWidth={1.5}
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>

      <div className="flex items-center justify-between mt-2 text-[11px] text-muted-foreground">
        <span>{points[0].label}</span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block w-3 border-t border-dashed border-[hsl(var(--score-high))]" aria-hidden />
          verified bar {threshold}
        </span>
        <span className="tabular-nums">
          {delta === 0 ? "no change" : delta > 0 ? `+${delta} since first` : `${delta} since first`}
        </span>
      </div>
    </div>
  );
}
