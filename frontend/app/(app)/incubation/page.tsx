"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Rocket, Star, ShieldCheck, ArrowRight, Inbox, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardContent, CardHeader, CardTitle, Input } from "@/components/ui/primitives";
import { Skeleton } from "@/components/ui/skeleton";
import { TierBadge } from "@/components/reputation/reputation-panel";
import { useIncubationDiscover, useReceivedOffers, useSentOffers, useRespondOffer, useWithdrawOffer } from "@/lib/hooks";
import type { IncubationOffer, OfferStatus } from "@/types";
import { useAuthStore } from "@/stores/auth";

const STATUS_VARIANT: Record<OfferStatus, "warning" | "success" | "destructive" | "ghost"> = {
  pending: "warning", accepted: "success", declined: "destructive", withdrawn: "ghost",
};

function rupees(paise: number) {
  return "\u20b9" + (paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

function OfferTerms({ o }: { o: IncubationOffer }) {
  if (o.amount_paise == null && o.equity_percent == null) return null;
  return (
    <span className="text-xs text-muted-foreground">
      {o.amount_paise != null && <b className="text-foreground">{rupees(o.amount_paise)}</b>}
      {o.amount_paise != null && o.equity_percent != null && " for "}
      {o.equity_percent != null && <b className="text-foreground">{o.equity_percent}%</b>}
    </span>
  );
}

export default function IncubationPage() {
  const router = useRouter();
  const token = useAuthStore((s) => s.accessToken);
  const { data: discover, isLoading: dLoading } = useIncubationDiscover();
  const { data: received } = useReceivedOffers();
  const { data: sent } = useSentOffers();
  const respond = useRespondOffer();
  const withdraw = useWithdrawOffer();
  const [notes, setNotes] = useState<Record<string, string>>({});

  useEffect(() => { if (!token) router.replace("/auth/login"); }, [token, router]);
  if (!token) return null;

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-10">
      <div>
        <h1 className="text-display-md flex items-center gap-2"><Rocket className="w-6 h-6 text-primary" /> Incubation</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Discover verified builders, make offers, and manage deals.</p>
      </div>

      {/* Received */}
      {received && received.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-semibold flex items-center gap-2"><Inbox className="w-4 h-4" /> Offers received</h2>
          {received.map((o) => (
            <Card key={o.id}>
              <CardContent className="p-4 space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm">{o.title}</span>
                    <Badge variant="ghost" className="text-[10px] capitalize">{o.offer_type}</Badge>
                    <Badge variant={STATUS_VARIANT[o.status]} className="text-[10px] capitalize">{o.status}</Badge>
                  </div>
                  <OfferTerms o={o} />
                </div>
                <p className="text-sm text-muted-foreground">{o.message}</p>
                {o.status === "pending" && (
                  <div className="space-y-2 pt-1">
                    <Input placeholder="Response note (optional)" value={notes[o.id] ?? ""}
                      onChange={(e) => setNotes((n) => ({ ...n, [o.id]: e.target.value }))} />
                    <div className="flex gap-2">
                      <Button size="sm" className="h-7 text-xs" loading={respond.isPending}
                        onClick={() => respond.mutate({ offerId: o.id, accept: true, note: notes[o.id] })}>Accept</Button>
                      <Button size="sm" variant="ghost" className="h-7 text-xs" loading={respond.isPending}
                        onClick={() => respond.mutate({ offerId: o.id, accept: false, note: notes[o.id] })}>Decline</Button>
                    </div>
                  </div>
                )}
                {o.response_note && <p className="text-xs text-muted-foreground italic">Note: {o.response_note}</p>}
              </CardContent>
            </Card>
          ))}
        </section>
      )}

      {/* Sent */}
      {sent && sent.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-semibold flex items-center gap-2"><Send className="w-4 h-4" /> Offers sent</h2>
          {sent.map((o) => (
            <Card key={o.id}>
              <CardContent className="p-4 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm">{o.title}</span>
                    <Badge variant="ghost" className="text-[10px] capitalize">{o.offer_type}</Badge>
                    <Badge variant={STATUS_VARIANT[o.status]} className="text-[10px] capitalize">{o.status}</Badge>
                  </div>
                  <div className="mt-0.5"><OfferTerms o={o} /></div>
                </div>
                {o.status === "pending" && (
                  <Button size="sm" variant="ghost" className="h-7 text-xs flex-shrink-0"
                    loading={withdraw.isPending} onClick={() => withdraw.mutate(o.id)}>Withdraw</Button>
                )}
              </CardContent>
            </Card>
          ))}
        </section>
      )}

      {/* Discover */}
      <section className="space-y-3">
        <h2 className="font-semibold">Verified projects to back</h2>
        {dLoading ? (
          <div className="grid sm:grid-cols-2 gap-3">{[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-28 rounded-lg" />)}</div>
        ) : !discover?.length ? (
          <p className="text-sm text-muted-foreground">No verified projects yet.</p>
        ) : (
          <div className="grid sm:grid-cols-2 gap-3">
            {discover.map((d) => (
              <Link key={d.project_id} href={`/projects/${d.project_id}`}
                className="rounded-xl border bg-card p-4 hover:border-primary/40 transition-all group">
                <div className="flex items-start justify-between gap-2">
                  <span className="font-medium text-sm truncate group-hover:text-primary transition-colors">{d.title}</span>
                  {d.verified_build_score != null && (
                    <span className="flex items-center gap-1 text-xs font-semibold text-text-success flex-shrink-0">
                      <ShieldCheck className="w-3.5 h-3.5" />{d.verified_build_score}
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground truncate mt-0.5">{d.repo_full_name}</p>
                <div className="flex items-center justify-between mt-2">
                  <span className="text-xs text-muted-foreground">by {d.owner_name}</span>
                  <div className="flex items-center gap-2">
                    <TierBadge tier={d.owner_tier} />
                    <span className="flex items-center gap-0.5 text-xs text-muted-foreground"><Star className="w-3 h-3" />{d.stars}</span>
                  </div>
                </div>
                <span className="inline-flex items-center gap-1 text-xs text-primary mt-2 group-hover:gap-1.5 transition-all">
                  View &amp; make offer <ArrowRight className="w-3 h-3" />
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
