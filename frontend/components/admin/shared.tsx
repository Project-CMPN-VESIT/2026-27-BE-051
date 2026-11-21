import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import type { LucideIcon } from "lucide-react";

// ── Stat Card ─────────────────────────────────────────────────────────────────

export function StatCard({
  icon: Icon,
  label,
  value,
  sublabel,
  loading,
  trend,
}: {
  icon: LucideIcon;
  label: string;
  value: string | number;
  sublabel?: string;
  loading?: boolean;
  trend?: { value: string; positive: boolean };
}) {
  return (
    <div className="rounded-xl border bg-card p-5 transition-colors hover:border-border-strong">
      <div className="flex items-center justify-between mb-3.5">
        <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
          <Icon className="w-4 h-4 text-primary" />
        </div>
        {trend && (
          <span className={cn(
            "text-xs font-semibold px-1.5 py-0.5 rounded-md tabular-nums",
            trend.positive
              ? "bg-background-success text-text-success"
              : "bg-background-danger text-text-danger"
          )}>
            {trend.value}
          </span>
        )}
      </div>
      {loading ? (
        <Skeleton className="h-8 w-20 mb-1" />
      ) : (
        <div className="text-display-md leading-none tabular-nums">{value}</div>
      )}
      <div className="text-xs text-muted-foreground mt-1.5">{label}</div>
      {sublabel && <div className="text-xs text-muted-foreground/70 mt-0.5">{sublabel}</div>}
    </div>
  );
}

// ── Page header ───────────────────────────────────────────────────────────────

export function AdminPageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 mb-7 pb-5 border-b flex-wrap">
      <div className="min-w-0">
        <h1 className="text-display-md">{title}</h1>
        {subtitle && <p className="text-sm text-muted-foreground mt-1.5">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 flex-shrink-0">{actions}</div>}
    </div>
  );
}

// ── Table shell ───────────────────────────────────────────────────────────────

export function AdminTable({
  columns,
  children,
  loading,
  empty,
}: {
  columns: string[];
  children: React.ReactNode;
  loading?: boolean;
  empty?: boolean;
}) {
  // Column labels are handed to CSS as custom properties so that, on mobile,
  // each cell can render its own label via ::before and the table can collapse
  // into cards without every page repeating its headers per cell.
  const labelVars = Object.fromEntries(
    columns.map((c, i) => [`--col-${i + 1}`, JSON.stringify(c)])
  ) as React.CSSProperties;

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <div className="md:overflow-x-auto">
        <table className="w-full text-sm table-stack" style={labelVars}>
          <thead>
            <tr className="border-b bg-surface">
              {columns.map((c) => (
                <th
                  key={c}
                  scope="col"
                  className="text-left font-semibold text-[11px] uppercase tracking-wider text-muted-foreground px-4 py-3 whitespace-nowrap"
                >
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}>
                  {columns.map((c) => (
                    <td key={c} className="px-4 py-3"><Skeleton className="h-4 w-full max-w-[120px]" /></td>
                  ))}
                </tr>
              ))
            ) : empty ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-16 text-center">
                  <p className="text-sm font-medium">No results</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Try adjusting your filters or search.
                  </p>
                </td>
              </tr>
            ) : (
              children
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Pagination ────────────────────────────────────────────────────────────────

export function AdminPagination({
  page,
  totalPages,
  onChange,
}: {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
}) {
  if (totalPages <= 1) return null;
  return (
    <nav className="flex items-center justify-center gap-3 mt-6" aria-label="Pagination">
      <Button variant="outline" size="sm" disabled={page === 1} onClick={() => onChange(page - 1)}>
        Previous
      </Button>
      <span className="text-sm text-muted-foreground tabular-nums">
        Page {page} of {totalPages}
      </span>
      <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => onChange(page + 1)}>
        Next
      </Button>
    </nav>
  );
}
