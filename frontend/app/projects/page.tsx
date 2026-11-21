"use client";
import { Suspense, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { Search, SlidersHorizontal, X, Tag, ShoppingBag, Compass, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, Select } from "@/components/ui/primitives";
import { ProjectGrid, EmptyProjects } from "@/components/projects/project-card";
import { ProjectGridSkeleton } from "@/components/ui/skeleton";
import { useProjects } from "@/lib/hooks";
import { useDebounce } from "@/lib/hooks/use-debounce";
import { cn } from "@/lib/utils";
import type { ProjectStage } from "@/types";

const STAGES: ProjectStage[] = ["idea", "prototype", "mvp", "production"];
const LANGUAGES = ["Python", "TypeScript", "JavaScript", "Go", "Rust", "Java", "C++", "Ruby", "Swift", "Kotlin"];
const SORT_OPTIONS = [
  { value: "created_at", label: "Newest" },
  { value: "stars", label: "Most stars" },
  { value: "updated_at", label: "Recently updated" },
];

interface Filters {
  search: string;
  stage: ProjectStage | "";
  language: string;
  seeking_contributors: boolean | undefined;
  for_sale: boolean | undefined;
  sort_by: string;
  sort_dir: "asc" | "desc";
  page: number;
}

const DEFAULT_FILTERS: Filters = {
  search: "",
  stage: "",
  language: "",
  seeking_contributors: undefined,
  for_sale: undefined,
  sort_by: "created_at",
  sort_dir: "desc",
  page: 1,
};

function FilterChip({
  label, active, onClick,
}: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "px-3 py-1.5 rounded-full text-xs font-medium border transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
        active
          ? "bg-primary text-primary-foreground border-primary shadow-xs"
          : "bg-card text-muted-foreground border-border hover:border-primary/40 hover:text-foreground"
      )}
    >
      {label}
    </button>
  );
}

function RemovablePill({ children, onRemove }: { children: React.ReactNode; onRemove: () => void }) {
  return (
    <button
      onClick={onRemove}
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border bg-card text-xs font-medium text-muted-foreground hover:text-foreground hover:border-border-strong transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
    >
      {children}
      <X className="w-3 h-3" />
      <span className="sr-only">Remove filter</span>
    </button>
  );
}

function ProjectsBrowser({ forSaleDefault }: { forSaleDefault: boolean }) {
  const [filters, setFilters] = useState<Filters>(() => ({
    ...DEFAULT_FILTERS,
    for_sale: forSaleDefault ? true : undefined,
  }));
  const [showFilters, setShowFilters] = useState(false);

  const debouncedSearch = useDebounce(filters.search, 350);

  const activeFilters = {
    page: filters.page,
    per_page: 18,
    search: debouncedSearch || undefined,
    language: filters.language || undefined,
    stage: filters.stage || undefined,
    seeking_contributors: filters.seeking_contributors,
    for_sale: filters.for_sale,
    sort_by: filters.sort_by,
    sort_dir: filters.sort_dir,
  };

  const { data, isLoading, isFetching } = useProjects(activeFilters);

  const update = useCallback(
    (patch: Partial<Filters>) => setFilters((prev) => ({ ...prev, ...patch, page: 1 })),
    []
  );

  const clearAll = () => setFilters(DEFAULT_FILTERS);

  const activeCount =
    (filters.stage ? 1 : 0) +
    (filters.language ? 1 : 0) +
    (filters.seeking_contributors !== undefined ? 1 : 0) +
    (filters.for_sale !== undefined ? 1 : 0);
  const hasActiveFilters = activeCount > 0 || !!filters.search;

  const isMarketplace = filters.for_sale === true;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-2">
          <span className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
            {isMarketplace ? <ShoppingBag className="w-4 h-4" /> : <Compass className="w-4 h-4" />}
          </span>
          <h1 className="text-display-md">{isMarketplace ? "Marketplace" : "Explore projects"}</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          {isMarketplace
            ? (data?.total
                ? `${data.total.toLocaleString()} verified ${data.total === 1 ? "project" : "projects"} for sale`
                : "Verified student software you can buy today")
            : (data?.total
                ? `${data.total.toLocaleString()} ${data.total === 1 ? "project" : "projects"} — discover, buy, or build on top`
                : "Discover student-built software")}
        </p>
      </div>

      {/* Search + controls */}
      <div className="sticky top-16 z-20 -mx-4 sm:-mx-6 px-4 sm:px-6 py-3 mb-5 glass border-b">
        <div className="flex gap-2.5 flex-wrap items-center">
          <div className="relative flex-1 min-w-[13rem]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <input
              type="search"
              aria-label="Search projects"
              className="w-full h-10 pl-9 pr-9 text-sm rounded-xl border border-input bg-card shadow-xs placeholder:text-muted-foreground/70 transition-[box-shadow,border-color] focus-visible:outline-none focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-primary/12"
              placeholder="Search projects, repos, or descriptions…"
              value={filters.search}
              onChange={(e) => update({ search: e.target.value })}
            />
            {filters.search && (
              <button
                onClick={() => update({ search: "" })}
                aria-label="Clear search"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <Button
            variant={showFilters ? "secondary" : "outline"}
            className="gap-1.5"
            onClick={() => setShowFilters((s) => !s)}
            aria-expanded={showFilters}
          >
            <SlidersHorizontal className="w-4 h-4" />
            Filters
            {activeCount > 0 && (
              <span className="ml-0.5 min-w-5 h-5 px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-semibold flex items-center justify-center tabular-nums">
                {activeCount}
              </span>
            )}
          </Button>

          <div className="w-[11rem]">
            <Select
              aria-label="Sort projects"
              value={filters.sort_by}
              onChange={(e) => update({ sort_by: e.target.value })}
            >
              {SORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </Select>
          </div>
        </div>
      </div>

      {/* Expanded filters */}
      {showFilters && (
        <div className="rounded-xl border bg-card p-5 mb-5 space-y-5 animate-fade-in">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2.5">Stage</p>
            <div className="flex flex-wrap gap-2">
              {STAGES.map((s) => (
                <FilterChip
                  key={s}
                  label={s.charAt(0).toUpperCase() + s.slice(1)}
                  active={filters.stage === s}
                  onClick={() => update({ stage: filters.stage === s ? "" : s })}
                />
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2.5">Language</p>
            <div className="flex flex-wrap gap-2">
              {LANGUAGES.map((l) => (
                <FilterChip
                  key={l}
                  label={l}
                  active={filters.language === l}
                  onClick={() => update({ language: filters.language === l ? "" : l })}
                />
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2.5">Availability</p>
            <div className="flex flex-wrap gap-2">
              <FilterChip
                label="For sale"
                active={filters.for_sale === true}
                onClick={() => update({ for_sale: filters.for_sale === true ? undefined : true })}
              />
              <FilterChip
                label="Seeking contributors"
                active={filters.seeking_contributors === true}
                onClick={() =>
                  update({
                    seeking_contributors: filters.seeking_contributors === true ? undefined : true,
                  })
                }
              />
            </div>
          </div>

          {hasActiveFilters && (
            <div className="pt-1">
              <Button variant="ghost" size="sm" onClick={clearAll}>Clear all filters</Button>
            </div>
          )}
        </div>
      )}

      {/* Active filter pills */}
      {hasActiveFilters && !showFilters && (
        <div className="flex flex-wrap items-center gap-2 mb-5">
          {filters.stage && (
            <RemovablePill onRemove={() => update({ stage: "" })}>
              <span className="capitalize">{filters.stage}</span>
            </RemovablePill>
          )}
          {filters.language && (
            <RemovablePill onRemove={() => update({ language: "" })}>{filters.language}</RemovablePill>
          )}
          {filters.seeking_contributors && (
            <RemovablePill onRemove={() => update({ seeking_contributors: undefined })}>
              Seeking contributors
            </RemovablePill>
          )}
          {filters.for_sale && (
            <RemovablePill onRemove={() => update({ for_sale: undefined })}>
              <Tag className="w-3 h-3" /> For sale
            </RemovablePill>
          )}
          <button
            onClick={clearAll}
            className="text-xs text-primary hover:underline ml-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded"
          >
            Clear all
          </button>
        </div>
      )}

      {/* Results */}
      <div
        className={cn(
          "transition-opacity duration-200",
          isFetching && !isLoading && "opacity-60"
        )}
        aria-busy={isFetching || undefined}
      >
        {isLoading ? (
          <ProjectGridSkeleton count={9} />
        ) : !data?.items.length ? (
          <EmptyProjects
            message="No projects match your filters. Try broadening your search."
            action={
              hasActiveFilters
                ? <Button variant="outline" size="sm" onClick={clearAll}>Clear filters</Button>
                : undefined
            }
          />
        ) : (
          <ProjectGrid projects={data.items} />
        )}
      </div>

      {/* Pagination */}
      {data && data.pages > 1 && (
        <nav className="flex items-center justify-center gap-3 mt-12" aria-label="Pagination">
          <Button
            variant="outline"
            disabled={filters.page === 1 || isLoading}
            onClick={() => setFilters((p) => ({ ...p, page: p.page - 1 }))}
          >
            <ChevronLeft className="w-4 h-4" /> Previous
          </Button>
          <span className="text-sm text-muted-foreground tabular-nums px-2">
            Page {filters.page} of {data.pages}
          </span>
          <Button
            variant="outline"
            disabled={filters.page >= data.pages || isLoading}
            onClick={() => setFilters((p) => ({ ...p, page: p.page + 1 }))}
          >
            Next <ChevronRight className="w-4 h-4" />
          </Button>
        </nav>
      )}
    </div>
  );
}

function ProjectsPageContent() {
  const searchParams = useSearchParams();
  const forSaleDefault = searchParams.get("for_sale") === "true";
  return <ProjectsBrowser key={searchParams.toString()} forSaleDefault={forSaleDefault} />;
}

export default function ProjectsPage() {
  return (
    <Suspense fallback={<ProjectGridSkeleton />}>
      <ProjectsPageContent />
    </Suspense>
  );
}
