"use client";
import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { Bell, CheckCheck, Trash2, Zap, MessageSquare, ShieldCheck, Star, CreditCard, type LucideIcon } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { notificationsApi } from "@/lib/api";
import { useAuthStore } from "@/stores/auth";
import { cn } from "@/lib/utils";
import type { NotificationRead } from "@/lib/api";

const TYPE_ICONS: Record<string, LucideIcon> = {
  contributor_request: Zap,
  request_accepted: CheckCheck,
  request_rejected: Trash2,
  project_verified: ShieldCheck,
  new_review: Star,
  new_message: MessageSquare,
  payment_success: CreditCard,
  project_access_purchased: CreditCard,
  system: Bell,
};

function NotifItem({ n, onRead }: { n: NotificationRead; onRead: (id: string) => void }) {
  const Icon = TYPE_ICONS[n.type] ?? Bell;
  return (
    <div
      className={cn(
        "flex gap-3 px-4 py-3 hover:bg-accent/50 transition-colors cursor-pointer",
        !n.is_read && "bg-primary/5"
      )}
      onClick={() => !n.is_read && onRead(n.id)}
    >
      <div className={cn(
        "w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5",
        n.is_read ? "bg-secondary" : "bg-primary/10"
      )}>
        <Icon className={cn("w-3.5 h-3.5", n.is_read ? "text-muted-foreground" : "text-primary")} />
      </div>
      <div className="min-w-0 flex-1">
        <p className={cn("text-sm leading-snug", !n.is_read && "font-medium")}>{n.title}</p>
        {n.body && <p className="text-xs text-muted-foreground mt-0.5 truncate">{n.body}</p>}
        <p className="text-[10px] text-muted-foreground/60 mt-1">
          {new Date(n.created_at).toLocaleDateString()}
        </p>
      </div>
      {!n.is_read && <div className="w-1.5 h-1.5 rounded-full bg-primary mt-2 flex-shrink-0" />}
    </div>
  );
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const token = useAuthStore((s) => s.accessToken);
  const qc = useQueryClient();

  const { data: countData } = useQuery({
    queryKey: ["notif-count"],
    queryFn: notificationsApi.unreadCount,
    enabled: !!token,
    refetchInterval: 30_000,
  });

  const { data: notifs } = useQuery({
    queryKey: ["notifications"],
    queryFn: () => notificationsApi.list(),
    enabled: !!token && open,
    staleTime: 10_000,
  });

  const { mutate: markRead } = useMutation({
    mutationFn: notificationsApi.markRead,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notif-count"] });
      qc.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  const { mutate: markAllRead } = useMutation({
    mutationFn: notificationsApi.markAllRead,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notif-count"] });
      qc.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  if (!token) return null;

  const count = countData?.count ?? 0;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="relative p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        aria-label={`${count} unread notifications`}
      >
        <Bell className="w-4 h-4" />
        {count > 0 && (
          <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-primary text-primary-foreground text-[9px] font-bold flex items-center justify-center">
            {count > 9 ? "9+" : count}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 rounded-xl border bg-card shadow-xl z-50 overflow-hidden animate-fade-in">
          <div className="flex items-center justify-between px-4 py-3 border-b">
            <h3 className="font-semibold text-sm">Notifications</h3>
            {count > 0 && (
              <button
                onClick={() => markAllRead()}
                className="text-xs text-primary hover:underline flex items-center gap-1"
              >
                <CheckCheck className="w-3 h-3" /> Mark all read
              </button>
            )}
          </div>

          <div className="max-h-[380px] overflow-y-auto divide-y divide-border/50">
            {!notifs?.length ? (
              <div className="py-10 text-center">
                <Bell className="w-6 h-6 text-muted-foreground/40 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">No notifications yet</p>
              </div>
            ) : (
              notifs.map((n) => (
                <NotifItem key={n.id} n={n} onRead={markRead} />
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
