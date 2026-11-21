"use client";
import { useState } from "react";
import Link from "next/link";
import { Hammer, Plus, Users, Clock, IndianRupee, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, EmptyState } from "@/components/ui/primitives";
import { Skeleton } from "@/components/ui/skeleton";
import { useBuildRequests } from "@/lib/hooks";
import { useDebounce } from "@/lib/hooks/use-debounce";
import { useAuthStore } from "@/stores/auth";
import { Container, PageHeader } from "@/components/ui/layout";
import type { BuildRequestListItem } from "@/types";

function inr(paise: number): string {
  return "\u20B9" + (paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

function RequestCard({ req }: { req: BuildRequestListItem }) {
  return (
    <Link
      href={`/requests/${req.id}`}
      className="block rounded-xl border bg-card p-5 hover:border-primary/40 transition-colors"
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-semibold leading-tight">{req.title}</h3>
        <span className="text-sm font-bold text-primary whitespace-nowrap">{inr(req.budget_paise)}</span>
      </div>
      <p className="text-sm text-muted-foreground mt-1.5 line-clamp-2">{req.description}</p>
      {req.skills.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-3">
          {req.skills.slice(0, 5).map((s) => (
            <span key={s} className="text-xs px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground">{s}</span>
          ))}
        </div>
      )}
      <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1"><Users className="w-3 h-3" /> {req.application_count} applied</span>
        {req.timeline_days && <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {req.timeline_days}d</span>}
      </div>
    </Link>
  );
}

export default function BuildRequestsPage() {
  const [search, setSearch] = useState("");
  const debounced = useDebounce(search, 350);
  const { data, isLoading } = useBuildRequests({ search: debounced || undefined });
  const token = useAuthStore((s) => s.accessToken);

  return (
    <Container width="lg" className="py-10">
      <PageHeader
        eyebrow="Marketplace"
        title="Build requests"
        icon={<Hammer />}
        description="Founders post paid projects. Builders apply with a quote and get hired to build them."
        actions={
          <Button asChild className="gap-1.5">
            <Link href={token ? "/requests/new" : "/auth/login"}><Plus className="w-4 h-4" /> Post a request</Link>
          </Button>
        }
      />

      <div className="relative max-w-md mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        <input
          type="search"
          aria-label="Search build requests"
          className="w-full h-10 pl-9 pr-3 text-sm rounded-lg border border-input bg-card shadow-xs placeholder:text-muted-foreground/70 focus-visible:outline-none focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-primary/12"
          placeholder="Search build requests…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {isLoading ? (
        <div className="grid sm:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-40 rounded-xl" />)}
        </div>
      ) : !data?.length ? (
        <EmptyState
          icon={<IndianRupee />}
          title="No open build requests"
          description="Be the first to post a paid build request and get applications from verified builders."
          action={
            <Button asChild size="sm">
              <Link href={token ? "/requests/new" : "/auth/login"}>Post a request</Link>
            </Button>
          }
        />
      ) : (
        <div className="grid sm:grid-cols-2 gap-4 stagger">
          {data.map((req) => <RequestCard key={req.id} req={req} />)}
        </div>
      )}
    </Container>
  );
}
