import Link from "next/link";
import {
  Star, GitFork, Users, Zap, CheckCircle2, ArrowUpRight, Tag,
  HeartHandshake, Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge, EmptyState } from "@/components/ui/primitives";
import { ScorePill } from "@/components/shared/score-badge";
import type { ProjectListItem } from "@/types";

const LANGUAGE_COLORS: Record<string, string> = {
  Python: "bg-blue-400",
  TypeScript: "bg-primary/100",
  JavaScript: "bg-yellow-400",
  Rust: "bg-orange-500",
  Go: "bg-cyan-400",
  Java: "bg-score-low",
  "C++": "bg-pink-500",
  "C#": "bg-purple-500",
  Ruby: "bg-red-400",
  Swift: "bg-orange-400",
  Kotlin: "bg-purple-400",
  Dart: "bg-teal-400",
  HTML: "bg-orange-400",
  CSS: "bg-indigo-400",
  Shell: "bg-lime-400",
  Vue: "bg-emerald-400",
};

function LanguageDot({ lang }: { lang: string }) {
  const color = LANGUAGE_COLORS[lang] ?? "bg-muted-foreground";
  return (
    <span className="flex items-center gap-1.5 text-xs text-muted-foreground min-w-0">
      <span className={cn("inline-block w-2 h-2 rounded-full flex-shrink-0", color)} aria-hidden />
      <span className="truncate">{lang}</span>
    </span>
  );
}

function formatCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`;
  return n.toLocaleString();
}

interface ProjectCardProps {
  project: ProjectListItem;
  className?: string;
}

export function ProjectCard({ project, className }: ProjectCardProps) {
  const hasAnalysis =
    project.health_score !== null || project.startup_potential !== null;
  const price = project.is_for_sale && project.price_paise != null
    ? `₹${(project.price_paise / 100).toLocaleString("en-IN")}`
    : null;

  return (
    <Link
      href={`/projects/${project.id}`}
      className={cn(
        "group relative flex h-full flex-col rounded-xl border bg-card p-5 card-interactive",
        "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/25 focus-visible:border-primary",
        project.is_featured && "border-primary/35",
        className
      )}
    >
      {/* Status ribbons */}
      {(project.is_featured || project.is_open_for_adoption) && (
        <div className="absolute -top-2.5 left-4 flex gap-1.5">
          {project.is_featured && (
            <Badge size="sm" className="shadow-sm gap-1">
              <Sparkles className="w-2.5 h-2.5" /> Featured
            </Badge>
          )}
          {project.is_open_for_adoption && (
            <Badge size="sm" variant="warning" className="shadow-sm gap-1">
              <HeartHandshake className="w-2.5 h-2.5" /> Adoptable
            </Badge>
          )}
        </div>
      )}

      {/* Header */}
      <div className="flex items-start justify-between gap-2.5 mb-2.5">
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-[0.95rem] leading-snug line-clamp-1 group-hover:text-primary transition-colors">
            {project.title}
          </h3>
          <p className="text-xs text-muted-foreground mt-1 truncate font-mono">
            {project.repo_full_name}
          </p>
        </div>

        {price ? (
          <span className="flex-shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-background-success text-text-success text-xs font-bold tabular-nums">
            <Tag className="w-3 h-3" aria-hidden /> {price}
          </span>
        ) : (
          <ArrowUpRight
            className="w-4 h-4 flex-shrink-0 text-muted-foreground/30 group-hover:text-primary transition-colors"
            aria-hidden
          />
        )}
      </div>

      {/* Description */}
      {project.description && (
        <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed mb-3">
          {project.description}
        </p>
      )}

      {/* Topics */}
      {project.topics.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-4">
          {project.topics.slice(0, 3).map((t) => (
            <span
              key={t}
              className="text-[10px] px-1.5 py-0.5 rounded-md bg-secondary text-secondary-foreground max-w-[8rem] truncate"
            >
              {t}
            </span>
          ))}
          {project.topics.length > 3 && (
            <span className="text-[10px] px-1.5 py-0.5 text-muted-foreground">
              +{project.topics.length - 3}
            </span>
          )}
        </div>
      )}

      {/* Footer — pinned to the bottom so cards align in a grid */}
      <div className="mt-auto flex items-center justify-between gap-2 pt-3 border-t">
        <div className="flex items-center gap-2.5 min-w-0">
          {project.primary_language && <LanguageDot lang={project.primary_language} />}
          <span className="flex items-center gap-1 text-xs text-muted-foreground tabular-nums">
            <Star className="w-3 h-3" aria-hidden />
            {formatCount(project.stars)}
            <span className="sr-only">stars</span>
          </span>
          <span className="flex items-center gap-1 text-xs text-muted-foreground tabular-nums">
            <GitFork className="w-3 h-3" aria-hidden />
            {formatCount(project.forks)}
            <span className="sr-only">forks</span>
          </span>
        </div>

        <div className="flex items-center gap-1.5 flex-shrink-0">
          {project.is_verified && (
            <span title="Verified build">
              <CheckCircle2 className="w-3.5 h-3.5 text-text-success" />
              <span className="sr-only">Verified build</span>
            </span>
          )}
          {project.is_seeking_contributors && (
            <span title="Seeking contributors">
              <Users className="w-3.5 h-3.5 text-primary" />
              <span className="sr-only">Seeking contributors</span>
            </span>
          )}
          {hasAnalysis && (
            <ScorePill score={project.startup_potential ?? project.health_score} label="" />
          )}
        </div>
      </div>
    </Link>
  );
}

export function ProjectGrid({
  projects,
  className,
}: {
  projects: ProjectListItem[];
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 stagger",
        className
      )}
    >
      {projects.map((p) => (
        <ProjectCard key={p.id} project={p} />
      ))}
    </div>
  );
}

export function EmptyProjects({
  message = "No projects found.",
  action,
}: {
  message?: string;
  action?: React.ReactNode;
}) {
  return (
    <EmptyState
      icon={<Zap />}
      title="Nothing here yet"
      description={message}
      action={action}
    />
  );
}
