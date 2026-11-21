"use client";
import Link from "next/link";
import { GitCompare, Sparkles, Star } from "lucide-react";
import { Badge } from "@/components/ui/primitives";
import { Skeleton } from "@/components/ui/skeleton";
import { BuildScoreChip } from "@/components/trust/trust-badges";
import { useSimilarProjects } from "@/lib/hooks/advanced";
import { cn } from "@/lib/utils";

/**
 * Related listings, each carrying the reason it matched.
 *
 * The reasons are the point. A "you might also like" rail with no stated basis is
 * indistinguishable from a random rail, and buyers notice — so every row says
 * "shares topics: fintech, ledger" or "also TypeScript" rather than leaving the
 * relevance implied.
 */
export function SimilarProjects({
  projectId,
  limit = 6,
  className,
}: {
  projectId: string;
  limit?: number;
  className?: string;
}) {
  const { data: similar, isLoading } = useSimilarProjects(projectId, limit);

  if (isLoading) {
    return (
      <div className={cn("space-y-2", className)}>
        <Skeleton className="h-5 w-40" />
        <div className="grid gap-3 sm:grid-cols-2">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  // Nothing genuinely related is a valid answer. An empty rail is better than a
  // padded one.
  if (!similar || similar.length === 0) return null;

  return (
    <section className={className} aria-labelledby="similar-heading">
      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <h2 id="similar-heading" className="font-semibold text-sm flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-primary" /> Related projects
        </h2>
        {similar.length >= 2 && (
          <Link
            href={`/compare?id=${projectId}&id=${similar[0].project_id}`}
            className={cn(
              "text-xs font-medium text-primary hover:underline",
              "inline-flex items-center gap-1.5",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded",
            )}
          >
            <GitCompare className="w-3.5 h-3.5" /> Compare side by side
          </Link>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {similar.map((project) => (
          <Link
            key={project.project_id}
            href={`/projects/${project.project_id}`}
            className={cn(
              "rounded-xl border bg-card p-4 block transition-colors",
              "hover:border-border-strong",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <h3 className="font-medium text-sm leading-snug line-clamp-2">
                {project.title}
              </h3>
              <BuildScoreChip
                score={project.verified_build_score}
                verified={project.is_verified}
              />
            </div>

            <ul className="mt-2 space-y-0.5">
              {project.reasons.map((reason) => (
                <li key={reason} className="text-xs text-muted-foreground">
                  · {reason}
                </li>
              ))}
            </ul>

            <div className="mt-2.5 flex items-center gap-2 flex-wrap text-xs text-muted-foreground">
              {project.stars > 0 && (
                <span className="inline-flex items-center gap-1">
                  <Star className="w-3 h-3" /> {project.stars}
                </span>
              )}
              {project.is_for_sale && project.price_paise != null && (
                <Badge variant="brand" size="sm">
                  ₹{(project.price_paise / 100).toLocaleString("en-IN")}
                </Badge>
              )}
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
