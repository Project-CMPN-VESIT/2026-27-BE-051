"use client";
import * as React from "react";
import * as LabelPrimitive from "@radix-ui/react-label";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

// ── Input ─────────────────────────────────────────────────────────────────────

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: string;
  /** Leading icon, rendered inside the field. */
  icon?: React.ReactNode;
  /** Trailing adornment (unit, action, hint). */
  suffix?: React.ReactNode;
  inputSize?: "sm" | "default" | "lg";
}

const inputSizes = {
  sm: "h-8 text-xs px-2.5",
  default: "h-10 text-sm px-3",
  lg: "h-11 text-base px-3.5",
};

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, error, icon, suffix, inputSize = "default", ...props }, ref) => (
    <div className="w-full">
      <div className="relative">
        {icon && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none [&>svg]:w-4 [&>svg]:h-4">
            {icon}
          </span>
        )}
        <input
          type={type}
          aria-invalid={!!error || undefined}
          className={cn(
            "flex w-full rounded-xl border border-input bg-card text-foreground shadow-xs",
            "placeholder:text-muted-foreground/70",
            "transition-[box-shadow,border-color,background-color] duration-200",
            "focus-visible:outline-none focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-primary/12",
            "disabled:cursor-not-allowed disabled:opacity-60 disabled:bg-muted",
            "file:border-0 file:bg-transparent file:text-sm file:font-medium",
            inputSizes[inputSize],
            icon && "pl-9",
            suffix && "pr-10",
            error && "border-destructive focus-visible:border-destructive focus-visible:ring-destructive/15",
            className
          )}
          ref={ref}
          {...props}
        />
        {suffix && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">
            {suffix}
          </span>
        )}
      </div>
      {error && <p className="mt-1.5 text-xs text-destructive font-medium">{error}</p>}
    </div>
  )
);
Input.displayName = "Input";

// ── Label ─────────────────────────────────────────────────────────────────────

const Label = React.forwardRef<
  React.ElementRef<typeof LabelPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root> & { hint?: string }
>(({ className, hint, children, ...props }, ref) => (
  <div className="flex items-baseline justify-between gap-2">
    <LabelPrimitive.Root
      ref={ref}
      className={cn(
        "text-sm font-medium leading-none text-foreground/90 peer-disabled:cursor-not-allowed peer-disabled:opacity-70",
        className
      )}
      {...props}
    >
      {children}
    </LabelPrimitive.Root>
    {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
  </div>
));
Label.displayName = "Label";

// ── Textarea ──────────────────────────────────────────────────────────────────

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: string;
}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, error, ...props }, ref) => (
    <div className="w-full">
      <textarea
        aria-invalid={!!error || undefined}
        className={cn(
          "flex min-h-[84px] w-full rounded-xl border border-input bg-card px-3 py-2.5 text-sm shadow-xs",
          "placeholder:text-muted-foreground/70 resize-none",
          "transition-[box-shadow,border-color] duration-200",
          "focus-visible:outline-none focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-primary/12",
          "disabled:cursor-not-allowed disabled:opacity-60 disabled:bg-muted",
          error && "border-destructive focus-visible:border-destructive focus-visible:ring-destructive/15",
          className
        )}
        ref={ref}
        {...props}
      />
      {error && <p className="mt-1.5 text-xs text-destructive font-medium">{error}</p>}
    </div>
  )
);
Textarea.displayName = "Textarea";

// ── Select ────────────────────────────────────────────────────────────────────

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  error?: string;
}

const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, error, children, ...props }, ref) => (
    <div className="w-full">
      <div className="relative">
        <select
          ref={ref}
          aria-invalid={!!error || undefined}
          className={cn(
            "flex h-10 w-full appearance-none rounded-xl border border-input bg-card pl-3 pr-9 text-sm shadow-xs",
            "transition-[box-shadow,border-color] duration-200 cursor-pointer",
            "focus-visible:outline-none focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-primary/12",
            "disabled:cursor-not-allowed disabled:opacity-60",
            error && "border-destructive",
            className
          )}
          {...props}
        >
          {children}
        </select>
        <svg
          className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none"
          viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          aria-hidden="true"
        >
          <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      {error && <p className="mt-1.5 text-xs text-destructive font-medium">{error}</p>}
    </div>
  )
);
Select.displayName = "Select";

// ── Badge ─────────────────────────────────────────────────────────────────────

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full border font-medium transition-colors whitespace-nowrap",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground",
        secondary: "border-transparent bg-secondary text-secondary-foreground",
        destructive: "border-transparent bg-destructive text-destructive-foreground",
        outline: "border-border text-foreground bg-transparent",
        success: "border-transparent bg-background-success text-text-success",
        warning: "border-transparent bg-background-warning text-text-warning",
        info: "border-transparent bg-background-info text-text-info",
        ghost: "border-border text-muted-foreground bg-transparent",
        brand: "border-transparent bg-primary/12 text-primary",
      },
      size: {
        sm: "px-1.5 py-0.5 text-[10px]",
        default: "px-2.5 py-0.5 text-xs",
        lg: "px-3 py-1 text-sm",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {
  /** Show a leading status dot. */
  dot?: boolean;
}

function Badge({ className, variant, size, dot, children, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant, size }), className)} {...props}>
      {dot && <span className="w-1.5 h-1.5 rounded-full bg-current opacity-80" aria-hidden />}
      {children}
    </div>
  );
}

// ── Card ──────────────────────────────────────────────────────────────────────

const cardVariants = cva("rounded-xl border bg-card text-card-foreground", {
  variants: {
    variant: {
      default: "shadow-sm",
      flat: "shadow-none",
      elevated: "bg-elevated shadow-md",
      interactive: "shadow-sm card-interactive",
      subtle: "bg-surface shadow-none",
    },
  },
  defaultVariants: { variant: "default" },
});

export interface CardProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof cardVariants> {}

const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, variant, ...props }, ref) => (
    <div ref={ref} className={cn(cardVariants({ variant }), className)} {...props} />
  )
);
Card.displayName = "Card";

const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("flex flex-col space-y-1.5 p-5", className)} {...props} />
  )
);
CardHeader.displayName = "CardHeader";

const CardTitle = React.forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h3 ref={ref} className={cn("font-semibold leading-none tracking-tight", className)} {...props} />
  )
);
CardTitle.displayName = "CardTitle";

const CardDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p ref={ref} className={cn("text-sm text-muted-foreground leading-relaxed", className)} {...props} />
  )
);
CardDescription.displayName = "CardDescription";

const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("p-5 pt-0", className)} {...props} />
  )
);
CardContent.displayName = "CardContent";

const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("flex items-center p-5 pt-0", className)} {...props} />
  )
);
CardFooter.displayName = "CardFooter";

// ── Progress ──────────────────────────────────────────────────────────────────

export interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  value: number;
  max?: number;
  label?: string;
  barClassName?: string;
  size?: "sm" | "default" | "lg";
}

const progressSizes = { sm: "h-1", default: "h-2", lg: "h-3" };

function Progress({
  value, max = 100, label, className, barClassName, size = "default", ...props
}: ProgressProps) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div
      className={cn("w-full rounded-full bg-secondary overflow-hidden", progressSizes[size], className)}
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
      {...props}
    >
      <div
        className={cn("h-full rounded-full bg-primary transition-[width] duration-500 ease-out", barClassName)}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

// ── Section header ────────────────────────────────────────────────────────────

export function SectionHeader({
  title, description, icon, action, className,
}: {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-start justify-between gap-4 flex-wrap", className)}>
      <div className="min-w-0">
        <h2 className="text-lg font-semibold tracking-tight flex items-center gap-2">
          {icon && <span className="text-primary [&>svg]:w-[1.1rem] [&>svg]:h-[1.1rem]">{icon}</span>}
          {title}
        </h2>
        {description && (
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl leading-relaxed">{description}</p>
        )}
      </div>
      {action && <div className="flex-shrink-0">{action}</div>}
    </div>
  );
}

// ── Stat card ─────────────────────────────────────────────────────────────────

export function StatCard({
  label, value, icon, hint, accent = false, className,
}: {
  label: string;
  value: React.ReactNode;
  icon?: React.ReactNode;
  hint?: string;
  accent?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border p-4 transition-colors",
        accent ? "border-primary/35 bg-primary/[0.06]" : "bg-card hover:border-border-strong",
        className
      )}
    >
      <div
        className={cn(
          "flex items-center gap-1.5 text-xs font-medium",
          accent ? "text-primary" : "text-muted-foreground"
        )}
      >
        {icon && <span className="[&>svg]:w-3.5 [&>svg]:h-3.5">{icon}</span>}
        {label}
      </div>
      <div
        className={cn(
          "mt-1.5 text-display-md font-display tracking-tight tabular-nums",
          accent && "text-primary"
        )}
      >
        {value}
      </div>
      {hint && <div className="text-xs text-muted-foreground mt-0.5">{hint}</div>}
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────

export function EmptyState({
  icon, title, description, action, className,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-dashed bg-surface/60 px-6 py-12 text-center",
        className
      )}
    >
      {icon && (
        <div className="w-12 h-12 rounded-xl bg-secondary flex items-center justify-center mx-auto mb-4 text-muted-foreground [&>svg]:w-5 [&>svg]:h-5">
          {icon}
        </div>
      )}
      <p className="font-semibold">{title}</p>
      {description && (
        <p className="text-sm text-muted-foreground mt-1.5 max-w-sm mx-auto leading-relaxed">
          {description}
        </p>
      )}
      {action && <div className="mt-5 flex justify-center gap-2">{action}</div>}
    </div>
  );
}

// ── Spinner ───────────────────────────────────────────────────────────────────

export function Spinner({ className }: { className?: string }) {
  return (
    <svg
      className={cn("animate-spin h-4 w-4", className)}
      viewBox="0 0 24 24" fill="none" role="status" aria-label="Loading"
    >
      <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3.5" />
      <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 018-8v3.2A4.8 4.8 0 007.2 12z" />
    </svg>
  );
}

// ── Divider with optional label ───────────────────────────────────────────────

export function Divider({ label, className }: { label?: string; className?: string }) {
  if (!label) return <hr className={cn("border-border", className)} />;
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <hr className="flex-1 border-border" />
      <span className="text-xs text-muted-foreground font-medium">{label}</span>
      <hr className="flex-1 border-border" />
    </div>
  );
}

export {
  Input, Label, Textarea, Select,
  Badge, badgeVariants,
  Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter, cardVariants,
  Progress,
};
