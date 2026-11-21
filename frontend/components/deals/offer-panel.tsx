"use client";
import { useState } from "react";
import Link from "next/link";
import {
  ArrowLeftRight, ArrowRight, Check, Clock, Gavel, HandCoins, Hourglass,
  MessageSquare, ShieldCheck, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, EmptyState, Input, Label, Textarea } from "@/components/ui/primitives";
import { Alert, FormError } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useAcceptOffer, useCounterOffer, useDeclineOffer, useMakeOffer,
  useMyOfferOn, useProjectOffers, useWithdrawPurchaseOffer,
} from "@/lib/hooks/advanced";
import { getErrorMessage } from "@/lib/api/client";
import { cn } from "@/lib/utils";
import type { OfferStatus, PurchaseOffer } from "@/types/advanced";

const MIN_FRACTION = 0.3;

const STATUS_META: Record<
  OfferStatus,
  { label: string; variant: "default" | "success" | "warning" | "ghost" | "destructive" | "info" }
> = {
  pending: { label: "Awaiting response", variant: "warning" },
  countered: { label: "Countered", variant: "info" },
  accepted: { label: "Accepted", variant: "success" },
  declined: { label: "Declined", variant: "ghost" },
  withdrawn: { label: "Withdrawn", variant: "ghost" },
  expired: { label: "Expired", variant: "ghost" },
  completed: { label: "Paid", variant: "success" },
};

const ACTION_ICON = {
  offer: HandCoins,
  counter: ArrowLeftRight,
  accept: Check,
  decline: X,
  withdraw: X,
} as const;

function rupees(paise: number | null | undefined) {
  if (paise == null) return "—";
  return `₹${(paise / 100).toLocaleString("en-IN")}`;
}

function discountPct(offer: number, list: number) {
  if (!list) return 0;
  return Math.round(100 - (offer * 100) / list);
}

const OPEN: OfferStatus[] = ["pending", "countered"];

/* ══════════════════════════════════════════════════════════════════════════ */
/* Buyer side                                                                 */
/* ══════════════════════════════════════════════════════════════════════════ */

/**
 * Buyer-facing negotiation box on a for-sale listing.
 *
 * Deliberately shows the *whole* negotiation, including the seller's counters,
 * so a buyer never has to guess whose turn it is. `awaiting` drives which
 * actions are available — offering into your own open offer is the single most
 * confusing thing a naive implementation allows.
 */
export function MakeOfferPanel({
  projectId,
  listPricePaise,
  isOwner,
  className,
}: {
  projectId: string;
  listPricePaise: number;
  isOwner: boolean;
  className?: string;
}) {
  const { data: offer, isLoading } = useMyOfferOn(projectId, !isOwner);
  const make = useMakeOffer(projectId);
  const counter = useCounterOffer(projectId);
  const accept = useAcceptOffer(projectId);
  const withdraw = useWithdrawPurchaseOffer(projectId);

  const [amount, setAmount] = useState("");
  const [message, setMessage] = useState("");
  const [open, setOpen] = useState(false);

  if (isOwner) return null;
  if (isLoading) return <Skeleton className={cn("h-32 w-full rounded-xl", className)} />;

  const floor = Math.ceil((listPricePaise * MIN_FRACTION) / 100);
  const listRupees = Math.floor(listPricePaise / 100);
  const isOpen = offer && OPEN.includes(offer.status);
  const myTurn = isOpen && offer!.awaiting === "buyer";
  const accepted = offer?.status === "accepted";

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const paise = Math.round(Number(amount) * 100);
    if (!Number.isFinite(paise) || paise <= 0) return;
    const payload = { amount_paise: paise, message: message.trim() || undefined };

    if (myTurn && offer) {
      counter.mutate(
        { offerId: offer.id, ...payload },
        { onSuccess: () => { setAmount(""); setMessage(""); setOpen(false); } },
      );
    } else {
      make.mutate(payload, {
        onSuccess: () => { setAmount(""); setMessage(""); setOpen(false); },
      });
    }
  };

  const pending = make.isPending || counter.isPending;
  const error = make.error || counter.error;

  return (
    <div className={cn("rounded-xl border bg-card overflow-hidden", className)}>
      <div className="px-4 sm:px-5 py-4">
        <div className="flex items-center gap-2 mb-1">
          <Gavel className="w-4 h-4 text-primary flex-shrink-0" />
          <h3 className="font-semibold text-sm">Make an offer</h3>
          {offer && (
            <Badge variant={STATUS_META[offer.status].variant} size="sm">
              {STATUS_META[offer.status].label}
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Asking price is {rupees(listPricePaise)}. Offers below{" "}
          {rupees(floor * 100)} aren&apos;t accepted on this listing — a lowball
          wastes both sides&apos; time.
        </p>
      </div>

      {/* Accepted: the buyer now needs to pay */}
      {accepted && offer && (
        <div className="px-4 sm:px-5 pb-4">
          <Alert
            variant="success"
            title={`Offer accepted at ${rupees(offer.agreed_price_paise)}`}
            description="Complete checkout to receive delivery details. Your agreed price is applied automatically — you won't be charged the list price."
          />
          <Button variant="cta" className="w-full mt-3" asChild>
            <Link href={`/projects/${projectId}/checkout?offer=${offer.id}`}>
              Pay {rupees(offer.agreed_price_paise)}
              <ArrowRight className="w-4 h-4" />
            </Link>
          </Button>
        </div>
      )}

      {/* Live negotiation */}
      {isOpen && offer && (
        <div className="px-4 sm:px-5 pb-4 space-y-3">
          <div className="rounded-lg border bg-surface/50 px-3 py-2.5 flex items-center justify-between gap-3 flex-wrap">
            <div>
              <p className="text-[11px] text-muted-foreground">On the table</p>
              <p className="text-lg font-semibold tabular-nums">
                {rupees(offer.current_offer_paise)}
                <span className="text-xs font-normal text-muted-foreground ml-1.5">
                  {discountPct(offer.current_offer_paise, offer.list_price_paise)}% below asking
                </span>
              </p>
            </div>
            <Badge variant={myTurn ? "warning" : "ghost"} size="sm">
              {myTurn ? "Your move" : "With the seller"}
            </Badge>
          </div>

          <OfferThread offer={offer} />

          {myTurn && (
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="cta"
                loading={accept.isPending}
                onClick={() => accept.mutate(offer.id)}
              >
                <Check className="w-3.5 h-3.5" /> Accept {rupees(offer.current_offer_paise)}
              </Button>
              <Button size="sm" variant="outline" onClick={() => setOpen((v) => !v)}>
                <ArrowLeftRight className="w-3.5 h-3.5" /> Counter
              </Button>
            </div>
          )}

          {!myTurn && (
            <Button
              size="sm"
              variant="ghost"
              loading={withdraw.isPending}
              onClick={() => withdraw.mutate(offer.id)}
            >
              Withdraw offer
            </Button>
          )}
          {accept.isError && <FormError message={getErrorMessage(accept.error)} />}
        </div>
      )}

      {/* Closed states get an explanation plus a way back in */}
      {offer && !isOpen && !accepted && (
        <div className="px-4 sm:px-5 pb-4 space-y-3">
          <Alert
            variant="neutral"
            title={`Your offer was ${offer.status}`}
            description={
              offer.seller_message ||
              (offer.status === "expired"
                ? "Nobody responded before it timed out. You can open a new negotiation."
                : "You can make a fresh offer if you'd still like to buy.")
            }
          />
          <OfferThread offer={offer} />
        </div>
      )}

      {/* Offer form */}
      {(!offer || (!isOpen && !accepted) || (myTurn && open)) && (
        <form onSubmit={submit} className="px-4 sm:px-5 pb-4 space-y-3 border-t pt-4">
          <div>
            <Label htmlFor="offer-amount">
              {myTurn ? "Your counter" : "Your offer"} (₹)
            </Label>
            <Input
              id="offer-amount"
              type="number"
              inputMode="numeric"
              min={floor}
              max={listRupees - 1}
              placeholder={String(Math.round(listRupees * 0.75))}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              Between ₹{floor.toLocaleString("en-IN")} and ₹
              {(listRupees - 1).toLocaleString("en-IN")}
            </p>
          </div>
          <div>
            <Label htmlFor="offer-message">Message (optional)</Label>
            <Textarea
              id="offer-message"
              rows={2}
              maxLength={1000}
              placeholder="Why this number, and what you'd need included."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
          </div>
          <FormError message={error ? getErrorMessage(error) : null} />
          <Button type="submit" className="w-full" loading={pending}>
            <HandCoins className="w-4 h-4" />
            {myTurn ? "Send counter" : "Send offer"}
          </Button>
        </form>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════ */
/* Seller side                                                                */
/* ══════════════════════════════════════════════════════════════════════════ */

/** Every offer on the seller's own listing, with accept/counter/decline. */
export function OffersOnListing({
  projectId,
  isOwner,
  className,
}: {
  projectId: string;
  isOwner: boolean;
  className?: string;
}) {
  const { data: offers, isLoading } = useProjectOffers(projectId, isOwner);

  if (!isOwner) return null;
  if (isLoading) return <Skeleton className={cn("h-40 w-full rounded-xl", className)} />;
  if (!offers || offers.length === 0) {
    return (
      <div className={cn("rounded-xl border bg-card p-5", className)} id="offers">
        <EmptyState
          icon={<Gavel className="w-6 h-6" />}
          title="No offers yet"
          description="Buyers can offer below your asking price. You'll be able to accept, counter or decline here."
        />
      </div>
    );
  }

  const open = offers.filter((o) => OPEN.includes(o.status));
  const closed = offers.filter((o) => !OPEN.includes(o.status));
  const best = open.reduce<PurchaseOffer | null>(
    (top, o) => (!top || o.current_offer_paise > top.current_offer_paise ? o : top),
    null,
  );

  return (
    <div className={cn("rounded-xl border bg-card overflow-hidden", className)} id="offers">
      <div className="px-4 sm:px-5 py-4 border-b">
        <div className="flex items-center gap-2 flex-wrap">
          <Gavel className="w-4 h-4 text-primary flex-shrink-0" />
          <h3 className="font-semibold text-sm">Offers on this listing</h3>
          <Badge variant="ghost" size="sm">{offers.length} total</Badge>
          {open.length > 0 && (
            <Badge variant="warning" size="sm">{open.length} needs a decision</Badge>
          )}
        </div>
        {best && (
          <p className="text-xs text-muted-foreground mt-1.5">
            Best open offer:{" "}
            <span className="font-semibold text-foreground tabular-nums">
              {rupees(best.current_offer_paise)}
            </span>{" "}
            ({discountPct(best.current_offer_paise, best.list_price_paise)}% below your
            asking price)
          </p>
        )}
      </div>

      <ul className="divide-y">
        {[...open, ...closed].map((offer) => (
          <li key={offer.id}>
            <SellerOfferRow offer={offer} projectId={projectId} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function SellerOfferRow({
  offer,
  projectId,
}: {
  offer: PurchaseOffer;
  projectId: string;
}) {
  const accept = useAcceptOffer(projectId);
  const counter = useCounterOffer(projectId);
  const decline = useDeclineOffer(projectId);

  const [mode, setMode] = useState<"none" | "counter" | "decline">("none");
  const [amount, setAmount] = useState("");
  const [message, setMessage] = useState("");

  const isOpen = OPEN.includes(offer.status);
  const myTurn = isOpen && offer.awaiting === "seller";
  const meta = STATUS_META[offer.status];

  const sendCounter = (e: React.FormEvent) => {
    e.preventDefault();
    const paise = Math.round(Number(amount) * 100);
    if (!Number.isFinite(paise) || paise <= 0) return;
    counter.mutate(
      { offerId: offer.id, amount_paise: paise, message: message.trim() || undefined },
      { onSuccess: () => { setMode("none"); setAmount(""); setMessage(""); } },
    );
  };

  return (
    <div className="px-4 sm:px-5 py-3.5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-base font-semibold tabular-nums">
              {rupees(offer.current_offer_paise)}
            </span>
            <span className="text-xs text-muted-foreground">
              {discountPct(offer.current_offer_paise, offer.list_price_paise)}% below asking
            </span>
            <Badge variant={meta.variant} size="sm">{meta.label}</Badge>
            {myTurn && <Badge variant="warning" size="sm">Your move</Badge>}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {offer.buyer_name ?? "A buyer"} ·{" "}
            {new Date(offer.created_at).toLocaleDateString("en-IN", {
              day: "numeric",
              month: "short",
            })}
            {offer.rounds.length > 1 && ` · ${offer.rounds.length} rounds`}
          </p>
        </div>

        {myTurn && mode === "none" && (
          <div className="flex flex-wrap gap-1.5 flex-shrink-0">
            <Button
              size="sm"
              variant="cta"
              className="h-7 text-xs"
              loading={accept.isPending}
              onClick={() => accept.mutate(offer.id)}
            >
              <Check className="w-3 h-3" /> Accept
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={() => setMode("counter")}
            >
              <ArrowLeftRight className="w-3 h-3" /> Counter
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs"
              onClick={() => setMode("decline")}
            >
              Decline
            </Button>
          </div>
        )}
      </div>

      {offer.buyer_message && (
        <p className="mt-2 text-xs text-muted-foreground italic flex items-start gap-1.5">
          <MessageSquare className="w-3 h-3 flex-shrink-0 mt-0.5" />
          {offer.buyer_message}
        </p>
      )}

      {offer.rounds.length > 1 && <OfferThread offer={offer} className="mt-3" />}

      {mode === "counter" && (
        <form onSubmit={sendCounter} className="mt-3 space-y-2">
          <div className="flex items-end gap-2 flex-wrap">
            <div className="flex-1 min-w-[140px]">
              <Label htmlFor={`counter-${offer.id}`}>Counter with (₹)</Label>
              <Input
                id={`counter-${offer.id}`}
                type="number"
                inputMode="numeric"
                min={Math.floor(offer.current_offer_paise / 100) + 1}
                max={Math.floor(offer.list_price_paise / 100)}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
              />
            </div>
            <Button type="submit" size="sm" loading={counter.isPending}>
              Send
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setMode("none")}
            >
              Cancel
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Must be above their {rupees(offer.current_offer_paise)} and at or below
            your {rupees(offer.list_price_paise)} asking price.
          </p>
          <Textarea
            rows={2}
            placeholder="What's included at that number?"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
          {counter.isError && <FormError message={getErrorMessage(counter.error)} />}
        </form>
      )}

      {mode === "decline" && (
        <form
          className="mt-3 space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            decline.mutate(
              { offerId: offer.id, message: message.trim() || undefined },
              { onSuccess: () => { setMode("none"); setMessage(""); } },
            );
          }}
        >
          <Textarea
            rows={2}
            placeholder="Optional reason — a short note is kinder than silence."
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
          <div className="flex gap-2">
            <Button type="submit" size="sm" variant="outline" loading={decline.isPending}>
              Decline offer
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setMode("none")}>
              Cancel
            </Button>
          </div>
          {decline.isError && <FormError message={getErrorMessage(decline.error)} />}
        </form>
      )}

      {offer.status === "accepted" && (
        <p className="mt-2 text-xs text-text-success flex items-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5" />
          Agreed at {rupees(offer.agreed_price_paise)} — waiting for the buyer to pay.
          Accepting agreed a price; it didn&apos;t charge them.
        </p>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════ */
/* Shared: the negotiation history                                            */
/* ══════════════════════════════════════════════════════════════════════════ */

/** Append-only round history. This is what makes "offer history" real. */
export function OfferThread({
  offer,
  className,
}: {
  offer: PurchaseOffer;
  className?: string;
}) {
  if (!offer.rounds?.length) return null;

  return (
    <ol className={cn("space-y-2", className)}>
      {offer.rounds.map((round) => {
        const Icon = ACTION_ICON[round.action] ?? HandCoins;
        const isBuyer = round.actor === "buyer";
        return (
          <li key={round.sequence} className="flex items-start gap-2.5 text-xs">
            <div
              className={cn(
                "w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-px",
                isBuyer ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
              )}
            >
              <Icon className="w-3 h-3" />
            </div>
            <div className="min-w-0 flex-1">
              <p>
                <span className="font-medium capitalize">{round.actor}</span>{" "}
                <span className="text-muted-foreground">
                  {round.action === "offer" && "offered"}
                  {round.action === "counter" && "countered at"}
                  {round.action === "accept" && "accepted"}
                  {round.action === "decline" && "declined"}
                  {round.action === "withdraw" && "withdrew"}
                </span>
                {round.amount_paise != null && (
                  <span className="font-semibold tabular-nums">
                    {" "}
                    {rupees(round.amount_paise)}
                  </span>
                )}
              </p>
              {round.message && (
                <p className="text-muted-foreground italic mt-0.5">{round.message}</p>
              )}
            </div>
            <time className="text-[11px] text-muted-foreground flex-shrink-0">
              {new Date(round.created_at).toLocaleDateString("en-IN", {
                day: "numeric",
                month: "short",
              })}
            </time>
          </li>
        );
      })}
    </ol>
  );
}

/** Compact list row for the buyer's "my offers" dashboard. */
export function OfferListRow({ offer }: { offer: PurchaseOffer }) {
  const meta = STATUS_META[offer.status];
  const needsMe = OPEN.includes(offer.status) && offer.awaiting === "buyer";

  return (
    <div className="px-4 py-3.5 flex items-start justify-between gap-3 flex-wrap">
      <div className="min-w-0">
        <Link
          href={`/projects/${offer.project_id}`}
          className="font-medium text-sm hover:text-primary transition-colors"
        >
          {offer.project_title ?? "Project"}
        </Link>
        <p className="text-xs text-muted-foreground mt-0.5 tabular-nums">
          You offered {rupees(offer.initial_offer_paise)}
          {offer.current_offer_paise !== offer.initial_offer_paise && (
            <> · now {rupees(offer.current_offer_paise)}</>
          )}{" "}
          · asking {rupees(offer.list_price_paise)}
        </p>
      </div>
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <Badge variant={meta.variant} size="sm">{meta.label}</Badge>
        {needsMe && <Badge variant="warning" size="sm">Your move</Badge>}
        {offer.status === "accepted" && (
          <Button size="sm" variant="cta" className="h-7 text-xs" asChild>
            <Link href={`/projects/${offer.project_id}/checkout?offer=${offer.id}`}>
              Pay {rupees(offer.agreed_price_paise)}
            </Link>
          </Button>
        )}
      </div>
    </div>
  );
}

/** Public, identity-free offer activity hint for a listing. */
export function OfferActivityHint({
  summary,
}: {
  summary: { total_offers: number; open_offers: number; has_accepted: boolean } | undefined;
}) {
  if (!summary || summary.total_offers === 0) return null;
  return (
    <p className="text-xs text-muted-foreground flex items-center gap-1.5">
      <Hourglass className="w-3 h-3" />
      {summary.has_accepted
        ? "An offer has been accepted on this listing."
        : `${summary.open_offers} open offer${summary.open_offers === 1 ? "" : "s"} · ${summary.total_offers} total`}
    </p>
  );
}
