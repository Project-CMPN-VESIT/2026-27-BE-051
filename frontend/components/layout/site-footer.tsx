import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { Container } from "@/components/ui/layout";

const COLUMNS: { heading: string; links: { href: string; label: string }[] }[] = [
  {
    heading: "Discover",
    links: [
      { href: "/projects?for_sale=true", label: "Marketplace" },
      { href: "/projects", label: "All projects" },
      { href: "/builders", label: "Builders" },
      { href: "/leaderboard", label: "Leaderboard" },
      { href: "/campus", label: "Campus leaderboard" },
    ],
  },
  {
    heading: "Build",
    links: [
      { href: "/import", label: "Import a repo" },
      { href: "/requests", label: "Build requests" },
      { href: "/mentors", label: "Find a mentor" },
      { href: "/pricing", label: "Pricing" },
    ],
  },
  {
    heading: "Trust",
    links: [
      { href: "/how-verification-works", label: "Methodology" },
      { href: "/docs/api", label: "API docs" },
      { href: "/changelog", label: "Changelog" },
    ],
  },
  {
    heading: "Company",
    links: [
      { href: "/about", label: "About" },
      { href: "/#faq", label: "FAQ" },
      { href: "/terms", label: "Terms" },
      { href: "/privacy", label: "Privacy" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="border-t bg-surface mt-24">
      <Container className="py-14">
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-10">
          <div className="max-w-xs">
            <div className="flex items-center gap-2.5 font-display text-lg font-semibold">
              <span className="w-7 h-7 rounded-lg bg-gradient-brand flex items-center justify-center">
                <ShieldCheck className="w-4 h-4 text-white" strokeWidth={2.25} />
              </span>
              CodeBazaar
            </div>
            <p className="text-sm text-muted-foreground mt-3 leading-relaxed">
              Every listing carries a Verified Build Score computed from real
              commit history — so buyers, funders, and recruiters can trust what
              they are looking at.
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 sm:gap-8 text-sm">
            {COLUMNS.map((col) => (
              <div key={col.heading}>
                <p className="font-semibold mb-3">{col.heading}</p>
                <ul className="space-y-2 text-muted-foreground">
                  {col.links.map((link) => (
                    <li key={link.href}>
                      <Link
                        href={link.href}
                        className="hover:text-foreground transition-colors"
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div className="border-t mt-10 pt-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-sm text-muted-foreground">
          <span>© {new Date().getFullYear()} CodeBazaar. Built for builders.</span>
          <div className="flex items-center gap-4 text-xs">
            <a
              href="mailto:hello@codebazaar.dev"
              className="hover:text-foreground transition-colors"
            >
              hello@codebazaar.dev
            </a>
            <span>Made in India</span>
          </div>
        </div>
      </Container>
    </footer>
  );
}
