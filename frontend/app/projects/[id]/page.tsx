"use client";
import { use, useState } from "react";
import Link from "next/link";
import {
  Star, GitFork, ExternalLink, CheckCircle2, Users, Zap, Clock,
  AlertTriangle, TrendingUp, Code2, RefreshCw, MessageSquare, ShoppingCart,
  ArrowLeft, Download, FileText, KeyRound, Sparkles, ChevronRight,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge, EmptyState } from "@/components/ui/primitives";
import { Container } from "@/components/ui/layout";
import { ScoreRow } from "@/components/shared/score-badge";
import { ProjectDetailSkeleton } from "@/components/ui/skeleton";
import { ReviewSection } from "@/components/reviews/review-section";
import { ProjectSkillTags } from "@/components/skills/skills-manager";
import { VerifiedBuildScorePanel } from "@/components/projects/verified-build-score";
import { BadgeEmbed } from "@/components/trust/badge-embed";
import { ScoreHistoryPanel } from "@/components/trust/score-history";
import { BuyerBriefPanel } from "@/components/projects/buyer-brief";
import { MentorPanel } from "@/components/mentors/mentor-panel";
import { ReportProjectButton } from "@/components/projects/report-button";
import { AdoptionPanel } from "@/components/projects/adoption-panel";
import { PitchDeckPanel } from "@/components/projects/pitch-deck";
import { ContributorMatchesPanel } from "@/components/projects/contributor-matches";
import { ProjectTimeline } from "@/components/projects/timeline";
import { RiskPanel } from "@/components/projects/risk-panel";
import { SimilarProjects } from "@/components/projects/similar-projects";
import { DuplicateNotice } from "@/components/trust/duplicate-notice";
import { TeamPanel } from "@/components/teams/team-panel";
import { MakeOfferPanel, OffersOnListing } from "@/components/deals/offer-panel";
import { HackathonAuthenticity } from "@/components/hackathon/hackathon-authenticity";
import { MakeOfferButton } from "@/components/incubation/make-offer";
import { useProject, useMe, useCreateContributorRequest, useTriggerAnalysis } from "@/lib/hooks";
import { skillsApi, projectsApi } from "@/lib/api";
import { cn } from "@/lib/utils";
import { getErrorMessage } from "@/lib/api/client";
import type { Project, RoadmapStep } from "@/types";
import { useAuthStore } from "@/stores/auth";

const PRIORITY_STYLES: Record<string, string> = {
  high: "bg-background-danger text-text-danger",
  medium: "bg-background-warning text-text-warning",
  low: "bg-background-success text-text-success",
};

/* ── Small building blocks ────────────────────────────────────────────────── */

function Panel({
  title, icon, action, children, className, tone = "default",
}: {
  title?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  tone?: "default" | "brand" | "success";
}) {
  return (
    <section
      className={cn(
        "rounded-xl border bg-card",
        tone === "brand" && "border-primary/35 bg-primary/[0.04]",
        tone === "success" && "border-border-success bg-background-success/40",
        className
      )}
    >
      {title && (
        <header className="flex items-center justify-between gap-3 px-5 py-3.5 border-b">
          <h2 className="font-semibold text-sm flex items-center gap-2">
            {icon && <span className="text-primary [&>svg]:w-4 [&>svg]:h-4">{icon}</span>}
            {title}
          </h2>
          {action}
        </header>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}

function LanguageBar({ languages }: { languages: Array<{ language: string; percentage: number }> }) {
  const COLORS = ["bg-primary/100", "bg-yellow-400", "bg-purple-500", "bg-score-high", "bg-rose-400"];
  return (
    <div className="space-y-2.5">
      <div className="flex h-2 rounded-full overflow-hidden gap-0.5" aria-hidden="true">
        {languages.slice(0, 5).map((l, i) => (
          <div key={l.language} className={cn("h-full", COLORS[i])} style={{ width: `${l.percentage}%` }} />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1.5">
        {languages.slice(0, 5).map((l, i) => (
          <span key={l.language} className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className={cn("w-2 h-2 rounded-full", COLORS[i])} />
            {l.language} <span className="tabular-nums">{l.percentage}%</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function ContributeButton({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const { mutateAsync, isPending } = useCreateContributorRequest();

  const submit = async () => {
    try {
      await mutateAsync({ projectId, data: { message } });
      setOpen(false);
      setMessage("");
    } catch (err) { setError(getErrorMessage(err)); }
  };

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)} block className="gap-2">
        <Users className="w-4 h-4" /> Request to contribute
      </Button>
    );
  }
  return (
    <div className="space-y-3 animate-fade-in">
      <textarea
        className="w-full min-h-[84px] px-3 py-2.5 text-sm rounded-xl border border-input bg-card resize-none shadow-xs focus-visible:outline-none focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-primary/12"
        placeholder="Why you want to contribute and what skills you bring…"
        value={message}
        onChange={(e) => setMessage(e.target.value)}
      />
      {error && <p className="text-xs text-destructive">{error}</p>}
      <div className="flex gap-2">
        <Button size="sm" onClick={submit} loading={isPending}>Send request</Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
      </div>
    </div>
  );
}

/** Buy box — the commercial focal point of the sidebar. */
function BuyBox({ project, isOwner }: { project: Project; isOwner: boolean }) {
  const token = useAuthStore((s) => s.accessToken);
  if (!project.is_for_sale || !project.price_paise) return null;

  const label =
    project.price_label ??
    (project.sale_type === "source_code" ? "Full source code access"
      : project.sale_type === "collab_access" ? "Collaboration rights"
      : "Custom access");

  return (
    <div className="rounded-xl border-2 border-primary/40 bg-card shadow-md overflow-hidden">
      <div className="bg-gradient-brand px-5 py-2.5">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-white/95">
          For sale
        </span>
      </div>
      <div className="p-5">
        <div className="flex items-baseline gap-1.5">
          <span className="text-3xl font-extrabold font-display tabular-nums tracking-tight">
            ₹{(project.price_paise / 100).toLocaleString("en-IN")}
          </span>
          <span className="text-xs text-muted-foreground">one-time</span>
        </div>
        <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">{label}</p>

        {!isOwner && (
          <div className="mt-5">
            {token ? (
              <Button block size="lg" variant="brand" asChild>
                <Link href={`/projects/${project.id}/checkout`}>
                  <ShoppingCart className="w-4 h-4" /> Buy now
                </Link>
              </Button>
            ) : (
              <Button block size="lg" variant="outline" asChild>
                <Link href="/auth/login">Sign in to purchase</Link>
              </Button>
            )}
            <ul className="mt-4 space-y-2">
              {["Delivery unlocks instantly", "Verified before listing", "Seller reputation on record"].map((t) => (
                <li key={t} className="flex items-center gap-2 text-xs text-muted-foreground">
                  <CheckCircle2 className="w-3.5 h-3.5 text-text-success flex-shrink-0" /> {t}
                </li>
              ))}
            </ul>
          </div>
        )}

        {isOwner && (
          <p className="text-xs text-muted-foreground mt-4 leading-relaxed">
            Listed for sale. Edit the project to change the price or delivery details.
          </p>
        )}
      </div>
    </div>
  );
}

function DeliveryPanel({ projectId, enabled, isOwner }: { projectId: string; enabled: boolean; isOwner: boolean }) {
  const { data, isError } = useQuery({
    queryKey: ["project-delivery", projectId],
    queryFn: () => projectsApi.delivery(projectId),
    enabled,
    retry: false,
  });

  // Non-buyers get a 403 -> isError; render nothing for them.
  if (!enabled || isError || !data) return null;

  const hasAnything = data.delivery_url || data.delivery_instructions || data.sale_license;
  if (!hasAnything && !isOwner) return null;

  return (
    <Panel
      tone="success"
      title={isOwner ? "Delivery details (buyer view)" : "Your purchase"}
      icon={<CheckCircle2 />}
    >
      <div className="space-y-4">
        {!hasAnything && isOwner && (
          <p className="text-sm text-muted-foreground leading-relaxed">
            No delivery details yet. Edit the project to add a download link, setup
            instructions and license so buyers get access automatically.
          </p>
        )}

        {data.delivery_url && (
          <div className="space-y-1.5">
            <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Download className="w-3.5 h-3.5" /> Delivery link
            </span>
            <a
              href={data.delivery_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-primary hover:underline break-all inline-flex items-center gap-1"
            >
              {data.delivery_url} <ExternalLink className="w-3 h-3 flex-shrink-0" />
            </a>
          </div>
        )}

        {data.delivery_instructions && (
          <div className="space-y-1.5">
            <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <KeyRound className="w-3.5 h-3.5" /> Setup instructions
            </span>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">
              {data.delivery_instructions}
            </p>
          </div>
        )}

        {data.sale_license && (
          <div className="space-y-1.5">
            <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <FileText className="w-3.5 h-3.5" /> License / terms
            </span>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">
              {data.sale_license}
            </p>
          </div>
        )}
      </div>
    </Panel>
  );
}

/* ── Page ─────────────────────────────────────────────────────────────────── */

export default function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: project, isLoading, error } = useProject(id);
  const { data: me } = useMe();
  const { mutate: triggerAnalysis, isPending: analyzing } = useTriggerAnalysis();
  const { data: projectSkills } = useQuery({
    queryKey: ["project-skills", id],
    queryFn: () => skillsApi.projectSkills(id),
    enabled: !!id,
  });
  const token = useAuthStore((s) => s.accessToken);

  if (isLoading) {
    return (
      <Container width="xl" className="py-10">
        <ProjectDetailSkeleton />
      </Container>
    );
  }

  if (error || !project) {
    return (
      <Container width="md" className="py-20">
        <EmptyState
          icon={<AlertTriangle />}
          title="Project not found"
          description="This project may have been removed or made private."
          action={<Button variant="outline" asChild><Link href="/projects">Browse projects</Link></Button>}
        />
      </Container>
    );
  }

  const isOwner = me?.id === project.owner_id;
  const analysis = project.analysis;

  return (
    <>
      {/* ══ HEADER ════════════════════════════════════════════════════════ */}
      <div className="border-b bg-surface">
        <Container width="xl" className="py-8">
          {/* Breadcrumb */}
          <nav className="flex items-center gap-1.5 text-xs text-muted-foreground mb-5" aria-label="Breadcrumb">
            <Link href="/projects" className="inline-flex items-center gap-1 hover:text-foreground transition-colors">
              <ArrowLeft className="w-3 h-3" /> Projects
            </Link>
            <ChevronRight className="w-3 h-3 opacity-50" />
            <span className="truncate max-w-[16rem] text-foreground/70">{project.title}</span>
          </nav>

          <div className="flex items-start justify-between gap-6 flex-wrap">
            <div className="min-w-0 flex-1">
              {/* Status row */}
              <div className="flex items-center gap-2 flex-wrap mb-3">
                {project.is_featured && (
                  <Badge size="sm" className="gap-1"><Sparkles className="w-2.5 h-2.5" /> Featured</Badge>
                )}
                {project.is_verified && (
                  <Badge variant="success" size="sm" className="gap-1">
                    <CheckCircle2 className="w-2.5 h-2.5" /> Verified
                  </Badge>
                )}
                <Badge variant="ghost" size="sm" className="capitalize">{project.stage}</Badge>
                <Badge
                  variant={project.status === "active" ? "success" : project.status === "dormant" ? "warning" : "ghost"}
                  size="sm"
                  className="capitalize"
                >
                  {project.status}
                </Badge>
              </div>

              <h1 className="text-display-lg">{project.title}</h1>

              <div className="flex items-center gap-x-4 gap-y-1.5 mt-3 flex-wrap text-sm">
                <a
                  href={`https://github.com/${project.repo_full_name}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-muted-foreground hover:text-primary transition-colors inline-flex items-center gap-1.5 font-mono text-xs"
                >
                  {project.repo_full_name} <ExternalLink className="w-3 h-3" />
                </a>
                <Link
                  href={`/u/${project.owner_id}`}
                  className="text-muted-foreground hover:text-primary transition-colors"
                >
                  by {project.owner?.profile?.display_name ?? "Unknown"}
                </Link>
                {project.last_synced_at && (
                  <span className="text-xs text-muted-foreground/70 inline-flex items-center gap-1">
                    <Clock className="w-3 h-3" /> Synced{" "}
                    {new Date(project.last_synced_at).toLocaleDateString()}
                  </span>
                )}
              </div>

              {project.description && (
                <p className="text-[0.9375rem] text-muted-foreground mt-4 leading-relaxed max-w-2xl">
                  {project.description}
                </p>
              )}

              {project.topics.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-4">
                  {project.topics.slice(0, 8).map((t) => (
                    <span key={t} className="text-xs px-2 py-0.5 rounded-md bg-secondary text-secondary-foreground">
                      {t}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 flex-wrap">
              <Button variant="outline" size="sm" asChild className="gap-1.5">
                <a href={`https://github.com/${project.repo_full_name}`} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="w-3.5 h-3.5" /> GitHub
                </a>
              </Button>
              {isOwner ? (
                <>
                  <Button variant="outline" size="sm" asChild>
                    <Link href={`/projects/${id}/edit`}>Edit</Link>
                  </Button>
                  <Button
                    variant="outline" size="sm" className="gap-1.5"
                    onClick={() => triggerAnalysis({ projectId: id })}
                    loading={analyzing}
                  >
                    <Zap className="w-3.5 h-3.5" /> Re-analyse
                  </Button>
                  <Button size="sm" asChild className="gap-1.5">
                    <Link href={`/projects/${id}/checkout`}>
                      <ShoppingCart className="w-3.5 h-3.5" /> Sell / boost
                    </Link>
                  </Button>
                </>
              ) : token ? (
                <Button variant="outline" size="sm" asChild className="gap-1.5">
                  <Link href={`/messages?new=${project.owner_id}&project=${id}`}>
                    <MessageSquare className="w-3.5 h-3.5" /> Contact builder
                  </Link>
                </Button>
              ) : null}
            </div>
          </div>
        </Container>
      </div>

      {/* ══ BODY ══════════════════════════════════════════════════════════ */}
      <Container width="xl" className="py-8">
        <div className="grid lg:grid-cols-[minmax(0,1fr)_20rem] xl:grid-cols-[minmax(0,1fr)_22rem] gap-6 lg:gap-8 items-start">

          {/* ── Main column ───────────────────────────────────────────── */}
          <div className="min-w-0 space-y-6">
            {/* Delivery (buyers/owner) */}
            <DeliveryPanel projectId={id} enabled={!!token} isOwner={isOwner} />

            {/* AI analysis */}
            {analysis ? (
              <Panel
                title="AI analysis"
                icon={<Zap />}
                action={
                  analysis.model_used ? (
                    <span className="text-xs text-muted-foreground truncate max-w-[10rem]">
                      via {analysis.model_used}
                    </span>
                  ) : undefined
                }
              >
                {analysis.status === "running" || analysis.status === "pending" ? (
                  <div className="py-8 text-center">
                    <RefreshCw className="w-6 h-6 text-primary mx-auto mb-3 animate-spin" />
                    <p className="text-sm text-muted-foreground">Analysis in progress…</p>
                  </div>
                ) : analysis.status === "failed" ? (
                  <div className="rounded-xl border border-destructive/30 bg-destructive/8 p-4">
                    <p className="text-sm text-destructive">Analysis failed. Try re-running it.</p>
                  </div>
                ) : (
                  <div className="space-y-6">
                    <ScoreRow analysis={analysis} />

                    {analysis.reasoning && (
                      <div>
                        <h3 className="text-eyebrow mb-2">Reasoning</h3>
                        <p className="text-sm text-muted-foreground leading-relaxed">{analysis.reasoning}</p>
                      </div>
                    )}

                    {analysis.technical_debt_summary && (
                      <div>
                        <h3 className="text-eyebrow mb-2 flex items-center gap-1.5">
                          <AlertTriangle className="w-3 h-3 text-text-warning" /> Technical debt
                        </h3>
                        <p className="text-sm text-muted-foreground leading-relaxed">
                          {analysis.technical_debt_summary}
                        </p>
                      </div>
                    )}

                    {analysis.missing_features.length > 0 && (
                      <div>
                        <h3 className="text-eyebrow mb-2.5">Missing modules</h3>
                        <ul className="grid sm:grid-cols-2 gap-x-5 gap-y-2">
                          {analysis.missing_features.map((f, i) => (
                            <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                              <span className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 flex-shrink-0" />
                              {f}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {analysis.roadmap_steps?.steps && analysis.roadmap_steps.steps.length > 0 && (
                      <div>
                        <h3 className="text-eyebrow mb-3.5 flex items-center gap-1.5">
                          <TrendingUp className="w-3 h-3 text-primary" /> Suggested roadmap
                        </h3>
                        <ol className="space-y-3.5">
                          {(analysis.roadmap_steps.steps as RoadmapStep[]).map((step) => (
                            <li key={step.step} className="flex gap-3">
                              <span className="w-6 h-6 rounded-lg bg-primary/10 text-primary text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5 tabular-nums">
                                {step.step}
                              </span>
                              <div className="min-w-0">
                                <div className="flex items-center gap-2 flex-wrap mb-0.5">
                                  <span className="text-sm font-medium">{step.title}</span>
                                  <span className={cn(
                                    "text-[10px] px-1.5 py-0.5 rounded font-semibold capitalize",
                                    PRIORITY_STYLES[step.priority]
                                  )}>
                                    {step.priority}
                                  </span>
                                </div>
                                <p className="text-xs text-muted-foreground leading-relaxed">
                                  {step.description}
                                </p>
                              </div>
                            </li>
                          ))}
                        </ol>
                      </div>
                    )}

                    {analysis.contributor_recommendations.length > 0 && (
                      <div>
                        <h3 className="text-eyebrow mb-2.5">Skills needed</h3>
                        <div className="flex flex-wrap gap-1.5">
                          {analysis.contributor_recommendations.map((skill) => (
                            <span
                              key={skill}
                              className="text-xs px-2.5 py-1 rounded-full bg-primary/10 text-primary font-medium"
                            >
                              {skill}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Startup report upsell / unlocked view */}
                    {project.startup_report_unlocked ? (
                      <div className="rounded-xl border border-border-warning bg-background-warning/40 p-5">
                        <h3 className="font-semibold text-sm mb-4 flex items-center gap-2">
                          <Star className="w-4 h-4 text-text-warning" /> Startup readiness report
                        </h3>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                          {[
                            { v: analysis.startup_potential, l: "Startup potential" },
                            { v: analysis.impact_potential, l: "Impact potential" },
                            { v: analysis.health_score, l: "Health" },
                            { v: analysis.completion_score, l: "Completion" },
                          ].map(({ v, l }) => (
                            <div key={l} className="text-center">
                              <div className="text-display-md font-display text-text-warning tabular-nums">
                                {v ?? "—"}
                              </div>
                              <div className="text-[11px] text-muted-foreground mt-0.5">{l}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : isOwner ? (
                      // Owner-only: the API restricts startup-report purchases to
                      // the project owner, so offering it to visitors just sent
                      // them to a checkout that returns 403.
                      <div className="rounded-xl border border-dashed p-5 flex items-center justify-between gap-4 flex-wrap">
                        <div className="min-w-0">
                          <h3 className="font-medium text-sm">Startup readiness report</h3>
                          <p className="text-xs text-muted-foreground mt-1">
                            Unlock a full investor-grade analysis of your project.
                          </p>
                        </div>
                        <Button size="sm" variant="outline" asChild>
                          <Link href={`/projects/${id}/checkout`}>Unlock ₹999</Link>
                        </Button>
                      </div>
                    ) : null}
                  </div>
                )}
              </Panel>
            ) : isOwner ? (
              <EmptyState
                icon={<Zap />}
                title="No analysis yet"
                description="Run an AI analysis to get health scores, missing modules, a roadmap and risk areas."
                action={
                  <Button onClick={() => triggerAnalysis({ projectId: id })} loading={analyzing} className="gap-2">
                    <Zap className="w-4 h-4" /> Run AI analysis
                  </Button>
                }
              />
            ) : null}

            {/* Duplicate screening — owner and admins only, and always with the
                specific matches so a withheld listing is contestable. */}
            <DuplicateNotice
              projectId={id}
              duplicateStatus={project.duplicate_status}
              canSee={isOwner || me?.role === "admin"}
            />

            {/* Co-owners and revenue splits, when this is a team project. */}
            <TeamPanel projectId={id} currentUserId={me?.id} />

            {/* Risk + pitch deck + timeline */}
            <RiskPanel projectId={id} />
            <PitchDeckPanel project={project} isOwner={isOwner} />
            <ProjectTimeline projectId={id} canManage={isOwner} progressPercent={project.progress_percent} />

            {/* Owner-only matching */}
            <ContributorMatchesPanel projectId={id} isOwner={isOwner} />

            {/* Adoption */}
            <AdoptionPanel project={project} isOwner={isOwner} isLoggedIn={!!token} />

            {/* Collaborate */}
            {project.is_seeking_contributors && !isOwner && token && (
              <Panel title="Seeking contributors" icon={<Users />} tone="brand">
                <p className="text-sm text-muted-foreground mb-4 leading-relaxed">
                  The owner is looking for collaborators on this project.
                </p>
                <ContributeButton projectId={id} />
              </Panel>
            )}

            {/* Offers */}
            {!isOwner && token && (
              <Panel title="Interested in this project?" icon={<Sparkles />}>
                <p className="text-sm text-muted-foreground mb-4 leading-relaxed">
                  Make an incubation, mentorship, funding or acquisition offer — or message the
                  builder to discuss working together.
                </p>
                <div className="flex flex-wrap gap-2">
                  <MakeOfferButton projectId={id} />
                  <Button variant="outline" asChild className="gap-2">
                    <Link href={`/messages?new=${project.owner_id}&project=${id}`}>
                      <MessageSquare className="w-4 h-4" /> Message builder
                    </Link>
                  </Button>
                </div>
              </Panel>
            )}

            {/* Reviews */}
            <ReviewSection projectId={id} ownerId={project.owner_id} />

            {/* Offers on this listing — seller's view */}
            <OffersOnListing projectId={id} isOwner={isOwner} />

            {/* Related projects. Public: this is pre-purchase evaluation. */}
            <SimilarProjects projectId={id} />

            {/* Report */}
            {!isOwner && token && (
              <div className="flex justify-end">
                <ReportProjectButton projectId={id} />
              </div>
            )}
          </div>

          {/* ── Sidebar ───────────────────────────────────────────────── */}
          <aside className="space-y-5 lg:sticky lg:top-24">
            <BuyBox project={project} isOwner={isOwner} />

            {/* Price negotiation. Sits directly under the buy box because it's
                the alternative to paying the sticker price, not a separate topic. */}
            {project.is_for_sale && project.price_paise && token && (
              <MakeOfferPanel
                projectId={id}
                listPricePaise={project.price_paise}
                isOwner={isOwner}
              />
            )}

            {/* Verified build score — the trust anchor */}
            <VerifiedBuildScorePanel
              projectId={id}
              isOwner={isOwner}
              publicReportHref={`/verify/${id}`}
            />

            {/* Turns a low score into a specific next step. Owner only. */}
            <MentorPanel projectId={id} isOwner={isOwner} />

            {/* Append-only score history — a trend nobody can edit. */}
            <ScoreHistoryPanel projectId={id} />

            {/* Plain-English buyer brief. Hidden entirely until generated. */}
            <BuyerBriefPanel projectId={id} isOwner={isOwner} />

            {/* Owners get the README embed code right where the score lives. */}
            {isOwner && <BadgeEmbed projectId={id} />}

            {/* Repo stats */}
            <div className="rounded-xl border bg-card p-5">
              <h2 className="text-eyebrow mb-4">Repository</h2>
              <dl className="grid grid-cols-2 gap-y-4 gap-x-3">
                {[
                  { icon: <Star className="w-3.5 h-3.5" />, value: project.stars.toLocaleString(), label: "Stars" },
                  { icon: <GitFork className="w-3.5 h-3.5" />, value: project.forks.toLocaleString(), label: "Forks" },
                  { icon: <AlertTriangle className="w-3.5 h-3.5" />, value: project.open_issues.toLocaleString(), label: "Issues" },
                  { icon: <Code2 className="w-3.5 h-3.5" />, value: project.primary_language ?? "—", label: "Language" },
                ].map(({ icon, value, label }) => (
                  <div key={label}>
                    <dt className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                      {icon} {label}
                    </dt>
                    <dd className="font-semibold text-sm mt-1 truncate tabular-nums">{value}</dd>
                  </div>
                ))}
              </dl>

              {project.languages && project.languages.length > 0 && (
                <div className="mt-5 pt-5 border-t">
                  <LanguageBar languages={project.languages} />
                </div>
              )}
            </div>

            {/* Required skills */}
            {projectSkills && projectSkills.length > 0 && (
              <div className="rounded-xl border bg-card p-5">
                <h2 className="text-eyebrow mb-3">Skills required</h2>
                <ProjectSkillTags skills={projectSkills} />
              </div>
            )}

            {/* Hackathon authenticity */}
            <HackathonAuthenticity projectId={id} isOwner={isOwner} />
          </aside>
        </div>
      </Container>
    </>
  );
}
