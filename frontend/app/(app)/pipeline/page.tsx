"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Bell, BellOff, Bookmark, ExternalLink, Plus, RefreshCw, Search, Trash2, X,
} from "lucide-react";
import {
  Badge, Card, CardContent, EmptyState, Input, Label, Select, Textarea,
} from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/ui/layout";
import { Alert, FormError } from "@/components/ui/alert";
import { ListSkeleton, Skeleton } from "@/components/ui/skeleton";
import {
  useCreateSavedSearch, useDeleteSavedSearch, useRemoveFromShortlist,
  useRunSavedSearch, useSavedSearches, useShortlist, useUpdateSavedSearch,
  useUpdateShortlistEntry,
} from "@/lib/hooks/analytics";
import { useMe } from "@/lib/hooks";
import { useAuthStore } from "@/stores/auth";
import { getErrorMessage } from "@/lib/api/client";
import type { SavedSearchFilters } from "@/types";
import { cn } from "@/lib/utils";

const STAGES = ["screening", "contacted", "in discussion", "offer", "passed"];

function rupees(paise: number | null): string {
  if (paise == null) return "—";
  return "₹" + (paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

function describeFilters(f: SavedSearchFilters): string {
  const parts: string[] = [];
  if (f.search) parts.push(`"${f.search}"`);
  if (f.language) parts.push(f.language);
  if (f.stage) parts.push(f.stage);
  if (f.verified_only) parts.push("verified only");
  if (f.for_sale) parts.push("for sale");
  if (f.seeking_contributors) parts.push("seeking contributors");
  if (f.min_score != null) parts.push(`score ${f.min_score}+`);
  if (f.max_price_paise != null) parts.push(`under ${rupees(f.max_price_paise)}`);
  return parts.length ? parts.join(" · ") : "no filters";
}

/** Build a discovery URL so a saved search is one click from real results. */
function searchToHref(f: SavedSearchFilters): string {
  const q = new URLSearchParams();
  if (f.search) q.set("search", f.search);
  if (f.language) q.set("language", f.language);
  if (f.stage) q.set("stage", f.stage);
  if (f.for_sale) q.set("for_sale", "true");
  if (f.seeking_contributors) q.set("seeking_contributors", "true");
  return `/projects${q.toString() ? `?${q}` : ""}`;
}

export default function PipelinePage() {
  const token = useAuthStore((s) => s.accessToken);
  const router = useRouter();
  const { data: me } = useMe();

  useEffect(() => {
    if (!token) router.replace("/auth/login");
  }, [token, router]);

  const searches = useSavedSearches();
  const shortlist = useShortlist();

  const roleAllowed =
    me?.role === "founder" || me?.role === "incubator" ||
    me?.role === "mentor" || me?.role === "admin";

  if (!token) {
    return (
      <Container className="py-10">
        <Skeleton className="h-8 w-56" />
      </Container>
    );
  }

  // Gated by role, not plan. Say so plainly and offer the way in.
  if (me && !roleAllowed) {
    return (
      <Container className="py-16 max-w-lg">
        <EmptyState
          icon={<Bookmark />}
          title="Pipeline is for hiring and funding accounts"
          description="Saved searches and shortlists are built for founders, incubators and mentors evaluating builders. You can switch your account mode in Settings."
          action={
            <>
              <Button asChild>
                <Link href="/settings">Switch account mode</Link>
              </Button>
              <Button variant="outline" asChild>
                <Link href="/projects">Browse projects</Link>
              </Button>
            </>
          }
        />
      </Container>
    );
  }

  return (
    <Container className="py-10 space-y-10 max-w-4xl">
      <div>
        <h1 className="text-display-lg">Your pipeline</h1>
        <p className="text-sm text-muted-foreground mt-1.5 max-w-xl leading-relaxed">
          Saved searches you can re-run, and a private shortlist with notes only
          you can see.
        </p>
      </div>

      <SavedSearchesSection searches={searches} />
      <ShortlistSection shortlist={shortlist} />
    </Container>
  );
}

// ══════════════════════════════════════════════════════════════════════════════

function SavedSearchesSection({
  searches,
}: {
  searches: ReturnType<typeof useSavedSearches>;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const create = useCreateSavedSearch();
  const update = useUpdateSavedSearch();
  const remove = useDeleteSavedSearch();
  const run = useRunSavedSearch();
  const [runResult, setRunResult] = useState<Record<string, string>>({});

  const [name, setName] = useState("");
  const [filters, setFilters] = useState<SavedSearchFilters>({
    verified_only: true,
    for_sale: false,
    seeking_contributors: false,
  });
  const [alerts, setAlerts] = useState(true);

  const submit = () => {
    setError(null);
    if (!name.trim()) {
      setError("Give the search a name so you can recognise it later.");
      return;
    }
    create.mutate(
      { name, filters, alerts_enabled: alerts },
      {
        onSuccess: () => {
          setOpen(false);
          setName("");
          setFilters({ verified_only: true, for_sale: false, seeking_contributors: false });
        },
        onError: (e) => setError(getErrorMessage(e)),
      }
    );
  };

  return (
    <section className="space-y-4">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h2 className="font-display text-xl font-semibold">Saved searches</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Re-run a query and see how many matches are new since you last looked.
          </p>
        </div>
        {!open && (
          <Button size="sm" variant="cta" onClick={() => setOpen(true)}>
            <Plus className="w-3.5 h-3.5" /> New search
          </Button>
        )}
      </div>

      {open && (
        <Card>
          <CardContent className="pt-5 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <p className="font-semibold text-sm">New saved search</p>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Cancel"
                className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="search-name">Name</Label>
              <Input
                id="search-name"
                placeholder="e.g. Verified Python projects under ₹10k"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <div className="grid sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="search-text">Keyword</Label>
                <Input
                  id="search-text"
                  placeholder="Optional"
                  value={filters.search ?? ""}
                  onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value || null }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="search-lang">Language</Label>
                <Input
                  id="search-lang"
                  placeholder="e.g. Python"
                  value={filters.language ?? ""}
                  onChange={(e) => setFilters((f) => ({ ...f, language: e.target.value || null }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="search-score">Minimum build score</Label>
                <Input
                  id="search-score"
                  type="number"
                  min={0}
                  max={100}
                  placeholder="e.g. 70"
                  value={filters.min_score ?? ""}
                  onChange={(e) =>
                    setFilters((f) => ({
                      ...f,
                      min_score: e.target.value ? Number(e.target.value) : null,
                    }))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="search-price">Max price (₹)</Label>
                <Input
                  id="search-price"
                  type="number"
                  min={0}
                  placeholder="e.g. 10000"
                  value={
                    filters.max_price_paise != null ? filters.max_price_paise / 100 : ""
                  }
                  onChange={(e) =>
                    setFilters((f) => ({
                      ...f,
                      max_price_paise: e.target.value ? Number(e.target.value) * 100 : null,
                    }))
                  }
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-4 pt-1">
              <Toggle
                label="Verified only"
                checked={!!filters.verified_only}
                onChange={(v) => setFilters((f) => ({ ...f, verified_only: v }))}
              />
              <Toggle
                label="For sale"
                checked={!!filters.for_sale}
                onChange={(v) => setFilters((f) => ({ ...f, for_sale: v }))}
              />
              <Toggle
                label="Seeking contributors"
                checked={!!filters.seeking_contributors}
                onChange={(v) => setFilters((f) => ({ ...f, seeking_contributors: v }))}
              />
              <Toggle
                label="Alert me to new matches"
                checked={alerts}
                onChange={setAlerts}
              />
            </div>

            <FormError message={error} />

            <div className="flex gap-2">
              <Button size="sm" onClick={submit} loading={create.isPending}>
                Save search
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {searches.isLoading && <ListSkeleton rows={3} />}

      {searches.isError && (
        <Alert
          variant="warning"
          title="Couldn't load your saved searches"
          description={getErrorMessage(searches.error)}
        />
      )}

      {searches.data && searches.data.length === 0 && !open && (
        <EmptyState
          icon={<Search />}
          title="No saved searches yet"
          description="Save a query once and re-run it whenever you want, instead of rebuilding the same filters each time."
          action={
            <Button variant="cta" onClick={() => setOpen(true)}>
              <Plus className="w-4 h-4" /> Create one
            </Button>
          }
        />
      )}

      {searches.data && searches.data.length > 0 && (
        <div className="rounded-xl border bg-card divide-y">
          {searches.data.map((s) => (
            <div key={s.id} className="p-4 flex items-start gap-3 flex-wrap">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-medium text-sm">{s.name}</p>
                  {s.alerts_enabled ? (
                    <Badge variant="info" size="sm">
                      <Bell className="w-3 h-3" /> alerts on
                    </Badge>
                  ) : (
                    <Badge variant="ghost" size="sm">
                      <BellOff className="w-3 h-3" /> alerts off
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {describeFilters(s.filters)}
                </p>
                <p className="text-xs text-muted-foreground mt-1 tabular-nums">
                  {s.last_match_count} match{s.last_match_count === 1 ? "" : "es"} when
                  last checked
                  {runResult[s.id] && (
                    <span className="text-text-success font-medium">
                      {" "}· {runResult[s.id]}
                    </span>
                  )}
                </p>
              </div>

              <div className="flex items-center gap-1.5 flex-shrink-0">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs gap-1.5"
                  loading={run.isPending && run.variables === s.id}
                  onClick={() =>
                    run.mutate(s.id, {
                      onSuccess: (r) =>
                        setRunResult((prev) => ({
                          ...prev,
                          [s.id]:
                            r.new_since_last_check > 0
                              ? `${r.new_since_last_check} new`
                              : "no new matches",
                        })),
                    })
                  }
                >
                  <RefreshCw className="w-3 h-3" /> Re-run
                </Button>
                <Button size="sm" variant="ghost" className="h-7 text-xs" asChild>
                  <Link href={searchToHref(s.filters)}>
                    <ExternalLink className="w-3 h-3" /> Open
                  </Link>
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs"
                  onClick={() =>
                    update.mutate({ id: s.id, alerts_enabled: !s.alerts_enabled })
                  }
                  aria-label={s.alerts_enabled ? "Turn alerts off" : "Turn alerts on"}
                >
                  {s.alerts_enabled ? <BellOff className="w-3 h-3" /> : <Bell className="w-3 h-3" />}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs text-destructive hover:bg-destructive/10"
                  onClick={() => remove.mutate(s.id)}
                  aria-label={`Delete ${s.name}`}
                >
                  <Trash2 className="w-3 h-3" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

// ══════════════════════════════════════════════════════════════════════════════

function ShortlistSection({
  shortlist,
}: {
  shortlist: ReturnType<typeof useShortlist>;
}) {
  const update = useUpdateShortlistEntry();
  const remove = useRemoveFromShortlist();
  const [editing, setEditing] = useState<string | null>(null);
  const [note, setNote] = useState("");

  return (
    <section className="space-y-4">
      <div>
        <h2 className="font-display text-xl font-semibold">Shortlist</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Projects you&apos;ve set aside. Notes and stages are private — the builder
          never sees them.
        </p>
      </div>

      {shortlist.isLoading && <ListSkeleton rows={3} />}

      {shortlist.isError && (
        <Alert
          variant="warning"
          title="Couldn't load your shortlist"
          description={getErrorMessage(shortlist.error)}
        />
      )}

      {shortlist.data && shortlist.data.length === 0 && (
        <EmptyState
          icon={<Bookmark />}
          title="Nothing shortlisted yet"
          description="Use the bookmark button on any project to add it here with a private note."
          action={
            <Button variant="outline" asChild>
              <Link href="/projects?verified=true">Browse verified projects</Link>
            </Button>
          }
        />
      )}

      {shortlist.data && shortlist.data.length > 0 && (
        <div className="rounded-xl border bg-card divide-y">
          {shortlist.data.map((e) => (
            <div key={e.id} className="p-4 space-y-3">
              <div className="flex items-start gap-3 flex-wrap">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Link
                      href={`/projects/${e.project_id}`}
                      className="font-medium text-sm hover:text-primary transition-colors"
                    >
                      {e.project?.title ?? "Project"}
                    </Link>
                    {e.project?.is_verified && (
                      <Badge variant="success" size="sm">verified</Badge>
                    )}
                    {e.project?.is_for_sale && (
                      <Badge variant="ghost" size="sm">
                        {rupees(e.project.price_paise)}
                      </Badge>
                    )}
                    {e.stage && <Badge variant="info" size="sm">{e.stage}</Badge>}
                  </div>
                  {e.project?.repo_full_name && (
                    <p className="text-xs text-muted-foreground font-mono mt-1 truncate">
                      {e.project.repo_full_name}
                    </p>
                  )}
                  {e.note && editing !== e.id && (
                    <p className="text-xs text-muted-foreground mt-2 border-l-2 pl-2.5 leading-relaxed">
                      {e.note}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <Select
                    aria-label="Stage"
                    className="h-7 text-xs w-auto"
                    value={e.stage ?? ""}
                    onChange={(ev) =>
                      update.mutate({ id: e.id, stage: ev.target.value || undefined })
                    }
                  >
                    <option value="">No stage</option>
                    {STAGES.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </Select>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs"
                    onClick={() => {
                      setEditing(editing === e.id ? null : e.id);
                      setNote(e.note ?? "");
                    }}
                  >
                    {e.note ? "Edit note" : "Add note"}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs text-destructive hover:bg-destructive/10"
                    onClick={() => remove.mutate(e.id)}
                    aria-label="Remove from shortlist"
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              </div>

              {editing === e.id && (
                <div className="space-y-2">
                  <Textarea
                    rows={2}
                    placeholder="Why is this on your shortlist?"
                    value={note}
                    onChange={(ev) => setNote(ev.target.value)}
                  />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      className="h-7 text-xs"
                      loading={update.isPending}
                      onClick={() =>
                        update.mutate(
                          { id: e.id, note },
                          { onSuccess: () => setEditing(null) }
                        )
                      }
                    >
                      Save note
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs"
                      onClick={() => setEditing(null)}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function Toggle({
  label, checked, onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="inline-flex items-center gap-2 text-sm cursor-pointer select-none">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className={cn(
          "w-4 h-4 rounded border-input accent-[hsl(var(--primary))]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        )}
      />
      {label}
    </label>
  );
}
