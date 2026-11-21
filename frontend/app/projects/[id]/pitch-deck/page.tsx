"use client";
import { useEffect, useState } from "react";
import { use } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  ArrowLeft, ChevronLeft, ChevronRight, Maximize2, Printer,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/primitives";
import { Container } from "@/components/ui/layout";
import { LoadingRegion, Skeleton } from "@/components/ui/skeleton";
import { PitchSlide } from "@/components/projects/pitch-slide";
import { usePitchDeck, useProject } from "@/lib/hooks";
import { cn } from "@/lib/utils";

/**
 * Full-page deck: present mode on screen, one slide per sheet when printed.
 *
 * Download is deliberately "print to PDF" rather than a server-side renderer.
 * The slides are already CSS, the browser's print engine produces a correct
 * vector PDF from them, and it avoids adding a headless-browser or PDF library
 * dependency to render markup we can already draw.
 */
export default function PitchDeckPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const searchParams = useSearchParams();
  const autoPrint = searchParams.get("print") === "1";

  const { data: project, isLoading: projectLoading } = useProject(id);
  const { data: deck, isLoading: deckLoading } = usePitchDeck(id);
  const [index, setIndex] = useState(0);

  const slides = deck?.slides ?? [];
  const ready = deck?.status === "completed" && slides.length > 0;

  // Open the print dialog once the deck has actually rendered, otherwise the
  // browser captures an empty page.
  useEffect(() => {
    if (!autoPrint || !ready) return;
    const t = setTimeout(() => window.print(), 700);
    return () => clearTimeout(t);
  }, [autoPrint, ready]);

  // Arrow-key navigation, as any deck viewer should have.
  useEffect(() => {
    if (!ready) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === " ") {
        setIndex((i) => Math.min(slides.length - 1, i + 1));
      } else if (e.key === "ArrowLeft") {
        setIndex((i) => Math.max(0, i - 1));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ready, slides.length]);

  if (projectLoading || deckLoading) {
    return (
      <Container className="py-10">
        <LoadingRegion label="Loading pitch deck" className="space-y-4">
          <Skeleton className="h-6 w-56" />
          <Skeleton className="w-full aspect-[16/9] rounded-xl" />
        </LoadingRegion>
      </Container>
    );
  }

  if (!project) {
    return (
      <Container className="py-20 max-w-lg">
        <EmptyState
          title="Project not found"
          description="This project may have been removed."
          action={
            <Button asChild>
              <Link href="/projects">Browse projects</Link>
            </Button>
          }
        />
      </Container>
    );
  }

  if (!ready) {
    return (
      <Container className="py-20 max-w-lg">
        <EmptyState
          title="No pitch deck yet"
          description="This project doesn't have a generated deck. The owner can create one from the project page."
          action={
            <Button asChild>
              <Link href={`/projects/${id}`}>Back to project</Link>
            </Button>
          }
        />
      </Container>
    );
  }

  const safeIndex = Math.min(index, slides.length - 1);

  return (
    <>
      {/* ── Screen: present mode ─────────────────────────────────────────── */}
      <div className="no-print">
        <Container className="py-6 sm:py-8 max-w-6xl">
          <div className="flex items-center justify-between gap-3 mb-5 flex-wrap">
            <div className="min-w-0">
              <Button variant="ghost" size="sm" asChild className="-ml-2 mb-1">
                <Link href={`/projects/${id}`}>
                  <ArrowLeft className="w-3.5 h-3.5" /> Back to project
                </Link>
              </Button>
              <h1 className="text-display-sm truncate">{project.title}</h1>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.print()}
              >
                <Printer className="w-3.5 h-3.5" /> Download PDF
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => document.documentElement.requestFullscreen?.()}
                aria-label="Enter fullscreen"
              >
                <Maximize2 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Fullscreen</span>
              </Button>
            </div>
          </div>

          <div className="rounded-xl border overflow-hidden shadow-lg">
            <PitchSlide
              slide={slides[safeIndex]}
              index={safeIndex}
              total={slides.length}
              projectTitle={project.title}
            />
          </div>

          {/* Speaker note, on screen only — never printed onto the slide. */}
          {slides[safeIndex].speaker_note && (
            <p className="mt-4 text-sm text-muted-foreground italic leading-relaxed max-w-3xl">
              {slides[safeIndex].speaker_note}
            </p>
          )}

          <div className="flex items-center justify-between gap-3 mt-5 flex-wrap">
            <Button
              variant="outline"
              size="sm"
              disabled={safeIndex === 0}
              onClick={() => setIndex(safeIndex - 1)}
            >
              <ChevronLeft className="w-3.5 h-3.5" /> Prev
            </Button>

            <div className="flex gap-1.5 flex-wrap justify-center">
              {slides.map((s, i) => (
                <button
                  key={i}
                  onClick={() => setIndex(i)}
                  title={s.title}
                  aria-label={`Slide ${i + 1}: ${s.title}`}
                  aria-current={i === safeIndex ? "true" : undefined}
                  className={cn(
                    "h-1.5 rounded-full transition-all",
                    i === safeIndex ? "w-6 bg-primary" : "w-1.5 bg-border hover:bg-muted-foreground"
                  )}
                />
              ))}
            </div>

            <Button
              variant="outline"
              size="sm"
              disabled={safeIndex >= slides.length - 1}
              onClick={() => setIndex(safeIndex + 1)}
            >
              Next <ChevronRight className="w-3.5 h-3.5" />
            </Button>
          </div>

          <p className="text-xs text-muted-foreground mt-6 text-center">
            Use the arrow keys to move between slides. Download PDF prints every
            slide, one per page.
          </p>
        </Container>
      </div>

      {/* ── Print: every slide, one per landscape page ───────────────────── */}
      <div className="hidden print:block print-deck">
        {slides.map((s, i) => (
          <div key={i} className="print-slide">
            <PitchSlide
              slide={s}
              index={i}
              total={slides.length}
              projectTitle={project.title}
            />
          </div>
        ))}
      </div>
    </>
  );
}
