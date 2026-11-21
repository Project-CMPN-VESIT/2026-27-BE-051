"use client";
import { use } from "react";
import Link from "next/link";
import { MapPin, GraduationCap, Globe, ExternalLink, MessageSquare, Lock, Mail, Sparkles, UserX } from "lucide-react";
import { GithubIcon, LinkedinIcon } from "@/components/shared/icons";
import { useQuery } from "@tanstack/react-query";
import { usersApi, projectsApi, skillsApi } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge, EmptyState } from "@/components/ui/primitives";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuthStore } from "@/stores/auth";
import { useUserContact } from "@/lib/hooks";
import { ProjectGrid } from "@/components/projects/project-card";
import { ReputationPanel } from "@/components/reputation/reputation-panel";
import { PublicStreak } from "@/components/growth/public-streak";
import { DeliveryReliability } from "@/components/delivery/delivery-reliability";
import { cn } from "@/lib/utils";

function ContactCard({ userId }: { userId: string }) {
  const { data, isLoading } = useUserContact(userId, true);

  if (isLoading) {
    return (
      <div className="rounded-xl border bg-card p-6 space-y-3">
        <Skeleton className="h-4 w-24" />
        <div className="flex flex-wrap gap-2">
          <Skeleton className="h-8 w-40 rounded-lg" />
          <Skeleton className="h-8 w-28 rounded-lg" />
        </div>
      </div>
    );
  }
  if (!data) return null;

  if (!data.unlocked) {
    return (
      <div className="rounded-xl border border-primary/30 bg-primary/5 p-6 flex items-start gap-4">
        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
          <Lock className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1">
          <h2 className="font-semibold text-sm">Contact details are Pro-only</h2>
          <p className="text-sm text-muted-foreground mt-0.5 mb-3">
            Unlock this builder&apos;s email and links with a Pro membership to hire or invest directly.
          </p>
          <Button size="sm" className="gap-1.5" asChild>
            <Link href="/pricing"><Sparkles className="w-3.5 h-3.5" /> Upgrade to Pro</Link>
          </Button>
        </div>
      </div>
    );
  }

  const items = [
    data.email && { icon: <Mail className="w-3.5 h-3.5" />, label: data.email, href: `mailto:${data.email}` },
    data.github_username && { icon: <GithubIcon className="w-3.5 h-3.5" />, label: data.github_username, href: `https://github.com/${data.github_username}` },
    data.linkedin_url && { icon: <LinkedinIcon className="w-3.5 h-3.5" />, label: "LinkedIn", href: data.linkedin_url },
    data.website_url && { icon: <Globe className="w-3.5 h-3.5" />, label: "Website", href: data.website_url },
  ].filter(Boolean) as { icon: React.ReactNode; label: string; href: string }[];

  return (
    <div className="rounded-xl border bg-card p-6">
      <h2 className="font-semibold text-sm mb-3 flex items-center gap-2">
        <Mail className="w-4 h-4 text-primary" /> Contact
      </h2>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">This builder hasn&apos;t added contact links yet.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {items.map((it) => (
            <a
              key={it.label}
              href={it.href}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-sm hover:bg-accent transition-colors"
            >
              {it.icon} {it.label}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

const ROLE_LABELS: Record<string, string> = {
  builder: "Builder",
  contributor: "Contributor",
  founder: "Founder",
  mentor: "Mentor",
  incubator: "Incubator",
  admin: "Admin",
};

export default function UserProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const token = useAuthStore((s) => s.accessToken);

  const { data: user, isLoading } = useQuery({
    queryKey: ["user-profile", id],
    queryFn: () => usersApi.getPublicProfile(id),
  });

  // Both of these went through the shared client rather than a bare fetch, so
  // they inherit auth headers, the 401-refresh retry, timeouts and error
  // normalisation instead of silently resolving to an error body as JSON.
  const { data: userSkills } = useQuery({
    queryKey: ["user-skills-public", id],
    queryFn: () => skillsApi.userSkills(id),
    enabled: !!id,
  });

  const { data: projects } = useQuery({
    queryKey: ["projects", { owner_id: id, per_page: 6 }],
    queryFn: () => projectsApi.list({ owner_id: id, per_page: 6 }),
    enabled: !!id,
  });

  // Get viewer's ID to check if viewing own profile
  let viewerId = "";
  if (token) {
    try { viewerId = JSON.parse(atob(token.split(".")[1])).sub; } catch {}
  }
  const isOwnProfile = viewerId === id;

  if (isLoading) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-6">
        <div className="flex items-center gap-4"><Skeleton className="w-20 h-20 rounded-full" /><div className="space-y-2"><Skeleton className="h-6 w-40" /><Skeleton className="h-4 w-24" /></div></div>
        <Skeleton className="h-48 w-full rounded-lg" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="max-w-lg mx-auto px-4 sm:px-6 py-20">
        <EmptyState
          icon={<UserX />}
          title="This builder profile doesn't exist"
          description="The link may be out of date, or the account may have been removed. You can browse verified builders instead."
          action={
            <>
              <Button asChild>
                <Link href="/builders">Browse builders</Link>
              </Button>
              <Button variant="outline" asChild>
                <Link href="/projects">Explore projects</Link>
              </Button>
            </>
          }
        />
      </div>
    );
  }

  const { profile } = user;
  const initials = profile?.display_name?.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase() ?? "U";

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
      {/* Hero */}
      <div className="rounded-xl border bg-card p-6">
        <div className="flex items-start gap-5 flex-wrap">
          {/* Avatar */}
          <div className="w-20 h-20 rounded-full bg-primary/10 text-primary text-2xl font-bold flex items-center justify-center flex-shrink-0 overflow-hidden">
            {profile?.avatar_url
              ? <img src={profile.avatar_url} alt={initials} className="w-full h-full object-cover" />
              : initials}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <h1 className="text-display-md">{profile?.display_name ?? "Unknown Builder"}</h1>
              <Badge variant="outline" className="text-[10px] capitalize">{ROLE_LABELS[user.role] ?? user.role}</Badge>
            </div>

            {profile?.bio && <p className="text-sm text-muted-foreground mb-3 leading-relaxed">{profile.bio}</p>}

            <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
              {profile?.location && (
                <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{profile.location}</span>
              )}
              {profile?.college && (
                <span className="flex items-center gap-1"><GraduationCap className="w-3 h-3" />{profile.college}{profile.graduation_year ? ` · ${profile.graduation_year}` : ""}</span>
              )}
              {profile?.github_username && (
                <a href={`https://github.com/${profile.github_username}`} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1 hover:text-foreground transition-colors">
                  <ExternalLink className="w-3 h-3" /> {profile.github_username}
                </a>
              )}
              {profile?.linkedin_url && (
                <a href={profile.linkedin_url} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1 hover:text-foreground transition-colors">
                  <LinkedinIcon className="w-3 h-3" /> LinkedIn
                </a>
              )}
              {profile?.website_url && (
                <a href={profile.website_url} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1 hover:text-foreground transition-colors">
                  <Globe className="w-3 h-3" /> Website
                </a>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2 flex-shrink-0">
            {isOwnProfile ? (
              <Button size="sm" variant="outline" asChild><Link href="/settings">Edit profile</Link></Button>
            ) : token ? (
              <Button size="sm" className="gap-1.5" asChild>
                <Link href={`/messages?new=${id}`}><MessageSquare className="w-3.5 h-3.5" /> Message</Link>
              </Button>
            ) : null}
          </div>
        </div>
      </div>

      {/* Contact (Pro-gated) — only for logged-in viewers on other profiles */}
      {token && !isOwnProfile && <ContactCard userId={id} />}

      {/* Reputation */}
      <ReputationPanel userId={id} />

      {/* Commit streak — public, and self-hiding when untracked. */}
      <PublicStreak userId={id} />

      {/* Delivery reliability */}
      <DeliveryReliability builderId={id} />

      {/* Skills */}
      {userSkills && userSkills.length > 0 && (
        <div className="rounded-xl border bg-card p-6">
          <h2 className="font-semibold text-sm mb-3">Skills</h2>
          <div className="flex flex-wrap gap-2">
            {userSkills.map((us) => (
              <span key={us.id} className={cn(
                "inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium",
                us.proficiency === "expert" ? "bg-background-success text-text-success"
                : us.proficiency === "intermediate" ? "bg-background-warning text-text-warning"
                : "bg-primary/12 text-primary"
              )}>
                {us.skill.name}
                {us.proficiency && <span className="opacity-60">· {us.proficiency[0]}</span>}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Projects */}
      <div>
        <h2 className="font-semibold mb-4">Projects</h2>
        {projects && projects.items.length > 0 ? (
          <ProjectGrid projects={projects.items} />
        ) : (
          <EmptyState
            title="No public projects yet"
            description={
              isOwnProfile
                ? "Import a repository to get it verified and shown here."
                : "This builder hasn't published a project on CodeBazaar yet."
            }
            action={
              isOwnProfile ? (
                <Button variant="cta" asChild>
                  <Link href="/import">Import your first repo</Link>
                </Button>
              ) : undefined
            }
          />
        )}
      </div>
    </div>
  );
}
