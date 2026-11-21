"use client";
import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  Check, Crown, GitCompare, Minus, ShieldCheck, Star, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, EmptyState } from "@/components/ui/primitives";
import { Container, PageHeader } from "@/components/ui/layout";
import { Skeleton } from "@/components/ui/skeleton";
import { LicenceChip } from "@/components/projects/dependency-audit";
import { useComparison } from "@/lib/hooks/advanced";
import { cn } from "@/lib/utils";
import type { Comparison } from "@/types/advanced";

function inr(paise: number | null | undefined) {
  if (paise == null) return "—";
  return `₹${(paise / 100).toLocaleString("en-IN")}`;
}

export default function ComparePage() {
  return (
    <Suspense fallback={<CompareSkeleton />}>
      <CompareBody />
    </Suspense>
  );
}

function CompareSkeleton() {
  return (
    <Container className="py-10 max-w-5xl space-y-4">
      <Skeleton className="h-8 w-56" />
      <Skeleton className="h-96 w-full rounded-xl" />
    </Container>
  );
}

function CompareBody() {
  const searchParams = useSearchParams();
  const ids = searchParams.getAll("id").filter(Boolean).slice(0, 3);
  const { data, isLoading, isError, error } = useComparison(ids);

  if (ids.length < 2) {
    return (
      <Container className="py-20 max-w-lg">
        <EmptyState
          icon={<GitCompare className="w-6 h-6" />}
          title="Pick two or three projects"
          description="Comparison works on 2–3 listings at a time. Open a project and use 'Compare side by side' from the related projects section, or add ?id=…&id=… to this URL."
          action={
            <Button asChild>
              <Link href="/projects?for_sale=true">Browse projects</Link>
            </Button>
          }
        />
      </Container>
    );
  }

  if (isLoading) return <CompareSkeleton />;

  if (isError || !data) {
    return (
      <Container className="py-20 max-w-lg">
        <EmptyState
          icon={<GitCompare className="w-6 h-6" />}
          title="Couldn't build that comparison"
          description={
            (error as Error | undefined)?.message ??
            "One or more of those projects couldn't be found."
          }
          action={
            <Button asChild>
              <Link href="/projects">Browse projects</Link>
            </Button>
          }
        />
      </Container>
    );
  }

  return (
    <Container className="py-8 sm:py-10 max-w-5xl">
      <PageHeader
        title="Side-by-side comparison"
        description="The same six components that make up each Verified Build Score, aligned so you can see where the difference actually is. Column weights come from the scoring engine, not from this page."
      />
      <ComparisonTable data={data} />
    </Container>
  );
}

function ComparisonTable({ data }: { data: Comparison }) {
  const { projects, component_spec, component_leaders, overall_leader, threshold } = data;
  const cols = projects.length;

  return (
    <div className="space-y-6">
      {/* Header cards — become the mobile layout too */}
      <div
        className={cn(
          "grid gap-3",
          cols === 2 ? "sm:grid-cols-2" : "sm:grid-cols-3",
        )}
      >
        {projects.map((project) => {
          const winner = project.project_id === overall_leader;
          return (
            <div
              key={project.project_id}
              className={cn(
                "rounded-xl border bg-card p-4",
                winner && "border-primary/40 ring-1 ring-primary/15",
              )}
            >
              {winner && (
                <Badge variant="brand" size="sm" className="mb-2">
                  <Crown className="w-3 h-3" /> Highest score
                </Badge>
              )}
              <Link
                href={`/projects/${project.project_id}`}
                className="font-semibold text-sm leading-snug hover:text-primary transition-colors block"
              >
                {project.title}
              </Link>
              <div className="flex items-baseline gap-1.5 mt-2">
                <span className="text-3xl font-semibold tabular-nums">
                  {project.verified_build_score ?? "—"}
                </span>
                {project.verified_build_score != null && (
                  <span className="text-xs text-muted-foreground">/100</span>
                )}
              </div>
              <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                {project.is_verified ? (
                  <Badge variant="success" size="sm">
                    <ShieldCheck className="w-3 h-3" /> Verified
                  </Badge>
                ) : (
                  <Badge variant="ghost" size="sm">
                    Below {threshold} threshold
                  </Badge>
                )}
                {project.confidence && (
                  <Badge variant="ghost" size="sm" className="capitalize">
                    {project.confidence} confidence
                  </Badge>
                )}
              </div>
              {project.is_for_sale && (
                <p className="text-sm font-semibold tabular-nums mt-2.5">
                  {inr(project.price_paise)}
                </p>
              )}
            </div>
          );
        })}
      </div>

      {/* Component rows */}
      <section aria-labelledby="components-heading" className="rounded-xl border bg-card overflow-hidden">
        <h2 id="components-heading" className="px-4 py-3 border-b font-semibold text-sm">
          Score components
        </h2>
        <ul className="divide-y">
          {component_spec.map((spec) => (
            <li key={spec.key} className="px-4 py-3">
              <div className="flex items-baseline justify-between gap-2 mb-2">
                <span className="text-xs font-medium">{spec.label}</span>
                <span className="text-[11px] text-muted-foreground tabular-nums">
                  {Math.round(spec.weight * 100)}% of score
                </span>
              </div>
              <div
                className={cn(
                  "grid gap-3",
                  cols === 2 ? "grid-cols-2" : "grid-cols-3",
                )}
              >
                {projects.map((project) => {
                  const component = project.components.find((c) => c.key === spec.key);
                  const score = component?.score ?? null;
                  const leads = component_leaders[spec.key] === project.project_id;
                  return (
                    <div key={project.project_id}>
                      <div className="flex items-center gap-1.5">
                        <span
                          className={cn(
                            "text-sm font-semibold tabular-nums",
                            leads && "text-primary",
                          )}
                        >
                          {score ?? "—"}
                        </span>
                        {leads && score != null && (
                          <Crown className="w-3 h-3 text-primary flex-shrink-0" />
                        )}
                      </div>
                      <div
                        className="h-1.5 rounded-full bg-border overflow-hidden mt-1"
                        role="presentation"
                      >
                        <div
                          className={cn(
                            "h-full rounded-full",
                            leads ? "bg-primary" : "bg-muted-foreground/40",
                          )}
                          style={{ width: `${Math.max(0, Math.min(100, score ?? 0))}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
              <p className="text-[11px] text-muted-foreground mt-2 leading-relaxed">
                {spec.explains}
              </p>
            </li>
          ))}
        </ul>
      </section>

      {/* Evidence + engineering rows */}
      <section aria-labelledby="evidence-heading" className="rounded-xl border bg-card overflow-hidden">
        <h2 id="evidence-heading" className="px-4 py-3 border-b font-semibold text-sm">
          Evidence &amp; engineering practice
        </h2>
        <div className="divide-y">
          <Row label="Commits analysed" projects={projects} cols={cols}
            render={(p) => p.commits_analyzed?.toLocaleString("en-IN") ?? "—"} />
          <Row label="Contributors" projects={projects} cols={cols}
            render={(p) => p.contributors_count ?? "—"} />
          <Row label="Repo age" projects={projects} cols={cols}
            render={(p) => (p.repo_age_days != null ? `${p.repo_age_days} days` : "—")} />
          <Row label="Automated tests" projects={projects} cols={cols}
            render={(p) => <BoolCell value={p.has_tests} />} />
          <Row label="CI pipeline" projects={projects} cols={cols}
            render={(p) => <BoolCell value={p.has_ci} />} />
          <Row label="Dependencies" projects={projects} cols={cols}
            render={(p) => (p.dependency_count != null ? `~${p.dependency_count}` : "—")} />
          <Row label="Licence" projects={projects} cols={cols}
            render={(p) => <LicenceChip licenceClass={p.licence_class} />} />
          <Row label="Stars" projects={projects} cols={cols}
            render={(p) => (
              <span className="inline-flex items-center gap-1">
                <Star className="w-3 h-3 text-muted-foreground" />
                {p.stars}
              </span>
            )} />
          <Row label="Open issues" projects={projects} cols={cols}
            render={(p) => p.open_issues} />
          <Row label="Trust flags" projects={projects} cols={cols}
            render={(p) =>
              p.fraud_flags.length === 0 ? (
                <span className="text-text-success inline-flex items-center gap-1">
                  <Check className="w-3.5 h-3.5" /> None
                </span>
              ) : (
                <span className="text-destructive">{p.fraud_flags.length}</span>
              )
            } />
        </div>
      </section>

      <p className="text-xs text-muted-foreground leading-relaxed max-w-prose">
        A crown marks the leader on each row. It is not a recommendation — a
        project can lead on cadence and still be the wrong purchase for you.
        The weights shown are the live weights from the scoring engine, so this
        table changes if the methodology does.{" "}
        <Link href="/how-verification-works" className="text-primary hover:underline">
          Read the methodology
        </Link>
        .
      </p>
    </div>
  );
}

function Row({
  label,
  projects,
  cols,
  render,
}: {
  label: string;
  projects: Comparison["projects"];
  cols: number;
  render: (p: Comparison["projects"][number]) => React.ReactNode;
}) {
  return (
    <div className="px-4 py-2.5">
      <p className="text-xs text-muted-foreground mb-1.5">{label}</p>
      <div className={cn("grid gap-3", cols === 2 ? "grid-cols-2" : "grid-cols-3")}>
        {projects.map((project) => (
          <div key={project.project_id} className="text-sm font-medium tabular-nums">
            {render(project)}
          </div>
        ))}
      </div>
    </div>
  );
}

function BoolCell({ value }: { value: boolean | null | undefined }) {
  if (value == null) return <Minus className="w-3.5 h-3.5 text-muted-foreground" />;
  return value ? (
    <Check className="w-4 h-4 text-text-success" />
  ) : (
    <X className="w-4 h-4 text-destructive" />
  );
}
