"use client";
import { use } from "react";
import Link from "next/link";
import { ArrowLeft, ExternalLink, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/primitives";
import { Container } from "@/components/ui/layout";
import { LoadingRegion, Skeleton } from "@/components/ui/skeleton";
import { HealthTrendCard } from "@/components/trust/health-monitor";
import { TrustReceiptCard } from "@/components/trust/trust-receipt";
import { usePurchaseHealth, useTrustReceipt } from "@/lib/hooks/advanced";

/**
 * One purchased project: its trust receipt and its health since the sale.
 *
 * Pairing them on one page is deliberate — the receipt says what was promised,
 * the trend says what happened next. Read together they're either reassuring or
 * actionable, and separately they're just two numbers.
 */
export default function PurchaseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { data: trend, isLoading, isError } = usePurchaseHealth(id);
  const { data: receipt } = useTrustReceipt(trend?.receipt_id ?? null);

  if (isLoading) {
    return (
      <Container className="py-10 max-w-3xl">
        <LoadingRegion label="Loading purchase" className="space-y-4">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-56 w-full rounded-xl" />
          <Skeleton className="h-40 w-full rounded-xl" />
        </LoadingRegion>
      </Container>
    );
  }

  if (isError || !trend) {
    return (
      <Container className="py-20 max-w-lg">
        <EmptyState
          icon={<ShieldAlert className="w-6 h-6" />}
          title="Not one of your purchases"
          description="This page shows health monitoring for projects you've bought. If you did buy this project, the monitor may not have been set up — contact support with your trust receipt code."
          action={
            <Button asChild>
              <Link href="/purchases">Back to your purchases</Link>
            </Button>
          }
        />
      </Container>
    );
  }

  return (
    <Container className="py-8 sm:py-10 max-w-3xl space-y-6">
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-1">
          <Link href="/purchases">
            <ArrowLeft className="w-3.5 h-3.5" /> Your purchases
          </Link>
        </Button>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <h1 className="text-display-sm">{trend.project_title ?? "Purchased project"}</h1>
          <Button variant="outline" size="sm" asChild>
            <Link href={`/projects/${id}`}>
              <ExternalLink className="w-3.5 h-3.5" /> Project page
            </Link>
          </Button>
        </div>
      </div>

      <HealthTrendCard trend={trend} showLink={false} />

      {receipt && <TrustReceiptCard receipt={receipt} />}

      <div className="rounded-xl border bg-surface/50 p-4">
        <h2 className="text-sm font-semibold mb-1.5">If something isn&apos;t right</h2>
        <p className="text-xs text-muted-foreground leading-relaxed">
          The trust receipt above is the record of what was disclosed to you when
          you paid. If the project materially differs from it, cite the receipt
          code{" "}
          {receipt?.receipt_code && (
            <span className="font-mono font-medium text-foreground">
              {receipt.receipt_code}
            </span>
          )}{" "}
          when you raise it — that&apos;s the evidence a reviewer works from, and it
          cannot be edited by either party.
        </p>
        <div className="flex gap-2 mt-3 flex-wrap">
          <Button size="sm" variant="outline" asChild>
            <Link href="/messages">Message the seller</Link>
          </Button>
          <Button size="sm" variant="ghost" asChild>
            <Link href="/escrow">Open a dispute via escrow</Link>
          </Button>
        </div>
      </div>
    </Container>
  );
}
