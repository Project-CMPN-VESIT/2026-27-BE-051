"use client";
import Link from "next/link";
import {
  ArrowRight, CheckCircle2, RefreshCw, Sparkles, Tag, TrendingUp, Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/ui/layout";
import { ProjectGrid, EmptyProjects } from "@/components/projects/project-card";
import { ProjectGridSkeleton } from "@/components/ui/skeleton";
import {
  useForSale, useHighPotential, useRecentlyRevived, useSeekingContributors,
  useTrending, useVerifiedProjects,
} from "@/lib/hooks";

/**
 * The six discovery feeds on the landing page.
 *
 * Extracted so the surrounding marketing page can be a server component: the
 * pitch, the live stats and the transparency demo are now in the initial HTML,
 * while these rails hydrate on the client. Anonymous visitors can browse them
 * freely — taking an action is what prompts sign-in.
 */
function FeedSection({
  icon: Icon, title, subtitle, href, children,
}: {
  icon: React.ElementType;
  title: string;
  subtitle: string;
  href: string;
  children: React.ReactNode;
}) {
  return (
    <section className="py-10 sm:py-14">
      <div className="flex items-end justify-between gap-4 mb-6 sm:mb-7">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5 mb-1.5">
            <span className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
              <Icon className="w-4 h-4" />
            </span>
            <h2 className="text-display-sm">{title}</h2>
          </div>
          <p className="text-sm text-muted-foreground">{subtitle}</p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          asChild
          className="flex-shrink-0 gap-1 text-muted-foreground hover:text-foreground"
        >
          <Link href={href}>
            <span className="hidden sm:inline">View all</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </Button>
      </div>
      {children}
    </section>
  );
}

export function DiscoveryRails() {
  const forSale = useForSale();
  const verified = useVerifiedProjects();
  const trending = useTrending();
  const highPotential = useHighPotential();
  const seeking = useSeekingContributors();
  const revived = useRecentlyRevived();

  const rails = [
    {
      icon: Tag, title: "For sale",
      subtitle: "Verified student projects you can buy right now",
      href: "/projects?for_sale=true", query: forSale,
      empty: "No projects listed for sale yet — list yours to be the first.",
    },
    {
      icon: CheckCircle2, title: "Verified builds",
      subtitle: "Ownership and authenticity confirmed — highest trust projects",
      href: "/projects?verified=true", query: verified,
      empty: "Complete verification to appear in this section.",
    },
    {
      icon: TrendingUp, title: "Trending",
      subtitle: "Most active this week by stars and contributor interest",
      href: "/projects?sort_by=stars", query: trending,
      empty: "No trending projects yet — be the first to import one.",
    },
    {
      icon: Sparkles, title: "High potential",
      subtitle: "Highest AI-scored startup potential",
      href: "/projects?sort_by=startup_potential", query: highPotential,
      empty: "Run an AI analysis on your project to appear here.",
    },
    {
      icon: Users, title: "Seeking contributors",
      subtitle: "Projects actively looking for collaborators",
      href: "/projects?seeking_contributors=true", query: seeking,
      empty: "No projects seeking contributors at the moment.",
    },
    {
      icon: RefreshCw, title: "Recently revived",
      subtitle: "Dormant projects that found a new owner",
      href: "/projects?status=revived", query: revived,
      empty: "No revived projects yet.",
    },
  ];

  return (
    <Container className="divide-y">
      {rails.map((rail) => (
        <FeedSection
          key={rail.title}
          icon={rail.icon}
          title={rail.title}
          subtitle={rail.subtitle}
          href={rail.href}
        >
          {rail.query.isLoading ? (
            <ProjectGridSkeleton count={3} />
          ) : rail.query.data?.length ? (
            <ProjectGrid projects={rail.query.data.slice(0, 6)} />
          ) : (
            <EmptyProjects message={rail.empty} />
          )}
        </FeedSection>
      ))}
    </Container>
  );
}
