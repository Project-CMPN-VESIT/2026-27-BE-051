"use client";
import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  [
    "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg",
    "font-medium select-none",
    "transition-[background-color,border-color,color,box-shadow,transform] duration-200",
    // Focus ring reads clearly on both themes without shifting layout.
    "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/25 focus-visible:ring-offset-0",
    "disabled:pointer-events-none disabled:opacity-50",
    "active:scale-[0.985]",
    "[&>svg]:shrink-0",
  ].join(" "),
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-sm hover:bg-primary-hover hover:shadow-md",
        /**
         * The warm amber accent. Reserved for the single most important action
         * on a page (buy, fund, verify, import). Using it more than once per
         * view is what makes an accent stop working.
         */
        cta:
          "bg-cta text-cta-foreground font-semibold shadow-sm hover:bg-cta-hover hover:shadow-md",
        brand:
          "bg-gradient-brand text-white shadow-sm hover:shadow-glow",
        destructive:
          "bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90",
        outline:
          "border border-input bg-card text-foreground shadow-xs hover:bg-accent hover:border-border-strong",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-accent",
        ghost:
          "text-foreground hover:bg-accent hover:text-accent-foreground",
        subtle:
          "bg-primary/10 text-primary hover:bg-primary/16",
        link:
          "text-primary underline-offset-4 hover:underline p-0 h-auto",
        // Kept as an alias of `brand` so existing call sites keep working.
        bazaar:
          "bg-gradient-brand text-white shadow-sm hover:shadow-glow",
      },
      size: {
        default: "h-10 px-4 text-sm",
        sm: "h-8 rounded-md px-3 text-xs",
        lg: "h-11 px-6 text-[0.95rem]",
        xl: "h-12 px-7 text-base font-semibold",
        icon: "h-10 w-10",
        "icon-sm": "h-8 w-8 rounded-md",
      },
      block: {
        true: "w-full",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
  /** Optional text shown while loading, replacing children. */
  loadingText?: string;
}

const Spinner = () => (
  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3.5" />
    <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 018-8v3.2A4.8 4.8 0 007.2 12z" />
  </svg>
);

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { className, variant, size, block, asChild = false, loading, loadingText, children, disabled, type, ...props },
    ref
  ) => {
    const Comp = asChild ? Slot : "button";

    // With asChild, Slot requires exactly one child — don't inject a spinner.
    if (asChild) {
      return (
        <Comp className={cn(buttonVariants({ variant, size, block, className }))} ref={ref} {...props}>
          {children}
        </Comp>
      );
    }

    return (
      <button
        className={cn(buttonVariants({ variant, size, block, className }))}
        ref={ref}
        // Default to "button", not the native "submit". Without this, any
        // Button rendered inside a <form> submits it on click — every form in
        // the app declares its own type="submit" button, so this is the safe
        // default and prevents accidental submits from unrelated controls.
        type={type ?? "button"}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        {...props}
      >
        {loading && <Spinner />}
        {loading && loadingText ? loadingText : children}
      </button>
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
