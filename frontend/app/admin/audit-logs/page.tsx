"use client";
import { useState, type ComponentType } from "react";
import {
  ScrollText, Ban, ShieldCheck, BadgeCheck, Trash2, UserCog, Sparkles,
} from "lucide-react";
import { AdminPageHeader, AdminTable, AdminPagination } from "@/components/admin/shared";
import { Badge } from "@/components/ui/primitives";
import { useAuditLogs } from "@/lib/hooks/admin";
import { cn } from "@/lib/utils";

type IconType = ComponentType<{ className?: string }>;
const ACTION_META: Record<string, { label: string; icon: IconType; color: string }> = {
  "user.ban": { label: "User banned", icon: Ban, color: "text-destructive" },
  "user.unban": { label: "User unbanned", icon: ShieldCheck, color: "text-text-success" },
  "user.role_change": { label: "Role changed", icon: UserCog, color: "text-primary" },
  "project.verify": { label: "Project verification", icon: BadgeCheck, color: "text-text-success" },
  "project.feature_toggle": { label: "Feature toggled", icon: Sparkles, color: "text-bazaar-500" },
  "project.delete": { label: "Project deleted", icon: Trash2, color: "text-destructive" },
};

const ACTION_FILTERS = [
  { label: "All", value: "" },
  { label: "User actions", value: "user." },
  { label: "Project actions", value: "project." },
];

function ActionBadge({ action }: { action: string }) {
  const meta = ACTION_META[action];
  if (!meta) return <Badge variant="ghost" className="text-[10px]">{action}</Badge>;
  const Icon = meta.icon;
  return (
    <span className={cn("flex items-center gap-1.5 text-xs font-medium", meta.color)}>
      <Icon className="w-3.5 h-3.5" /> {meta.label}
    </span>
  );
}

function LogRow({ log }: { log: import("@/lib/api/admin").AuditLogEntry }) {
  return (
    <tr className="hover:bg-accent/30 transition-colors">
      <td className="px-4 py-3">
        <ActionBadge action={log.action} />
      </td>
      <td className="px-4 py-3 text-sm">
        {log.actor_email ?? <span className="text-muted-foreground">System</span>}
      </td>
      <td className="px-4 py-3">
        {log.target_type ? (
          <div>
            <Badge variant="outline" className="text-[10px] capitalize">{log.target_type}</Badge>
            {log.target_id && (
              <span className="text-xs text-muted-foreground ml-2 font-mono">
                {log.target_id.slice(0, 8)}…
              </span>
            )}
          </div>
        ) : (
          <span className="text-muted-foreground text-xs">—</span>
        )}
      </td>
      <td className="px-4 py-3 text-sm text-muted-foreground max-w-[280px] truncate">
        {log.details ?? "—"}
      </td>
      <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
        {new Date(log.created_at).toLocaleString()}
      </td>
    </tr>
  );
}

export default function AdminAuditLogsPage() {
  const [page, setPage] = useState(1);
  const [actionFilter, setActionFilter] = useState("");

  const { data, isLoading } = useAuditLogs({
    page,
    per_page: 30,
    action: actionFilter || undefined,
  });

  return (
    <div>
      <AdminPageHeader
        title="Audit Logs"
        subtitle={data ? `${data.total.toLocaleString()} recorded actions` : undefined}
        actions={
          <div className="flex items-center gap-1 rounded-lg border bg-card p-0.5">
            {ACTION_FILTERS.map((opt) => (
              <button
                key={opt.label}
                onClick={() => { setActionFilter(opt.value); setPage(1); }}
                className={cn(
                  "px-3 py-1 text-xs rounded transition-colors",
                  actionFilter === opt.value
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
        columns={["Action", "Actor", "Target", "Details", "Timestamp"]}
        loading={isLoading}
        empty={!isLoading && !data?.items.length}
      >
        {data?.items.map((log) => <LogRow key={log.id} log={log} />)}
      </AdminTable>

      <AdminPagination page={page} totalPages={data?.pages ?? 1} onChange={setPage} />

      {!isLoading && !data?.items.length && (
        <div className="text-center mt-8">
          <ScrollText className="w-8 h-8 text-muted-foreground/50 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">
            Audit entries appear here as admins take moderation actions.
          </p>
        </div>
      )}
    </div>
  );
}
