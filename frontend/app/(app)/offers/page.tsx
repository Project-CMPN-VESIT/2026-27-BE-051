"use client";
import { useState } from "react";
import Link from "next/link";
import { Gavel, Inbox, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, EmptyState } from "@/components/ui/primitives";
import { Container, PageHeader } from "@/components/ui/layout";
import { Skeleton } from "@/components/ui/skeleton";
import { OfferListRow, OfferThread } from "@/components/deals/offer-panel";
import { useMyOffers, useReceivedOffers } from "@/lib/hooks/advanced";
import { cn } from "@/lib/utils";

const OPEN = ["pending", "countered"];

/**
 * Both sides of price negotiation in one place.
 *
 * Tabs rather than two pages because most users are both: a builder selling one
 * project is often buying another, and making them navigate between two screens
 * to find out whose turn it is would be the wrong shape.
 */
export default function OffersPage() {
  const [tab, setTab] = useState<"received" | "sent">("received");
  const { data: received, isLoading: receivedLoading } = useReceivedOffers();
  const { data: sent, isLoading: sentLoading } = useMyOffers();

  const needsMeAsSeller = (received ?? []).filter(
    (o) => OPEN.includes(o.status) && o.awaiting === "seller",
  ).length;
  const needsMeAsBuyer = (sent ?? []).filter(
    (o) => OPEN.includes(o.status) && o.awaiting === "buyer",
  ).length;

  return (
    <Container className="py-8 sm:py-10 max-w-3xl">
      <PageHeader
        title="Offers"
        description="Buyers can offer below your asking price, and you can counter. Nothing is charged until a price is agreed and the buyer completes checkout."
      />

      <div className="flex gap-1 mb-6 border-b" role="tablist">
        <TabButton
          active={tab === "received"}
          onClick={() => setTab("received")}
          icon={<Inbox className="w-3.5 h-3.5" />}
          label="On your listings"
          count={received?.length}
          badge={needsMeAsSeller}
        />
        <TabButton
          active={tab === "sent"}
          onClick={() => setTab("sent")}
          icon={<Send className="w-3.5 h-3.5" />}
          label="Offers you've made"
          count={sent?.length}
          badge={needsMeAsBuyer}
        />
      </div>

      {tab === "received" ? (
        <SellerOffers offers={received} isLoading={receivedLoading} />
      ) : (
        <BuyerOffers offers={sent} isLoading={sentLoading} />
      )}
    </Container>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
  count,
  badge,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  count?: number;
  badge?: number;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
        "inline-flex items-center gap-2",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded-t",
        active
          ? "border-primary text-foreground"
          : "border-transparent text-muted-foreground hover:text-foreground",
      )}
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
      <span className="sm:hidden">{label.split(" ")[0]}</span>
      {count != null && count > 0 && (
        <span className="text-xs text-muted-foreground tabular-nums">({count})</span>
      )}
      {badge != null && badge > 0 && (
        <Badge variant="warning" size="sm">{badge}</Badge>
      )}
    </button>
  );
}

function SellerOffers({
  offers,
  isLoading,
}: {
  offers: ReturnType<typeof useReceivedOffers>["data"];
  isLoading: boolean;
}) {
  if (isLoading) return <Skeleton className="h-48 w-full rounded-xl" />;
  if (!offers || offers.length === 0) {
    return (
      <EmptyState
        icon={<Gavel className="w-6 h-6" />}
        title="No offers on your listings yet"
        description="Once a project is listed for sale, buyers can make an offer below your asking price. You'll be able to accept, counter or decline from here."
        action={
          <Button asChild>
            <Link href="/dashboard">Your projects</Link>
          </Button>
        }
      />
    );
  }

  const byProject = new Map<string, typeof offers>();
  for (const offer of offers) {
    const list = byProject.get(offer.project_id) ?? [];
    list.push(offer);
    byProject.set(offer.project_id, list);
  }

  return (
    <div className="space-y-5">
      {[...byProject.entries()].map(([projectId, group]) => (
        <div key={projectId} className="rounded-xl border bg-card overflow-hidden">
          <div className="px-4 py-3 border-b flex items-center justify-between gap-3 flex-wrap">
            <Link
              href={`/projects/${projectId}#offers`}
              className="font-medium text-sm hover:text-primary transition-colors"
            >
              {group[0].project_title ?? "Project"}
            </Link>
            <div className="flex items-center gap-1.5">
              <Badge variant="ghost" size="sm">{group.length} offer{group.length === 1 ? "" : "s"}</Badge>
              <Button size="sm" variant="outline" className="h-7 text-xs" asChild>
                <Link href={`/projects/${projectId}#offers`}>Manage</Link>
              </Button>
            </div>
          </div>
          <ul className="divide-y">
            {group.map((offer) => (
              <li key={offer.id} className="px-4 py-3">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <p className="text-sm font-semibold tabular-nums">
                      ₹{(offer.current_offer_paise / 100).toLocaleString("en-IN")}
                      <span className="text-xs font-normal text-muted-foreground ml-1.5">
                        of ₹{(offer.list_price_paise / 100).toLocaleString("en-IN")} asking
                      </span>
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {offer.buyer_name ?? "A buyer"}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Badge
                      variant={
                        offer.status === "accepted"
                          ? "success"
                          : OPEN.includes(offer.status)
                            ? "warning"
                            : "ghost"
                      }
                      size="sm"
                    >
                      {offer.status}
                    </Badge>
                    {OPEN.includes(offer.status) && offer.awaiting === "seller" && (
                      <Badge variant="warning" size="sm">Your move</Badge>
                    )}
                  </div>
                </div>
                {offer.rounds.length > 1 && <OfferThread offer={offer} className="mt-2.5" />}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function BuyerOffers({
  offers,
  isLoading,
}: {
  offers: ReturnType<typeof useMyOffers>["data"];
  isLoading: boolean;
}) {
  if (isLoading) return <Skeleton className="h-48 w-full rounded-xl" />;
  if (!offers || offers.length === 0) {
    return (
      <EmptyState
        icon={<Send className="w-6 h-6" />}
        title="You haven't made any offers"
        description="On any project listed for sale you can offer below the asking price rather than paying it. Sellers can accept, counter or decline."
        action={
          <Button asChild>
            <Link href="/projects?for_sale=true">Browse projects for sale</Link>
          </Button>
        }
      />
    );
  }

  return (
    <div className="rounded-xl border bg-card divide-y">
      {offers.map((offer) => (
        <OfferListRow key={offer.id} offer={offer} />
      ))}
    </div>
  );
}
