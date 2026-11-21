/**
 * API surface for the advanced feature set.
 *
 * Separate module from `lib/api/index.ts` (already 700 lines) but re-exported
 * from it so callers keep importing from `@/lib/api`.
 */
import { apiClient } from "@/lib/api/client";
import type {
  CollegeDashboard,
  CollegePartner,
  Comparison,
  Digest,
  DuplicateFlag,
  EmployerVerificationRequest,
  HealthTrend,
  MemberEarnings,
  OfferSummary,
  ProjectBundle,
  PurchaseOffer,
  SimilarProject,
  Streak,
  StreakCalendarDay,
  StreakLeader,
  Team,
  TeamMembership,
  TrustReceipt,
} from "@/types/advanced";

// ── Trust: receipts, health, duplicates ──────────────────────────────────────

export const trustApi = {
  myReceipts: () =>
    apiClient.get<TrustReceipt[]>("/trust/receipts").then((r) => r.data),

  receipt: (id: string) =>
    apiClient.get<TrustReceipt>(`/trust/receipts/${id}`).then((r) => r.data),

  receiptByCode: (code: string) =>
    apiClient
      .get<TrustReceipt>(`/trust/receipts/by-code/${encodeURIComponent(code)}`)
      .then((r) => r.data),

  purchases: () =>
    apiClient.get<HealthTrend[]>("/trust/purchases").then((r) => r.data),

  purchaseHealth: (projectId: string) =>
    apiClient.get<HealthTrend>(`/trust/purchases/${projectId}`).then((r) => r.data),

  recheck: (projectId: string, githubToken?: string | null) =>
    apiClient
      .post<{ task_id: string; status: string }>(
        `/trust/purchases/${projectId}/recheck`,
        {},
        githubToken ? { headers: { "X-GitHub-Token": githubToken } } : undefined,
      )
      .then((r) => r.data),

  // Admin
  duplicateQueue: () =>
    apiClient.get<DuplicateFlag[]>("/trust/duplicates").then((r) => r.data),

  reviewDuplicate: (flagId: string, data: { confirm: boolean; note?: string }) =>
    apiClient
      .post<DuplicateFlag>(`/trust/duplicates/${flagId}/review`, data)
      .then((r) => r.data),

  projectDuplicates: (projectId: string) =>
    apiClient
      .get<DuplicateFlag[]>(`/trust/projects/${projectId}/duplicates`)
      .then((r) => r.data),
};

// ── Offers ───────────────────────────────────────────────────────────────────

export const offersApi = {
  create: (projectId: string, data: { amount_paise: number; message?: string }) =>
    apiClient
      .post<PurchaseOffer>(`/offers/projects/${projectId}`, data)
      .then((r) => r.data),

  mine: () => apiClient.get<PurchaseOffer[]>("/offers/mine").then((r) => r.data),

  received: () =>
    apiClient.get<PurchaseOffer[]>("/offers/received").then((r) => r.data),

  forProject: (projectId: string) =>
    apiClient
      .get<PurchaseOffer[]>(`/offers/projects/${projectId}`)
      .then((r) => r.data),

  myOfferOn: (projectId: string) =>
    apiClient
      .get<PurchaseOffer | null>(`/offers/projects/${projectId}/mine`)
      .then((r) => r.data),

  summary: (projectId: string) =>
    apiClient
      .get<OfferSummary>(`/offers/projects/${projectId}/summary`)
      .then((r) => r.data),

  counter: (offerId: string, data: { amount_paise: number; message?: string }) =>
    apiClient.post<PurchaseOffer>(`/offers/${offerId}/counter`, data).then((r) => r.data),

  accept: (offerId: string) =>
    apiClient.post<PurchaseOffer>(`/offers/${offerId}/accept`).then((r) => r.data),

  decline: (offerId: string, message?: string) =>
    apiClient
      .post<PurchaseOffer>(`/offers/${offerId}/decline`, { message })
      .then((r) => r.data),

  withdraw: (offerId: string) =>
    apiClient.post<PurchaseOffer>(`/offers/${offerId}/withdraw`).then((r) => r.data),
};

// ── Bundles ──────────────────────────────────────────────────────────────────

export const bundlesApi = {
  list: () => apiClient.get<ProjectBundle[]>("/bundles").then((r) => r.data),

  mine: () => apiClient.get<ProjectBundle[]>("/bundles/mine").then((r) => r.data),

  get: (slug: string) =>
    apiClient.get<ProjectBundle>(`/bundles/${slug}`).then((r) => r.data),

  create: (data: {
    title: string;
    description?: string;
    project_ids: string[];
    price_paise: number;
    publish?: boolean;
  }) => apiClient.post<ProjectBundle>("/bundles", data).then((r) => r.data),

  setPublished: (bundleId: string, publish: boolean) =>
    apiClient
      .patch<ProjectBundle>(`/bundles/${bundleId}/publish`, { publish })
      .then((r) => r.data),

  remove: (bundleId: string) =>
    apiClient.delete(`/bundles/${bundleId}`).then((r) => r.data),
};

// ── Teams ────────────────────────────────────────────────────────────────────

export const teamsApi = {
  get: (projectId: string) =>
    apiClient.get<Team>(`/teams/projects/${projectId}`).then((r) => r.data),

  set: (
    projectId: string,
    members: {
      user_id: string;
      revenue_share_bps: number;
      contribution?: string;
      role?: string;
    }[],
  ) => apiClient.put<Team>(`/teams/projects/${projectId}`, { members }).then((r) => r.data),

  respond: (projectId: string, accept: boolean) =>
    apiClient
      .post<Team>(`/teams/projects/${projectId}/respond`, { accept })
      .then((r) => r.data),

  myMemberships: () =>
    apiClient.get<TeamMembership[]>("/teams/my-memberships").then((r) => r.data),

  mySplits: () =>
    apiClient.get<MemberEarnings>("/teams/my-splits").then((r) => r.data),
};

// ── Retention: streaks + digest ──────────────────────────────────────────────

export const retentionApi = {
  myStreak: () => apiClient.get<Streak>("/retention/streak").then((r) => r.data),

  myCalendar: (weeks = 26) =>
    apiClient
      .get<StreakCalendarDay[]>("/retention/streak/calendar", { params: { weeks } })
      .then((r) => r.data),

  userStreak: (userId: string) =>
    apiClient.get<Streak>(`/retention/streak/users/${userId}`).then((r) => r.data),

  userCalendar: (userId: string, weeks = 26) =>
    apiClient
      .get<StreakCalendarDay[]>(`/retention/streak/users/${userId}/calendar`, {
        params: { weeks },
      })
      .then((r) => r.data),

  leaderboard: (limit = 10) =>
    apiClient
      .get<StreakLeader[]>("/retention/streak/leaderboard", { params: { limit } })
      .then((r) => r.data),

  digest: (days = 7) =>
    apiClient.get<Digest>("/retention/digest", { params: { days } }).then((r) => r.data),
};

// ── Institutions ─────────────────────────────────────────────────────────────

export const institutionsApi = {
  register: (data: {
    college_name: string;
    department?: string;
    contact_name?: string;
    contact_title?: string;
    website_url?: string;
  }) =>
    apiClient
      .post<CollegePartner>("/institutions/college-partners", data)
      .then((r) => r.data),

  me: () =>
    apiClient
      .get<CollegePartner | null>("/institutions/college-partners/me")
      .then((r) => r.data),

  dashboard: () =>
    apiClient
      .get<CollegeDashboard>("/institutions/college-partners/dashboard")
      .then((r) => r.data),

  pending: () =>
    apiClient
      .get<CollegePartner[]>("/institutions/college-partners/pending")
      .then((r) => r.data),

  verify: (partnerId: string, data: { approve: boolean; note?: string }) =>
    apiClient
      .post<CollegePartner>(
        `/institutions/college-partners/${partnerId}/verify`,
        data,
      )
      .then((r) => r.data),
};

export const verificationRequestsApi = {
  list: () =>
    apiClient
      .get<EmployerVerificationRequest[]>("/verification-requests")
      .then((r) => r.data),

  get: (id: string) =>
    apiClient
      .get<EmployerVerificationRequest>(`/verification-requests/${id}`)
      .then((r) => r.data),

  create: (data: {
    builder_id: string;
    role_title: string;
    message: string;
    company?: string;
    looking_for?: string;
  }) =>
    apiClient
      .post<EmployerVerificationRequest>("/verification-requests", data)
      .then((r) => r.data),

  fulfil: (
    id: string,
    data: { repo_full_name: string; note?: string },
    githubToken: string,
  ) =>
    apiClient
      .post<EmployerVerificationRequest>(
        `/verification-requests/${id}/fulfil`,
        data,
        { headers: { "X-GitHub-Token": githubToken } },
      )
      .then((r) => r.data),

  decline: (id: string, note?: string) =>
    apiClient
      .post<EmployerVerificationRequest>(`/verification-requests/${id}/decline`, {
        note,
      })
      .then((r) => r.data),
};

// ── Discovery: comparison + similar ──────────────────────────────────────────

export const discoveryApi = {
  compare: (projectIds: string[]) => {
    const params = new URLSearchParams();
    projectIds.forEach((id) => params.append("id", id));
    return apiClient
      .get<Comparison>(`/discovery/compare?${params.toString()}`)
      .then((r) => r.data);
  },

  similar: (projectId: string, limit = 6) =>
    apiClient
      .get<SimilarProject[]>(`/discovery/projects/${projectId}/similar`, {
        params: { limit },
      })
      .then((r) => r.data),
};
