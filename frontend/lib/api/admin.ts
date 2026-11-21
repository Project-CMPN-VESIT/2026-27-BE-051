import { apiClient } from "./client";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AdminUserRow {
  id: string;
  email: string;
  role: string;
  is_verified: boolean;
  is_active: boolean;
  created_at: string;
}

export interface AdminUsersResponse {
  items: AdminUserRow[];
  total: number;
  page: number;
}

export interface AdminProjectsResponse {
  items: { id: string; title: string; repo_full_name: string; stage: string; status: string; stars: number; forks: number; is_verified: boolean; is_featured: boolean }[];
  total: number;
  page: number;
}

export interface AdminAnalytics {
  users: { total: number; active: number; inactive: number };
  projects: { total: number; verified: number };
  payments: { total_revenue_inr: number };
}

export interface VerificationQueueResponse {
  items: { id: string; title: string; repo_full_name: string; stage: string; stars: number; forks: number; description: string | null }[];
  total: number;
}

export interface AuditLogEntry {
  id: string;
  actor_id: string | null;
  actor_email: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  details: string | null;
  ip_address: string | null;
  created_at: string;
}

export interface AuditLogsResponse {
  items: AuditLogEntry[];
  total: number;
  page: number;
  pages: number;
}

export interface AdminPayoutRow {
  user_id: string;
  email: string;
  display_name: string | null;
  method: string;
  upi_id: string | null;
  account_holder_name: string | null;
  account_number_masked: string | null;
  ifsc: string | null;
  pan_masked: string | null;
  is_verified: boolean;
  net_paise: number;
  settled_paise: number;
  outstanding_paise: number;
  created_at: string;
}

export interface AdminPayoutsResponse {
  items: AdminPayoutRow[];
  total: number;
}

export interface SettlementPayload {
  amount_paise: number;
  method: string;
  reference?: string;
  note?: string;
}

export interface AdminReportRow {
  id: string;
  reporter_id: string;
  reporter_email: string | null;
  target_type: string;
  target_id: string;
  target_title: string | null;
  target_owner_id: string | null;
  reason: string;
  details: string | null;
  status: string;
  action_taken: string | null;
  resolution_note: string | null;
  resolved_at: string | null;
  created_at: string;
}

export interface AdminReportsResponse {
  items: AdminReportRow[];
  total: number;
}

export interface ResolveReportPayload {
  status: "resolved" | "dismissed";
  action: "none" | "remove_target" | "ban_owner";
  note?: string;
}

// ── API ───────────────────────────────────────────────────────────────────────

export const adminApi = {
  // Users
  listUsers: (params?: { page?: number; per_page?: number; search?: string }) =>
    apiClient
      .get<AdminUsersResponse>("/admin/users", { params })
      .then((r) => r.data),

  banUser: (userId: string) =>
    apiClient.post(`/admin/users/${userId}/ban`).then((r) => r.data),

  unbanUser: (userId: string) =>
    apiClient.post(`/admin/users/${userId}/unban`).then((r) => r.data),

  changeUserRole: (userId: string, role: string) =>
    apiClient
      .put(`/admin/users/${userId}/role`, null, { params: { role } })
      .then((r) => r.data),

  // Projects
  listProjects: (params?: { page?: number; per_page?: number; is_verified?: boolean }) =>
    apiClient
      .get<AdminProjectsResponse>("/admin/projects", { params })
      .then((r) => r.data),

  toggleFeatured: (projectId: string, featured: boolean) =>
    apiClient
      .put(`/admin/projects/${projectId}/feature`, null, { params: { featured } })
      .then((r) => r.data),

  verifyProject: (projectId: string, verified: boolean, notes?: string) =>
    apiClient
      .put(`/admin/projects/${projectId}/verify`, null, {
        params: { verified, notes },
      })
      .then((r) => r.data),

  deleteProject: (projectId: string) =>
    apiClient.delete(`/admin/projects/${projectId}`).then((r) => r.data),

  // Verification queue
  verificationQueue: () =>
    apiClient
      .get<VerificationQueueResponse>("/admin/verification-queue")
      .then((r) => r.data),

  // Analytics
  analytics: () =>
    apiClient.get<AdminAnalytics>("/admin/analytics").then((r) => r.data),

  // Audit logs
  auditLogs: (params?: { page?: number; per_page?: number; action?: string; target_type?: string }) =>
    apiClient
      .get<AuditLogsResponse>("/admin/audit-logs", { params })
      .then((r) => r.data),

  // Seller payouts
  listPayoutDetails: (unverified_only = false) =>
    apiClient
      .get<AdminPayoutsResponse>("/admin/payout-details", { params: { unverified_only } })
      .then((r) => r.data),

  verifyPayoutDetails: (userId: string, verified: boolean) =>
    apiClient
      .put(`/admin/payout-details/${userId}/verify`, null, { params: { verified } })
      .then((r) => r.data),

  recordSettlement: (userId: string, payload: SettlementPayload) =>
    apiClient
      .post(`/admin/payouts/${userId}/settle`, payload)
      .then((r) => r.data),

  // Moderation reports
  listReports: (status?: string) =>
    apiClient
      .get<AdminReportsResponse>("/admin/reports", { params: status ? { status } : undefined })
      .then((r) => r.data),

  resolveReport: (reportId: string, payload: ResolveReportPayload) =>
    apiClient
      .put(`/admin/reports/${reportId}/resolve`, payload)
      .then((r) => r.data),
};
