import type { Metadata } from "next";
import Link from "next/link";
import { Circle, CircleDot, Clock } from "lucide-react";
import { Badge } from "@/components/ui/primitives";
import { Container } from "@/components/ui/layout";
import { Alert } from "@/components/ui/alert";

export const metadata: Metadata = {
  title: "Changelog & roadmap",
  description:
    "What has shipped on CodeBazaar, what is in progress, and what is deliberately not built yet.",
};

type Entry = {
  date: string;
  title: string;
  items: string[];
};

const SHIPPED: Entry[] = [
  {
    date: "September 2026",
    title: "Explainable scoring, public reports and mentorship",
    items: [
      "Verified Build Score now publishes its full derivation — all six weighted components, their individual contributions, penalties and confidence level",
      "Public verification reports at /verify/[id] — shareable, no login, server-rendered",
      "Embeddable README badge with live score, linking back to the public report",
      "Published methodology page fed directly from the scoring engine, so it cannot drift from the code",
      "Append-only score history: a score that dropped stays on the record",
      "AI mentor scoped to a project, grounded in its real verification data",
      "Human mentor directory with a request/accept flow",
      "Builder analytics: views, earnings and inbound interest over time",
      "Saved searches and shortlists for recruiters and incubators",
      "Public API for querying verified scores, with docs",
    ],
  },
  {
    date: "August 2026",
    title: "Marketplace, escrow and trust engines",
    items: [
      "Cashfree checkout with webhook reconciliation; purchase unlocks gated delivery",
      "Escrow contracts with milestone lifecycle, disputes and admin resolution",
      "Seller earnings dashboard and admin payout queue with settlement references",
      "Hackathon authenticity engine comparing event windows against commit timelines",
      "Builder reputation tiers derived from verified output and delivery record",
      "Delivery reliability predictions from real milestone history",
      "Contributor matching with visible reasoning",
      "Project adoption, build request board and incubation offers",
    ],
  },
  {
    date: "July 2026",
    title: "Foundations",
    items: [
      "GitHub import with commit, contributor and documentation analysis",
      "Email/password auth plus GitHub and Google OAuth, with 2FA",
      "Discovery feeds, reviews, direct messages and notifications",
      "Content reporting into an admin moderation queue with an audit trail",
    ],
  },
];

const IN_PROGRESS = [
  "Scheduled alerting for saved searches — the matching and baseline logic works, the periodic job does not exist yet",
  "Dark mode audit across every authenticated screen",
  "Extending the shared alert component to the remaining legacy error surfaces",
];

const NOT_BUILT = [
  {
    title: "Automated escrow payouts",
    why: "Approving a milestone writes a ledger entry recording what is owed. Settlement is a manual bank transfer with the reference recorded against it. We would rather show a real ledger with a manual step than imply a payout rail we don't have.",
  },
  {
    title: "Real plagiarism detection",
    why: "Originality is inferred from fork status, description and README depth, and capped at 90 so it can never masquerade as certainty. Genuine code-similarity scanning against a corpus is a separate system.",
  },
  {
    title: "Code quality and security auditing",
    why: "The score measures how software was developed, not how well it was written. A well-developed project can still contain a serious bug, and we don't claim otherwise.",
  },
];

export default function ChangelogPage() {
  return (
    <Container className="py-12 sm:py-16 max-w-3xl">
      <p className="text-eyebrow mb-4">Changelog</p>
      <h1 className="text-display-xl">What&apos;s shipped, and what hasn&apos;t</h1>
      <p className="mt-5 text-muted-foreground leading-relaxed">
        Including the parts we haven&apos;t built. A roadmap that only lists wins
        isn&apos;t much use to anyone deciding whether to rely on this.
      </p>

      {/* ── Shipped ──────────────────────────────────────────────────────── */}
      <div className="mt-12 space-y-10">
        {SHIPPED.map((entry, i) => (
          <section key={entry.date} className="relative pl-7">
            {/* Timeline rail */}
            <span
              className="absolute left-0 top-1.5 w-3.5 h-3.5 rounded-full bg-primary/15 border-2 border-primary flex-shrink-0"
              aria-hidden
            />
            {i < SHIPPED.length - 1 && (
              <span
                className="absolute left-[0.4rem] top-6 bottom-[-2.5rem] w-px bg-border"
                aria-hidden
              />
            )}

            <div className="flex items-center gap-2.5 flex-wrap">
              <Badge variant="success" size="sm">Shipped</Badge>
              <span className="text-xs text-muted-foreground">{entry.date}</span>
            </div>
            <h2 className="text-display-sm mt-2">{entry.title}</h2>
            <ul className="mt-3 space-y-2 list-none">
              {entry.items.map((item) => (
                <li key={item} className="flex items-start gap-2.5 text-sm">
                  <CircleDot
                    className="w-3 h-3 mt-1.5 flex-shrink-0 text-text-success"
                    aria-hidden
                  />
                  <span className="text-muted-foreground leading-relaxed">{item}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      {/* ── In progress ──────────────────────────────────────────────────── */}
      <section className="mt-14">
        <div className="flex items-center gap-2.5">
          <Badge variant="warning" size="sm">
            <Clock className="w-3 h-3" /> In progress
          </Badge>
        </div>
        <h2 className="text-display-sm mt-2">Being worked on now</h2>
        <ul className="mt-3 space-y-2 list-none">
          {IN_PROGRESS.map((item) => (
            <li key={item} className="flex items-start gap-2.5 text-sm">
              <Circle
                className="w-3 h-3 mt-1.5 flex-shrink-0 text-text-warning"
                aria-hidden
              />
              <span className="text-muted-foreground leading-relaxed">{item}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* ── Deliberately not built ───────────────────────────────────────── */}
      <section className="mt-14">
        <Badge variant="ghost" size="sm">Not built</Badge>
        <h2 className="text-display-sm mt-2">Deliberately not built yet</h2>
        <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
          These are real gaps. Each one is stated in the product itself wherever it
          matters, rather than left for someone to discover.
        </p>
        <div className="mt-5 space-y-3">
          {NOT_BUILT.map(({ title, why }) => (
            <div key={title} className="rounded-xl border bg-surface/60 p-4">
              <p className="font-semibold text-sm">{title}</p>
              <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">{why}</p>
            </div>
          ))}
        </div>
      </section>

      <Alert
        variant="info"
        className="mt-12"
        title="Check it yourself"
        description={
          <>
            The scoring rulebook is served from the engine at a public endpoint, so
            you don&apos;t have to trust this page. See the{" "}
            <Link href="/how-verification-works" className="underline underline-offset-2">
              methodology
            </Link>{" "}
            or the{" "}
            <Link href="/docs/api" className="underline underline-offset-2">
              API docs
            </Link>
            .
          </>
        }
      />
    </Container>
  );
}
