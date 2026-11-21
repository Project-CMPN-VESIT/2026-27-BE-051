"use client";
import { useEffect } from "react";
import Link from "next/link";
import {
  Plus, GitFork, Zap, Users, CheckCircle2, Star,
  Search, Rocket, Gift, ArrowRight, MessageSquare, Wallet, ShieldCheck,
  FolderKanban, TrendingUp, ShoppingBag,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Badge, Card, CardContent, EmptyState, Progress, SectionHeader, StatCard,
} from "@/components/ui/primitives";
import { Skeleton, StatGridSkeleton } from "@/components/ui/skeleton";
import { OnboardingChecklist } from "@/components/onboarding/checklist";
import { BuilderRetentionRow } from "@/components/growth/builder-retention-row";
import {
  useMe, useMyProjects, useContributorRequests, useResolveContributorRequest,
  useSentOffers,
} from "@/lib/hooks";
import { cn } from "@/lib/utils";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/auth";
import type { ProjectListItem } from "@/types";

const TIER_STYLES: Record<string, string> = {
  elite: "bg-primary/12 text-primary",
  trusted: "bg-background-success text-text-success",
  rising: "bg-background-warning text-text-warning",
  newcomer: "bg-secondary text-secondary-foreground",
};

function ReputationCard({
  reputation,
}: {
  reputation: NonNullable<ReturnType<typeof useMe>["data"]>["reputation"];
}) {
  if (!reputation) return null;
  const scores = [
    { label: "Contribution", value: reputation.contribution_score },
    { label: "Trust", value: reputation.trust_score },
    { label: "Collaboration", value: reputation.collab_score },
    { label: "Completion", value: reputation.completion_score },
  ];

  const barTone = (v: number) =>
    v >= 70 ? "bg-[hsl(var(--score-high))]"
      : v >= 40 ? "bg-[hsl(var(--score-mid))]"
      : "bg-muted-foreground/40";

  return (
    <div className="rounded-xl border bg-card p-5">
      <div className="flex items-center justify-between gap-3 mb-5">
        <h3 className="font-semibold text-sm flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-primary" /> Builder reputation
        </h3>
        <span
          className={cn(
            "text-[11px] px-2 py-0.5 rounded-full font-semibold capitalize",
            TIER_STYLES[reputation.tier] ?? TIER_STYLES.newcomer
          )}
        >
          {reputation.tier}
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-5">
        {scores.map(({ label, value }) => (
          <div key={label}>
            <div className="flex items-baseline justify-between mb-1.5">
              <span className="text-xs text-muted-foreground">{label}</span>
              <span className="text-sm font-bold font-display tabular-nums">{value}</span>
            </div>
            <Progress value={value} size="sm" barClassName={barTone(value)} label={label} />
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-x-5 gap-y-1 pt-4 border-t text-sm text-muted-foreground">
        <span className="tabular-nums">
          <strong className="text-foreground font-semibold">{reputation.total_projects}</strong> projects
        </span>
        <span className="tabular-nums">
          <strong className="text-foreground font-semibold">{reputation.verified_projects}</strong> verified
        </span>
        <span className="tabular-nums">
          <strong className="text-foreground font-semibold">{reputation.reputation_points}</strong> points
        </span>
      </div>
    </div>
  );
}

function ProjectRow({ project }: { project: ProjectListItem }) {
  return (
    <Link
      href={`/projects/${project.id}`}
      className={cn(
        "flex items-center justify-between gap-3 p-4 rounded-xl border bg-card group transition-colors",
        "hover:border-primary/40 hover:bg-accent/30",
        "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/25 focus-visible:border-primary"
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 mb-0.5 flex-wrap">
          <span className="font-medium text-sm group-hover:text-primary transition-colors truncate">
            {project.title}
          </span>
          {project.is_verified && (
            <span title="Verified">
              <CheckCircle2 className="w-3.5 h-3.5 text-text-success flex-shrink-0" />
              <span className="sr-only">Verified</span>
            </span>
          )}
          {project.is_seeking_contributors && (
            <span title="Seeking contributors">
              <Users className="w-3.5 h-3.5 text-primary flex-shrink-0" />
              <span className="sr-only">Seeking contributors</span>
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground truncate font-mono">{project.repo_full_name}</p>
      </div>

      <div className="flex items-center gap-3 sm:gap-4 flex-shrink-0">
        <div className="hidden sm:flex items-center gap-3 text-xs text-muted-foreground tabular-nums">
          <span className="flex items-center gap-1"><Star className="w-3 h-3" />{project.stars}</span>
          <span className="flex items-center gap-1"><GitFork className="w-3 h-3" />{project.forks}</span>
        </div>
        {project.is_for_sale && project.price_paise != null && (
          <span className="hidden sm:inline text-xs font-bold text-text-success tabular-nums">
            ₹{(project.price_paise / 100).toLocaleString("en-IN")}
          </span>
        )}
        <Badge
          variant={
            project.status === "active" ? "success"
              : project.status === "dormant" ? "warning"
              : "ghost"
          }
          size="sm"
          className="capitalize"
        >
          {project.status}
        </Badge>
        <ArrowRight className="w-4 h-4 text-muted-foreground/30 group-hover:text-primary transition-colors" />
      </div>
    </Link>
  );
}

function RequestsPanel({ projectId }: { projectId: string }) {
  const { data: requests, isLoading } = useContributorRequests(projectId);
  const { mutate: resolve, isPending } = useResolveContributorRequest();
  const pending = requests?.filter((r) => r.status === "pending") ?? [];

  if (isLoading) return <Skeleton className="h-12 w-full" />;
  if (!pending.length) return null;

  return (
    <div className="space-y-2 pl-3 border-l-2 border-primary/30 ml-3">
      {pending.map((req) => (
        <div
          key={req.id}
          className="flex items-center justify-between gap-3 p-3 rounded-xl border bg-primary/[0.04]"
        >
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">
              {req.requester?.profile?.display_name ?? "Someone"} wants to contribute
            </p>
            {req.message && (
              <p className="text-xs text-muted-foreground truncate">{req.message}</p>
            )}
          </div>
          <div className="flex gap-1.5 flex-shrink-0">
            <Button
              size="sm"
              className="h-7 text-xs"
              onClick={() => resolve({ requestId: req.id, status: "accepted", projectId })}
              disabled={isPending}
            >
              Accept
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs"
              onClick={() => resolve({ requestId: req.id, status: "rejected", projectId })}
              disabled={isPending}
            >
              Decline
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}

function QuickAction({
  href, icon, label, desc,
}: { href: string; icon: React.ReactNode; label: string; desc: string }) {
  return (
    <Link
      href={href}
      className={cn(
        "rounded-xl border bg-card p-4 group flex items-start gap-3 card-interactive",
        "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/25 focus-visible:border-primary"
      )}
    >
      <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center flex-shrink-0 transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
        {icon}
      </div>
      <div className="min-w-0">
        <div className="flex items-center gap-1 text-sm font-medium group-hover:text-primary transition-colors">
          {label}
          <ArrowRight className="w-3 h-3 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
        </div>
        <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{desc}</p>
      </div>
    </Link>
  );
}

function HirerHome() {
  const { data: offers } = useSentOffers();
  return (
    <div className="space-y-10">
      <div className="grid sm:grid-cols-2 gap-3">
        <QuickAction href="/projects?for_sale=true" icon={<ShoppingBag className="w-4 h-4" />} label="Buy a project" desc="Browse verified software you can buy today." />
        <QuickAction href="/requests" icon={<Plus className="w-4 h-4" />} label="Post a build request" desc="Describe what you need built and get applications." />
        <QuickAction href="/builders" icon={<Search className="w-4 h-4" />} label="Find builders" desc="Browse verified student builders to work with." />
        <QuickAction href="/incubation" icon={<Rocket className="w-4 h-4" />} label="Fund a project" desc="Make a mentorship, funding or acquisition offer." />
      </div>

      <div className="space-y-4">
        <SectionHeader
          title="Offers you've sent"
          icon={<Rocket />}
          action={
            <Button variant="ghost" size="sm" asChild>
              <Link href="/incubation">Manage <ArrowRight className="w-3.5 h-3.5" /></Link>
            </Button>
          }
        />
        {!offers?.length ? (
          <EmptyState
            icon={<Rocket />}
            title="No offers yet"
            description="Find a builder or discover a verified project to make your first offer."
            action={
              <>
                <Button size="sm" asChild><Link href="/incubation">Discover projects</Link></Button>
                <Button size="sm" variant="outline" asChild><Link href="/builders">Find builders</Link></Button>
              </>
            }
          />
        ) : (
          <div className="rounded-xl border bg-card divide-y">
            {offers.slice(0, 6).map((o) => (
              <div key={o.id} className="flex items-center justify-between gap-3 p-4">
                <span className="font-medium text-sm truncate">{o.title}</span>
                <Badge
                  variant={
                    o.status === "accepted" ? "success"
                      : o.status === "declined" ? "destructive"
                      : "warning"
                  }
                  size="sm"
                  className="capitalize flex-shrink-0"
                >
                  {o.status}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const token = useAuthStore((s) => s.accessToken);
  const { data: user, isLoading: userLoading } = useMe();
  const { data: projects, isLoading: projectsLoading } = useMyProjects();

  useEffect(() => {
    if (!token) router.replace("/auth/login");
  }, [router, token]);

  if (!token) return null;

  const isHirer = user?.role === "founder" || user?.role === "incubator";

  const verifiedCount = projects?.filter((p) => p.is_verified).length ?? 0;
  const forSaleCount = projects?.filter((p) => p.is_for_sale).length ?? 0;
  const totalStars = projects?.reduce((sum, p) => sum + p.stars, 0) ?? 0;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-10">

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          {userLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-9 w-56" />
              <Skeleton className="h-4 w-40" />
            </div>
          ) : (
            <>
              <h1 className="text-display-md">
                Hey, {user?.profile?.display_name?.split(" ")[0] ?? "there"} 👋
              </h1>
              <p className="text-sm text-muted-foreground mt-1.5">
                {isHirer
                  ? "Buy verified projects, commission builds, and back student builders."
                  : "Here's how your projects are doing."}
              </p>
            </>
          )}
        </div>
        <Button variant="brand" asChild>
          {isHirer
            ? <Link href="/projects?for_sale=true"><ShoppingBag className="w-4 h-4" /> Browse marketplace</Link>
            : <Link href="/import"><Plus className="w-4 h-4" /> Import project</Link>}
        </Button>
      </div>

      {userLoading ? (
        <StatGridSkeleton />
      ) : isHirer ? (
        <HirerHome />
      ) : (
        <>
          {/* First-run guidance. Hides itself once the core path is done. */}
          <OnboardingChecklist />

          {/* Streak + team memberships. Both hide themselves when empty. */}
          <BuilderRetentionRow />

          {/* At-a-glance stats */}
          {projectsLoading ? (
            <StatGridSkeleton />
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatCard
                label="Projects"
                value={projects?.length ?? 0}
                icon={<FolderKanban />}
              />
              <StatCard
                label="Verified"
                value={verifiedCount}
                icon={<ShieldCheck />}
                accent={verifiedCount > 0}
              />
              <StatCard label="Listed for sale" value={forSaleCount} icon={<Wallet />} />
              <StatCard label="Total stars" value={totalStars} icon={<TrendingUp />} />
            </div>
          )}

          {/* Quick actions */}
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <QuickAction href="/import" icon={<Plus className="w-4 h-4" />} label="Import project" desc="Add a repo for analysis and scoring." />
            <QuickAction href="/earnings" icon={<Wallet className="w-4 h-4" />} label="Earnings" desc="Track sales, fees and payouts." />
            <QuickAction href="/invite" icon={<Gift className="w-4 h-4" />} label="Invite" desc="Share your link, grow your rank." />
            <QuickAction href={`/u/${user?.id}`} icon={<Star className="w-4 h-4" />} label="My profile" desc="Your public reputation page." />
          </div>

          <ReputationCard reputation={user?.reputation ?? null} />

          {/* Projects */}
          <div className="space-y-4">
            <SectionHeader
              title="My projects"
              icon={<FolderKanban />}
              description="Pending contributor requests appear under each project."
              action={
                projects?.length ? (
                  <Button variant="outline" size="sm" asChild>
                    <Link href="/import"><Plus className="w-3.5 h-3.5" /> Add</Link>
                  </Button>
                ) : undefined
              }
            />

            {projectsLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => <Skeleton key={i} className="h-[4.5rem] w-full rounded-xl" />)}
              </div>
            ) : !projects?.length ? (
              <EmptyState
                icon={<Zap />}
                title="No projects yet"
                description="Import a GitHub repository to get AI analysis, a Verified Build Score, and marketplace visibility."
                action={<Button asChild><Link href="/import">Import your first project</Link></Button>}
              />
            ) : (
              <div className="space-y-3">
                {projects.map((p) => (
                  <div key={p.id} className="space-y-2">
                    <ProjectRow project={p} />
                    <RequestsPanel projectId={p.id} />
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
