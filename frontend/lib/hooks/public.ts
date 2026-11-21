"use client";
import { useQuery } from "@tanstack/react-query";
import { publicApi } from "@/lib/api";

export const publicKeys = {
  stats: ["public", "stats"] as const,
  report: (id: string) => ["public", "report", id] as const,
  badge: (id: string) => ["public", "badge", id] as const,
};

/** Live platform totals. Used by the landing stats ticker. */
export function usePlatformStats() {
  return useQuery({
    queryKey: publicKeys.stats,
    queryFn: publicApi.stats,
    staleTime: 2 * 60 * 1000,
  });
}

/** README embed snippets for a project's badge. */
export function useBadgeSnippets(projectId: string, enabled = true) {
  return useQuery({
    queryKey: publicKeys.badge(projectId),
    queryFn: () => publicApi.badgeSnippets(projectId),
    enabled: enabled && !!projectId,
    staleTime: 5 * 60 * 1000,
  });
}
