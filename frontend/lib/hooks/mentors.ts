"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { mentorsApi } from "@/lib/api";
import { useAuthStore } from "@/stores/auth";

export const mentorKeys = {
  directory: (accepting: boolean) => ["mentors", "directory", accepting] as const,
  history: (projectId: string) => ["mentors", "history", projectId] as const,
  plan: (projectId: string) => ["mentors", "plan", projectId] as const,
  mySessions: ["mentors", "sessions", "mine"] as const,
  incoming: ["mentors", "sessions", "incoming"] as const,
};

/** Public directory — no auth needed. */
export function useMentors(acceptingOnly = true) {
  return useQuery({
    queryKey: mentorKeys.directory(acceptingOnly),
    queryFn: () => mentorsApi.list(acceptingOnly),
  });
}

export function useMentorHistory(projectId: string, enabled = true) {
  const token = useAuthStore((s) => s.accessToken);
  return useQuery({
    queryKey: mentorKeys.history(projectId),
    queryFn: () => mentorsApi.history(projectId),
    enabled: enabled && !!projectId && !!token,
    retry: false,
  });
}

export function useAskMentor(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (question: string) => mentorsApi.ask(projectId, question),
    // Refetch rather than appending: the question turn is persisted server-side
    // before the model is called, so the server holds the authoritative thread.
    onSettled: () => qc.invalidateQueries({ queryKey: mentorKeys.history(projectId) }),
  });
}

export function useClearMentorHistory(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => mentorsApi.clearHistory(projectId),
    onSuccess: () => qc.invalidateQueries({ queryKey: mentorKeys.history(projectId) }),
  });
}

export function useImprovementPlan(projectId: string, enabled = true) {
  const token = useAuthStore((s) => s.accessToken);
  return useQuery({
    queryKey: mentorKeys.plan(projectId),
    queryFn: () => mentorsApi.improvementPlan(projectId),
    enabled: enabled && !!projectId && !!token,
    retry: false,
  });
}

export function useMyMentorSessions() {
  const token = useAuthStore((s) => s.accessToken);
  return useQuery({
    queryKey: mentorKeys.mySessions,
    queryFn: mentorsApi.mySessions,
    enabled: !!token,
    retry: false,
  });
}

export function useIncomingMentorSessions() {
  const token = useAuthStore((s) => s.accessToken);
  return useQuery({
    queryKey: mentorKeys.incoming,
    queryFn: mentorsApi.incomingSessions,
    enabled: !!token,
    retry: false,
  });
}

export function useRequestMentorSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      mentor_id: string;
      topic: string;
      message: string;
      project_id?: string | null;
    }) => mentorsApi.requestSession(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: mentorKeys.mySessions }),
  });
}

export function useRespondToSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; status: string; reply?: string }) =>
      mentorsApi.respond(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: mentorKeys.incoming });
      qc.invalidateQueries({ queryKey: mentorKeys.mySessions });
    },
  });
}
