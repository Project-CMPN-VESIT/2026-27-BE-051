"use client";
import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ShieldCheck, Zap, Star, Lock, CheckCircle2, Presentation, type LucideIcon } from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { projectsApi, paymentsApi } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Container } from "@/components/ui/layout";
import { useMe } from "@/lib/hooks";
import { useAuthStore } from "@/stores/auth";
import { getErrorMessage } from "@/lib/api/client";
import { cn } from "@/lib/utils";
import type { PaymentType } from "@/types";

const SALE_TYPE_LABELS: Record<string, string> = {
  source_code: "Full source code access",
  collab_access: "Collaboration rights",
  custom: "Custom access",
};

const PLATFORM_PRODUCTS = [
  {
    id: "ai_audit" as const,
    name: "AI Project Audit",
    price: 299,
    description: "Deep AI analysis — health score, startup potential, roadmap, contributor recommendations",
    icon: Zap,
    color: "text-primary",
  },
  {
    id: "startup_report" as const,
    name: "Startup Readiness Report",
    price: 999,
    description: "Full investor-grade startup readiness assessment with actionable insights",
    icon: Star,
    color: "text-text-warning",
  },
  {
    id: "pitch_deck" as const,
    name: "AI Pitch Deck",
    price: 499,
    description: "8-slide investor pitch — problem, solution, market, traction, model, roadmap, ask, with speaker notes",
    icon: Presentation,
    color: "text-violet-500",
  },
  {
    id: "featured_placement" as const,
    name: "Featured Placement",
    price: 1499,
    description: "Feature this project on the home page — maximum visibility for 30 days",
    icon: ShieldCheck,
    color: "text-text-success",
  },
  // "Premium Listing" is intentionally not offered: it has no fulfilment
  // behaviour on the backend, so a purchase would charge without delivering.
  // Re-add here once search-ranking boost is implemented and wired into
  // PaymentService._fulfill_payment.
];

function CheckoutCard({
  name, price, description, icon: Icon, color, onBuy, loading, success,
}: {
  name: string; price: number; description: string; icon: LucideIcon;
  color: string; onBuy: () => void; loading: boolean; success: boolean;
}) {
  return (
    <div className="rounded-xl border bg-card p-5 sm:p-6 flex flex-col gap-4 card-interactive">
      <div className="flex items-start gap-4">
        <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center flex-shrink-0">
          <Icon className={cn("w-[1.1rem] h-[1.1rem]", color)} />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-[0.9375rem]">{name}</h3>
          <p className="text-sm text-muted-foreground mt-1 leading-relaxed">{description}</p>
        </div>
      </div>
      <div className="flex items-center justify-between gap-3 pt-4 border-t">
        <div className="flex items-baseline gap-1.5">
          <span className="text-2xl font-extrabold font-display tabular-nums tracking-tight">
            ₹{price.toLocaleString("en-IN")}
          </span>
          <span className="text-xs text-muted-foreground">one-time</span>
        </div>
        {success ? (
          <div className="flex items-center gap-2 text-text-success text-sm font-medium">
            <CheckCircle2 className="w-4 h-4" /> Redirecting…
          </div>
        ) : (
          <Button onClick={onBuy} loading={loading} className="gap-2">
            <Lock className="w-3.5 h-3.5" /> Buy now
          </Button>
        )}
      </div>
    </div>
  );
}

export default function CheckoutPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const token = useAuthStore((s) => s.accessToken);
  const [error, setError] = useState<string | null>(null);
  const [successType, setSuccessType] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      router.replace("/auth/login");
    }
  }, [router, token]);

  const { data: project, isLoading } = useQuery({
    queryKey: ["project", id],
    queryFn: () => projectsApi.get(id),
    enabled: !!token,
  });
  const { data: me } = useMe();

  const isOwner = !!me && !!project && me.id === project.owner_id;

  // Owner-only add-ons, minus anything already unlocked — the API rejects both
  // cases, so showing them would only produce an avoidable error.
  const availableProducts = PLATFORM_PRODUCTS.filter((p) => {
    if (!project) return false;
    if (p.id === "startup_report") return !project.startup_report_unlocked;
    if (p.id === "pitch_deck") return !project.pitch_deck_unlocked;
    if (p.id === "featured_placement") return !project.is_featured;
    return true;
  });

  const { mutate: createOrder, isPending } = useMutation({
    mutationFn: ({ type, projectId }: { type: PaymentType; projectId?: string }) =>
      paymentsApi.createOrder(type, projectId),
    onSuccess: (data) => {
      setSuccessType(data.payment_type);
      setError(null);
      // Redirect to Cashfree payment page
      if (data.cf_order_token) {
        window.location.href = `https://sandbox.cashfree.com/pg/view/orders/${data.order_id}?orderToken=${data.cf_order_token}`;
      }
    },
    onError: (err) => setError(getErrorMessage(err)),
  });

  if (!token) return null;

  if (isLoading) {
    return (
      <Container width="md" className="py-10 space-y-4">
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-40 w-full rounded-xl" />
        <Skeleton className="h-40 w-full rounded-xl" />
      </Container>
    );
  }

  if (!project) return null;

  return (
    <Container width="md" className="py-10 space-y-6">
      <Link
        href={`/projects/${id}`}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="w-3.5 h-3.5" /> Back to project
      </Link>

      <div>
        <h1 className="text-display-md">Checkout</h1>
        <p className="text-sm text-muted-foreground mt-2">
          for <span className="text-foreground font-medium">{project.title}</span>
        </p>
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-xl border border-destructive/30 bg-destructive/8 px-4 py-3 text-sm text-destructive"
        >
          {error}
        </div>
      )}

      {/* Trust reassurance */}
      <div className="rounded-xl border bg-surface p-4 flex flex-wrap gap-x-5 gap-y-2">
        {[
          "Secure payment via Cashfree",
          "Instant delivery on purchase",
          "Invoice in your billing history",
        ].map((t) => (
          <span key={t} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <CheckCircle2 className="w-3.5 h-3.5 text-text-success flex-shrink-0" /> {t}
          </span>
        ))}
      </div>

      {/* Project access (if for sale) */}
      {project.is_for_sale && project.price_paise && (
        <div className="space-y-2">
          <h2 className="font-semibold text-sm flex items-center gap-2 text-foreground">
            <Lock className="w-4 h-4 text-primary" /> Project Access
          </h2>
          <CheckoutCard
            name={project.price_label ?? SALE_TYPE_LABELS[project.sale_type ?? ""] ?? "Project Access"}
            price={project.price_paise / 100}
            description={`Purchase access to ${project.title}. ${project.sale_type === "source_code" ? "Download and use the full source code." : project.sale_type === "collab_access" ? "Join as an official collaborator." : "Contact the owner for details."}`}
            icon={Lock}
            color="text-primary"
            loading={isPending && successType !== "project_access"}
            success={successType === "project_access"}
            onBuy={() => createOrder({ type: "project_access", projectId: id })}
          />
          <p className="text-xs text-muted-foreground px-1">
            Payment processed securely via Cashfree. After payment, the project owner will be notified and you&apos;ll receive a confirmation.
          </p>
        </div>
      )}

      {/* Platform products — owner only. These upgrades act on the listing
          itself, so the API rejects them for anyone but the owner. */}
      {isOwner && availableProducts.length > 0 && (
        <div className="space-y-3">
          <h2 className="font-semibold text-sm text-foreground">Boost this project</h2>
          <p className="text-xs text-muted-foreground">These are platform-level upgrades you can buy for this project.</p>
          <div className="space-y-3">
            {availableProducts.map((product) => (
              <CheckoutCard
                key={product.id}
                name={product.name}
                price={product.price}
                description={product.description}
                icon={product.icon}
                color={product.color}
                loading={isPending && successType !== product.id}
                success={successType === product.id}
                onBuy={() => createOrder({ type: product.id, projectId: id })}
              />
            ))}
          </div>
        </div>
      )}

      {isOwner && availableProducts.length === 0 && (
        <div className="rounded-xl border bg-surface px-4 py-3.5 flex items-start gap-3">
          <CheckCircle2 className="w-4 h-4 text-text-success flex-shrink-0 mt-0.5" />
          <p className="text-xs text-muted-foreground leading-relaxed">
            Every available upgrade for this project is already unlocked.
          </p>
        </div>
      )}

      {!isOwner && !project.is_for_sale && (
        <div className="rounded-xl border bg-surface px-4 py-3.5 flex items-start gap-3">
          <Lock className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
          <p className="text-xs text-muted-foreground leading-relaxed">
            This project isn&apos;t listed for sale right now. Project upgrades can
            only be purchased by the owner.
          </p>
        </div>
      )}

      {/* Security note */}
      <div className="rounded-xl border bg-surface px-4 py-3.5 flex items-start gap-3">
        <ShieldCheck className="w-4 h-4 text-text-success flex-shrink-0 mt-0.5" />
        <p className="text-xs text-muted-foreground leading-relaxed">
          All payments are processed securely through <strong className="text-foreground">Cashfree Payments</strong>.
          CodeBazaar never stores your card details. All amounts are in INR.
        </p>
      </div>
    </Container>
  );
}
