"use client";
import Link from "next/link";
import {
  Users, FolderKanban, ShieldCheck, IndianRupee, UserCheck,
  ArrowRight, ShieldAlert, Building2, CopyCheck, Wallet,
} from "lucide-react";
import { AdminPageHeader, StatCard } from "@/components/admin/shared";
import { useAdminAnalytics, useVerificationQueue } from "@/lib/hooks/admin";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export default function AdminOverviewPage() {
  const { data, isLoading } = useAdminAnalytics();
  const { data: queue, isLoading: queueLoading } = useVerificationQueue();

  return (
    <div>
      <AdminPageHeader
        title="Overview"
        subtitle="Platform-wide metrics, refreshed every minute"
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          icon={Users}
          label="Total users"
          value={data?.users.total ?? 0}
          loading={isLoading}
        />
        <StatCard
          icon={UserCheck}
          label="Active users"
          value={data?.users.active ?? 0}
          sublabel={data ? `${data.users.inactive} inactive` : undefined}
          loading={isLoading}
        />
        <StatCard
          icon={FolderKanban}
          label="Total projects"
          value={data?.projects.total ?? 0}
          loading={isLoading}
        />
        <StatCard
          icon={ShieldCheck}
          label="Verified projects"
          value={data?.projects.verified ?? 0}
          sublabel={
            data && data.projects.total > 0
              ? `${Math.round((data.projects.verified / data.projects.total) * 100)}% of total`
              : undefined
          }
          loading={isLoading}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-8">
        <div className="lg:col-span-1">
          <StatCard
            icon={IndianRupee}
            label="Total revenue"
            value={data ? `₹${data.payments.total_revenue_inr.toLocaleString("en-IN")}` : "₹0"}
            sublabel="All-time, paid orders"
            loading={isLoading}
          />
        </div>

        {/* Verification queue preview */}
        <div className="lg:col-span-2 rounded-xl border bg-card p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-medium text-sm flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-text-warning" />
              Verification Queue
            </h3>
            <Button variant="ghost" size="sm" asChild className="gap-1 text-xs">
              <Link href="/admin/verification">
                View all <ArrowRight className="w-3 h-3" />
              </Link>
            </Button>
          </div>

          {queueLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : !queue?.items.length ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              No projects pending verification.
            </p>
          ) : (
            <div className="space-y-1.5">
              {queue.items.slice(0, 4).map((p: { id: string; title: string; repo_full_name: string }) => (
                <Link
                  key={p.id}
                  href={`/admin/verification`}
                  className="flex items-center justify-between px-3 py-2 rounded-md hover:bg-accent transition-colors text-sm"
                >
                  <span className="truncate font-medium">{p.title}</span>
                  <span className="text-xs text-muted-foreground truncate ml-2">{p.repo_full_name}</span>
                </Link>
              ))}
              {queue.total > 4 && (
                <p className="text-xs text-muted-foreground px-3 pt-1">
                  +{queue.total - 4} more pending
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Quick links */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Link href="/admin/users" className="rounded-xl border bg-card p-5 hover:border-primary/40 transition-colors group">
          <Users className="w-5 h-5 text-primary mb-2" />
          <h3 className="font-medium text-sm group-hover:text-primary transition-colors">Manage Users</h3>
          <p className="text-xs text-muted-foreground mt-1">Ban, unban, change roles</p>
        </Link>
        <Link href="/admin/projects" className="rounded-xl border bg-card p-5 hover:border-primary/40 transition-colors group">
          <FolderKanban className="w-5 h-5 text-primary mb-2" />
          <h3 className="font-medium text-sm group-hover:text-primary transition-colors">Manage Projects</h3>
          <p className="text-xs text-muted-foreground mt-1">Feature, verify, or remove projects</p>
        </Link>
        <Link href="/admin/verification" className="rounded-xl border bg-card p-5 hover:border-primary/40 transition-colors group">
          <ShieldCheck className="w-5 h-5 text-primary mb-2" />
          <h3 className="font-medium text-sm group-hover:text-primary transition-colors">Verification Queue</h3>
          <p className="text-xs text-muted-foreground mt-1">Review ownership &amp; hackathon proofs</p>
        </Link>
        <Link href="/admin/duplicates" className="rounded-xl border bg-card p-5 hover:border-primary/40 transition-colors group">
          <CopyCheck className="w-5 h-5 text-primary mb-2" />
          <h3 className="font-medium text-sm group-hover:text-primary transition-colors">Duplicate Review</h3>
          <p className="text-xs text-muted-foreground mt-1">Listings flagged as possible clones</p>
        </Link>
        <Link href="/admin/institutions" className="rounded-xl border bg-card p-5 hover:border-primary/40 transition-colors group">
          <Building2 className="w-5 h-5 text-primary mb-2" />
          <h3 className="font-medium text-sm group-hover:text-primary transition-colors">Institution Partners</h3>
          <p className="text-xs text-muted-foreground mt-1">Approve faculty dashboard access</p>
        </Link>
        <Link href="/admin/payouts" className="rounded-xl border bg-card p-5 hover:border-primary/40 transition-colors group">
          <Wallet className="w-5 h-5 text-primary mb-2" />
          <h3 className="font-medium text-sm group-hover:text-primary transition-colors">Payouts</h3>
          <p className="text-xs text-muted-foreground mt-1">Record settlements to sellers</p>
        </Link>
      </div>
    </div>
  );
}
