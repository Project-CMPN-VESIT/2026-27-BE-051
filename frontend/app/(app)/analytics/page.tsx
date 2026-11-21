"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import {
  ArrowRight, Eye, Handshake, IndianRupee, MessageSquare, TrendingUp, Users, Wallet,
} from "lucide-react";
import { Badge, Card, CardContent, EmptyState, StatCard } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/ui/layout";
import { Alert } from "@/components/ui/alert";
import { Skeleton, StatGridSkeleton } from "@/components/ui/skeleton";
import { Sparkline } from "@/components/charts/sparkline";
import { useMyAnalytics } from "@/lib/hooks/analytics";
import { useAuthStore } from "@/stores/auth";
import { getErrorMessage } from "@/lib/api/client";
import { cn } from "@/lib/utils";

const WINDOWS = [
  { days: 7, label: "7 days" },
  { days: 30, label: "30 days" },
  { days: 90, label: "90 days" },
];

function rupees(paise: number): string {
  return "₹" + (paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

function shortDay(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

export default function AnalyticsPage() {
  const token = useAuthStore((s) => s.accessToken);
  const router = useRouter();
  const [days, setDays] = useState(30);
  const { data, isLoading, isError, error } = useMyAnalytics(days);

  useEffect(() => {
    if (!token) router.replace("/auth/login");
  }, [token, router]);

  if (!token) {
    return (
      <Container className="py-10">
        <Skeleton className="h-8 w-56" />
      </Container>
    );
  }

  return (
    <Container className="py-10 space-y-8 max-w-5xl">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <h1 className="text-display-lg">Your analytics</h1>
          <p className="text-sm text-muted-foreground mt-1.5 max-w-xl leading-relaxed">
            Who is looking at your projects, what they do next, and what you&apos;ve
            earned. Your own views are excluded.
          </p>
        </div>
        <div
          className="inline-flex items-center gap-0.5 p-1 rounded-full border bg-surface/60 flex-shrink-0"
          role="tablist"
          aria-label="Time window"
        >
          {WINDOWS.map((w) => (
            <button
              key={w.days}
              type="button"
              role="tab"
              aria-selected={days === w.days}
              onClick={() => setDays(w.days)}
              className={cn(
                "px-3 py-1 rounded-full text-xs transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                days === w.days
                  ? "bg-card text-foreground font-semibold shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {w.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading && (
        <>
          <StatGridSkeleton />
          <Skeleton className="h-40 w-full rounded-xl" />
          <Skeleton className="h-40 w-full rounded-xl" />
        </>
      )}

      {isError && (
        <Alert
          variant="danger"
          title="Couldn't load your analytics"
          description={getErrorMessage(error)}
          action={
            <Button size="sm" variant="outline" onClick={() => location.reload()}>
              Try again
            </Button>
          }
        />
      )}

      {data && data.projects_total === 0 && (
        <EmptyState
          icon={<TrendingUp />}
          title="Nothing to measure yet"
          description="Once you import a repository and it starts getting views, this page will show where the interest is coming from."
          action={
            <Button variant="cta" asChild>
              <Link href="/import">Import your first repo</Link>
            </Button>
          }
        />
      )}

      {data && data.projects_total > 0 && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard
              label={`Views · ${days}d`}
              value={data.views_total.toLocaleString("en-IN")}
              icon={<Eye />}
              hint={
                data.views_owner_excluded > 0
                  ? `${data.views_owner_excluded} of your own excluded`
                  : undefined
              }
              accent={data.views_total > 0}
            />
            <StatCard
              label={`Earned · ${days}d`}
              value={rupees(data.earnings_window_paise)}
              icon={<IndianRupee />}
            />
            <StatCard
              label="Lifetime sales"
              value={rupees(data.lifetime_sales_paise)}
              icon={<Wallet />}
              hint={`${data.sales_count} sale${data.sales_count === 1 ? "" : "s"}`}
            />
            <StatCard
              label="Escrow credited"
              value={rupees(data.escrow_released_paise)}
              icon={<Handshake />}
              hint="payout pending"
            />
          </div>

          {/* Views over time */}
          <Card>
            <CardContent className="pt-5">
              <div className="flex items-baseline justify-between gap-3 mb-4">
                <h2 className="font-display text-lg font-semibold">Views over time</h2>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {data.views_total.toLocaleString("en-IN")} total
                </span>
              </div>
              <Sparkline
                points={data.views_series.map((p) => ({
                  label: shortDay(p.day),
                  value: p.value,
                }))}
                ariaLabel={`Project views over the last ${days} days`}
                height={72}
              />
            </CardContent>
          </Card>

          {/* Earnings over time */}
          <Card>
            <CardContent className="pt-5">
              <div className="flex items-baseline justify-between gap-3 mb-4">
                <h2 className="font-display text-lg font-semibold">Earnings over time</h2>
                <span className="text-xs text-muted-foreground tabular-nums">
                  net of the 10% platform fee
                </span>
              </div>
              <Sparkline
                points={data.earnings_series.map((p) => ({
                  label: shortDay(p.day),
                  value: p.value,
                }))}
                ariaLabel={`Earnings over the last ${days} days`}
                height={72}
                tone="cta"
                formatValue={(n) => rupees(n)}
              />
            </CardContent>
          </Card>

          {/* Inbound interest */}
          <Card>
            <CardContent className="pt-5">
              <h2 className="font-display text-lg font-semibold mb-1">Inbound interest</h2>
              <p className="text-sm text-muted-foreground mb-4">
                Lifetime totals across all your projects.
              </p>
              <div className="grid grid-cols-3 gap-3">
                <Interest
                  icon={<Handshake className="w-3.5 h-3.5" />}
                  label="Offers received"
                  value={data.offers_received}
                  href="/incubation"
                />
                <Interest
                  icon={<Users className="w-3.5 h-3.5" />}
                  label="Contributor requests"
                  value={data.contributor_requests}
                  href="/dashboard"
                />
                <Interest
                  icon={<MessageSquare className="w-3.5 h-3.5" />}
                  label="Conversations"
                  value={data.conversations_started}
                  href="/messages"
                />
              </div>
            </CardContent>
          </Card>

          {/* Per-project breakdown */}
          <Card>
            <CardContent className="pt-5">
              <h2 className="font-display text-lg font-semibold mb-4">
                Most viewed projects
              </h2>
              {data.top_projects.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No views recorded in this window yet.
                </p>
              ) : (
                <ul className="divide-y list-none">
                  {data.top_projects.map((p) => {
                    const share = data.views_total
                      ? Math.round((p.views / data.views_total) * 100)
                      : 0;
                    return (
                      <li key={p.project_id} className="py-2.5 first:pt-0 last:pb-0">
                        <Link
                          href={`/projects/${p.project_id}`}
                          className="group flex items-center gap-3"
                        >
                          <span className="text-sm font-medium flex-1 min-w-0 truncate group-hover:text-primary transition-colors">
                            {p.title}
                          </span>
                          <div className="hidden sm:block w-28 h-1.5 rounded-full bg-secondary overflow-hidden flex-shrink-0">
                            <div
                              className="h-full rounded-full bg-primary"
                              style={{ width: `${share}%` }}
                            />
                          </div>
                          <span className="text-sm tabular-nums w-12 text-right flex-shrink-0">
                            {p.views}
                          </span>
                          <ArrowRight className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>

          <p className="text-xs text-muted-foreground">
            View counts are aggregated per day and exclude your own visits. They are
            deliberately coarse — we don&apos;t record who viewed your project.
          </p>
        </>
      )}
    </Container>
  );
}

function Interest({
  icon, label, value, href,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="rounded-xl border bg-surface/50 p-3.5 hover:border-border-strong transition-colors group"
    >
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {icon} <span className="truncate">{label}</span>
      </div>
      <div className="mt-1.5 font-display text-xl font-semibold tabular-nums group-hover:text-primary transition-colors">
        {value}
      </div>
    </Link>
  );
}
