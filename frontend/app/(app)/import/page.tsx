"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Star, GitFork, Lock, ArrowRight, RefreshCw, } from "lucide-react";
import { GithubIcon } from "@/components/shared/icons";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/primitives";
import { Skeleton } from "@/components/ui/skeleton";
import { useGitHubRepos, useImportProject } from "@/lib/hooks";
import { getErrorMessage } from "@/lib/api/client";
import { cn } from "@/lib/utils";
import type { GitHubRepo } from "@/types";

function RepoCard({
  repo,
  selected,
  onClick,
}: {
  repo: GitHubRepo;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full text-left p-4 rounded-xl border transition-all",
        selected
          ? "border-primary bg-primary/5 ring-1 ring-primary"
          : "border-border bg-card hover:border-primary/40"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            {repo.private && <Lock className="w-3 h-3 text-muted-foreground flex-shrink-0" />}
            <span className="font-medium text-sm truncate">{repo.name}</span>
          </div>
          {repo.description && (
            <p className="text-xs text-muted-foreground truncate">{repo.description}</p>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0 text-xs text-muted-foreground">
          {repo.language && (
            <span className="hidden sm:inline">{repo.language}</span>
          )}
          <span className="flex items-center gap-0.5">
            <Star className="w-3 h-3" />{repo.stars}
          </span>
        </div>
      </div>
    </button>
  );
}

export default function ImportPage() {
  const router = useRouter();
  const [githubToken, setGithubToken] = useState("");
  const [tokenSubmitted, setTokenSubmitted] = useState(false);
  const [selected, setSelected] = useState<GitHubRepo | null>(null);
  const [search, setSearch] = useState("");
  const [customTitle, setCustomTitle] = useState("");
  const [seekingContributors, setSeekingContributors] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const { data: repos, isLoading, refetch } = useGitHubRepos(
    tokenSubmitted ? githubToken : null,
    page
  );
  const { mutateAsync: importProject, isPending } = useImportProject();

  const filtered = repos?.filter(
    (r) =>
      !search ||
      r.name.toLowerCase().includes(search.toLowerCase()) ||
      r.description?.toLowerCase().includes(search.toLowerCase())
  );

  const handleImport = async () => {
    if (!selected) return;
    setError(null);
    try {
      const proj = await importProject({
        data: {
          github_repo_id: selected.id,
          repo_full_name: selected.full_name,
          title: customTitle || selected.name,
          description: selected.description ?? undefined,
          is_seeking_contributors: seekingContributors,
        },
        githubToken,
      });
      router.push(`/projects/${proj.id}`);
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <div className="mb-8">
        <h1 className="text-display-md mb-1">Import a project</h1>
        <p className="text-sm text-muted-foreground">
          Connect GitHub, pick a repository, and get AI analysis in minutes.
        </p>
      </div>

      {/* Step 1: GitHub token */}
      {!tokenSubmitted ? (
        <div className="rounded-xl border bg-card p-6 space-y-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center">1</div>
            <h2 className="font-medium">Connect GitHub</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            Generate a{" "}
            <a href="https://github.com/settings/tokens/new?scopes=repo,user:email" target="_blank" rel="noopener noreferrer"
              className="text-primary hover:underline">GitHub personal access token</a>
            {" "}with <code className="text-xs bg-secondary px-1 py-0.5 rounded">repo</code> scope, then paste it below.
          </p>
          <div className="space-y-1.5">
            <Label>GitHub Token</Label>
            <Input
              type="password"
              placeholder="ghp_xxxxxxxxxxxx"
              value={githubToken}
              onChange={(e) => setGithubToken(e.target.value)}
            />
          </div>
          <Button
            onClick={() => setTokenSubmitted(true)}
            disabled={!githubToken}
            className="gap-2"
          >
            <GithubIcon className="w-4 h-4" /> Load repositories
          </Button>
        </div>
      ) : (
        <div className="space-y-5">
          {/* Step 2: Pick repo */}
          <div className="rounded-xl border bg-card p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center">2</div>
                <h2 className="font-medium">Select a repository</h2>
              </div>
              <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => refetch()}>
                <RefreshCw className="w-3.5 h-3.5" /> Refresh
              </Button>
            </div>

            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <input
                className="w-full pl-9 pr-3 py-2 text-sm rounded-md border bg-background focus-visible:outline-none focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-primary/12"
                placeholder="Search repositories…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            {isLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 rounded-lg" />)}
              </div>
            ) : !filtered?.length ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                No repositories found.
              </p>
            ) : (
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {filtered.map((repo) => (
                  <RepoCard
                    key={repo.id}
                    repo={repo}
                    selected={selected?.id === repo.id}
                    onClick={() => { setSelected(repo); setCustomTitle(repo.name); }}
                  />
                ))}
              </div>
            )}

            <div className="flex justify-between pt-1">
              <Button variant="ghost" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
              <span className="text-xs text-muted-foreground self-center">Page {page}</span>
              <Button variant="ghost" size="sm" disabled={(repos?.length ?? 0) < 100} onClick={() => setPage(p => p + 1)}>Next</Button>
            </div>
          </div>

          {/* Step 3: Configure */}
          {selected && (
            <div className="rounded-xl border bg-card p-5 space-y-4 animate-fade-in">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center">3</div>
                <h2 className="font-medium">Configure import</h2>
              </div>

              <div className="space-y-1.5">
                <Label>Project title</Label>
                <Input
                  value={customTitle}
                  onChange={(e) => setCustomTitle(e.target.value)}
                  placeholder={selected.name}
                />
              </div>

              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  className="w-4 h-4 rounded border-input"
                  checked={seekingContributors}
                  onChange={(e) => setSeekingContributors(e.target.checked)}
                />
                <span className="text-sm">
                  I&apos;m seeking contributors for this project
                </span>
              </label>

              {error && (
                <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-md">{error}</p>
              )}

              <Button onClick={handleImport} loading={isPending} className="gap-2 w-full sm:w-auto">
                Import {selected.name} <ArrowRight className="w-4 h-4" />
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
