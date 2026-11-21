"use client";
import * as React from "react";
import Link from "next/link";
import {
  ArrowRight, Check, Code2, GitBranch, IndianRupee, ShieldCheck, X,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useMyProjects } from "@/lib/hooks";
import { cn } from "@/lib/utils";

const DISMISS_KEY = "cb-onboarding-dismissed";

type Step = {
  key: string;
  label: string;
  detail: string;
  icon: React.ComponentType<{ className?: string }>;
  done: boolean;
  href: string;
  cta: string;
};

/**
 * First-run guidance: import a repo, get it verified, set a price.
 *
 * State is derived from the user's actual projects rather than stored as flags,
 * so it can't disagree with reality — deleting your only project correctly puts
 * step one back. Dismissal is the only thing persisted, and it disappears on its
 * own once every step is done.
 */
export function OnboardingChecklist() {
  const { data: projects, isLoading } = useMyProjects();
  const dismissed = React.useSyncExternalStore(
    (notify) => {
      window.addEventListener("storage", notify);
      window.addEventListener("cb-onboarding-dismissed", notify);
      return () => {
        window.removeEventListener("storage", notify);
        window.removeEventListener("cb-onboarding-dismissed", notify);
      };
    },
    () => window.localStorage.getItem(DISMISS_KEY) === "1",
    () => true
  );

  const dismiss = () => {
    window.localStorage.setItem(DISMISS_KEY, "1");
    window.dispatchEvent(new Event("cb-onboarding-dismissed"));
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="pt-5 space-y-3">
          <Skeleton className="h-5 w-56" />
          <Skeleton className="h-2 w-full rounded-full" />
          <Skeleton className="h-14 w-full rounded-lg" />
        </CardContent>
      </Card>
    );
  }

  const list = projects ?? [];
  const imported = list.length > 0;
  const verified = list.some((p) => p.is_verified);
  const priced = list.some((p) => p.is_for_sale && (p.price_paise ?? 0) > 0);

  const firstProject = list[0];
  const verifiedProject = list.find((p) => p.is_verified) ?? firstProject;

  const steps: Step[] = [
    {
      key: "import",
      label: "Import your first repo",
      detail: "Connect a GitHub repository. We read its commit history to compute a score.",
      icon: GitBranch,
      done: imported,
      href: "/import",
      cta: "Import a repo",
    },
    {
      key: "verify",
      label: "Get it verified",
      detail:
        "Prove you own the repo and run verification. A score of 70+ with proved ownership earns the verified badge.",
      icon: ShieldCheck,
      done: verified,
      href: firstProject ? `/projects/${firstProject.id}` : "/import",
      cta: imported ? "Run verification" : "Import first",
    },
    {
      key: "price",
      label: "Set a price",
      detail:
        "List the project for sale, or offer collaborator access. You keep 90% — the platform fee is 10%.",
      icon: IndianRupee,
      done: priced,
      href: firstProject ? `/projects/${firstProject.id}/edit` : "/import",
      cta: imported ? "Set a price" : "Import first",
    },
    {
      key: "badge",
      label: "Add your badge to GitHub",
      detail:
        "Paste a live score badge into your README. Every viewer sees your verified score and can open the full report.",
      icon: Code2,
      // No reliable signal for whether a README was edited, so this step is
      // marked available rather than complete — claiming it was done would be
      // a guess, and a checklist that lies is worse than one that doesn't try.
      done: false,
      href: verifiedProject ? `/projects/${verifiedProject.id}` : "/import",
      cta: verified ? "Get embed code" : "Verify first",
    },
  ];

  const required = steps.slice(0, 3);
  const completed = required.filter((s) => s.done).length;
  const allDone = completed === required.length;

  // Nothing left to guide once the core path is finished.
  if (dismissed || allDone) return null;

  const nextStep = steps.find((s) => !s.done);

  return (
    <Card className="border-primary/25 bg-primary-subtle/40 relative overflow-hidden">
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss the getting started checklist"
        className={cn(
          "absolute top-3 right-3 p-1.5 rounded-md text-muted-foreground",
          "hover:text-foreground hover:bg-accent transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        )}
      >
        <X className="w-3.5 h-3.5" />
      </button>

      <CardContent className="pt-5">
        <div className="flex items-baseline gap-2 pr-8">
          <h2 className="font-display text-lg font-semibold">Get set up</h2>
          <span className="text-sm text-muted-foreground tabular-nums">
            {completed} of {required.length}
          </span>
        </div>
        <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
          Three steps to a listing buyers will trust.
        </p>

        {/* Progress */}
        <div
          className="mt-4 h-1.5 rounded-full bg-secondary overflow-hidden"
          role="progressbar"
          aria-valuenow={completed}
          aria-valuemin={0}
          aria-valuemax={required.length}
          aria-label="Onboarding progress"
        >
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-700 ease-out"
            style={{ width: `${(completed / required.length) * 100}%` }}
          />
        </div>

        <ol className="mt-5 space-y-1.5 list-none">
          {steps.map((step) => {
            const Icon = step.icon;
            const isNext = step.key === nextStep?.key;
            return (
              <li
                key={step.key}
                className={cn(
                  "flex items-start gap-3 rounded-lg p-3 transition-colors",
                  isNext ? "bg-card border shadow-xs" : "bg-transparent"
                )}
              >
                <span
                  className={cn(
                    "w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5",
                    step.done
                      ? "bg-background-success text-text-success border border-border-success"
                      : "bg-secondary text-muted-foreground"
                  )}
                  aria-hidden
                >
                  {step.done ? (
                    <Check className="w-3.5 h-3.5" strokeWidth={3} />
                  ) : (
                    <Icon className="w-3.5 h-3.5" />
                  )}
                </span>

                <div className="min-w-0 flex-1">
                  <p
                    className={cn(
                      "text-sm font-medium",
                      step.done && "text-muted-foreground line-through decoration-1"
                    )}
                  >
                    {step.label}
                  </p>
                  {isNext && (
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                      {step.detail}
                    </p>
                  )}
                </div>

                {isNext && (
                  <Button size="sm" variant="cta" asChild className="flex-shrink-0">
                    <Link href={step.href}>
                      {step.cta} <ArrowRight className="w-3.5 h-3.5" />
                    </Link>
                  </Button>
                )}
              </li>
            );
          })}
        </ol>
      </CardContent>
    </Card>
  );
}
