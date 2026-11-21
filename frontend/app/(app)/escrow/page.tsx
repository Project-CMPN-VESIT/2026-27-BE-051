"use client";
import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, ShieldCheck, ArrowRight, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, Card } from "@/components/ui/primitives";
import { Skeleton } from "@/components/ui/skeleton";
import { useEscrowContracts, useMe } from "@/lib/hooks";
import { contractStatusVariant, humanize, rupees } from "@/lib/escrow";
import { useAuthStore } from "@/stores/auth";
import { cn } from "@/lib/utils";

export default function EscrowListPage() {
  const router = useRouter();
  const token = useAuthStore((s) => s.accessToken);
  const { data: me } = useMe();
  const { data: contracts, isLoading } = useEscrowContracts();

  useEffect(() => {
    if (!token) router.replace("/auth/login");
  }, [token, router]);
  if (!token) return null;

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-display-md flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-text-success" /> Escrow
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Milestone-based payments held safely until work is approved.
          </p>
        </div>
        <Button asChild className="gap-2">
          <Link href="/escrow/new"><Plus className="w-4 h-4" /> New contract</Link>
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 w-full rounded-lg" />)}
        </div>
      ) : !contracts?.length ? (
        <Card className="border-dashed p-10 text-center">
          <div className="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center mx-auto mb-3">
            <Wallet className="w-5 h-5 text-muted-foreground" />
          </div>
          <h3 className="font-medium mb-1">No contracts yet</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Start a milestone contract to hire a builder or get hired safely.
          </p>
          <Button asChild><Link href="/escrow/new">Create your first contract</Link></Button>
        </Card>
      ) : (
        <div className="space-y-2">
          {contracts.map((c) => {
            const role = me?.id === c.client_id ? "Client" : "Builder";
            const released = c.milestones.filter((m) => m.status === "released").length;
            return (
              <Link key={c.id} href={`/escrow/${c.id}`}
                className="flex items-center justify-between gap-3 p-4 rounded-xl border bg-card hover:border-primary/40 transition-all group">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="font-medium text-sm truncate group-hover:text-primary transition-colors">{c.title}</span>
                    <Badge variant={contractStatusVariant[c.status]} className="text-[10px]">{humanize(c.status)}</Badge>
                    <Badge variant="ghost" className="text-[10px]">{role}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {released}/{c.milestones.length} milestones released
                  </p>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <span className={cn("text-sm font-semibold tabular-nums")}>{rupees(c.total_amount_paise)}</span>
                  <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
