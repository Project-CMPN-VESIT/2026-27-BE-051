"use client";
import Link from "next/link";
import { Zap, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

/* ═══════════════════════════════════════════════════════════════════════════
   Shared shell for every auth screen.

   Centralises the card, ambient background, brand mark and footer link so the
   four auth routes stay visually identical.
   ═══════════════════════════════════════════════════════════════════════════ */

export function AuthShell({
  title,
  subtitle,
  children,
  footer,
  notice,
  width = "sm",
  /** Reassurance bullets shown under the card on wider screens. */
  highlights,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  notice?: React.ReactNode;
  width?: "sm" | "md";
  highlights?: string[];
}) {
  return (
    <div className="relative min-h-[calc(100dvh-4rem)] flex items-center justify-center px-4 py-12 sm:py-16 overflow-hidden">
      {/* Ambient background */}
      <div className="hero-aura" aria-hidden="true" />
      <div
        className="absolute inset-0 bg-dot-grid mask-fade-edges opacity-50"
        aria-hidden="true"
      />

      <div
        className={cn(
          "relative w-full",
          width === "sm" ? "max-w-[25rem]" : "max-w-md"
        )}
      >
        {/* Brand */}
        <div className="text-center mb-7">
          <Link
            href="/"
            className="inline-flex w-11 h-11 rounded-2xl bg-gradient-brand items-center justify-center mb-4 shadow-glow transition-transform hover:scale-105"
            aria-label="CodeBazaar home"
          >
            <Zap className="w-[1.15rem] h-[1.15rem] text-white" strokeWidth={2.6} />
          </Link>
          <h1 className="text-display-md">{title}</h1>
          {subtitle && (
            <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{subtitle}</p>
          )}
          {notice && <div className="mt-3">{notice}</div>}
        </div>

        {/* Card */}
        <div className="rounded-2xl border bg-card shadow-lg p-6 sm:p-7">
          {children}
        </div>

        {footer && (
          <div className="text-center text-sm text-muted-foreground mt-6">{footer}</div>
        )}

        {highlights && highlights.length > 0 && (
          <ul className="mt-8 flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
            {highlights.map((h) => (
              <li
                key={h}
                className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"
              >
                <CheckCircle2 className="w-3.5 h-3.5 text-text-success" /> {h}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/** Divider used between OAuth buttons and the email form. */
export function AuthDivider({ label = "or" }: { label?: string }) {
  return (
    <div className="relative my-5">
      <div className="absolute inset-0 flex items-center" aria-hidden="true">
        <div className="w-full border-t" />
      </div>
      <div className="relative flex justify-center">
        <span className="bg-card px-3 text-xs text-muted-foreground">{label}</span>
      </div>
    </div>
  );
}

/** Consistent inline error banner. */
export function AuthError({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/8 px-3 py-2.5 text-sm text-destructive"
    >
      <svg className="w-4 h-4 flex-shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" strokeLinecap="round" />
      </svg>
      <span>{message}</span>
    </div>
  );
}

export function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path fill="#4285F4" d="M23.7 12.27c0-.85-.08-1.67-.22-2.45H12.1v4.64h6.5a5.56 5.56 0 0 1-2.41 3.65v3.03h3.9c2.28-2.1 3.6-5.19 3.6-8.87z"/>
      <path fill="#34A853" d="M12.1 24c3.24 0 5.96-1.08 7.95-2.91l-3.9-3.03c-1.08.72-2.46 1.15-4.05 1.15-3.13 0-5.78-2.11-6.73-4.96H1.4v3.13A12 12 0 0 0 12.1 24z"/>
      <path fill="#FBBC05" d="M5.37 14.25a7.2 7.2 0 0 1 0-4.5V6.62H1.4a12 12 0 0 0 0 10.76l3.97-3.13z"/>
      <path fill="#EA4335" d="M12.1 4.77c1.77 0 3.35.61 4.6 1.8l3.44-3.44C18.05 1.19 15.33 0 12.1 0A12 12 0 0 0 1.4 6.62l3.97 3.13c.95-2.85 3.6-4.98 6.73-4.98z"/>
    </svg>
  );
}
