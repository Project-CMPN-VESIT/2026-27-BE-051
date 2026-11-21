"use client";
import { use } from "react";
import Link from "next/link";
import {
  ArrowLeft, ArrowRight, Layers, Package, ShieldCheck, TrendingDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, EmptyState } from "@/components/ui/primitives";
import { Container } from "@/components/ui/layout";
import { LoadingRegion, Skeleton } from "@/components/ui/skeleton";
import { ScoreRing } from "@/components/trust/score-ring";
import { BuildScoreChip } from "@/components/trust/trust-badges";
import { useBundle } from "@/lib/hooks/advanced";
import { cn } from "@/lib/utils";

function inr(paise: number | null | undefined) {
  if (paise == null) return "—";
  return `₹${(paise / 100).toLocaleString("en-IN")}`;
}

export default function BundleDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  const { data: bundle, isLoading, isError } = useBundle(slug);

  if (isLoading) {
    return (
      <Container className="py-10 max-w-3xl">
        <LoadingRegion label="Loading bundle" className="space-y-4">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-32 w-full rounded-xl" />
          <Skeleton className="h-64 w-full rounded-xl" />
        </LoadingRegion>
      </Container>
    );
  }

  if (isError || !bundle) {
    return (
      <Container className="py-20 max-w-lg">
        <EmptyState
          icon={<Layers className="w-6 h-6" />}
          title="Bundle not found"
          description="This bundle may have been unpublished or removed."
          action={
            <Button asChild>
              <Link href="/bundles">Browse bundles</Link>
            </Button>
          }
        />
      </Container>
    );
  }

  const savingPct =
    bundle.combined_list_price_paise > 0
      ? Math.round((bundle.savings_paise * 100) / bundle.combined_list_price_paise)
      : 0;
  const verifiedCount = bundle.items.filter((i) => i.is_verified).length;

  return (
    <Container className="py-8 sm:py-10 max-w-3xl">
      <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
        <Link href="/bundles">
          <ArrowLeft className="w-3.5 h-3.5" /> All bundles
        </Link>
      </Button>

      <div className="flex items-start justify-between gap-5 flex-wrap mb-6">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-2">
            <Package className="w-4 h-4 text-primary" />
            <Badge variant="brand" size="sm">{bundle.items.length} projects</Badge>
            {!bundle.is_published && (
              <Badge variant="warning" size="sm">Draft — only you can see this</Badge>
            )}
          </div>
          <h1 className="text-display-sm">{bundle.title}</h1>
          {bundle.owner_name && (
            <p className="text-sm text-muted-foreground mt-1">
              by{" "}
              <Link
                href={`/u/${bundle.owner_id}`}
                className="font-medium text-foreground hover:text-primary transition-colors"
              >
                {bundle.owner_name}
              </Link>
            </p>
          )}
        </div>
        {bundle.average_score != null && (
          <div className="text-center flex-shrink-0">
            <ScoreRing score={bundle.average_score} size="lg" />
            <p className="text-xs text-muted-foreground mt-1.5">
              Average across
              <br />
              {bundle.items.length} projects
            </p>
          </div>
        )}
      </div>

      {bundle.description && (
        <p className="text-base text-muted-foreground leading-relaxed mb-6 max-w-prose">
          {bundle.description}
        </p>
      )}

      {/* Price block */}
      <div className="rounded-xl border bg-card p-5 mb-6">
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div>
            <p className="text-xs text-muted-foreground">Bundle price</p>
            <p className="text-3xl font-semibold tabular-nums">
              {inr(bundle.price_paise)}
            </p>
            {bundle.savings_paise > 0 && (
              <p className="text-sm text-muted-foreground mt-1">
                Bought separately:{" "}
                <span className="line-through">
                  {inr(bundle.combined_list_price_paise)}
                </span>
              </p>
            )}
          </div>
          {savingPct > 0 && (
            <div className="text-right">
              <Badge variant="success">
                <TrendingDown className="w-3.5 h-3.5" /> Save {inr(bundle.savings_paise)}
              </Badge>
              <p className="text-xs text-muted-foreground mt-1.5">
                {savingPct}% below the sum of the parts
              </p>
            </div>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-4 leading-relaxed border-t pt-3">
          A bundle can never be priced above the total of its member listings —
          the platform rejects that, so the saving shown here is arithmetic rather
          than marketing. Each project can still be bought on its own.
        </p>
      </div>

      {/* Members */}
      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <h2 className="font-semibold text-sm">What&apos;s included</h2>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <ShieldCheck className="w-3.5 h-3.5 text-text-success" />
          {verifiedCount} of {bundle.items.length} verified
        </div>
      </div>

      <div className="space-y-3">
        {bundle.items.map((item) => (
          <Link
            key={item.project_id}
            href={`/projects/${item.project_id}`}
            className={cn(
              "rounded-xl border bg-card p-4 flex items-start justify-between gap-4 block",
              "hover:border-border-strong transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
            )}
          >
            <div className="min-w-0">
              <h3 className="font-medium text-sm">{item.title ?? "Project"}</h3>
              {item.repo_full_name && (
                <p className="text-xs font-mono text-muted-foreground mt-0.5 truncate">
                  {item.repo_full_name}
                </p>
              )}
              {item.note && (
                <p className="text-xs text-muted-foreground mt-1.5">{item.note}</p>
              )}
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                {item.primary_language && (
                  <Badge variant="ghost" size="sm">{item.primary_language}</Badge>
                )}
                {item.price_paise != null && (
                  <span className="text-xs text-muted-foreground">
                    {inr(item.price_paise)} on its own
                  </span>
                )}
              </div>
            </div>
            <div className="flex flex-col items-end gap-2 flex-shrink-0">
              <BuildScoreChip
                score={item.verified_build_score}
                verified={item.is_verified}
              />
              <ArrowRight className="w-4 h-4 text-muted-foreground" />
            </div>
          </Link>
        ))}
      </div>

      {bundle.items.length >= 2 && (
        <div className="mt-6">
          <Button variant="outline" asChild>
            <Link
              href={`/compare?${bundle.items
                .slice(0, 3)
                .map((i) => `id=${i.project_id}`)
                .join("&")}`}
            >
              Compare these projects side by side
            </Link>
          </Button>
        </div>
      )}
    </Container>
  );
}
