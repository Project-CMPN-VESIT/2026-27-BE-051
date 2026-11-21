"use client";
import { useState } from "react";
import Link from "next/link";
import {
  Building2, GraduationCap, IndianRupee, Info, Lock, ShieldCheck, Trophy, Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, EmptyState, Input, Label } from "@/components/ui/primitives";
import { Alert, FormError } from "@/components/ui/alert";
import { Container, PageHeader } from "@/components/ui/layout";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useCollegeDashboard, useMyPartnerProfile, useRegisterPartner,
} from "@/lib/hooks/advanced";
import { getErrorMessage } from "@/lib/api/client";
import { cn } from "@/lib/utils";

/**
 * Faculty / placement-cell dashboard.
 *
 * Read-only and aggregate by design. The privacy line is drawn deliberately: an
 * institution sees counts, totals and its leaderboard position, plus the projects
 * its students already made public. It does not get a roster with private data
 * attached — students didn't sign up to hand their college a surveillance panel.
 */
export default function CollegeDashboardPage() {
  const { data: partner, isLoading: partnerLoading } = useMyPartnerProfile();
  const { data: dash, isLoading, isError, error } = useCollegeDashboard(
    !!partner?.is_verified,
  );

  if (partnerLoading) {
    return (
      <Container className="py-10 max-w-4xl space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full rounded-xl" />
      </Container>
    );
  }

  if (!partner) return <RegisterPartner />;

  if (!partner.is_verified) {
    return (
      <Container className="py-10 max-w-2xl">
        <PageHeader
          title={partner.college_name}
          description={partner.department ?? "Institution partner account"}
        />
        <Alert
          variant="warning"
          title="Waiting on verification"
          description="Anyone can claim to be faculty at any institution, so the dashboard stays locked until an admin confirms your affiliation. We've notified them — this usually takes a day."
        />
        <div className="rounded-xl border bg-card p-5 mt-5">
          <h2 className="font-semibold text-sm mb-2">What you&apos;ll see once approved</h2>
          <ul className="text-sm text-muted-foreground space-y-1.5 leading-relaxed">
            <li>· How many of your students have verified projects on CodeBazaar</li>
            <li>· Total earned by your students through the marketplace</li>
            <li>· Your institution&apos;s position on the campus leaderboard</li>
            <li>· The distribution of Verified Build Scores across your cohort</li>
          </ul>
          <p className="text-xs text-muted-foreground mt-4 pt-3 border-t leading-relaxed">
            You will <span className="font-medium text-foreground">not</span> see
            individual students&apos; private data, messages, offers or earnings
            breakdowns. Only aggregates, and only projects those students already
            published.
          </p>
        </div>
      </Container>
    );
  }

  if (isLoading) {
    return (
      <Container className="py-10 max-w-4xl space-y-4">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-64 w-full rounded-xl" />
      </Container>
    );
  }

  if (isError || !dash) {
    return (
      <Container className="py-20 max-w-lg">
        <EmptyState
          icon={<Lock className="w-6 h-6" />}
          title="Dashboard unavailable"
          description={getErrorMessage(error) || "Could not load your institution's data."}
        />
      </Container>
    );
  }

  return (
    <Container className="py-8 sm:py-10 max-w-4xl">
      <div className="flex items-start justify-between gap-4 flex-wrap mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <Building2 className="w-4 h-4 text-primary" />
            <Badge variant="success" size="sm">
              <ShieldCheck className="w-3 h-3" /> Verified partner
            </Badge>
          </div>
          <h1 className="text-display-sm">{dash.college_name}</h1>
          {dash.department && (
            <p className="text-sm text-muted-foreground mt-1">{dash.department}</p>
          )}
        </div>
        {dash.leaderboard_rank != null && (
          <Link
            href="/campus"
            className={cn(
              "rounded-xl border bg-card px-4 py-3 text-center flex-shrink-0",
              "hover:border-border-strong transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
            )}
          >
            <Trophy className="w-4 h-4 text-[hsl(var(--cta))] mx-auto mb-1" />
            <p className="text-2xl font-semibold tabular-nums leading-none">
              #{dash.leaderboard_rank}
            </p>
            <p className="text-[11px] text-muted-foreground mt-1">
              of {dash.leaderboard_total} campuses
            </p>
          </Link>
        )}
      </div>

      {dash.empty_reason ? (
        <Alert variant="info" title="Nothing to show yet" description={dash.empty_reason} />
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            <Stat
              label="Students"
              value={dash.students_total.toString()}
              icon={<Users className="w-4 h-4" />}
            />
            <Stat
              label="Verified projects"
              value={`${dash.verified_projects}`}
              sub={`of ${dash.projects_total}`}
              icon={<ShieldCheck className="w-4 h-4" />}
            />
            <Stat
              label="Earned"
              value={`₹${(dash.total_earned_paise / 100).toLocaleString("en-IN")}`}
              icon={<IndianRupee className="w-4 h-4" />}
            />
            <Stat
              label="Average score"
              value={dash.avg_score != null ? String(dash.avg_score) : "—"}
              sub={dash.avg_score != null ? "/100" : undefined}
              icon={<GraduationCap className="w-4 h-4" />}
            />
          </div>

          {dash.cohort_too_small_for_averages && (
            <Alert
              variant="info"
              title="Small cohort"
              description="With fewer than five participating students, per-student figures would effectively identify individuals, so only totals are shown."
              className="mb-6"
            />
          )}

          {/* Score distribution */}
          <section className="rounded-xl border bg-card p-5 mb-6">
            <h2 className="font-semibold text-sm mb-3">Score distribution</h2>
            <div className="space-y-2.5">
              {dash.score_distribution.map((band) => {
                const total = dash.score_distribution.reduce((s, b) => s + b.count, 0) || 1;
                const pct = Math.round((band.count * 100) / total);
                return (
                  <div key={band.band} className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground w-16 flex-shrink-0 tabular-nums">
                      {band.band}
                    </span>
                    <div className="flex-1 h-2 rounded-full bg-border overflow-hidden">
                      <div
                        className={cn(
                          "h-full rounded-full",
                          band.band === "80-100" && "bg-[hsl(var(--score-high))]",
                          band.band === "70-79" && "bg-[hsl(var(--score-high))]/70",
                          band.band === "50-69" && "bg-[hsl(var(--score-mid))]",
                          band.band === "0-49" && "bg-[hsl(var(--score-low))]",
                        )}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="text-xs font-medium tabular-nums w-8 text-right flex-shrink-0">
                      {band.count}
                    </span>
                  </div>
                );
              })}
            </div>
            <p className="text-[11px] text-muted-foreground mt-3 pt-3 border-t">
              70 and above is the verified threshold. Every score here was computed
              by the same engine used across the platform — nothing is adjusted per
              institution.
            </p>
          </section>

          {/* Top projects */}
          {dash.top_projects.length > 0 && (
            <section className="rounded-xl border bg-card overflow-hidden mb-6">
              <h2 className="px-4 py-3 border-b font-semibold text-sm">
                Strongest verified projects
              </h2>
              <ul className="divide-y">
                {dash.top_projects.map((project) => (
                  <li
                    key={project.project_id}
                    className="px-4 py-3 flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <Link
                        href={project.link}
                        className="text-sm font-medium hover:text-primary transition-colors"
                      >
                        {project.title}
                      </Link>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {project.builder_name}
                      </p>
                    </div>
                    <span className="text-sm font-semibold tabular-nums flex-shrink-0">
                      {project.score ?? "—"}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      <div className="rounded-xl border bg-surface/50 p-4 flex items-start gap-2.5">
        <Info className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-xs font-medium">How students are counted</p>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
            A student appears in these figures when they list{" "}
            <span className="font-medium text-foreground">{dash.college_name}</span>{" "}
            on their own profile. They control that — leaving it blank keeps them out
            of the aggregate entirely. This dashboard is read-only and contains no
            private student data.
          </p>
        </div>
      </div>
    </Container>
  );
}

function Stat({
  label,
  value,
  sub,
  icon,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
        {icon}
        {label}
      </div>
      <p className="text-2xl font-semibold tabular-nums mt-1">
        {value}
        {sub && (
          <span className="text-xs font-normal text-muted-foreground ml-1">{sub}</span>
        )}
      </p>
    </div>
  );
}

/** Application form for institutions without a partner profile yet. */
function RegisterPartner() {
  const register = useRegisterPartner();
  const [form, setForm] = useState({
    college_name: "",
    department: "",
    contact_name: "",
    contact_title: "",
    website_url: "",
  });

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  return (
    <Container className="py-10 max-w-2xl">
      <PageHeader
        title="Institution partner access"
        description="Faculty and placement cells can request a read-only dashboard showing their students' verified output on CodeBazaar."
      />

      {register.isSuccess ? (
        <Alert
          variant="success"
          title="Request submitted"
          description="An admin will confirm your affiliation. You'll get a notification when the dashboard unlocks."
        />
      ) : (
        <form
          className="rounded-xl border bg-card p-5 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            register.mutate({
              college_name: form.college_name,
              department: form.department || undefined,
              contact_name: form.contact_name || undefined,
              contact_title: form.contact_title || undefined,
              website_url: form.website_url || undefined,
            });
          }}
        >
          <div>
            <Label htmlFor="college_name">Institution name *</Label>
            <Input
              id="college_name"
              required
              placeholder="e.g. NIT Trichy"
              value={form.college_name}
              onChange={set("college_name")}
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              Must match how your students write it on their profiles, or they
              won&apos;t be counted.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="department">Department or cell</Label>
              <Input
                id="department"
                placeholder="Placement Cell"
                value={form.department}
                onChange={set("department")}
              />
            </div>
            <div>
              <Label htmlFor="website_url">Institution website</Label>
              <Input
                id="website_url"
                type="url"
                placeholder="https://…"
                value={form.website_url}
                onChange={set("website_url")}
              />
            </div>
            <div>
              <Label htmlFor="contact_name">Your name</Label>
              <Input
                id="contact_name"
                value={form.contact_name}
                onChange={set("contact_name")}
              />
            </div>
            <div>
              <Label htmlFor="contact_title">Your title</Label>
              <Input
                id="contact_title"
                placeholder="Head, Training & Placement"
                value={form.contact_title}
                onChange={set("contact_title")}
              />
            </div>
          </div>

          <FormError message={register.isError ? getErrorMessage(register.error) : null} />

          <Button type="submit" loading={register.isPending} className="w-full">
            Request access
          </Button>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Access is aggregate and read-only. You will not be able to see
            individual students&apos; private data, act on their behalf, or use any
            marketplace function.
          </p>
        </form>
      )}
    </Container>
  );
}
