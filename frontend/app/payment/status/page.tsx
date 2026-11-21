"use client";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  CheckCircle2, Clock, XCircle, ArrowRight, RefreshCw, ReceiptText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/primitives";
import { Container } from "@/components/ui/layout";
import { paymentsApi } from "@/lib/api";
import { useAuthStore } from "@/stores/auth";
import type { Payment } from "@/types";

type View = "checking" | "paid" | "pending" | "failed";

const COPY: Record<Exclude<View, "checking">, { title: string; body: string }> = {
  paid: {
    title: "Payment successful",
    body: "Your purchase is confirmed. Any delivery details or unlocked features are available now.",
  },
  pending: {
    title: "Payment is processing",
    body: "Cashfree hasn't confirmed this order yet. This usually settles within a minute — refresh to check again.",
  },
  failed: {
    title: "Payment not completed",
    body: "The order wasn't completed. You have not been charged. You can safely try again.",
  },
};

const ICONS = {
  paid: { Icon: CheckCircle2, wrap: "bg-background-success", tone: "text-text-success" },
  pending: { Icon: Clock, wrap: "bg-background-warning", tone: "text-text-warning" },
  failed: { Icon: XCircle, wrap: "bg-background-danger", tone: "text-text-danger" },
};

function PaymentStatusInner() {
  const params = useSearchParams();
  const orderId = params.get("order_id");
  const token = useAuthStore((s) => s.accessToken);

  const [view, setView] = useState<View>("checking");
  const [payment, setPayment] = useState<Payment | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;

    // The webhook is what actually marks a payment paid, so poll our own
    // history rather than trusting the redirect.
    paymentsApi
      .history()
      .then((rows) => {
        if (cancelled) return;
        const match = orderId
          ? rows.find((p) => p.order_id === orderId)
          : rows[0];
        setPayment(match ?? null);
        if (!match) {
          setView("pending");
        } else if (match.status === "paid") {
          setView("paid");
        } else if (match.status === "failed") {
          setView("failed");
        } else {
          setView("pending");
        }
      })
      .catch(() => !cancelled && setView("pending"));

    return () => { cancelled = true; };
  }, [orderId, token, attempt]);

  if (!token) {
    return (
      <Container width="sm" className="py-20 text-center">
        <h1 className="text-display-md mb-3">Sign in to view this payment</h1>
        <p className="text-sm text-muted-foreground mb-6">
          Your order status lives in your billing history.
        </p>
        <Button asChild><Link href="/auth/login">Sign in</Link></Button>
      </Container>
    );
  }

  if (view === "checking") {
    return (
      <Container width="sm" className="py-24 text-center">
        <Spinner className="w-6 h-6 text-primary mx-auto mb-4" />
        <p className="text-sm text-muted-foreground">Confirming your payment…</p>
      </Container>
    );
  }

  const { Icon, wrap, tone } = ICONS[view];
  const copy = COPY[view];

  return (
    <Container width="sm" className="py-16 sm:py-24">
      <div className="rounded-2xl border bg-card shadow-lg p-7 text-center" role="status" aria-live="polite">
        <span className={`inline-flex w-14 h-14 rounded-2xl items-center justify-center mb-5 ${wrap}`}>
          <Icon className={`w-6 h-6 ${tone}`} />
        </span>

        <h1 className="text-display-sm">{copy.title}</h1>
        <p className="text-sm text-muted-foreground mt-3 leading-relaxed">{copy.body}</p>

        {payment && (
          <dl className="mt-6 rounded-xl border bg-surface divide-y text-sm text-left">
            <div className="flex justify-between gap-4 px-4 py-2.5">
              <dt className="text-muted-foreground">Amount</dt>
              <dd className="font-semibold tabular-nums">
                ₹{(payment.amount_paise / 100).toLocaleString("en-IN")}
              </dd>
            </div>
            <div className="flex justify-between gap-4 px-4 py-2.5">
              <dt className="text-muted-foreground">Order</dt>
              <dd className="font-mono text-xs truncate max-w-[12rem]">{payment.order_id}</dd>
            </div>
            <div className="flex justify-between gap-4 px-4 py-2.5">
              <dt className="text-muted-foreground">Status</dt>
              <dd className="font-medium capitalize">{payment.status}</dd>
            </div>
          </dl>
        )}

        <div className="mt-7 space-y-2.5">
          {view === "paid" && (
            <Button block size="lg" variant="brand" asChild>
              <Link href="/dashboard">Go to dashboard <ArrowRight className="w-4 h-4" /></Link>
            </Button>
          )}
          {view === "pending" && (
            <Button block size="lg" onClick={() => { setView("checking"); setAttempt((a) => a + 1); }}>
              <RefreshCw className="w-4 h-4" /> Check again
            </Button>
          )}
          {view === "failed" && (
            <Button block size="lg" asChild>
              <Link href="/projects?for_sale=true">Back to marketplace</Link>
            </Button>
          )}
          <Button block variant="outline" asChild>
            <Link href="/settings">
              <ReceiptText className="w-4 h-4" /> View billing history
            </Link>
          </Button>
        </div>
      </div>

      <p className="text-xs text-muted-foreground text-center mt-6 leading-relaxed">
        Payments are confirmed by Cashfree via a secure webhook. If a charge shows on your
        card but the status here stays pending, contact support with the order ID above.
      </p>
    </Container>
  );
}

export default function PaymentStatusPage() {
  return (
    <Suspense
      fallback={
        <Container width="sm" className="py-24 text-center">
          <Spinner className="w-6 h-6 text-primary mx-auto" />
        </Container>
      }
    >
      <PaymentStatusInner />
    </Suspense>
  );
}
