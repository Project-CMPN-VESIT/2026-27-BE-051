"use client";
import { useState } from "react";
import Link from "next/link";
import {
  Star, GitFork, ExternalLink, Trash2, BadgeCheck, BadgeX, Sparkles,
} from "lucide-react";
import { AdminPageHeader, AdminTable, AdminPagination } from "@/components/admin/shared";

interface AdminProjectItem {
  id: string;
  title: string;
  repo_full_name: string;
  stage: string;
  status: string;
  stars: number;
  forks: number;
  is_verified: boolean;
  is_featured: boolean;
}
import { Badge } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import {
  useAdminProjects, useToggleFeatured, useVerifyProject, useAdminDeleteProject,
} from "@/lib/hooks/admin";
import { cn } from "@/lib/utils";

function ProjectRow({ project }: { project: AdminProjectItem }) {
  const { mutate: toggleFeatured, isPending: featuring } = useToggleFeatured();
  const { mutate: verify, isPending: verifying } = useVerifyProject();
  const { mutate: remove, isPending: deleting } = useAdminDeleteProject();
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <tr className="hover:bg-accent/30 transition-colors">
      <td className="px-4 py-3 max-w-[260px]">
        <Link href={`/projects/${project.id}`} className="font-medium hover:text-primary transition-colors truncate block">
          {project.title}
        </Link>
        <a
          href={`https://github.com/${project.repo_full_name}`}
          target="_blank" rel="noopener noreferrer"
          className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 truncate"
        >
          {project.repo_full_name} <ExternalLink className="w-2.5 h-2.5" />
        </a>
      </td>
      <td className="px-4 py-3">
        <Badge variant="ghost" className="capitalize text-[10px]">{project.stage}</Badge>
      </td>
      <td className="px-4 py-3">
        <Badge
          variant={project.status === "active" ? "success" : project.status === "dormant" ? "warning" : "ghost"}
          className="capitalize text-[10px]"
        >{project.status}</Badge>
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><Star className="w-3 h-3" />{project.stars}</span>
          <span className="flex items-center gap-1"><GitFork className="w-3 h-3" />{project.forks}</span>
        </div>
      </td>
      <td className="px-4 py-3">
        <button
          onClick={() => verify({ projectId: project.id, verified: !project.is_verified })}
          disabled={verifying}
          className={cn(
            "flex items-center gap-1 text-xs transition-colors disabled:opacity-50",
            project.is_verified ? "text-text-success" : "text-muted-foreground hover:text-foreground"
          )}
        >
          {project.is_verified ? <BadgeCheck className="w-3.5 h-3.5" /> : <BadgeX className="w-3.5 h-3.5" />}
          {project.is_verified ? "Verified" : "Unverified"}
        </button>
      </td>
      <td className="px-4 py-3">
        <button
          onClick={() => toggleFeatured({ projectId: project.id, featured: !project.is_featured })}
          disabled={featuring}
          className={cn(
            "flex items-center gap-1 text-xs transition-colors disabled:opacity-50",
            project.is_featured ? "text-bazaar-500" : "text-muted-foreground hover:text-foreground"
          )}
        >
          <Sparkles className="w-3.5 h-3.5" />
          {project.is_featured ? "Featured" : "Feature"}
        </button>
      </td>
      <td className="px-4 py-3 text-right">
        {confirmDelete ? (
          <div className="flex items-center gap-1 justify-end">
            <Button size="sm" variant="destructive" className="h-7 text-xs"
              loading={deleting} onClick={() => remove(project.id)}>
              Confirm
            </Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
          </div>
        ) : (
          <Button size="sm" variant="ghost" className="h-7 text-xs gap-1 text-muted-foreground hover:text-destructive"
            onClick={() => setConfirmDelete(true)}>
            <Trash2 className="w-3 h-3" /> Remove
          </Button>
        )}
      </td>
    </tr>
  );
}

export default function AdminProjectsPage() {
  const [page, setPage] = useState(1);
  const [verifiedFilter, setVerifiedFilter] = useState<boolean | undefined>(undefined);

  const { data, isLoading } = useAdminProjects({
    page,
    per_page: 20,
    is_verified: verifiedFilter,
  });

  const totalPages = data ? Math.max(1, Math.ceil(data.total / 20)) : 1;

  return (
    <div>
      <AdminPageHeader
        title="Projects"
        subtitle={data ? `${data.total.toLocaleString()} projects on the platform` : undefined}
        actions={
          <div className="flex items-center gap-1 rounded-lg border bg-card p-0.5">
            {[
              { label: "All", value: undefined },
              { label: "Verified", value: true },
              { label: "Unverified", value: false },
            ].map((opt) => (
              <button
                key={opt.label}
                onClick={() => { setVerifiedFilter(opt.value); setPage(1); }}
                className={cn(
                  "px-3 py-1 text-xs rounded transition-colors",
                  verifiedFilter === opt.value
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        }
      />

      <AdminTable
        columns={["Project", "Stage", "Status", "Stats", "Verification", "Featured", "Actions"]}
        loading={isLoading}
        empty={!isLoading && !data?.items.length}
      >
        {data?.items.map((p) => <ProjectRow key={p.id} project={p} />)}
      </AdminTable>

      <AdminPagination page={page} totalPages={totalPages} onChange={setPage} />
    </div>
  );
}
