import Link from "next/link";
import { ArrowLeft, Info } from "lucide-react";
import { Container } from "@/components/ui/layout";

export interface LegalSection {
  heading: string;
  body: string;
}

/**
 * Shared layout for Terms / Privacy. Includes a sticky table of contents on
 * wide screens so long policies stay navigable.
 */
export function LegalPage({
  title,
  updated,
  intro,
  sections,
  disclaimer,
  siblingLabel,
  siblingHref,
}: {
  title: string;
  updated: string;
  intro?: string;
  sections: LegalSection[];
  disclaimer?: string;
  siblingLabel: string;
  siblingHref: string;
}) {
  return (
    <Container width="xl" className="py-12 sm:py-16">
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-8"
      >
        <ArrowLeft className="w-3.5 h-3.5" /> Back to home
      </Link>

      <div className="grid lg:grid-cols-[15rem_minmax(0,42rem)] gap-10 lg:gap-14">
        {/* Table of contents */}
        <aside className="hidden lg:block">
          <div className="sticky top-24">
            <p className="text-eyebrow mb-3">On this page</p>
            <nav className="space-y-1" aria-label="Table of contents">
              {sections.map((s, i) => (
                <a
                  key={s.heading}
                  href={`#section-${i + 1}`}
                  className="block text-sm text-muted-foreground hover:text-foreground transition-colors py-1 leading-snug"
                >
                  {s.heading}
                </a>
              ))}
            </nav>
          </div>
        </aside>

        {/* Body */}
        <article className="min-w-0">
          <header className="mb-10 pb-8 border-b">
            <h1 className="text-display-lg">{title}</h1>
            <p className="text-sm text-muted-foreground mt-3">Last updated: {updated}</p>
            {intro && (
              <p className="text-[1.0625rem] text-muted-foreground mt-5 leading-relaxed">{intro}</p>
            )}
          </header>

          {disclaimer && (
            <div className="flex items-start gap-3 rounded-xl border border-border-warning bg-background-warning/50 px-4 py-3.5 mb-10">
              <Info className="w-4 h-4 text-text-warning flex-shrink-0 mt-0.5" />
              <p className="text-sm text-text-warning leading-relaxed">{disclaimer}</p>
            </div>
          )}

          <div className="space-y-10">
            {sections.map((s, i) => (
              <section key={s.heading} id={`section-${i + 1}`} className="scroll-mt-24">
                <h2 className="text-display-sm flex items-baseline gap-2.5 mb-3">
                  <span className="text-sm font-semibold text-primary tabular-nums">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  {s.heading}
                </h2>
                <p className="text-[0.9375rem] text-muted-foreground leading-[1.75]">{s.body}</p>
              </section>
            ))}
          </div>

          <footer className="mt-14 pt-6 border-t flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
            <Link href={siblingHref} className="text-primary hover:underline font-medium">
              {siblingLabel}
            </Link>
            <Link href="/" className="text-muted-foreground hover:text-foreground transition-colors">
              Back to home
            </Link>
          </footer>
        </article>
      </div>
    </Container>
  );
}
