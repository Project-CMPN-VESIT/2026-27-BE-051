import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminApi } from "@/lib/api/admin";
import { useAuthStore } from "@/stores/auth";

export const adminQk = {
  users: (params?: { page?: number; per_page?: number; search?: string }) => ["admin", "users", params] as const,
  projects: (params?: { page?: number; per_page?: number; is_verified?: boolean }) => ["admin", "projects", params] as const,
  verificationQueue: ["admin", "verification-queue"] as const,
  analytics: ["admin", "analytics"] as const,
};

export function useAdminUsers(params?: { page?: number; per_page?: number; search?: string }) {
  const token = useAuthStore((s) => s.accessToken);
  return useQuery({
    queryKey: adminQk.users(params),
    queryFn: () => adminApi.listUsers(params),
    enabled: !!token,
  });
}

export function useAdminProjects(params?: { page?: number; per_page?: number; is_verified?: boolean }) {
  const token = useAuthStore((s) => s.accessToken);
  return useQuery({
    queryKey: adminQk.projects(params),
    queryFn: () => adminApi.listProjects(params),
    enabled: !!token,
  });
}

export function useVerificationQueue() {
  const token = useAuthStore((s) => s.accessToken);
  return useQuery({
    queryKey: adminQk.verificationQueue,
    queryFn: adminApi.verificationQueue,
    enabled: !!token,
  });
}

export function useAdminAnalytics() {
  const token = useAuthStore((s) => s.accessToken);
  return useQuery({
    queryKey: adminQk.analytics,
    queryFn: adminApi.analytics,
    enabled: !!token,
    refetchInterval: 60_000,
  });
}

export function useAuditLogs(params?: { page?: number; per_page?: number; action?: string; target_type?: string }) {
  const token = useAuthStore((s) => s.accessToken);
  return useQuery({
    queryKey: ["admin", "audit-logs", params] as const,
    queryFn: () => adminApi.auditLogs(params),
    enabled: !!token,
  });
}

export function useBanUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => adminApi.banUser(userId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "users"] }),
  });
}

export function useUnbanUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => adminApi.unbanUser(userId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "users"] }),
  });
}

export function useChangeUserRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: string }) =>
      adminApi.changeUserRole(userId, role),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "users"] }),
  });
}

export function useToggleFeatured() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ projectId, featured }: { projectId: string; featured: boolean }) =>
      adminApi.toggleFeatured(projectId, featured),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "projects"] }),
  });
}

export function useVerifyProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ projectId, verified, notes }: { projectId: string; verified: boolean; notes?: string }) =>
      adminApi.verifyProject(projectId, verified, notes),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "projects"] });
      qc.invalidateQueries({ queryKey: adminQk.verificationQueue });
    },
  });
}

export function useAdminDeleteProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (projectId: string) => adminApi.deleteProject(projectId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "projects"] }),
  });
}

export function useAdminPayouts(unverifiedOnly = false) {
  const token = useAuthStore((s) => s.accessToken);
  return useQuery({
    queryKey: ["admin", "payouts", unverifiedOnly] as const,
    queryFn: () => adminApi.listPayoutDetails(unverifiedOnly),
    enabled: !!token,
  });
}

export function useVerifyPayout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, verified }: { userId: string; verified: boolean }) =>
      adminApi.verifyPayoutDetails(userId, verified),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "payouts"] }),
  });
}

export function useRecordSettlement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, payload }: { userId: string; payload: import("@/lib/api/admin").SettlementPayload }) =>
      adminApi.recordSettlement(userId, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "payouts"] }),
  });
}

export function useAdminReports(status?: string) {
  const token = useAuthStore((s) => s.accessToken);
  return useQuery({
    queryKey: ["admin", "reports", status] as const,
    queryFn: () => adminApi.listReports(status),
    enabled: !!token,
  });
}

export function useResolveReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ reportId, payload }: { reportId: string; payload: import("@/lib/api/admin").ResolveReportPayload }) =>
      adminApi.resolveReport(reportId, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "reports"] }),
  });
}
