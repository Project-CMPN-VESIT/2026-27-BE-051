"use client";
import { useState } from "react";
import Link from "next/link";
import {
  Building2, Check, Clock, MessageSquarePlus, UserRound, X,
} from "lucide-react";
import {
  Badge, Card, CardContent, EmptyState, Input, Label, Textarea,
} from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/ui/layout";
import { Alert, FormError, FormSuccess } from "@/components/ui/alert";
import { ListSkeleton } from "@/components/ui/skeleton";
import {
  useMentors, useMyMentorSessions, useRequestMentorSession,
} from "@/lib/hooks/mentors";
import { useMyProjects } from "@/lib/hooks";
import { useAuthGate } from "@/components/auth/require-auth";
import { getErrorMessage } from "@/lib/api/client";
import type { Mentor } from "@/types";
import { cn } from "@/lib/utils";

/**
 * Public mentor directory.
 *
 * Browsable without an account — requesting a session is the gated action, which
 * matches how the rest of the product treats discovery.
 */
export default function MentorsPage() {
  const { data: mentors, isLoading, isError, error } = useMentors();
  const { data: sessions } = useMyMentorSessions();
  const { isAuthenticated } = useAuthGate();
  const [requesting, setRequesting] = useState<Mentor | null>(null);

  const pendingWith = new Set(
    (sessions ?? []).filter((s) => s.status === "pending").map((s) => s.mentor_id)
  );

  return (
    <Container className="py-10 sm:py-14 max-w-4xl">
      <div className="max-w-2xl">
        <p className="text-eyebrow mb-3">Mentorship</p>
        <h1 className="text-display-lg">Talk to someone who&apos;s done it</h1>
        <p className="mt-4 text-muted-foreground leading-relaxed">
          A low build score usually isn&apos;t a dead end — it&apos;s a specific,
          fixable gap. These mentors volunteer time to review student projects.
          Most sessions are free.
        </p>
      </div>

      {isAuthenticated && sessions && sessions.length > 0 && (
        <Card className="mt-8">
          <CardContent className="pt-5">
            <h2 className="font-display text-lg font-semibold mb-3">Your requests</h2>
            <ul className="divide-y list-none">
              {sessions.slice(0, 5).map((s) => (
                <li key={s.id} className="py-3 flex items-start gap-3 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{s.topic}</p>
                    {s.mentor_reply && (
                      <p className="text-xs text-muted-foreground mt-1.5 border-l-2 pl-2.5 leading-relaxed">
                        {s.mentor_reply}
                      </p>
                    )}
                  </div>
                  <Badge
                    variant={
                      s.status === "accepted" || s.status === "completed" ? "success"
                        : s.status === "declined" || s.status === "cancelled" ? "ghost"
                        : "warning"
                    }
                    size="sm"
                    className="flex-shrink-0"
                  >
                    {s.status === "pending" && <Clock className="w-3 h-3" />}
                    {(s.status === "accepted" || s.status === "completed") && (
                      <Check className="w-3 h-3" />
                    )}
                    {s.status}
                  </Badge>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <div className="mt-8 space-y-4">
        {isLoading && <ListSkeleton rows={4} />}

        {isError && (
          <Alert
            variant="danger"
            title="Couldn't load mentors"
            description={getErrorMessage(error)}
          />
        )}

        {mentors && mentors.length === 0 && (
          <EmptyState
            icon={<UserRound />}
            title="No mentors listed yet"
            description="Mentors are being onboarded. In the meantime, the AI mentor on your project page can give you a specific improvement plan."
            action={
              <Button variant="outline" asChild>
                <Link href="/dashboard">Go to your projects</Link>
              </Button>
            }
          />
        )}

        {mentors?.map((m) => {
          const hasPending = pendingWith.has(m.user_id);
          return (
            <Card key={m.user_id}>
              <CardContent className="pt-5">
                <div className="flex items-start gap-4 flex-wrap sm:flex-nowrap">
                  <span className="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center text-lg font-semibold flex-shrink-0">
                    {m.display_name.charAt(0).toUpperCase()}
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="font-semibold">{m.display_name}</h2>
                      {m.sessions_completed > 0 && (
                        <Badge variant="ghost" size="sm">
                          {m.sessions_completed} sessions
                        </Badge>
                      )}
                      {m.rate_paise_per_hour ? (
                        <Badge variant="info" size="sm">
                          ₹{(m.rate_paise_per_hour / 100).toLocaleString("en-IN")}/hr
                        </Badge>
                      ) : (
                        <Badge variant="success" size="sm">Free</Badge>
                      )}
                    </div>

                    <p className="text-sm font-medium text-foreground/85 mt-1">
                      {m.headline}
                    </p>

                    <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1.5 flex-wrap">
                      {m.company && (
                        <span className="inline-flex items-center gap-1">
                          <Building2 className="w-3 h-3" /> {m.company}
                        </span>
                      )}
                      {m.years_experience != null && (
                        <span>· {m.years_experience} years experience</span>
                      )}
                    </p>

                    <p className="text-sm text-muted-foreground mt-2.5 leading-relaxed">
                      {m.bio}
                    </p>

                    {m.focus_areas.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-3">
                        {m.focus_areas.map((f) => (
                          <Badge key={f} variant="outline" size="sm">{f}</Badge>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="flex-shrink-0 w-full sm:w-auto">
                    <Button
                      size="sm"
                      variant={hasPending ? "secondary" : "cta"}
                      disabled={hasPending}
                      onClick={() => setRequesting(m)}
                      block
                    >
                      {hasPending ? (
                        <>
                          <Clock className="w-3.5 h-3.5" /> Request sent
                        </>
                      ) : (
                        <>
                          <MessageSquarePlus className="w-3.5 h-3.5" /> Request a session
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {requesting && (
        <RequestDialog mentor={requesting} onClose={() => setRequesting(null)} />
      )}
    </Container>
  );
}

function RequestDialog({ mentor, onClose }: { mentor: Mentor; onClose: () => void }) {
  const { isAuthenticated, requireAuth } = useAuthGate();
  const { data: projects } = useMyProjects();
  const request = useRequestMentorSession();
  const [topic, setTopic] = useState("");
  const [message, setMessage] = useState("");
  const [projectId, setProjectId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // A signed-out visitor gets sent to login and returned to this page.
  if (!isAuthenticated) {
    requireAuth("/mentors");
    return null;
  }

  const submit = () => {
    setError(null);
    if (topic.trim().length < 3) {
      setError("Give your request a short topic.");
      return;
    }
    if (message.trim().length < 10) {
      setError("Add a bit of detail so the mentor knows what you need.");
      return;
    }
    request.mutate(
      {
        mentor_id: mentor.user_id,
        topic,
        message,
        project_id: projectId || null,
      },
      {
        onSuccess: () => setDone(true),
        onError: (e) => setError(getErrorMessage(e)),
      }
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`Request a session with ${mentor.display_name}`}
    >
      <div
        className="absolute inset-0 bg-background/70 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      <div
        className={cn(
          "relative w-full sm:max-w-lg bg-card border shadow-xl",
          "rounded-t-2xl sm:rounded-2xl max-h-[92dvh] overflow-y-auto animate-scale-in"
        )}
      >
        <div className="flex items-start justify-between gap-3 p-5 border-b">
          <div className="min-w-0">
            <h2 className="font-display text-lg font-semibold">
              Request a session
            </h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              with {mentor.display_name}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors flex-shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {done ? (
          <div className="p-5 space-y-4">
            <FormSuccess message={`Request sent to ${mentor.display_name}.`} />
            <p className="text-sm text-muted-foreground leading-relaxed">
              They&apos;ll see it in their mentor inbox. You&apos;ll get a
              notification when they reply.
            </p>
            <Button block onClick={onClose}>Done</Button>
          </div>
        ) : (
          <div className="p-5 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="mentor-topic">What do you need help with?</Label>
              <Input
                id="mentor-topic"
                placeholder="e.g. Improving my documentation score"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                maxLength={200}
              />
            </div>

            {projects && projects.length > 0 && (
              <div className="space-y-1.5">
                <Label htmlFor="mentor-project">Which project? (optional)</Label>
                <select
                  id="mentor-project"
                  value={projectId}
                  onChange={(e) => setProjectId(e.target.value)}
                  className="flex h-10 w-full appearance-none rounded-xl border border-input bg-card px-3 text-sm shadow-xs focus-visible:outline-none focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-primary/12"
                >
                  <option value="">Not about a specific project</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>{p.title}</option>
                  ))}
                </select>
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="mentor-message" hint="The more specific, the more useful the reply">
                Your message
              </Label>
              <Textarea
                id="mentor-message"
                rows={5}
                placeholder="What have you tried, and where are you stuck?"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                maxLength={4000}
              />
            </div>

            <FormError message={error} />

            <div className="flex gap-2">
              <Button block onClick={submit} loading={request.isPending}>
                Send request
              </Button>
              <Button variant="ghost" onClick={onClose}>Cancel</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
