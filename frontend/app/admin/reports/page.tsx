"use client";
import { useState } from "react";
import Link from "next/link";
import { CheckCircle2, Trash2, XCircle, ExternalLink } from "lucide-react";
import { AdminPageHeader, AdminTable } from "@/components/admin/shared";
import { Badge } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { useAdminReports, useResolveReport } from "@/lib/hooks/admin";
import { getErrorMessage } from "@/lib/api/client";
import type { AdminReportRow, ResolveReportPayload } from "@/lib/api/admin";

const REASON_LABELS: Record<string, string> = {
  plagiarism: "Plagiarism",
  copied_repo: "Copied repo",
  fake_hackathon: "Fake hackathon",
  spam: "Spam",
  misleading: "Misleading",
  inappropriate: "Inappropriate",
  other: "Other",
};

const STATUS_VARIANT: Record<string, "warning" | "success" | "ghost"> = {
  open: "warning",
  resolved: "success",
  dismissed: "ghost",
};

function ReportRow({ row }: { row: AdminReportRow }) {
  const { mutate, isPending } = useResolveReport();
  const [error, setError] = useState<string | null>(null);

  const resolve = (payload: ResolveReportPayload) => {
    setError(null);
    mutate({ reportId: row.id, payload }, { onError: (err) => setError(getErrorMessage(err)) });
  };

  return (
    <tr className="hover:bg-accent/30 transition-colors align-top">
      <td className="px-4 py-3">
        {row.target_title ? (
          <Link href={`/projects/${row.target_id}`} className="font-medium hover:text-primary transition-colors inline-flex items-center gap-1">
            {row.target_title} <ExternalLink className="w-3 h-3" />
          </Link>
        ) : (
          <span className="text-muted-foreground text-xs">{row.target_type} · {row.target_id.slice(0, 8)}…</span>
        )}
        {row.details && <p className="text-xs text-muted-foreground mt-1 max-w-[280px]">{row.details}</p>}
      </td>
      <td className="px-4 py-3">
        <Badge variant="outline" className="text-[10px]">{REASON_LABELS[row.reason] ?? row.reason}</Badge>
      </td>
      <td className="px-4 py-3 text-xs text-muted-foreground">{row.reporter_email ?? "—"}</td>
      <td className="px-4 py-3">
        <Badge variant={STATUS_VARIANT[row.status] ?? "ghost"} className="text-[10px] capitalize">{row.status}</Badge>
        {row.action_taken && row.action_taken !== "none" && (
          <div className="text-[10px] text-muted-foreground mt-0.5">{row.action_taken.replace("_", " ")}</div>
        )}
      </td>
      <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
        {new Date(row.created_at).toLocaleDateString("en-IN")}
      </td>
      <td className="px-4 py-3 text-right">
        {row.status === "open" ? (
          <div className="flex flex-col items-end gap-1">
            <div className="flex items-center gap-1">
              <Button size="sm" variant="destructive" className="h-7 text-xs gap-1" loading={isPending}
                onClick={() => resolve({ status: "resolved", action: "remove_target" })}>
                <Trash2 className="w-3 h-3" /> Remove
              </Button>
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1" loading={isPending}
                onClick={() => resolve({ status: "resolved", action: "none" })}>
                <CheckCircle2 className="w-3 h-3" /> Keep
              </Button>
              <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" loading={isPending}
                onClick={() => resolve({ status: "dismissed", action: "none" })}>
                <XCircle className="w-3 h-3" /> Dismiss
              </Button>
            </div>
            {error && <span className="text-[10px] text-destructive">{error}</span>}
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </td>
    </tr>
  );
}

export default function AdminReportsPage() {
  const [status, setStatus] = useState<string>("open");
  const { data, isLoading } = useAdminReports(status || undefined);

  return (
    <div>
      <AdminPageHeader
        title="Moderation"
        subtitle={data ? `${data.total.toLocaleString()} report(s)` : undefined}
        actions={
          <select
            className="px-3 py-1.5 text-sm rounded-lg border bg-card focus-visible:outline-none focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-primary/12"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="open">Open</option>
            <option value="resolved">Resolved</option>
            <option value="dismissed">Dismissed</option>
            <option value="">All</option>
          </select>
        }
      />

      <AdminTable
        columns={["Target", "Reason", "Reporter", "Status", "Reported", "Actions"]}
        loading={isLoading}
        empty={!isLoading && !data?.items.length}
      >
        {data?.items.map((row) => <ReportRow key={row.id} row={row} />)}
      </AdminTable>
    </div>
  );
}
