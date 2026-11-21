"use client";
import { useState } from "react";
import Link from "next/link";
import {
  Users, Search, ShieldCheck, CheckCircle2, MessageSquare, GraduationCap, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, EmptyState } from "@/components/ui/primitives";
import { Skeleton } from "@/components/ui/skeleton";
import { Container, PageHeader } from "@/components/ui/layout";
import { TierBadge } from "@/components/reputation/reputation-panel";
import { useBuilderDirectory } from "@/lib/hooks";

export default function BuildersPage() {
  const [search, setSearch] = useState("");
  const { data: builders, isLoading } = useBuilderDirectory(search);

  return (
    <Container width="lg" className="py-10">
      <PageHeader
        eyebrow="Directory"
        title="Find builders"
        icon={<Users />}
        description="Verified student builders you can hire, commission, mentor or back — each with reputation and delivery history on record."
      />

      {/* Search */}
      <div className="relative mb-6 max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none z-10" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or college…"
          className="pl-9 pr-9"
          aria-label="Search builders"
        />
        {search && (
          <button
            onClick={() => setSearch("")}
            aria-label="Clear search"
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground z-10"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="grid sm:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-44 rounded-xl" />)}
        </div>
      ) : !builders?.length ? (
        <EmptyState
          icon={<Users />}
          title={search ? "No builders match that search" : "No builders yet"}
          description={
            search
              ? `Nothing found for “${search}”. Try a different name or college.`
              : "Verified builders will appear here as they join and ship projects."
          }
          action={
            search
              ? <Button variant="outline" size="sm" onClick={() => setSearch("")}>Clear search</Button>
              : undefined
          }
        />
      ) : (
        <div className="grid sm:grid-cols-2 gap-4 stagger">
          {builders.map((b) => {
            const initials = b.display_name
              .split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
            return (
              <div
                key={b.user_id}
                className="rounded-xl border bg-card p-5 flex flex-col card-interactive"
              >
                <div className="flex items-start gap-3.5">
                  <span className="w-11 h-11 rounded-full bg-primary/10 text-primary text-sm font-bold flex items-center justify-center flex-shrink-0 overflow-hidden">
                    {b.avatar_url
                      ? <img src={b.avatar_url} alt="" className="w-full h-full object-cover" />
                      : initials}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Link
                        href={`/u/${b.user_id}`}
                        className="font-semibold text-sm truncate hover:text-primary transition-colors"
                      >
                        {b.display_name}
                      </Link>
                      <TierBadge tier={b.tier} />
                    </div>
                    {b.college && (
                      <p className="text-xs text-muted-foreground truncate mt-0.5 inline-flex items-center gap-1">
                        <GraduationCap className="w-3 h-3 flex-shrink-0" /> {b.college}
                      </p>
                    )}
                  </div>
                </div>

                {b.bio && (
                  <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed mt-3">
                    {b.bio}
                  </p>
                )}

                {/* Trust signals */}
                <div className="grid grid-cols-3 gap-2 mt-4 pt-4 border-t">
                  {[
                    { icon: <ShieldCheck className="w-3 h-3 text-text-success" />, value: b.verified_projects, label: "Verified" },
                    { icon: <CheckCircle2 className="w-3 h-3" />, value: b.contracts_completed, label: "Delivered" },
                    { icon: null, value: b.trust_score, label: "Trust" },
                  ].map(({ icon, value, label }) => (
                    <div key={label}>
                      <div className="text-sm font-semibold tabular-nums inline-flex items-center gap-1">
                        {icon} {value}
                      </div>
                      <div className="text-[10px] text-muted-foreground">{label}</div>
                    </div>
                  ))}
                </div>

                <div className="flex gap-2 mt-4">
                  <Button asChild size="sm" className="flex-1 gap-1.5">
                    <Link href={`/messages?new=${b.user_id}`}>
                      <MessageSquare className="w-3.5 h-3.5" /> Message
                    </Link>
                  </Button>
                  <Button asChild size="sm" variant="outline" className="flex-1">
                    <Link href={`/u/${b.user_id}`}>Profile</Link>
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Container>
  );
}
