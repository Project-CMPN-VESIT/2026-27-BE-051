"use client";
import * as React from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A copyable code sample.
 *
 * No syntax highlighting on purpose: shipping a highlighter to render a dozen
 * short snippets costs more bundle than it earns in legibility, and monospace on
 * a warm surface reads cleanly enough.
 */
export function CodeBlock({
  code,
  language,
  label,
  className,
}: {
  code: string;
  language?: string;
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = React.useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* Clipboard needs a secure context; the text is selectable regardless. */
    }
  };

  return (
    <div className={cn("rounded-xl border bg-surface-2/70 overflow-hidden", className)}>
      <div className="flex items-center justify-between gap-3 px-3.5 py-2 border-b bg-surface/60">
        <span className="text-[11px] font-medium text-muted-foreground">
          {label ?? language ?? "code"}
        </span>
        <button
          type="button"
          onClick={copy}
          className={cn(
            "inline-flex items-center gap-1.5 text-[11px] font-medium rounded-md px-2 py-1",
            "text-muted-foreground hover:text-foreground hover:bg-accent transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          )}
          aria-label={copied ? "Copied" : "Copy code"}
        >
          {copied ? (
            <>
              <Check className="w-3 h-3" /> Copied
            </>
          ) : (
            <>
              <Copy className="w-3 h-3" /> Copy
            </>
          )}
        </button>
      </div>
      <pre className="p-3.5 overflow-x-auto text-xs leading-relaxed">
        <code className="font-mono">{code}</code>
      </pre>
    </div>
  );
}
