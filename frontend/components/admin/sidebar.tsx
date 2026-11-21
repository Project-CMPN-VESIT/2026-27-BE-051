"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, Users, FolderKanban, ShieldCheck, ScrollText, ArrowLeft, Zap, Wallet, Flag,
  Trophy,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/projects", label: "Projects", icon: FolderKanban },
  { href: "/admin/verification", label: "Verification Queue", icon: ShieldCheck },
  // The page existed but was absent from this array, so it was unreachable by
  // navigation — the only way in was typing the URL.
  { href: "/admin/hackathons", label: "Hackathon Claims", icon: Trophy },
  { href: "/admin/reports", label: "Moderation", icon: Flag },
  { href: "/admin/payouts", label: "Seller Payouts", icon: Wallet },
  { href: "/admin/audit-logs", label: "Audit Logs", icon: ScrollText },
];

export function AdminSidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden md:flex flex-col w-60 border-r bg-surface h-[calc(100dvh-4rem)] sticky top-16 px-3 py-5 flex-shrink-0">
      <div className="flex items-center gap-2.5 px-2 mb-6">
        <div className="w-8 h-8 rounded-xl bg-gradient-brand flex items-center justify-center shadow-sm">
          <Zap className="w-[0.9rem] h-[0.9rem] text-white" strokeWidth={2.75} />
        </div>
        <div>
          <p className="font-semibold text-sm leading-none">Admin</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">CodeBazaar</p>
        </div>
      </div>

      <nav className="flex-1 space-y-0.5" aria-label="Admin">
        {NAV.map(({ href, label, icon: Icon, exact }) => {
          const active = exact ? pathname === href : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                active
                  ? "bg-primary/10 text-primary font-semibold"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent"
              )}
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              {label}
            </Link>
          );
        })}
      </nav>

      <Link
        href="/dashboard"
        className="flex items-center gap-2.5 px-3 py-2 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors mt-auto"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to app
      </Link>
    </aside>
  );
}

export function AdminMobileNav() {
  const pathname = usePathname();
  return (
    <div className="md:hidden border-b bg-surface overflow-x-auto no-scrollbar sticky top-16 z-30">
      <div className="flex gap-1 px-3 py-2 min-w-max">
        {NAV.map(({ href, label, icon: Icon, exact }) => {
          const active = exact ? pathname === href : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs whitespace-nowrap transition-colors border",
                active
                  ? "bg-primary/10 text-primary font-semibold border-primary/30"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent border-transparent"
              )}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
