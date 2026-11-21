"use client";
import Link from "next/link";
import { Activity, FileCheck2, ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/primitives";
import { Container, PageHeader } from "@/components/ui/layout";
import { Skeleton } from "@/components/ui/skeleton";
import { PurchaseHealthList } from "@/components/trust/health-monitor";
import { TrustReceiptChip } from "@/components/trust/trust-receipt";
import { useMyPurchases, useMyReceipts } from "@/lib/hooks/advanced";

/**
 * The buyer's post-purchase view: what they bought, and whether it's still alive.
 *
 * This page is the argument for the whole platform. Anyone can sell a snapshot
 * score; continuing to measure the thing after the money moved is what makes the
 * trust claim worth anything.
 */
export default function PurchasesPage() {
  const { data: trends, isLoading } = useMyPurchases();
  const { data: receipts, isLoading: receiptsLoading } = useMyReceipts();

  const declining = (trends ?? []).filter((t) => t.direction === "down").length;

  return (
    <Container className="py-8 sm:py-10 max-w-4xl">
      <PageHeader
        title="Your purchases"
        description="CodeBazaar keeps re-scoring every project you buy, so you find out when one stops being maintained instead of discovering it yourself six months later."
      />

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-8">
        <Stat
          label="Monitored"
          value={trends?.length ?? 0}
          icon={<Activity className="w-4 h-4" />}
          loading={isLoading}
        />
        <Stat
          label="Declining"
          value={declining}
          icon={<Activity className="w-4 h-4" />}
          loading={isLoading}
          alert={declining > 0}
        />
        <Stat
          label="Trust receipts"
          value={receipts?.length ?? 0}
          icon={<FileCheck2 className="w-4 h-4" />}
          loading={receiptsLoading}
        />
      </div>

      <section aria-labelledby="health-heading" className="mb-10">
        <h2 id="health-heading" className="text-sm font-semibold mb-3">
          Code health since purchase
        </h2>
        <PurchaseHealthList trends={trends} isLoading={isLoading} />
      </section>

      {(receipts?.length ?? 0) > 0 && (
        <section aria-labelledby="receipts-heading">
          <h2 id="receipts-heading" className="text-sm font-semibold mb-1">
            Trust receipts
          </h2>
          <p className="text-xs text-muted-foreground mb-3 leading-relaxed max-w-prose">
            Each receipt is an immutable record of the verification state at the
            moment you paid. Quote its code if you ever need to open a dispute —
            it&apos;s the evidence the platform reviews.
          </p>
          <div className="rounded-xl border bg-card divide-y">
            {receipts!.map((receipt) => (
              <div
                key={receipt.id}
                className="px-4 py-3 flex items-center justify-between gap-3 flex-wrap"
              >
                <div className="min-w-0">
                  <Link
                    href={`/projects/${receipt.project_id}`}
                    className="text-sm font-medium hover:text-primary transition-colors"
                  >
                    {receipt.project_title ?? "Project"}
                  </Link>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    ₹{(receipt.amount_paise / 100).toLocaleString("en-IN")} ·{" "}
                    {new Date(receipt.issued_at).toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {receipt.was_verified && (
                    <Badge variant="success" size="sm">Verified at purchase</Badge>
                  )}
                  <TrustReceiptChip
                    receipt={receipt}
                    href={`/purchases/${receipt.project_id}`}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </Container>
  );
}

function Stat({
  label,
  value,
  icon,
  loading,
  alert,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  loading?: boolean;
  alert?: boolean;
}) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
        {icon}
        {label}
      </div>
      {loading ? (
        <Skeleton className="h-7 w-10 mt-1.5" />
      ) : (
        <p
          className={
            "text-2xl font-semibold tabular-nums mt-1 " +
            (alert ? "text-destructive" : "")
          }
        >
          {value}
        </p>
      )}
    </div>
  );
}
