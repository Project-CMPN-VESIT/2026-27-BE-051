"use client";
import { useState } from "react";
import { Search, Ban, CheckCircle2, ShieldCheck } from "lucide-react";
import { AdminPageHeader, AdminTable, AdminPagination } from "@/components/admin/shared";
import { Badge } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { useAdminUsers, useBanUser, useUnbanUser, useChangeUserRole } from "@/lib/hooks/admin";
import { useDebounce } from "@/lib/hooks/use-debounce";
import type { AdminUserRow } from "@/lib/api/admin";

const ROLES = ["builder", "contributor", "founder", "mentor", "incubator", "admin"];

function RoleSelect({ user }: { user: AdminUserRow }) {
  const { mutate, isPending } = useChangeUserRole();
  return (
    <select
      value={user.role}
      disabled={isPending}
      onChange={(e) => mutate({ userId: user.id, role: e.target.value })}
      className="text-xs px-2 py-1 rounded-md border bg-background focus-visible:outline-none focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-primary/12 capitalize disabled:opacity-50"
    >
      {ROLES.map((r) => (
        <option key={r} value={r} className="capitalize">{r}</option>
      ))}
    </select>
  );
}

function UserRow({ user }: { user: AdminUserRow }) {
  const { mutate: ban, isPending: banning } = useBanUser();
  const { mutate: unban, isPending: unbanning } = useUnbanUser();
  const [confirmBan, setConfirmBan] = useState(false);

  return (
    <tr className="hover:bg-accent/30 transition-colors">
      <td className="px-4 py-3">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-xs font-semibold text-primary flex-shrink-0">
            {user.email[0]?.toUpperCase()}
          </div>
          <span className="font-medium truncate max-w-[200px]">{user.email}</span>
        </div>
      </td>
      <td className="px-4 py-3">
        <RoleSelect user={user} />
      </td>
      <td className="px-4 py-3">
        {user.is_verified ? (
          <span className="flex items-center gap-1 text-xs text-text-success">
            <CheckCircle2 className="w-3.5 h-3.5" /> Verified
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">Unverified</span>
        )}
      </td>
      <td className="px-4 py-3">
        <Badge variant={user.is_active ? "success" : "destructive"} className="text-[10px]">
          {user.is_active ? "Active" : "Banned"}
        </Badge>
      </td>
      <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
        {new Date(user.created_at).toLocaleDateString()}
      </td>
      <td className="px-4 py-3 text-right">
        {user.role === "admin" ? (
          <span className="text-xs text-muted-foreground">—</span>
        ) : user.is_active ? (
          confirmBan ? (
            <div className="flex items-center gap-1 justify-end">
              <Button size="sm" variant="destructive" className="h-7 text-xs"
                loading={banning} onClick={() => { ban(user.id); setConfirmBan(false); }}>
                Confirm ban
              </Button>
              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setConfirmBan(false)}>
                Cancel
              </Button>
            </div>
          ) : (
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => setConfirmBan(true)}>
              <Ban className="w-3 h-3" /> Ban
            </Button>
          )
        ) : (
          <Button size="sm" variant="outline" className="h-7 text-xs gap-1" loading={unbanning} onClick={() => unban(user.id)}>
            <ShieldCheck className="w-3 h-3" /> Unban
          </Button>
        )}
      </td>
    </tr>
  );
}

export default function AdminUsersPage() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebounce(search, 350);

  const { data, isLoading } = useAdminUsers({
    page,
    per_page: 20,
    search: debouncedSearch || undefined,
  });

  const totalPages = data ? Math.max(1, Math.ceil(data.total / 20)) : 1;

  return (
    <div>
      <AdminPageHeader
        title="Users"
        subtitle={data ? `${data.total.toLocaleString()} registered users` : undefined}
        actions={
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <input
              className="pl-8 pr-3 py-1.5 text-sm rounded-lg border bg-card focus-visible:outline-none focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-primary/12 w-56"
              placeholder="Search by email…"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            />
          </div>
        }
      />

      <AdminTable
        columns={["User", "Role", "Email status", "Account", "Joined", "Actions"]}
        loading={isLoading}
        empty={!isLoading && !data?.items.length}
      >
        {data?.items.map((u) => <UserRow key={u.id} user={u} />)}
      </AdminTable>

      <AdminPagination page={page} totalPages={totalPages} onChange={setPage} />
    </div>
  );
}
