"use client";
import Link from "next/link";
import { Wallet, TrendingUp, Receipt, IndianRupee, ArrowRight, ShieldCheck, AlertCircle, ShoppingBag, CheckCircle2, Clock } from "lucide-react";
import { Badge } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useSellerEarnings, useSettlements } from "@/lib/hooks";
import { useMySplits } from "@/lib/hooks/advanced";
import { SplitEarnings } from "@/components/teams/team-panel";
import { PageHeader } from "@/components/ui/layout";

function inr(paise: number): string {
  return "\u20B9" + (paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

export default function EarningsPage() {
  const { data, isLoading } = useSellerEarnings();
  const { data: settlements } = useSettlements();
  const { data: splits, isLoading: splitsLoading } = useMySplits();

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-lg" />)}
        </div>
        <Skeleton className="h-64 w-full rounded-lg" />
      </div>
    );
  }

  const e = data;
  const hasSales = (e?.total_sales ?? 0) > 0;

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-6">
      <PageHeader
        eyebrow="Marketplace"
        title="Earnings"
        icon={<Wallet />}
        description="Your sales, the platform fee deducted, and what you take home."
        actions={
          <Button variant="outline" size="sm" asChild>
            <Link href="/settings">Payout settings <ArrowRight className="w-3.5 h-3.5" /></Link>
          </Button>
        }
      />

      {/* Payout status banner */}
      {!e?.payout_configured ? (
        <div className="rounded-xl border border-border-warning bg-background-warning/50 p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-text-warning flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-medium">Add your payout details to get paid</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              We can only settle your earnings once you&apos;ve added a UPI ID or bank account.
            </p>
          </div>
          <Button size="sm" asChild><Link href="/settings">Add payout</Link></Button>
        </div>
      ) : !e?.payout_verified ? (
        <div className="rounded-xl border border-primary/30 bg-primary/[0.06] p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium">Payout details under review</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Your payout details are saved and awaiting verification. Settlements begin once verified.
            </p>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-border-success bg-background-success/50 p-4 flex items-center gap-3">
          <ShieldCheck className="w-5 h-5 text-text-success flex-shrink-0" />
          <p className="text-sm font-medium">Payout details verified — you&apos;re ready to receive settlements.</p>
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { icon: <ShoppingBag className="w-4 h-4" />, label: "Sales", value: (e?.total_sales ?? 0).toString() },
          { icon: <TrendingUp className="w-4 h-4" />, label: "Gross", value: inr(e?.gross_paise ?? 0) },
          { icon: <Receipt className="w-4 h-4" />, label: "Platform fees", value: inr(e?.platform_fee_paise ?? 0) },
          { icon: <IndianRupee className="w-4 h-4" />, label: "Your net", value: inr(e?.net_paise ?? 0), highlight: true },
        ].map((c) => (
          <div
            key={c.label}
            className={
              "rounded-xl border p-4 " +
              (c.highlight ? "border-primary/40 bg-primary/5" : "bg-card")
            }
          >
            <div className={"flex items-center gap-1.5 text-xs " + (c.highlight ? "text-primary" : "text-muted-foreground")}>
              {c.icon} {c.label}
            </div>
            <div className={"mt-1 font-bold " + (c.highlight ? "text-2xl text-primary" : "text-2xl")}>{c.value}</div>
          </div>
        ))}
      </div>

      {/* Settlement summary */}
      {hasSales && (
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="rounded-xl border bg-card p-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-text-success" /> Settled
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">Already paid out to you.</p>
            </div>
            <span className="text-xl font-bold text-text-success">{inr(e?.settled_paise ?? 0)}</span>
          </div>
          <div className="rounded-xl border bg-card p-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-text-warning" /> Awaiting settlement
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">To be paid to your verified account.</p>
            </div>
            <span className="text-xl font-bold">{inr(e?.pending_payout_paise ?? 0)}</span>
          </div>
        </div>
      )}

      {/* Sales table */}
      <div className="rounded-xl border bg-card">
        <div className="px-5 py-3 border-b">
          <h2 className="font-semibold text-sm">Sales history</h2>
        </div>
        {!hasSales ? (
          <div className="p-10 text-center">
            <ShoppingBag className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm font-medium mb-1">No sales yet</p>
            <p className="text-sm text-muted-foreground mb-4">
              List a project for sale and your completed purchases will show up here.
            </p>
            <Button size="sm" variant="outline" asChild><Link href="/projects/mine">Your projects</Link></Button>
          </div>
        ) : (
          <div className="divide-y">
            {e!.sales.map((s) => (
              <div key={s.payment_id} className="px-5 py-3 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  {s.project_id ? (
                    <Link href={`/projects/${s.project_id}`} className="text-sm font-medium hover:text-primary transition-colors truncate block">
                      {s.project_title}
                    </Link>
                  ) : (
                    <span className="text-sm font-medium truncate block">{s.project_title}</span>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {s.buyer_name} · {new Date(s.created_at).toLocaleDateString("en-IN")}
                  </p>
                </div>
                <div className="text-right flex-shrink-0">
                  <div className="text-sm font-semibold">{inr(s.seller_net_paise)}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {inr(s.amount_paise)} − {inr(s.platform_fee_paise)} fee
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Co-owner shares. Self-hides when the user isn't on any team project. */}
      <SplitEarnings earnings={splits} isLoading={splitsLoading} />

      {/* Settlement history */}
      {settlements && settlements.length > 0 && (
        <div className="rounded-xl border bg-card">
          <div className="px-5 py-3 border-b">
            <h2 className="font-semibold text-sm">Settlement history</h2>
          </div>
          <div className="divide-y">
            {settlements.map((s) => (
              <div key={s.id} className="px-5 py-3 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Badge variant="ghost" className="text-[10px] uppercase">{s.method}</Badge>
                    <span className="text-xs text-muted-foreground">
                      {new Date(s.created_at).toLocaleDateString("en-IN")}
                    </span>
                  </div>
                  {(s.reference || s.note) && (
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">
                      {s.reference ? `Ref ${s.reference}` : ""}{s.reference && s.note ? " · " : ""}{s.note ?? ""}
                    </p>
                  )}
                </div>
                <div className="text-right flex-shrink-0">
                  <div className="text-sm font-semibold text-text-success">{inr(s.amount_paise)}</div>
                  <div className="text-[11px] text-muted-foreground capitalize">{s.status}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
