"use client";
import { useState } from "react";
import Link from "next/link";
import {
  AlertTriangle, ChevronLeft, ChevronRight, Download, ExternalLink, FileText,
  Lock, MessageSquareQuote, Pencil, Presentation, RefreshCw, ShieldCheck,
  Sparkles, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, Input } from "@/components/ui/primitives";
import { Alert, FormError } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { PitchSlide } from "@/components/projects/pitch-slide";
import { usePitchDeck, useGeneratePitchDeck, useRefinePitchSlide } from "@/lib/hooks";
import { projectsApi } from "@/lib/api";
import { getErrorMessage } from "@/lib/api/client";
import { cn } from "@/lib/utils";
import type { Project } from "@/types";

const PITCH_DECK_PRICE = 499;

/** Kinds built from database rows — the AI editor must not touch these. */
const COMPUTED_KINDS = new Set(["score", "traction", "cover"]);

const REFINE_PRESETS = [
  "Make the problem statement punchier",
  "Less jargon, more plain English",
  "Make it more specific and concrete",
  "Shorten it — too wordy",
];

export function PitchDeckPanel({ project, isOwner }: { project: Project; isOwner: boolean }) {
  const { data: deck, isLoading } = usePitchDeck(project.id);
  const { mutate: generate, isPending } = useGeneratePitchDeck(project.id);
  const refine = useRefinePitchSlide(project.id);

  const [error, setError] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [editing, setEditing] = useState(false);
  const [instruction, setInstruction] = useState("");

  const hasSlides = !!deck && deck.status === "completed" && deck.slides.length > 0;
  const unlocked = !!project.pitch_deck_unlocked;

  if (isLoading) {
    return <Skeleton className="h-64 w-full rounded-xl" />;
  }

  // Nothing generated and viewer isn't the owner — don't clutter the page.
  if (!hasSlides && !isOwner) return null;

  const run = () => {
    setError(null);
    generate(undefined, { onError: (e) => setError(getErrorMessage(e)) });
  };

  // ── Owner, not yet purchased ───────────────────────────────────────────────
  if (!hasSlides && isOwner && !unlocked) {
    return (
      <div className="rounded-xl border bg-card p-5 flex items-start gap-4">
        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
          <Presentation className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-sm flex items-center gap-2">
            AI Pitch Deck <Lock className="w-3.5 h-3.5 text-muted-foreground" />
          </h3>
          <p className="text-sm text-muted-foreground mt-1 mb-3 leading-relaxed">
            A designed investor deck for this project. The narrative is written for
            you; the Verified Build Score breakdown and traction slides are built
            from your real data, so nothing on them is invented.
          </p>
          <Button size="sm" variant="cta" asChild>
            <Link href={`/projects/${project.id}/checkout?type=pitch_deck`}>
              <Sparkles className="w-3.5 h-3.5" /> Unlock for ₹{PITCH_DECK_PRICE}
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  // ── Owner, purchased but not generated (or failed) ─────────────────────────
  if (!hasSlides && isOwner) {
    const failed = deck?.status === "failed";
    return (
      <div className="rounded-xl border bg-card p-5 space-y-3">
        <h3 className="font-semibold text-sm flex items-center gap-2">
          <Presentation className="w-4 h-4 text-primary" /> AI Pitch Deck
        </h3>
        {failed ? (
          <Alert
            variant="warning"
            title="Generation didn't finish"
            description={deck?.error_message || "Something went wrong. Try again."}
          />
        ) : (
          <p className="text-sm text-muted-foreground leading-relaxed">
            Unlocked. Generating reads your repo, prior analysis and verification
            result, then assembles a deck around them.
          </p>
        )}
        <FormError message={error} />
        <Button size="sm" variant="cta" loading={isPending} onClick={run}>
          <Sparkles className="w-3.5 h-3.5" />
          {failed ? "Retry generation" : "Generate pitch deck"}
        </Button>
        {isPending && (
          <p className="text-xs text-muted-foreground">
            10–30 seconds while the model writes the narrative slides.
          </p>
        )}
      </div>
    );
  }

  // ── Deck viewer ────────────────────────────────────────────────────────────
  const slides = deck!.slides;
  const safeIndex = Math.min(index, slides.length - 1);
  const slide = slides[safeIndex];
  const kind = slide.kind ?? "narrative";
  const isComputed = COMPUTED_KINDS.has(kind);

  const submitRefine = (text?: string) => {
    const value = (text ?? instruction).trim();
    if (!value) return;
    refine.mutate(
      { slideIndex: safeIndex, instruction: value },
      {
        onSuccess: () => {
          setEditing(false);
          setInstruction("");
        },
      }
    );
  };

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      {/* Header */}
      <div className="px-4 sm:px-5 py-3 border-b flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h3 className="font-semibold text-sm flex items-center gap-2">
            <Presentation className="w-4 h-4 text-primary" /> Pitch deck
          </h3>
          {deck!.tagline && (
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
              {deck!.tagline}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <Badge variant="ghost" size="sm" className="tabular-nums">
            {safeIndex + 1} / {slides.length}
          </Badge>
          <Button size="sm" variant="outline" className="h-7 text-xs" asChild>
            <Link href={`/projects/${project.id}/pitch-deck`} target="_blank">
              <ExternalLink className="w-3 h-3" /> Present
            </Link>
          </Button>
          {isOwner && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs"
              loading={isPending}
              onClick={run}
            >
              <RefreshCw className="w-3 h-3" /> Regenerate
            </Button>
          )}
        </div>
      </div>

      {/* The slide itself */}
      <PitchSlide
        slide={slide}
        index={safeIndex}
        total={slides.length}
        projectTitle={project.title}
      />

      {/* Speaker note */}
      {slide.speaker_note && (
        <div className="px-4 sm:px-5 py-3 border-t bg-surface/50 flex items-start gap-2">
          <MessageSquareQuote className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0 mt-0.5" />
          <p className="text-xs text-muted-foreground italic leading-relaxed">
            {slide.speaker_note}
          </p>
        </div>
      )}

      {/* Per-slide AI editing */}
      {isOwner && (
        <div className="px-4 sm:px-5 py-3 border-t">
          {isComputed ? (
            <p className="text-xs text-muted-foreground flex items-start gap-2 leading-relaxed">
              <ShieldCheck className="w-3.5 h-3.5 text-text-success flex-shrink-0 mt-px" />
              This slide is built from your verified data, so it can&apos;t be
              rewritten by the editor. That&apos;s deliberate — it&apos;s the slide
              an investor will check.
            </p>
          ) : editing ? (
            <div className="space-y-2.5">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-semibold">
                  Tell the editor what to change
                </p>
                <button
                  type="button"
                  onClick={() => setEditing(false)}
                  aria-label="Cancel editing"
                  className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {REFINE_PRESETS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    disabled={refine.isPending}
                    onClick={() => submitRefine(p)}
                    className={cn(
                      "text-xs px-2.5 py-1 rounded-full border bg-card text-muted-foreground",
                      "hover:text-foreground hover:border-border-strong transition-colors",
                      "disabled:opacity-50",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                    )}
                  >
                    {p}
                  </button>
                ))}
              </div>

              <form
                className="flex items-center gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  submitRefine();
                }}
              >
                <Input
                  placeholder="e.g. lead with the cost of rebuilding"
                  value={instruction}
                  onChange={(e) => setInstruction(e.target.value)}
                  aria-label="Editing instruction for this slide"
                />
                <Button
                  type="submit"
                  size="sm"
                  disabled={!instruction.trim() || refine.isPending}
                  loading={refine.isPending}
                  loadingText="Rewriting…"
                  className="flex-shrink-0"
                >
                  Rewrite
                </Button>
              </form>

              {refine.isError && (
                <FormError message={getErrorMessage(refine.error)} />
              )}

              <p className="text-[11px] text-muted-foreground leading-relaxed">
                The editor can sharpen the language but won&apos;t add facts —
                asking it to claim users or revenue you don&apos;t have will make
                the wording tighter, not the claims bigger.
              </p>
            </div>
          ) : (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs"
              onClick={() => setEditing(true)}
            >
              <Pencil className="w-3 h-3" /> Edit this slide with AI
            </Button>
          )}
        </div>
      )}

      {/* Navigation + export */}
      <div className="px-4 sm:px-5 py-3 border-t flex items-center justify-between gap-2 flex-wrap">
        <Button
          size="sm"
          variant="outline"
          disabled={safeIndex === 0}
          onClick={() => setIndex(Math.max(0, safeIndex - 1))}
        >
          <ChevronLeft className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Prev</span>
        </Button>

        <div className="flex gap-1 flex-wrap justify-center order-last sm:order-none w-full sm:w-auto">
          {slides.map((s, i) => (
            <button
              key={i}
              onClick={() => {
                setIndex(i);
                setEditing(false);
              }}
              aria-label={`Slide ${i + 1}: ${s.title}`}
              aria-current={i === safeIndex ? "true" : undefined}
              title={s.title}
              className={cn(
                "h-1.5 rounded-full transition-all",
                i === safeIndex
                  ? "w-5 bg-primary"
                  : COMPUTED_KINDS.has(s.kind ?? "narrative")
                    ? "w-1.5 bg-[hsl(var(--score-high))]/50 hover:bg-[hsl(var(--score-high))]"
                    : "w-1.5 bg-border hover:bg-muted-foreground"
              )}
            />
          ))}
        </div>

        <div className="flex items-center gap-1.5">
          <Button size="sm" variant="ghost" className="h-8 text-xs" asChild>
            <a href={projectsApi.pitchDeckMarkdownUrl(project.id)} download>
              <FileText className="w-3 h-3" />
              <span className="hidden sm:inline">Markdown</span>
            </a>
          </Button>
          <Button size="sm" variant="outline" className="h-8 text-xs" asChild>
            <Link href={`/projects/${project.id}/pitch-deck?print=1`} target="_blank">
              <Download className="w-3 h-3" />
              <span className="hidden sm:inline">PDF</span>
            </Link>
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={safeIndex >= slides.length - 1}
            onClick={() => setIndex(Math.min(slides.length - 1, safeIndex + 1))}
          >
            <span className="hidden sm:inline">Next</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {deck!.model_used && (
        <div className="px-4 sm:px-5 pb-3 flex items-center gap-2 flex-wrap">
          <Badge variant="ghost" size="sm">Narrative: AI-generated</Badge>
          <Badge variant="success" size="sm">
            <ShieldCheck className="w-3 h-3" /> Score &amp; traction: computed
          </Badge>
          <span className="text-[11px] text-muted-foreground font-mono">
            {deck!.model_used}
          </span>
        </div>
      )}
    </div>
  );
}
