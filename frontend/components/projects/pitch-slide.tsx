import { AlertTriangle, Check, ShieldCheck, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PitchDeckSlide } from "@/types";

/**
 * A single pitch deck slide, rendered at a fixed 16:9 aspect ratio.
 *
 * Each slide *kind* gets its own layout rather than everything being a title and
 * a bullet list — that difference is most of what separates a deck from a text
 * document. The computed kinds (score, traction) are the ones that look most like
 * data, because they are.
 *
 * Type sizes use cqw units so a slide scales with its container: the same
 * component renders correctly in a small in-page preview and on a full page.
 */
export function PitchSlide({
  slide,
  index,
  total,
  projectTitle,
  className,
}: {
  slide: PitchDeckSlide;
  index: number;
  total: number;
  projectTitle: string;
  className?: string;
}) {
  const kind = slide.kind ?? "narrative";
  const data = slide.data ?? {};

  return (
    <div
      className={cn(
        "relative w-full overflow-hidden bg-card text-card-foreground",
        "aspect-[16/9] [container-type:inline-size]",
        className
      )}
    >
      {/* Cover gets the inverted treatment so the deck opens with a title card. */}
      {kind === "cover" ? (
        <CoverLayout slide={slide} />
      ) : (
        <div className="absolute inset-0 flex flex-col p-[5cqw]">
          {/* Running header */}
          <div className="flex items-baseline justify-between gap-4 mb-[3cqw]">
            <span
              className="font-semibold uppercase tracking-[0.12em] text-primary"
              style={{ fontSize: "1.5cqw" }}
            >
              {slide.title}
            </span>
            <span
              className="text-muted-foreground tabular-nums"
              style={{ fontSize: "1.4cqw" }}
            >
              {projectTitle}
            </span>
          </div>

          <div className="flex-1 min-h-0">
            {kind === "score" && <ScoreLayout slide={slide} />}
            {kind === "traction" && <TractionLayout slide={slide} />}
            {kind === "ask" && <AskLayout slide={slide} />}
            {kind === "narrative" && <NarrativeLayout slide={slide} />}
          </div>

          {/* Slide number */}
          <div
            className="mt-[2cqw] flex items-center justify-between text-muted-foreground"
            style={{ fontSize: "1.3cqw" }}
          >
            <span>CodeBazaar</span>
            <span className="tabular-nums">
              {index + 1} / {total}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Cover ────────────────────────────────────────────────────────────────── */

function CoverLayout({ slide }: { slide: PitchDeckSlide }) {
  const d = slide.data ?? {};
  return (
    <div className="absolute inset-0 bg-gradient-brand text-white flex flex-col justify-between p-[5cqw]">
      <div className="absolute inset-0 bg-dot-grid opacity-[0.12]" aria-hidden />

      <div className="relative flex items-center gap-[1.5cqw]">
        <span
          className="rounded-[0.8cqw] bg-white/15 flex items-center justify-center"
          style={{ width: "3.4cqw", height: "3.4cqw" }}
        >
          <ShieldCheck style={{ width: "2cqw", height: "2cqw" }} />
        </span>
        <span
          className="font-semibold tracking-tight"
          style={{ fontSize: "1.8cqw" }}
        >
          CodeBazaar
        </span>
      </div>

      <div className="relative">
        <h1
          className="font-display font-semibold leading-[1.05] tracking-tight"
          style={{ fontSize: "6cqw" }}
        >
          {slide.title}
        </h1>
        {slide.headline && (
          <p
            className="mt-[2cqw] text-white/85 leading-snug max-w-[80%]"
            style={{ fontSize: "2.1cqw" }}
          >
            {slide.headline}
          </p>
        )}
      </div>

      <div
        className="relative flex items-end justify-between gap-[3cqw]"
        style={{ fontSize: "1.5cqw" }}
      >
        <div className="text-white/80">
          <p className="font-medium text-white">{d.builder ?? "Independent builder"}</p>
          {d.college && <p>{d.college}</p>}
          {d.repo && <p className="font-mono opacity-80">{d.repo}</p>}
        </div>

        {/* The score, front and centre on the cover — it's the whole pitch. */}
        {d.score != null && (
          <div className="text-right">
            <div
              className="font-display font-semibold leading-none tabular-nums"
              style={{ fontSize: "5cqw" }}
            >
              {d.score}
              <span className="opacity-60" style={{ fontSize: "2cqw" }}>
                /100
              </span>
            </div>
            <p className="text-white/80 mt-[0.5cqw]">
              {d.is_verified ? "Verified Build Score" : "Build Score"}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Narrative ────────────────────────────────────────────────────────────── */

function NarrativeLayout({ slide }: { slide: PitchDeckSlide }) {
  return (
    <div className="h-full flex flex-col justify-center">
      <h2
        className="font-display font-semibold leading-[1.15] tracking-tight max-w-[85%]"
        style={{ fontSize: "3.6cqw" }}
      >
        {slide.headline}
      </h2>
      {slide.bullets.length > 0 && (
        <ul className="mt-[3cqw] space-y-[1.4cqw] list-none max-w-[85%]">
          {slide.bullets.map((b, i) => (
            <li key={i} className="flex items-start gap-[1.4cqw]">
              <span
                className="rounded-full bg-primary flex-shrink-0"
                style={{ width: "0.7cqw", height: "0.7cqw", marginTop: "0.9cqw" }}
                aria-hidden
              />
              <span
                className="text-muted-foreground leading-snug"
                style={{ fontSize: "1.9cqw" }}
              >
                {b}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ── Verified Build Score ─────────────────────────────────────────────────── */

function bandColour(score: number | null | undefined) {
  if (score == null) return "hsl(var(--muted-foreground) / 0.3)";
  if (score >= 70) return "hsl(var(--score-high))";
  if (score >= 40) return "hsl(var(--score-mid))";
  return "hsl(var(--score-low))";
}

function ScoreLayout({ slide }: { slide: PitchDeckSlide }) {
  const d = slide.data ?? {};

  if (!d.scored) {
    return (
      <div className="h-full flex flex-col justify-center">
        <h2
          className="font-display font-semibold leading-tight"
          style={{ fontSize: "3.2cqw" }}
        >
          {slide.headline}
        </h2>
      </div>
    );
  }

  const components = d.components ?? [];

  return (
    <div className="h-full grid grid-cols-[auto_1fr] gap-[4cqw] items-center">
      {/* The number */}
      <div className="text-center">
        <div
          className="font-display font-semibold leading-none tabular-nums"
          style={{ fontSize: "8cqw", color: bandColour(d.score) }}
        >
          {d.score}
        </div>
        <div className="text-muted-foreground" style={{ fontSize: "1.5cqw" }}>
          out of 100
        </div>
        <div
          className={cn(
            "inline-flex items-center gap-[0.6cqw] rounded-full mt-[1.5cqw] px-[1.4cqw] py-[0.6cqw]",
            d.is_verified
              ? "bg-background-success text-text-success"
              : "bg-background-warning text-text-warning"
          )}
          style={{ fontSize: "1.3cqw" }}
        >
          {d.is_verified ? (
            <>
              <Check style={{ width: "1.3cqw", height: "1.3cqw" }} /> Verified
            </>
          ) : (
            <>Below the {d.threshold} bar</>
          )}
        </div>
        {d.confidence && (
          <p className="text-muted-foreground mt-[1cqw]" style={{ fontSize: "1.2cqw" }}>
            {d.confidence} confidence
          </p>
        )}
      </div>

      {/* The breakdown — the reason this slide exists */}
      <div className="min-w-0">
        <h2
          className="font-display font-semibold leading-tight mb-[2cqw]"
          style={{ fontSize: "2.2cqw" }}
        >
          {slide.headline}
        </h2>

        <div className="space-y-[1cqw]">
          {components.map((c) => (
            <div key={c.label} className="flex items-center gap-[1.4cqw]">
              <span
                className="text-muted-foreground truncate"
                style={{ fontSize: "1.4cqw", width: "34%" }}
              >
                {c.label}
              </span>
              <span
                className="text-muted-foreground tabular-nums text-right"
                style={{ fontSize: "1.2cqw", width: "9%" }}
              >
                {Math.round(c.weight * 100)}%
              </span>
              <span className="flex-1 rounded-full bg-secondary overflow-hidden" style={{ height: "0.9cqw" }}>
                <span
                  className="block h-full rounded-full"
                  style={{
                    width: `${c.score ?? 0}%`,
                    background: bandColour(c.score),
                  }}
                />
              </span>
              <span
                className="font-semibold tabular-nums text-right"
                style={{ fontSize: "1.4cqw", width: "7%" }}
              >
                {c.score ?? "—"}
              </span>
            </div>
          ))}
        </div>

        {/* Evidence line — makes the number checkable rather than asserted. */}
        <p
          className="text-muted-foreground mt-[2cqw] leading-snug"
          style={{ fontSize: "1.3cqw" }}
        >
          Computed from {d.commits_analyzed ?? "—"} commits across{" "}
          {d.contributors_count ?? "—"} contributor(s) over{" "}
          {d.repo_age_days ?? "—"} days. Full derivation published publicly.
        </p>

        {(d.flags?.length ?? 0) > 0 && (
          <p
            className="text-text-warning mt-[1cqw] flex items-start gap-[0.8cqw] leading-snug"
            style={{ fontSize: "1.25cqw" }}
          >
            <AlertTriangle
              style={{ width: "1.3cqw", height: "1.3cqw", marginTop: "0.1cqw" }}
              className="flex-shrink-0"
            />
            Disclosed trust signals: {d.flags!.join(", ")}
          </p>
        )}
      </div>
    </div>
  );
}

/* ── Traction ─────────────────────────────────────────────────────────────── */

function TractionLayout({ slide }: { slide: PitchDeckSlide }) {
  const d = slide.data ?? {};
  const metrics = d.metrics ?? [];

  return (
    <div className="h-full flex flex-col justify-center">
      <h2
        className="font-display font-semibold leading-tight max-w-[80%]"
        style={{ fontSize: "3cqw" }}
      >
        {slide.headline}
      </h2>

      {metrics.length > 0 && (
        <div className="grid grid-cols-3 gap-[1.6cqw] mt-[3cqw]">
          {metrics.map((m) => (
            <div
              key={m.label}
              className={cn(
                "rounded-[1.2cqw] border p-[1.8cqw]",
                m.has_data ? "bg-surface/70" : "bg-transparent border-dashed"
              )}
            >
              <div
                className={cn(
                  "font-display font-semibold tabular-nums leading-none",
                  !m.has_data && "text-muted-foreground"
                )}
                style={{ fontSize: "2.6cqw" }}
              >
                {m.value}
              </div>
              <div
                className="text-muted-foreground mt-[0.8cqw]"
                style={{ fontSize: "1.25cqw" }}
              >
                {m.label}
              </div>
            </div>
          ))}
        </div>
      )}

      {slide.bullets.length > 0 && (
        <ul className="mt-[2.5cqw] space-y-[0.9cqw] list-none">
          {slide.bullets.slice(0, 3).map((b, i) => (
            <li
              key={i}
              className="text-muted-foreground leading-snug flex items-start gap-[1.2cqw]"
              style={{ fontSize: "1.5cqw" }}
            >
              <span
                className="rounded-full bg-primary flex-shrink-0"
                style={{ width: "0.6cqw", height: "0.6cqw", marginTop: "0.6cqw" }}
                aria-hidden
              />
              {b}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ── The Ask ──────────────────────────────────────────────────────────────── */

function AskLayout({ slide }: { slide: PitchDeckSlide }) {
  const d = slide.data ?? {};
  const rupees = (paise?: number) =>
    paise ? "₹" + (paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 }) : null;

  const headlineNumber = rupees(d.listing_paise) ?? rupees(d.median_contract_paise);

  return (
    <div className="h-full grid grid-cols-[1.2fr_1fr] gap-[4cqw] items-center">
      <div>
        <h2
          className="font-display font-semibold leading-tight"
          style={{ fontSize: "3cqw" }}
        >
          {slide.headline}
        </h2>
        <ul className="mt-[2.5cqw] space-y-[1.2cqw] list-none">
          {slide.bullets.map((b, i) => (
            <li key={i} className="flex items-start gap-[1.2cqw]">
              <Sparkles
                className="text-cta flex-shrink-0"
                style={{ width: "1.5cqw", height: "1.5cqw", marginTop: "0.3cqw" }}
                aria-hidden
              />
              <span
                className="text-muted-foreground leading-snug"
                style={{ fontSize: "1.6cqw" }}
              >
                {b}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {headlineNumber && (
        <div className="rounded-[1.6cqw] border border-cta/40 bg-cta-subtle/60 p-[2.5cqw] text-center">
          <div
            className="font-display font-semibold leading-none tabular-nums"
            style={{ fontSize: "4.5cqw" }}
          >
            {headlineNumber}
          </div>
          <p className="text-muted-foreground mt-[1cqw]" style={{ fontSize: "1.3cqw" }}>
            {d.listing_paise ? "current asking price" : "median comparable build"}
          </p>
          {(d.basis?.length ?? 0) > 0 && (
            <p
              className="text-muted-foreground mt-[1.5cqw] leading-snug"
              style={{ fontSize: "1.15cqw" }}
            >
              Anchored to: {d.basis!.join(", ")}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
