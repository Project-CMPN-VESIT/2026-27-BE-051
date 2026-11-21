/**
 * Server-side fetchers for the unauthenticated public API.
 *
 * These deliberately do not go through `lib/api/client` (axios): that instance
 * reads the access token from the zustand store in localStorage, which does not
 * exist on the server. Every endpoint here is public, so a plain fetch is both
 * correct and lets us opt into Next's revalidation.
 *
 * In Next 16 `fetch` is uncached by default and blocks rendering, so caching is
 * opted into explicitly per call.
 */
import type {
  PlatformStats,
  PublicReport,
  ScoreSnapshot,
  ScoringMethodology,
  Showcase,
} from "@/types";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

/** Scores change on recompute, not on view — a short window is plenty. */
const REPORT_REVALIDATE_SECONDS = 60;
const STATS_REVALIDATE_SECONDS = 120;

export async function fetchPublicReport(projectId: string): Promise<PublicReport | null> {
  try {
    const res = await fetch(`${API_URL}/public/projects/${projectId}/report`, {
      next: { revalidate: REPORT_REVALIDATE_SECONDS },
    });
    if (!res.ok) return null;
    return (await res.json()) as PublicReport;
  } catch {
    // The report page renders a designed error state rather than throwing —
    // this URL gets shared, so a cold or unreachable backend must not produce
    // a stack trace for someone who just clicked a link in a README.
    return null;
  }
}

export async function fetchPlatformStats(): Promise<PlatformStats | null> {
  try {
    const res = await fetch(`${API_URL}/public/stats`, {
      next: { revalidate: STATS_REVALIDATE_SECONDS },
    });
    if (!res.ok) return null;
    return (await res.json()) as PlatformStats;
  } catch {
    return null;
  }
}

/**
 * Seed-backed landing page content: the featured project's full breakdown,
 * testimonials drawn from real reviews, and the campus leaderboard teaser.
 */
export async function fetchShowcase(): Promise<Showcase | null> {
  try {
    const res = await fetch(`${API_URL}/public/showcase`, {
      next: { revalidate: STATS_REVALIDATE_SECONDS },
    });
    if (!res.ok) return null;
    return (await res.json()) as Showcase;
  } catch {
    // The landing page degrades to its static pitch rather than failing — a
    // cold backend must not produce an error page for a first-time visitor.
    return null;
  }
}

/** Append-only score snapshots for a project. Public. */
export async function fetchScoreHistory(projectId: string): Promise<ScoreSnapshot[]> {
  try {
    const res = await fetch(
      `${API_URL}/analytics/projects/${projectId}/score-history`,
      { next: { revalidate: REPORT_REVALIDATE_SECONDS } }
    );
    if (!res.ok) return [];
    return (await res.json()) as ScoreSnapshot[];
  } catch {
    // The trend is supporting detail, not the point of the page — an empty
    // history renders a short explanation rather than failing the whole report.
    return [];
  }
}

/**
 * The scoring rulebook. Fetched rather than duplicated in the frontend so the
 * published methodology can never drift from the weights the engine actually
 * applies — if a weight changes in Python, this page changes with it.
 */
export async function fetchMethodology(): Promise<ScoringMethodology | null> {
  try {
    const res = await fetch(`${API_URL}/verification/methodology`, {
      // The rulebook changes only on deploy.
      next: { revalidate: 3600 },
    });
    if (!res.ok) return null;
    return (await res.json()) as ScoringMethodology;
  } catch {
    return null;
  }
}

/** ₹ formatting from paise. Amounts are stored as integers throughout. */
export function formatRupees(paise: number | null | undefined, compact = false): string {
  if (paise == null) return "—";
  const rupees = paise / 100;
  if (compact) {
    if (rupees >= 10_000_000) return `₹${(rupees / 10_000_000).toFixed(2)} Cr`;
    if (rupees >= 100_000) return `₹${(rupees / 100_000).toFixed(2)} L`;
    if (rupees >= 1_000) return `₹${(rupees / 1_000).toFixed(1)}k`;
  }
  return `₹${rupees.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}
