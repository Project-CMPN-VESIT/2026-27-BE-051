"use client";
import * as React from "react";
import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const alertVariants = cva(
  "rounded-xl border px-4 py-3 text-sm flex items-start gap-3",
  {
    variants: {
      variant: {
        danger: "border-border-danger bg-background-danger text-text-danger",
        warning: "border-border-warning bg-background-warning text-text-warning",
        success: "border-border-success bg-background-success text-text-success",
        info: "border-border-info bg-background-info text-text-info",
        neutral: "border-border bg-surface text-foreground",
      },
    },
    defaultVariants: { variant: "danger" },
  }
);

const ICONS = {
  danger: XCircle,
  warning: AlertTriangle,
  success: CheckCircle2,
  info: Info,
  neutral: Info,
} as const;

export interface AlertProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof alertVariants> {
  title?: string;
  description?: React.ReactNode;
  /** A recovery affordance. An error the user can't act on is just noise. */
  action?: React.ReactNode;
  icon?: React.ReactNode;
  hideIcon?: boolean;
}

/**
 * The single styled surface for errors, warnings and confirmations.
 *
 * Every failure path in the app renders through this so that a network error in
 * checkout looks like a network error in settings. `role` is chosen by severity:
 * problems get `alert` (announced immediately), the rest get `status`.
 */
export function Alert({
  className,
  variant = "danger",
  title,
  description,
  action,
  icon,
  hideIcon = false,
  children,
  ...props
}: AlertProps) {
  const Icon = ICONS[variant ?? "danger"];
  const assertive = variant === "danger" || variant === "warning";

  return (
    <div
      role={assertive ? "alert" : "status"}
      aria-live={assertive ? "assertive" : "polite"}
      className={cn(alertVariants({ variant }), className)}
      {...props}
    >
      {!hideIcon && (
        <span className="flex-shrink-0 mt-0.5" aria-hidden>
          {icon ?? <Icon className="w-4 h-4" />}
        </span>
      )}
      <div className="min-w-0 flex-1">
        {title && <p className="font-semibold leading-snug">{title}</p>}
        {description && (
          <div className={cn("leading-relaxed", title && "mt-1 text-[0.8125rem] opacity-90")}>
            {description}
          </div>
        )}
        {children}
        {action && <div className="mt-2.5 flex flex-wrap gap-2">{action}</div>}
      </div>
    </div>
  );
}

/**
 * Inline form-level error. Narrower than Alert on purpose — it sits directly
 * above a submit button and shouldn't dominate the form.
 */
export function FormError({ message, className }: { message?: string | null; className?: string }) {
  if (!message) return null;
  return (
    <p
      role="alert"
      className={cn(
        "flex items-start gap-2 rounded-lg border border-border-danger bg-background-danger px-3 py-2 text-xs text-text-danger",
        className
      )}
    >
      <XCircle className="w-3.5 h-3.5 mt-px flex-shrink-0" aria-hidden />
      <span className="leading-relaxed">{message}</span>
    </p>
  );
}

/** Transient success confirmation, e.g. after saving a form. */
export function FormSuccess({ message, className }: { message?: string | null; className?: string }) {
  if (!message) return null;
  return (
    <p
      role="status"
      className={cn(
        "flex items-start gap-2 rounded-lg border border-border-success bg-background-success px-3 py-2 text-xs text-text-success",
        className
      )}
    >
      <CheckCircle2 className="w-3.5 h-3.5 mt-px flex-shrink-0" aria-hidden />
      <span className="leading-relaxed">{message}</span>
    </p>
  );
}
