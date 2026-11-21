import * as React from "react";
import { cn } from "@/lib/utils";

/* ═══════════════════════════════════════════════════════════════════════════
   Layout primitives.

   Every page previously hand-wrote `max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10`.
   These components centralise that rhythm so spacing stays consistent and
   changes happen in one place.
   ═══════════════════════════════════════════════════════════════════════════ */

const WIDTHS = {
  sm: "max-w-2xl",     // focused forms, auth
  md: "max-w-3xl",     // reading / detail
  lg: "max-w-5xl",     // dashboards
  xl: "max-w-7xl",     // grids, marketing
  full: "max-w-none",
} as const;

export interface ContainerProps extends React.HTMLAttributes<HTMLDivElement> {
  width?: keyof typeof WIDTHS;
  as?: "div" | "section" | "main" | "header" | "footer";
}

export function Container({
  width = "xl", as: Tag = "div", className, ...props
}: ContainerProps) {
  return (
    <Tag
      className={cn("mx-auto w-full px-4 sm:px-6 lg:px-8", WIDTHS[width], className)}
      {...props}
    />
  );
}

const SPACING = {
  none: "",
  sm: "py-8 sm:py-10",
  md: "py-12 sm:py-16",
  lg: "py-16 sm:py-24",
  xl: "py-20 sm:py-32",
} as const;

export interface SectionProps extends React.HTMLAttributes<HTMLElement> {
  space?: keyof typeof SPACING;
  /** Tinted band that separates a section from its neighbours. */
  tint?: "none" | "surface" | "gradient";
  bordered?: boolean;
  width?: keyof typeof WIDTHS;
  /** Render children without the inner Container. */
  bare?: boolean;
}

export function Section({
  space = "lg",
  tint = "none",
  bordered = false,
  width = "xl",
  bare = false,
  className,
  children,
  ...props
}: SectionProps) {
  return (
    <section
      className={cn(
        "relative",
        SPACING[space],
        tint === "surface" && "bg-surface",
        tint === "gradient" && "bg-gradient-subtle",
        bordered && "border-y",
        className
      )}
      {...props}
    >
      {bare ? children : <Container width={width}>{children}</Container>}
    </section>
  );
}

/* ── Page header ──────────────────────────────────────────────────────────── */

export interface PageHeaderProps {
  title: string;
  description?: string;
  /** Small uppercase label above the title. */
  eyebrow?: string;
  icon?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}

export function PageHeader({
  title, description, eyebrow, icon, actions, className,
}: PageHeaderProps) {
  return (
    <div className={cn("flex items-start justify-between gap-4 flex-wrap mb-8", className)}>
      <div className="min-w-0">
        {eyebrow && <p className="text-eyebrow mb-2">{eyebrow}</p>}
        <div className="flex items-center gap-3">
          {icon && (
            <span className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center flex-shrink-0 [&>svg]:w-[1.15rem] [&>svg]:h-[1.15rem]">
              {icon}
            </span>
          )}
          <h1 className="text-display-md">{title}</h1>
        </div>
        {description && (
          <p className="text-[0.95rem] text-muted-foreground mt-2.5 max-w-2xl leading-relaxed">
            {description}
          </p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2 flex-shrink-0">{actions}</div>}
    </div>
  );
}

/* ── Section heading (marketing/centred) ──────────────────────────────────── */

export function SectionHeading({
  eyebrow, title, description, align = "center", className,
}: {
  eyebrow?: string;
  title: React.ReactNode;
  description?: string;
  align?: "center" | "left";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mb-12 sm:mb-14",
        align === "center" ? "text-center mx-auto max-w-2xl" : "max-w-2xl",
        className
      )}
    >
      {eyebrow && <p className="text-eyebrow mb-3">{eyebrow}</p>}
      <h2 className="text-display-lg">{title}</h2>
      {description && (
        <p className="text-[1.0625rem] text-muted-foreground mt-4 leading-relaxed">
          {description}
        </p>
      )}
    </div>
  );
}

/* ── Stack / Row helpers ──────────────────────────────────────────────────── */

const GAPS = { xs: "gap-2", sm: "gap-3", md: "gap-4", lg: "gap-6", xl: "gap-8" } as const;

export function Stack({
  gap = "md", className, ...props
}: React.HTMLAttributes<HTMLDivElement> & { gap?: keyof typeof GAPS }) {
  return <div className={cn("flex flex-col", GAPS[gap], className)} {...props} />;
}

export function Row({
  gap = "md", className, ...props
}: React.HTMLAttributes<HTMLDivElement> & { gap?: keyof typeof GAPS }) {
  return <div className={cn("flex items-center", GAPS[gap], className)} {...props} />;
}

/* ── Responsive grid ─────────────────────────────────────────────────────── */

const COLS = {
  2: "sm:grid-cols-2",
  3: "sm:grid-cols-2 lg:grid-cols-3",
  4: "grid-cols-2 lg:grid-cols-4",
} as const;

export function Grid({
  cols = 3, gap = "md", className, ...props
}: React.HTMLAttributes<HTMLDivElement> & {
  cols?: keyof typeof COLS;
  gap?: keyof typeof GAPS;
}) {
  return (
    <div className={cn("grid grid-cols-1", COLS[cols], GAPS[gap], className)} {...props} />
  );
}
