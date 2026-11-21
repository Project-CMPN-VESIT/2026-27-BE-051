"use client";
import Link from "next/link";
import { Layers, Package, Star, TrendingDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, EmptyState } from "@/components/ui/primitives";
import { Container, PageHeader } from "@/components/ui/layout";
import { Skeleton } from "@/components/ui/skeleton";
import { ScoreRing } from "@/components/trust/score-ring";
import { useBundles } from "@/lib/hooks/advanced";
import { cn } from "@/lib/utils";
import type { ProjectBundle } from "@/types/advanced";

function inr(paise: number) {
  return `₹${(paise / 100).toLocaleString("en-IN")}`;
}

/**
 * Portfolio bundles — public discovery surface.
 *
 * The pitch is specific: a recruiter or acquirer evaluating a body of work learns
 * more from three related shipped projects than from one. So the card leads with
 * the average verified score across members, not with the discount.
 */
export default function BundlesPage() {
  const { data: bundles, isLoading } = useBundles();

  return (
    <Container className="py-8 sm:py-12 max-w-5xl">
      <PageHeader
        title="Portfolio bundles"
        description="Several projects from one builder, sold together. Useful when you're assessing how someone works rather than buying a single repo — and always priced below the sum of its parts."
      />

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-64 rounded-xl" />
          ))}
        </div>
      ) : !bundles || bundles.length === 0 ? (
        <EmptyState
          icon={<Layers className="w-6 h-6" />}
          title="No bundles published yet"
          description="Builders with two or more verified projects can group them into a single portfolio listing."
          action={
            <Button asChild>
              <Link href="/projects">Browse individual projects</Link>
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {bundles.map((bundle) => (
            <BundleCard key={bundle.id} bundle={bundle} />
          ))}
        </div>
      )}
    </Container>
  );
}

function BundleCard({
  bundle,
  className,
}: {
  bundle: ProjectBundle;
  className?: string;
}) {
  const savingPct =
    bundle.combined_list_price_paise > 0
      ? Math.round((bundle.savings_paise * 100) / bundle.combined_list_price_paise)
      : 0;

  return (
    <Link
      href={`/bundles/${bundle.slug}`}
      className={cn(
        "rounded-xl border bg-card overflow-hidden block transition-colors",
        "hover:border-border-strong",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
        className,
      )}
    >
      <div className="px-5 pt-5 pb-4 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1.5">
            <Package className="w-3.5 h-3.5 text-primary flex-shrink-0" />
            <Badge variant="brand" size="sm">
              {bundle.items.length} projects
            </Badge>
          </div>
          <h2 className="font-semibold leading-snug">{bundle.title}</h2>
          {bundle.owner_name && (
            <p className="text-xs text-muted-foreground mt-1">by {bundle.owner_name}</p>
          )}
        </div>
        {bundle.average_score != null && (
          <div className="flex-shrink-0 text-center">
            <ScoreRing score={bundle.average_score} size="sm" animate={false} />
            <p className="text-[10px] text-muted-foreground mt-1">avg score</p>
          </div>
        )}
      </div>

      {bundle.description && (
        <p className="px-5 pb-4 text-sm text-muted-foreground leading-relaxed line-clamp-3">
          {bundle.description}
        </p>
      )}

      <ul className="px-5 pb-4 space-y-1.5">
        {bundle.items.slice(0, 4).map((item) => (
          <li key={item.project_id} className="flex items-center gap-2 text-xs">
            <span className="flex-1 truncate">{item.title ?? "Project"}</span>
            {item.primary_language && (
              <span className="text-muted-foreground flex-shrink-0">
                {item.primary_language}
              </span>
            )}
            {item.verified_build_score != null && (
              <span className="tabular-nums font-medium flex-shrink-0 w-6 text-right">
                {item.verified_build_score}
              </span>
            )}
          </li>
        ))}
      </ul>

      <div className="px-5 py-3 border-t flex items-center justify-between gap-3 flex-wrap">
        <div>
          <p className="text-lg font-semibold tabular-nums">{inr(bundle.price_paise)}</p>
          {bundle.savings_paise > 0 && (
            <p className="text-xs text-muted-foreground">
              <span className="line-through">
                {inr(bundle.combined_list_price_paise)}
              </span>{" "}
              separately
            </p>
          )}
        </div>
        {savingPct > 0 && (
          <Badge variant="success" size="sm">
            <TrendingDown className="w-3 h-3" /> Save {savingPct}%
          </Badge>
        )}
      </div>
    </Link>
  );
}
