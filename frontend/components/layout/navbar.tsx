"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  Moon, Sun, Menu, X, LogOut, Settings, LayoutDashboard, MessageSquare,
  Gift, ShieldCheck, Rocket, Wallet, ChevronDown, Store, Compass, Users,
  Hammer, Trophy, CreditCard, BarChart3, Bookmark, Scale, GitBranch,
  Activity, Building2, FileSearch, Gavel, Layers, Mail,
} from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { NotificationBell } from "@/components/notifications/bell";
import { useMe } from "@/lib/hooks";
import { useAuthHydrated, useAuthStore } from "@/stores/auth";
import { cn } from "@/lib/utils";
import { authApi } from "@/lib/api";

/**
 * Navigation changes shape with auth state.
 *
 * Signed out, this is a marketing site: discover, methodology, pricing, sign up.
 * Signed in, it becomes an app shell whose links depend on the user's role. The
 * previous single nav showed hiring tools to builders and marketing links to
 * signed-in users, which is the main thing that makes a product feel unfinished.
 */

/** Signed-out: keep it short and weighted toward the pitch. */
const PUBLIC_LINKS = [
  { href: "/projects", label: "Discover", icon: Compass, match: "/projects" },
  { href: "/bundles", label: "Bundles", icon: Layers, match: "/bundles" },
  { href: "/builders", label: "Builders", icon: Users, match: "/builders" },
  { href: "/how-verification-works", label: "Methodology", icon: Scale, match: "/how-verification-works" },
  { href: "/pricing", label: "Pricing", icon: CreditCard, match: "/pricing" },
];

/** Signed-in: discovery stays reachable but slims down. */
const APP_LINKS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, match: "/dashboard" },
  { href: "/projects", label: "Discover", icon: Compass, match: "/projects" },
  { href: "/offers", label: "Offers", icon: Gavel, match: "/offers" },
  { href: "/requests", label: "Requests", icon: Hammer, match: "/requests" },
  { href: "/leaderboard", label: "Leaderboard", icon: Trophy, match: "/leaderboard" },
];

type Role = string | undefined;

/** Account-menu links, filtered by what the role can actually use. */
function accountLinks(role: Role) {
  const isHirer = role === "founder" || role === "incubator" || role === "mentor" || role === "admin";
  const isBuilder = !isHirer || role === "admin";

  const isPartner = role === "college_partner";

  return [
    { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, show: !isPartner },
    // Faculty accounts are read-only and aggregate; their whole product is this
    // one page, so it leads their menu rather than sitting under it.
    { href: "/campus/dashboard", label: "Institution dashboard", icon: Building2, show: isPartner },
    { href: "/import", label: "Import a repo", icon: GitBranch, show: isBuilder },
    { href: "/analytics", label: "Analytics", icon: BarChart3, show: isBuilder },
    { href: "/earnings", label: "Earnings", icon: Wallet, show: isBuilder },
    { href: "/offers", label: "Offers", icon: Gavel, show: !isPartner },
    { href: "/purchases", label: "Your purchases", icon: Activity, show: !isPartner },
    { href: "/verification-requests", label: "Verification requests", icon: FileSearch, show: !isPartner },
    { href: "/pipeline", label: "Pipeline", icon: Bookmark, show: isHirer },
    { href: "/incubation", label: "Incubation", icon: Rocket, show: !isPartner },
    { href: "/escrow", label: "Escrow", icon: ShieldCheck, show: !isPartner },
    { href: "/messages", label: "Messages", icon: MessageSquare, show: !isPartner },
    { href: "/digest", label: "Week in review", icon: Mail, show: true },
    { href: "/invite", label: "Invite", icon: Gift, show: !isPartner },
    { href: "/settings", label: "Settings", icon: Settings, show: true },
  ].filter((l) => l.show);
}

export function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const accountRef = useRef<HTMLDivElement>(null);
  const { data: user } = useMe();
  const { accessToken, logout } = useAuthStore();
  const hydrated = useAuthHydrated();

  // Session presence and profile arrival are two different things. The token is
  // what decides whether this is the app or the marketing site; `user` only
  // fills in the name and role once /users/me responds. Requiring both to show
  // the account menu meant that for the whole duration of that request — the
  // cache having just been cleared on sign-in, and 50s+ on a cold backend — a
  // signed-in user was shown "Log in / Sign up" on their own dashboard.
  const signedIn = !!accessToken;
  const navLinks = signedIn ? APP_LINKS : PUBLIC_LINKS;
  const links = accountLinks(user?.role);

  // Close menus on navigation.
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      setMenuOpen(false);
      setAccountOpen(false);
    });
    return () => cancelAnimationFrame(frame);
  }, [pathname]);

  // Dismiss the account dropdown on outside click / Escape.
  useEffect(() => {
    if (!accountOpen) return;
    const onClick = (e: MouseEvent) => {
      if (accountRef.current && !accountRef.current.contains(e.target as Node)) {
        setAccountOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setAccountOpen(false);
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [accountOpen]);

  // Lock body scroll while the mobile sheet is open.
  useEffect(() => {
    document.body.style.overflow = menuOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [menuOpen]);

  const handleLogout = async () => {
    // Revokes the refresh token server-side and clears the cookie. Best-effort:
    // the local session is dropped either way.
    try { await authApi.logout(); } catch {}
    logout();
    setAccountOpen(false);
    setMenuOpen(false);
    router.push("/");
  };

  const isActive = (match: string) =>
    match === "/projects" ? pathname === "/projects" : pathname.startsWith(match);

  const initial = (user?.profile?.display_name ?? user?.email ?? "?")
    .charAt(0)
    .toUpperCase();

  return (
    <>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[100] focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-primary-foreground"
      >
        Skip to content
      </a>

      <header className="sticky top-0 z-50 w-full border-b border-border/60 glass">
        <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-3">

          {/* Logo */}
          <Link
            href={signedIn ? "/dashboard" : "/"}
            className="flex items-center gap-2.5 font-display font-semibold text-lg tracking-tight group flex-shrink-0"
          >
            <span className="relative w-8 h-8 rounded-xl bg-gradient-brand flex items-center justify-center shadow-sm transition-transform duration-300 group-hover:scale-105">
              <ShieldCheck className="w-[1rem] h-[1rem] text-white" strokeWidth={2.4} />
            </span>
            <span className="hidden sm:inline text-[1.0625rem]">CodeBazaar</span>
          </Link>

          {/* Desktop nav */}
          <nav
            className="hidden lg:flex items-center gap-0.5 p-1 rounded-full border border-border/60 bg-surface/60"
            aria-label="Main"
          >
            {navLinks.map(({ href, label, match }) => {
              const active = isActive(match);
              return (
                <Link
                  key={label}
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "px-3.5 py-1.5 rounded-full text-[0.8125rem] transition-colors",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                    active
                      ? "bg-card text-foreground font-semibold shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {label}
                </Link>
              );
            })}
          </nav>

          {/* Right actions */}
          <div className="flex items-center gap-1 sm:gap-1.5">
            <button
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
              aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
            >
              <Sun className="w-[1.05rem] h-[1.05rem] dark:hidden" />
              <Moon className="w-[1.05rem] h-[1.05rem] hidden dark:block" />
            </button>

            {signedIn && <NotificationBell />}

            {!hydrated ? (
              // Session state is still unknown. Rendering either branch here
              // would be a guess, and the wrong guess is a visible flash.
              <div
                className="w-9 h-9 rounded-full bg-secondary animate-pulse"
                aria-hidden="true"
              />
            ) : signedIn ? (
              <div className="relative" ref={accountRef}>
                <button
                  onClick={() => setAccountOpen((o) => !o)}
                  aria-expanded={accountOpen}
                  aria-haspopup="menu"
                  aria-label="Account menu"
                  className={cn(
                    "flex items-center gap-2 pl-1 pr-1.5 sm:pr-2 py-1 rounded-full border transition-colors",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                    accountOpen
                      ? "border-border-strong bg-accent"
                      : "border-transparent hover:border-border hover:bg-accent/60"
                  )}
                >
                  <span className="w-7 h-7 rounded-full bg-gradient-brand text-white flex items-center justify-center text-xs font-semibold shadow-xs">
                    {user ? (
                      initial
                    ) : (
                      <span
                        className="w-2.5 h-2.5 rounded-full bg-white/50 animate-pulse"
                        aria-hidden="true"
                      />
                    )}
                  </span>
                  {user ? (
                    <span className="hidden md:inline text-sm font-medium max-w-[9rem] truncate">
                      {user.profile?.display_name ?? "Account"}
                    </span>
                  ) : (
                    <span
                      className="hidden md:inline-block h-3.5 w-20 rounded bg-secondary animate-pulse"
                      aria-hidden="true"
                    />
                  )}
                  <ChevronDown
                    className={cn(
                      "hidden md:block w-3.5 h-3.5 text-muted-foreground transition-transform duration-200",
                      accountOpen && "rotate-180"
                    )}
                  />
                </button>

                {accountOpen && (
                  <div
                    role="menu"
                    className="absolute right-0 top-full mt-2 w-60 rounded-xl border bg-elevated shadow-lg py-1.5 z-50 animate-scale-in origin-top-right max-h-[calc(100dvh-6rem)] overflow-y-auto"
                  >
                    <div className="px-3 py-2 border-b mb-1">
                      <p className="text-sm font-medium truncate">
                        {user?.profile?.display_name ?? "Account"}
                      </p>
                      {user ? (
                        <>
                          <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                          {user.role && (
                            <p className="text-[11px] text-muted-foreground mt-1 capitalize">
                              {user.role} account
                            </p>
                          )}
                        </>
                      ) : (
                        <p className="text-xs text-muted-foreground">Loading your profile…</p>
                      )}
                    </div>

                    {links.map(({ href, label, icon: Icon }) => (
                      <Link
                        key={href}
                        href={href}
                        role="menuitem"
                        className="flex items-center gap-2.5 px-3 py-2 text-sm text-foreground/90 hover:bg-accent hover:text-foreground transition-colors"
                      >
                        <Icon className="w-4 h-4 text-muted-foreground" /> {label}
                      </Link>
                    ))}

                    {user?.role === "admin" && (
                      <>
                        <div className="border-t my-1.5" />
                        <Link
                          href="/admin"
                          role="menuitem"
                          className="flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-accent transition-colors"
                        >
                          <ShieldCheck className="w-4 h-4 text-muted-foreground" /> Admin panel
                        </Link>
                      </>
                    )}

                    <div className="border-t my-1.5" />
                    <button
                      onClick={handleLogout}
                      role="menuitem"
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-destructive hover:bg-destructive/10 transition-colors"
                    >
                      <LogOut className="w-4 h-4" /> Sign out
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="hidden sm:flex items-center gap-2">
                <Button variant="ghost" size="sm" asChild>
                  <Link href="/auth/login">Log in</Link>
                </Button>
                {/* CTA-styled: signing up is the one action this bar is selling. */}
                <Button variant="cta" size="sm" asChild>
                  <Link href="/auth/register">Sign up</Link>
                </Button>
              </div>
            )}

            {/* Mobile toggle */}
            <button
              className="lg:hidden p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
              onClick={() => setMenuOpen((o) => !o)}
              aria-label={menuOpen ? "Close menu" : "Open menu"}
              aria-expanded={menuOpen}
            >
              {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </header>

      {/* Mobile sheet */}
      {menuOpen && (
        <>
          <div
            className="lg:hidden fixed inset-0 top-16 z-40 bg-background/60 backdrop-blur-sm animate-fade-in"
            onClick={() => setMenuOpen(false)}
            aria-hidden="true"
          />
          <div className="lg:hidden fixed inset-x-0 top-16 z-40 max-h-[calc(100dvh-4rem)] overflow-y-auto border-b bg-background shadow-lg animate-fade-in">
            <nav className="px-4 py-4 space-y-6" aria-label="Mobile">
              <div className="space-y-1">
                <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {signedIn ? "Navigate" : "Explore"}
                </p>
                {navLinks.map(({ href, label, icon: Icon, match }) => (
                  <Link
                    key={label}
                    href={href}
                    onClick={() => setMenuOpen(false)}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors",
                      isActive(match)
                        ? "bg-primary/10 text-primary font-medium"
                        : "text-foreground/90 hover:bg-accent"
                    )}
                  >
                    <Icon className="w-4 h-4 text-muted-foreground" /> {label}
                  </Link>
                ))}
                {!signedIn && (
                  <Link
                    href="/docs/api"
                    onClick={() => setMenuOpen(false)}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-foreground/90 hover:bg-accent transition-colors"
                  >
                    <Store className="w-4 h-4 text-muted-foreground" /> API docs
                  </Link>
                )}
              </div>

              {signedIn ? (
                <div className="space-y-1">
                  <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Your account
                  </p>
                  {links.map(({ href, label, icon: Icon }) => (
                    <Link
                      key={href}
                      href={href}
                      onClick={() => setMenuOpen(false)}
                      className={cn(
                        "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors",
                        pathname === href
                          ? "bg-primary/10 text-primary font-medium"
                          : "text-foreground/90 hover:bg-accent"
                      )}
                    >
                      <Icon className="w-4 h-4 text-muted-foreground" /> {label}
                    </Link>
                  ))}
                  {user?.role === "admin" && (
                    <Link
                      href="/admin"
                      onClick={() => setMenuOpen(false)}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-foreground/90 hover:bg-accent transition-colors"
                    >
                      <ShieldCheck className="w-4 h-4 text-muted-foreground" /> Admin panel
                    </Link>
                  )}
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-destructive hover:bg-destructive/10 transition-colors"
                  >
                    <LogOut className="w-4 h-4" /> Sign out
                  </button>
                </div>
              ) : (
                <div className="flex flex-col gap-2 pt-1">
                  <Button variant="cta" block asChild>
                    <Link href="/auth/register" onClick={() => setMenuOpen(false)}>
                      Sign up free
                    </Link>
                  </Button>
                  <Button variant="outline" block asChild>
                    <Link href="/auth/login" onClick={() => setMenuOpen(false)}>Log in</Link>
                  </Button>
                </div>
              )}
            </nav>
          </div>
        </>
      )}
    </>
  );
}
