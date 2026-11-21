"use client";
import * as React from "react";
import Link from "next/link";
import { Check, Code2, Copy, ExternalLink } from "lucide-react";
import { Badge, Card, CardContent, CardHeader, CardTitle } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert } from "@/components/ui/alert";
import { useBadgeSnippets } from "@/lib/hooks/public";
import { getErrorMessage } from "@/lib/api/client";
import { cn } from "@/lib/utils";

type Format = "markdown" | "html" | "restructured_text";

const FORMATS: { key: Format; label: string }[] = [
  { key: "markdown", label: "Markdown" },
  { key: "html", label: "HTML" },
  { key: "restructured_text", label: "reST" },
];

/**
 * "Put this in your README" panel.
 *
 * The badge is the cheapest distribution the product has: a builder pastes it
 * into a repo that already gets traffic, and every viewer sees a live score that
 * links back to a full public report. So the panel optimises for one thing —
 * copying the snippet in a single click.
 */
export function BadgeEmbed({ projectId }: { projectId: string }) {
  const { data, isLoading, isError, error } = useBadgeSnippets(projectId);
  const [format, setFormat] = React.useState<Format>("markdown");
  const [copied, setCopied] = React.useState(false);

  const snippet = data ? data[format] : "";

  const copy = async () => {
    if (!snippet) return;
    try {
      await navigator.clipboard.writeText(snippet);
    } catch {
      // Clipboard API needs a secure context and can be blocked by policy.
      // Selecting the text is a workable fallback rather than a silent failure.
      const el = document.getElementById(`badge-snippet-${projectId}`);
      if (el instanceof HTMLTextAreaElement) {
        el.select();
      }
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Code2 className="w-4 h-4" /> Embed your badge
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-20 w-full rounded-lg" />
        </CardContent>
      </Card>
    );
  }

  if (isError || !data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Code2 className="w-4 h-4" /> Embed your badge
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Alert
            variant="warning"
            title="Couldn't load your embed code"
            description={getErrorMessage(error)}
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between space-y-0 gap-3">
        <div className="min-w-0">
          <CardTitle className="text-base flex items-center gap-2">
            <Code2 className="w-4 h-4 text-primary" /> Embed your badge
          </CardTitle>
          <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">
            Paste this into your README. It renders a live score and links to your
            public verification report — no login needed to view it.
          </p>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Live preview, rendered from the real endpoint. */}
        <div className="rounded-xl border bg-surface/60 p-4 flex items-center gap-3 flex-wrap">
          <span className="text-xs text-muted-foreground">Preview</span>
          {/* Intentionally a plain img: this is an SVG served by our API, and
              next/image would proxy and re-encode it for no benefit. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={data.badge_url}
            alt={`Verified Build Score ${data.score ?? "unscored"} out of 100`}
            width={168}
            height={20}
            className="h-5"
          />
          {data.is_verified && (
            <Badge variant="success" size="sm">Verified</Badge>
          )}
        </div>

        {/* Format switcher. */}
        <div
          className="inline-flex items-center gap-0.5 p-1 rounded-full border bg-surface/60"
          role="tablist"
          aria-label="Snippet format"
        >
          {FORMATS.map((f) => (
            <button
              key={f.key}
              type="button"
              role="tab"
              aria-selected={format === f.key}
              onClick={() => setFormat(f.key)}
              className={cn(
                "px-3 py-1 rounded-full text-xs transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                format === f.key
                  ? "bg-card text-foreground font-semibold shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="relative">
          <textarea
            id={`badge-snippet-${projectId}`}
            readOnly
            value={snippet}
            rows={format === "restructured_text" ? 3 : 2}
            onClick={(e) => e.currentTarget.select()}
            className={cn(
              "w-full rounded-xl border border-input bg-card p-3 pr-24",
              "font-mono text-xs leading-relaxed resize-none",
              "focus-visible:outline-none focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-primary/12"
            )}
            aria-label={`${format} snippet for your Verified Build badge`}
          />
          <Button
            size="sm"
            variant={copied ? "secondary" : "default"}
            onClick={copy}
            className="absolute top-2 right-2 gap-1.5"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5" /> Copied
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" /> Copy
              </>
            )}
          </Button>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" asChild>
            <Link href={`/verify/${projectId}`}>
              <ExternalLink className="w-3.5 h-3.5" /> View public report
            </Link>
          </Button>
          <p className="text-xs text-muted-foreground">
            The badge updates automatically whenever the score is recomputed.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
