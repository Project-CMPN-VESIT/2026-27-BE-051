"use client";
import * as React from "react";
import Link from "next/link";
import {
  ArrowRight, Eraser, Lightbulb, MessagesSquare, Send, Sparkles, TrendingUp,
  UserRound,
} from "lucide-react";
import {
  Badge, Card, CardContent, CardHeader, CardTitle, Textarea,
} from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert } from "@/components/ui/alert";
import {
  useAskMentor, useClearMentorHistory, useImprovementPlan, useMentorHistory,
} from "@/lib/hooks/mentors";
import { getErrorMessage } from "@/lib/api/client";
import { cn } from "@/lib/utils";

/**
 * Project-scoped mentor.
 *
 * Two halves, in this order deliberately:
 *
 *   1. A deterministic improvement plan — arithmetic over the stored component
 *      scores, so it works with no AI provider configured and can never disagree
 *      with the score shown elsewhere on the page.
 *   2. An AI chat grounded in that same project data.
 *
 * The plan comes first because a builder with a score of 58 needs a next step
 * more than they need a conversation, and the plan is the part that's guaranteed
 * to be available.
 */
export function MentorPanel({
  projectId,
  isOwner,
}: {
  projectId: string;
  isOwner?: boolean;
}) {
  // Only the owner can use this: the grounding facts include weaknesses and
  // unpublished analysis notes.
  if (!isOwner) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Lightbulb className="w-4 h-4 text-primary" /> Mentor
        </CardTitle>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Grounded in this project&apos;s real verification data — not generic advice.
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        <ImprovementPlanBlock projectId={projectId} />
        <MentorChat projectId={projectId} />
      </CardContent>
    </Card>
  );
}

function ImprovementPlanBlock({ projectId }: { projectId: string }) {
  const { data: plan, isLoading } = useImprovementPlan(projectId);

  if (isLoading) return <Skeleton className="h-32 w-full rounded-xl" />;
  if (!plan) return null;

  const score = plan.verified_build_score;

  // Verified already — acknowledge it and stop, rather than inventing work.
  if (plan.is_verified) {
    return (
      <div className="rounded-xl border border-border-success bg-background-success/40 p-4">
        <p className="text-sm font-semibold text-text-success">
          This project is verified at {score}/100
        </p>
        <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
          Nothing needs fixing to clear the bar. If you want to push the score
          higher, the components below still have room — but it&apos;s optional.
        </p>
        {plan.weakest.length > 0 && (
          <ul className="mt-3 space-y-1.5 list-none">
            {plan.weakest.slice(0, 2).map((c) => (
              <li key={c.key} className="text-xs text-muted-foreground">
                {c.label}: {c.score}/100 —{" "}
                <span className="tabular-nums">
                  {c.points_available.toFixed(1)} pts available
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border-warning bg-background-warning/40 p-4">
      <p className="text-sm font-semibold text-text-warning">
        {score != null
          ? `Your score is ${score}. You need ${plan.points_needed} more to reach ${plan.verified_threshold}.`
          : "This project hasn't been scored yet."}
      </p>
      <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
        These components have the most points still available, weighted by how
        much each is worth. Fix the top one first.
      </p>

      {plan.weakest.length > 0 && (
        <ol className="mt-3.5 space-y-2.5 list-none">
          {plan.weakest.map((c, i) => (
            <li key={c.key} className="flex items-start gap-2.5">
              <span className="w-5 h-5 rounded-full bg-card border text-[11px] font-semibold flex items-center justify-center flex-shrink-0 mt-0.5 tabular-nums">
                {i + 1}
              </span>
              <div className="min-w-0">
                <p className="text-xs font-medium">
                  {c.label}{" "}
                  <span className="text-muted-foreground font-normal tabular-nums">
                    — {c.score}/100, worth up to {c.points_available.toFixed(1)} pts
                  </span>
                </p>
                <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                  {c.explains}
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <Button size="sm" variant="outline" asChild>
          <Link href="/mentors">
            <UserRound className="w-3.5 h-3.5" /> Talk to a human mentor
          </Link>
        </Button>
        <Button size="sm" variant="ghost" asChild>
          <Link href="/how-verification-works">How scoring works</Link>
        </Button>
      </div>
    </div>
  );
}

function MentorChat({ projectId }: { projectId: string }) {
  const { data: history, isLoading } = useMentorHistory(projectId);
  const { data: plan } = useImprovementPlan(projectId);
  const ask = useAskMentor(projectId);
  const clear = useClearMentorHistory(projectId);
  const [question, setQuestion] = React.useState("");
  const endRef = React.useRef<HTMLDivElement>(null);

  const messages = history ?? [];

  // Keep the newest turn in view as the thread grows.
  React.useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest" });
  }, [messages.length, ask.isPending]);

  const submit = (text?: string) => {
    const q = (text ?? question).trim();
    if (!q || ask.isPending) return;
    ask.mutate(q, { onSuccess: () => setQuestion("") });
    if (!text) setQuestion("");
  };

  const suggestions = plan?.suggested_questions ?? [];

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-3">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <MessagesSquare className="w-3.5 h-3.5 text-primary" /> Ask the AI mentor
        </h3>
        {messages.length > 0 && (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs"
            onClick={() => clear.mutate()}
            loading={clear.isPending}
          >
            <Eraser className="w-3 h-3" /> Clear
          </Button>
        )}
      </div>

      {isLoading ? (
        <Skeleton className="h-24 w-full rounded-xl" />
      ) : (
        <div
          className={cn(
            "rounded-xl border bg-surface/50 divide-y",
            messages.length > 0 && "max-h-[26rem] overflow-y-auto"
          )}
        >
          {messages.length === 0 && !ask.isPending && (
            <div className="p-4">
              <p className="text-xs text-muted-foreground leading-relaxed">
                Ask about your score, your weakest component, what a flag means,
                or what to price this at. Answers cite your actual numbers.
              </p>
            </div>
          )}

          {messages.map((m) => (
            <div
              key={m.id}
              className={cn("p-4", m.role === "user" ? "bg-transparent" : "bg-card/60")}
            >
              <div className="flex items-center gap-2 mb-1.5">
                {m.role === "user" ? (
                  <Badge variant="ghost" size="sm">You</Badge>
                ) : (
                  <Badge variant="brand" size="sm">
                    <Sparkles className="w-3 h-3" /> Mentor
                  </Badge>
                )}
              </div>
              <p className="text-sm leading-relaxed whitespace-pre-wrap">{m.content}</p>
            </div>
          ))}

          {ask.isPending && (
            <div className="p-4 bg-card/60">
              <Badge variant="brand" size="sm" className="mb-2">
                <Sparkles className="w-3 h-3" /> Mentor
              </Badge>
              <div className="space-y-2">
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-5/6" />
                <Skeleton className="h-3 w-2/3" />
              </div>
            </div>
          )}
          <div ref={endRef} />
        </div>
      )}

      {ask.isError && (
        <Alert
          variant="warning"
          className="mt-3"
          title="The mentor couldn't answer"
          description={getErrorMessage(ask.error)}
        />
      )}

      {/* Suggested questions come from the improvement plan, so they're specific
          to this project's weakest components rather than a generic list. */}
      {messages.length === 0 && suggestions.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-3">
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => submit(s)}
              disabled={ask.isPending}
              className={cn(
                "text-xs px-2.5 py-1.5 rounded-full border bg-card text-muted-foreground",
                "hover:text-foreground hover:border-border-strong transition-colors",
                "disabled:opacity-50",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
              )}
            >
              {s}
            </button>
          ))}
        </div>
      )}

      <form
        className="mt-3 flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <Textarea
          rows={2}
          placeholder="e.g. How do I improve my contributor authenticity score?"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            // Enter sends; Shift+Enter is a newline. Matches every chat UI.
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          aria-label="Ask the AI mentor a question about this project"
          className="resize-none"
        />
        <Button
          type="submit"
          size="icon"
          variant="cta"
          disabled={!question.trim() || ask.isPending}
          aria-label="Send question"
          className="flex-shrink-0"
        >
          <Send className="w-4 h-4" />
        </Button>
      </form>

      <p className="text-[11px] text-muted-foreground mt-2 flex items-center gap-1.5">
        <TrendingUp className="w-3 h-3 flex-shrink-0" />
        AI-generated guidance based on your project&apos;s real data. Verify anything
        before acting on it.
      </p>
    </div>
  );
}
