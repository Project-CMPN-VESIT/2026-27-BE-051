"use client";
import Link from "next/link";
import {
  ArrowDownRight, ArrowUpRight, Eye, Flame, Gavel, Inbox, Mail, ShieldCheck,
  Sparkles, TrendingUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, EmptyState } from "@/components/ui/primitives";
import { Alert } from "@/components/ui/alert";
import { Container, PageHeader } from "@/components/ui/layout";
import { Skeleton } from "@/components/ui/skeleton";
import { useDigest } from "@/lib/hooks/advanced";
import { cn } from "@/lib/utils";
import type { DigestItem } from "@/types/advanced";

const SECTION_ICON: Record<string, React.ElementType> = {
  score_movement: TrendingUp,
  views: Eye,
  offers: Gavel,
  streak: Flame,
  team_earnings: Sparkles,
  saved_searches: Inbox,
  new_verified: ShieldCheck,
  purchase_health: TrendingUp,
};

/**
 * In-app preview of the weekly digest email.
 *
 * Same payload the emailer renders, so what's on screen is exactly what gets
 * sent. A digest whose contents can only be confirmed by receiving an email is a
 * digest nobody can verify is correct — including us.
 */
export default function DigestPage() {
  const { data: digest, isLoading } = useDigest(7);

  return (
    <Container className="py-8 sm:py-10 max-w-2xl">
      <PageHeader
        title="Your week in review"
        description="Everything that moved on your account in the last seven days. This is the same content your weekly digest email contains — sent Monday mornings."
      />

      {isLoading ? (
        <div className="space-y-4">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-32 rounded-xl" />
          ))}
        </div>
      ) : !digest || digest.sections.length === 0 ? (
        <EmptyState
          icon={<Mail className="w-6 h-6" />}
          title="A quiet week"
          description="Nothing notable happened on your account in the last seven days, so there's no digest to send. We don't email you to say nothing happened — that's how people learn to ignore an inbox."
          action={
            <Button asChild>
              <Link href="/projects">Browse projects</Link>
            </Button>
          }
        />
      ) : (
        <>
          {!digest.is_worth_sending && (
            <Alert
              variant="info"
              title="Below the send threshold"
              description="There's some activity here, but not enough to justify an email this week. You'd see this on your dashboard instead."
              className="mb-5"
            />
          )}

          <div className="flex items-center gap-2 mb-4 flex-wrap text-xs text-muted-foreground">
            <Badge variant="ghost" size="sm">
              {digest.item_count} item{digest.item_count === 1 ? "" : "s"}
            </Badge>
            <span>
              Window: last {digest.window_days} days · generated{" "}
              {new Date(digest.generated_at).toLocaleString("en-IN", {
                day: "numeric",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          </div>

          <div className="space-y-4">
            {digest.sections.map((section) => {
              const Icon = SECTION_ICON[section.key] ?? Sparkles;
              return (
                <section
                  key={section.key}
                  className="rounded-xl border bg-card overflow-hidden"
                >
                  <h2 className="px-4 py-3 border-b font-semibold text-sm flex items-center gap-2">
                    <Icon className="w-4 h-4 text-primary flex-shrink-0" />
                    {section.title}
                  </h2>
                  <ul className="divide-y">
                    {section.items.map((item, i) => (
                      <li key={i}>
                        <DigestRow item={item} />
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>

          <p className="text-xs text-muted-foreground mt-6 leading-relaxed">
            The digest is assembled per role — builders see score movement and
            inbound interest, recruiters see new matches on their saved searches.
            Everyone monitoring a purchase sees its health.
          </p>
        </>
      )}
    </Container>
  );
}

function DigestRow({ item }: { item: DigestItem }) {
  const body = (
    <div className="px-4 py-3 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm font-medium">{item.title}</p>
        {item.detail && (
          <p className="text-xs text-muted-foreground mt-0.5">{item.detail}</p>
        )}
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        {item.delta != null && item.delta !== 0 && (
          <span
            className={cn(
              "text-xs font-semibold tabular-nums inline-flex items-center gap-0.5",
              item.delta > 0 ? "text-text-success" : "text-destructive",
            )}
          >
            {item.delta > 0 ? (
              <ArrowUpRight className="w-3 h-3" />
            ) : (
              <ArrowDownRight className="w-3 h-3" />
            )}
            {item.delta > 0 ? "+" : ""}
            {item.delta}
          </span>
        )}
        {item.score != null && (
          <span className="text-sm font-semibold tabular-nums">{item.score}</span>
        )}
        {item.views != null && (
          <span className="text-sm font-semibold tabular-nums">{item.views}</span>
        )}
        {item.status && <Badge variant="ghost" size="sm">{item.status}</Badge>}
      </div>
    </div>
  );

  if (!item.link) return body;
  return (
    <Link
      href={item.link}
      className={cn(
        "block hover:bg-accent/50 transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/40",
      )}
    >
      {body}
    </Link>
  );
}
