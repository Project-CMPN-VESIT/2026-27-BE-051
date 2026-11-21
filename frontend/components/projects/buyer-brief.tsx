"use client";
import { AlertTriangle, Check, Sparkles } from "lucide-react";
import { Badge, Card, CardContent, CardHeader, CardTitle } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert } from "@/components/ui/alert";
import { useBuyerBrief, useGenerateBuyerBrief } from "@/lib/hooks/analytics";
import { getErrorMessage } from "@/lib/api/client";

/**
 * The AI "why buy this" brief.
 *
 * Generated once by the owner and cached, then shown to every visitor. The
 * caveats are given equal visual weight to the upside on purpose — a listing
 * summary that only sells gets discounted by the reader, and this one is
 * explicitly grounded in the verification result so it can't contradict the
 * score sitting next to it.
 */
export function BuyerBriefPanel({
  projectId,
  isOwner,
}: {
  projectId: string;
  isOwner?: boolean;
}) {
  const { data: brief, isLoading } = useBuyerBrief(projectId);
  const generate = useGenerateBuyerBrief(projectId);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="w-4 h-4" /> Why buy this
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2.5">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-20 w-full rounded-lg" />
        </CardContent>
      </Card>
    );
  }

  // Nothing generated yet. Visitors see nothing; the owner sees the affordance.
  if (!brief) {
    if (!isOwner) return null;
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" /> Why buy this
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground leading-relaxed">
            Generate a short buyer&apos;s brief for this listing. It&apos;s written
            from your verification result, so it can&apos;t overclaim — and it will
            include honest caveats alongside the strengths.
          </p>
          {generate.isError && (
            <Alert
              variant="warning"
              title="Couldn't generate the brief"
              description={getErrorMessage(generate.error)}
            />
          )}
          <Button
            variant="cta"
            size="sm"
            onClick={() => generate.mutate()}
            loading={generate.isPending}
            loadingText="Writing…"
          >
            <Sparkles className="w-3.5 h-3.5" /> Generate brief
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between space-y-0 gap-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-primary" /> Why buy this
        </CardTitle>
        {isOwner && (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs"
            onClick={() => generate.mutate()}
            loading={generate.isPending}
            loadingText="Rewriting…"
          >
            Regenerate
          </Button>
        )}
      </CardHeader>

      <CardContent className="space-y-4">
        {brief.summary && (
          <p className="text-sm leading-relaxed">{brief.summary}</p>
        )}

        <div className="grid sm:grid-cols-2 gap-3">
          {brief.good_for.length > 0 && (
            <div className="rounded-xl border border-border-success bg-background-success/40 p-3.5">
              <p className="text-xs font-semibold text-text-success mb-2">
                Good fit for
              </p>
              <ul className="space-y-1.5 list-none">
                {brief.good_for.map((item, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs leading-relaxed">
                    <Check className="w-3 h-3 mt-0.5 flex-shrink-0 text-text-success" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {brief.watch_outs.length > 0 && (
            <div className="rounded-xl border border-border-warning bg-background-warning/40 p-3.5">
              <p className="text-xs font-semibold text-text-warning mb-2">
                Worth checking
              </p>
              <ul className="space-y-1.5 list-none">
                {brief.watch_outs.map((item, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs leading-relaxed">
                    <AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0 text-text-warning" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {brief.verdict && (
          <p className="text-sm font-medium border-l-2 border-primary/40 pl-3 leading-relaxed">
            {brief.verdict}
          </p>
        )}

        {/* Provenance. A reader should know this was model-written. */}
        <div className="flex items-center gap-2 flex-wrap pt-1">
          <Badge variant="ghost" size="sm">
            AI-generated summary
          </Badge>
          {brief.model_used && (
            <span className="text-[11px] text-muted-foreground font-mono">
              {brief.model_used}
            </span>
          )}
          <span className="text-[11px] text-muted-foreground">
            Grounded in the verification result, not the sales pitch.
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
