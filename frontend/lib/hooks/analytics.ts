"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { analyticsApi, buyerBriefApi, pipelineApi } from "@/lib/api";
import { useAuthStore } from "@/stores/auth";
import type { SavedSearchFilters } from "@/types";

export const analyticsKeys = {
  me: (days: number) => ["analytics", "me", days] as const,
  projectScores: (id: string) => ["analytics", "project-scores", id] as const,
  builderScores: (id: string) => ["analytics", "builder-scores", id] as const,
  searches: ["saved-searches"] as const,
  shortlist: ["shortlist"] as const,
  buyerBrief: (id: string) => ["buyer-brief", id] as const,
};

export function useMyAnalytics(days = 30) {
  const token = useAuthStore((s) => s.accessToken);
  return useQuery({
    queryKey: analyticsKeys.me(days),
    queryFn: () => analyticsApi.me(days),
    enabled: !!token,
  });
}

/** Public: append-only score history for one project. */
export function useProjectScoreHistory(projectId: string) {
  return useQuery({
    queryKey: analyticsKeys.projectScores(projectId),
    queryFn: () => analyticsApi.projectScoreHistory(projectId),
    enabled: !!projectId,
  });
}

/** Public: every snapshot across a builder's projects. */
export function useBuilderScoreHistory(userId: string) {
  return useQuery({
    queryKey: analyticsKeys.builderScores(userId),
    queryFn: () => analyticsApi.builderScoreHistory(userId),
    enabled: !!userId,
  });
}

// ── Saved searches ───────────────────────────────────────────────────────────

export function useSavedSearches(enabled = true) {
  const token = useAuthStore((s) => s.accessToken);
  return useQuery({
    queryKey: analyticsKeys.searches,
    queryFn: pipelineApi.listSearches,
    enabled: enabled && !!token,
    // A 403 means the account role has no pipeline; retrying won't change that.
    retry: false,
  });
}

export function useCreateSavedSearch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      name: string;
      filters: SavedSearchFilters;
      alerts_enabled: boolean;
    }) => pipelineApi.createSearch(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: analyticsKeys.searches }),
  });
}

export function useUpdateSavedSearch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; name?: string; alerts_enabled?: boolean }) =>
      pipelineApi.updateSearch(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: analyticsKeys.searches }),
  });
}

export function useDeleteSavedSearch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => pipelineApi.deleteSearch(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: analyticsKeys.searches }),
  });
}

export function useRunSavedSearch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => pipelineApi.runSearch(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: analyticsKeys.searches }),
  });
}

// ── Shortlist ────────────────────────────────────────────────────────────────

export function useShortlist(enabled = true) {
  const token = useAuthStore((s) => s.accessToken);
  return useQuery({
    queryKey: analyticsKeys.shortlist,
    queryFn: pipelineApi.listShortlist,
    enabled: enabled && !!token,
    retry: false,
  });
}

export function useAddToShortlist() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { project_id: string; note?: string; stage?: string }) =>
      pipelineApi.addShortlist(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: analyticsKeys.shortlist }),
  });
}

export function useUpdateShortlistEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; note?: string; stage?: string }) =>
      pipelineApi.updateShortlist(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: analyticsKeys.shortlist }),
  });
}

export function useRemoveFromShortlist() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => pipelineApi.removeShortlist(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: analyticsKeys.shortlist }),
  });
}

// ── Buyer brief ──────────────────────────────────────────────────────────────

export function useBuyerBrief(projectId: string) {
  return useQuery({
    queryKey: analyticsKeys.buyerBrief(projectId),
    queryFn: () => buyerBriefApi.get(projectId),
    enabled: !!projectId,
  });
}

export function useGenerateBuyerBrief(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => buyerBriefApi.generate(projectId),
    onSuccess: (data) => {
      // Seed the cache directly so the panel updates without a refetch.
      qc.setQueryData(analyticsKeys.buyerBrief(projectId), data);
    },
  });
}
