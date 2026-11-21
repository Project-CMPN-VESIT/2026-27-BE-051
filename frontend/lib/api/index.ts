import { apiClient } from "./client";
import type {
  CreateOrderResponse,
  GitHubRepo,
  LoginPayload,
  PaginatedProjects,
  Payment,
  PaymentType,
  Project,
  ProjectListItem,
  RegisterPayload,
  TokenResponse,
  User,
  ContributorRequest,
} from "@/types";

// ── Auth ──────────────────────────────────────────────────────────────────────

export const authApi = {
  register: (data: RegisterPayload) =>
    apiClient.post<TokenResponse>("/auth/register", data).then((r) => r.data),

  login: (data: LoginPayload) =>
    apiClient.post<TokenResponse>("/auth/login", data).then((r) => r.data),

  // Both read the refresh token from the httpOnly cookie, so no body is sent.
  refresh: () =>
    apiClient.post<TokenResponse>("/auth/refresh").then((r) => r.data),

  logout: () => apiClient.post("/auth/logout").then((r) => r.data),

  verifyEmail: (token: string) =>
    apiClient.get(`/auth/verify-email/${token}`),

  forgotPassword: (email: string) =>
    apiClient.post("/auth/forgot-password", { email }),

  resetPassword: (token: string, new_password: string) =>
    apiClient.post("/auth/reset-password", { token, new_password }),

  setup2fa: () =>
    apiClient
      .post<{ secret: string; qr_code_url: string }>("/auth/2fa/setup")
      .then((r) => r.data),

  verify2fa: (code: string) =>
    apiClient.post("/auth/2fa/verify", { code }),

  githubOAuthUrl: () =>
    `${process.env.NEXT_PUBLIC_API_URL}/auth/github`,
};

// ── Users ─────────────────────────────────────────────────────────────────────

export const usersApi = {
  me: () => apiClient.get<User>("/users/me").then((r) => r.data),

  updateProfile: (data: Partial<User["profile"]>) =>
    apiClient.put<User>("/users/me/profile", data).then((r) => r.data),

  getPublicProfile: (userId: string) =>
    apiClient.get<User>(`/users/${userId}`).then((r) => r.data),

  reputation: (userId: string) =>
    apiClient
      .get<import("@/types").ReputationDetail>(`/users/${userId}/reputation`)
      .then((r) => r.data),

  recomputeMyReputation: () =>
    apiClient
      .post<import("@/types").ReputationDetail>("/users/me/reputation/recompute")
      .then((r) => r.data),

  updateMyRole: (role: string) =>
    apiClient.put<User>("/users/me/role", { role }).then((r) => r.data),

  leaderboard: (limit = 20) =>
    apiClient
      .get<import("@/types").LeaderboardEntry[]>("/users/leaderboard", { params: { limit } })
      .then((r) => r.data),

  directory: (search?: string, limit = 30) =>
    apiClient
      .get<import("@/types").BuilderDirectoryEntry[]>("/users/directory", {
        params: { search: search || undefined, limit },
      })
      .then((r) => r.data),

  contact: (userId: string) =>
    apiClient
      .get<import("@/types").ContactInfo>(`/users/${userId}/contact`)
      .then((r) => r.data),

  getPayoutDetails: () =>
    apiClient
      .get<import("@/types").PayoutDetail | null>("/users/me/payout-details")
      .then((r) => r.data),

  updatePayoutDetails: (data: import("@/types").PayoutDetailInput) =>
    apiClient
      .put<import("@/types").PayoutDetail>("/users/me/payout-details", data)
      .then((r) => r.data),
};

// ── Projects ──────────────────────────────────────────────────────────────────

export interface ListProjectsParams {
  page?: number;
  per_page?: number;
  search?: string;
  language?: string;
  stage?: string;
  status?: string;
  seeking_contributors?: boolean;
  for_sale?: boolean;
  /** Restrict to a single owner — used by public builder profiles. */
  owner_id?: string;
  sort_by?: string;
  sort_dir?: "asc" | "desc";
}

export const projectsApi = {
  list: (params?: ListProjectsParams) =>
    apiClient
      .get<PaginatedProjects>("/projects", { params })
      .then((r) => r.data),

  get: (id: string) =>
    apiClient.get<Project>(`/projects/${id}`).then((r) => r.data),

  trending: () =>
    apiClient
      .get<ProjectListItem[]>("/projects/trending")
      .then((r) => r.data),

  highPotential: () =>
    apiClient
      .get<ProjectListItem[]>("/projects/high-potential")
      .then((r) => r.data),

  seekingContributors: () =>
    apiClient
      .get<ProjectListItem[]>("/projects/seeking-contributors")
      .then((r) => r.data),

  verified: () =>
    apiClient
      .get<ProjectListItem[]>("/projects/verified")
      .then((r) => r.data),

  recentlyRevived: () =>
    apiClient
      .get<ProjectListItem[]>("/projects/recently-revived")
      .then((r) => r.data),

  forSale: () =>
    apiClient
      .get<ProjectListItem[]>("/projects/for-sale")
      .then((r) => r.data),

  mine: () =>
    apiClient
      .get<ProjectListItem[]>("/projects/mine")
      .then((r) => r.data),

  import: (
    data: {
      github_repo_id: number;
      repo_full_name: string;
      title: string;
      description?: string;
      stage?: string;
      is_seeking_contributors?: boolean;
    },
    githubToken: string
  ) =>
    apiClient
      .post<Project>("/projects", data, {
        headers: { "x-github-token": githubToken },
      })
      .then((r) => r.data),

  update: (id: string, data: import("@/types").ProjectUpdateInput) =>
    apiClient.put<Project>(`/projects/${id}`, data).then((r) => r.data),

  delivery: (id: string) =>
    apiClient
      .get<import("@/types").ProjectDelivery>(`/projects/${id}/delivery`)
      .then((r) => r.data),

  // ── Bug-risk assessment ───────────────────────────────────────────────────
  risk: (id: string) =>
    apiClient
      .get<import("@/types").RiskAssessment>(`/projects/${id}/risk`)
      .then((r) => r.data),

  // ── Progress timeline ─────────────────────────────────────────────────────
  timeline: (id: string, limit = 50) =>
    apiClient
      .get<import("@/types").TimelineEvent[]>(`/projects/${id}/timeline`, { params: { limit } })
      .then((r) => r.data),

  addTimelineUpdate: (id: string, data: import("@/types").TimelineEventPayload) =>
    apiClient
      .post<import("@/types").TimelineEvent>(`/projects/${id}/timeline`, data)
      .then((r) => r.data),

  deleteTimelineEvent: (eventId: string) =>
    apiClient.delete(`/projects/timeline/${eventId}`).then((r) => r.data),

  // ── Contributor matching ──────────────────────────────────────────────────
  contributorMatches: (id: string, limit = 10) =>
    apiClient
      .get<import("@/types").ContributorMatch[]>(`/projects/${id}/contributor-matches`, {
        params: { limit },
      })
      .then((r) => r.data),

  // ── AI pitch deck ─────────────────────────────────────────────────────────
  pitchDeck: (id: string) =>
    apiClient
      .get<import("@/types").PitchDeck | null>(`/projects/${id}/pitch-deck`)
      .then((r) => r.data),

  /** Rewrite one narrative slide from a plain-English instruction. */
  refinePitchSlide: (id: string, slideIndex: number, instruction: string) =>
    apiClient
      .post<import("@/types").PitchDeck>(
        `/projects/${id}/pitch-deck/slides/${slideIndex}/refine`,
        { instruction }
      )
      .then((r) => r.data),

  /** Absolute URL for the markdown export (a plain link, not an XHR). */
  pitchDeckMarkdownUrl: (id: string) =>
    `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"}` +
    `/projects/${id}/pitch-deck/export.md`,

  generatePitchDeck: (id: string, githubToken?: string) =>
    apiClient
      .post<import("@/types").PitchDeck>(`/projects/${id}/pitch-deck/generate`, null, {
        headers: githubToken ? { "X-GitHub-Token": githubToken } : undefined,
      })
      .then((r) => r.data),

  // ── Adoption ──────────────────────────────────────────────────────────────
  setAdoptionStatus: (id: string, isOpen: boolean) =>
    apiClient
      .put<{ is_open_for_adoption: boolean }>(`/projects/${id}/adoption-status`, {
        is_open_for_adoption: isOpen,
      })
      .then((r) => r.data),

  requestAdoption: (id: string, data: import("@/types").AdoptionRequestPayload) =>
    apiClient
      .post<import("@/types").AdoptionRequest>(`/projects/${id}/adoption-requests`, data)
      .then((r) => r.data),

  adoptionRequests: (id: string) =>
    apiClient
      .get<import("@/types").AdoptionRequest[]>(`/projects/${id}/adoption-requests`)
      .then((r) => r.data),

  myAdoptionRequest: (id: string) =>
    apiClient
      .get<import("@/types").AdoptionRequest | null>(`/projects/${id}/adoption-requests/mine`)
      .then((r) => r.data),

  resolveAdoption: (requestId: string, approve: boolean, note?: string) =>
    apiClient
      .put<import("@/types").AdoptionRequest>(`/adoption-requests/${requestId}/resolve`, {
        approve, note,
      })
      .then((r) => r.data),

  withdrawAdoption: (requestId: string) =>
    apiClient
      .put<import("@/types").AdoptionRequest>(`/adoption-requests/${requestId}/withdraw`)
      .then((r) => r.data),

  delete: (id: string) => apiClient.delete(`/projects/${id}`),

  sync: (id: string, githubToken: string) =>
    apiClient.post(
      `/projects/${id}/sync`,
      {},
      { headers: { "x-github-token": githubToken } }
    ),

  triggerAnalysis: (id: string, githubToken?: string) =>
    apiClient
      .post<{ task_id: string; status: string }>(
        `/projects/${id}/analyze`,
        {},
        githubToken
          ? { headers: { "x-github-token": githubToken } }
          : undefined
      )
      .then((r) => r.data),

  analysisStatus: (id: string) =>
    apiClient
      .get<{ status: string; error: string | null }>(
        `/projects/${id}/analysis/status`
      )
      .then((r) => r.data),

  verifyOwnership: (id: string, githubToken: string) =>
    apiClient.post(
      `/projects/${id}/verify/ownership`,
      {},
      { headers: { "x-github-token": githubToken } }
    ),

  createContributorRequest: (
    projectId: string,
    data: { message?: string; skills_offered?: string[] }
  ) =>
    apiClient
      .post<ContributorRequest>(
        `/projects/${projectId}/contributor-requests`,
        data
      )
      .then((r) => r.data),

  listContributorRequests: (projectId: string) =>
    apiClient
      .get<ContributorRequest[]>(
        `/projects/${projectId}/contributor-requests`
      )
      .then((r) => r.data),

  resolveContributorRequest: (
    requestId: string,
    status: "accepted" | "rejected"
  ) =>
    apiClient
      .put<ContributorRequest>(`/projects/contributor-requests/${requestId}`, {
        status,
      })
      .then((r) => r.data),

  collaborators: (projectId: string) =>
    apiClient
      .get(`/projects/${projectId}/collaborators`)
      .then((r) => r.data),
};

// ── GitHub ────────────────────────────────────────────────────────────────────

export const githubApi = {
  listRepos: (githubToken: string, page = 1) =>
    apiClient
      .get<GitHubRepo[]>("/github/repos", {
        params: { page },
        headers: { "x-github-token": githubToken },
      })
      .then((r) => r.data),
};

// ── Payments ──────────────────────────────────────────────────────────────────

export const paymentsApi = {
  createOrder: (payment_type: PaymentType, project_id?: string) =>
    apiClient
      .post<CreateOrderResponse>("/payments/create-order", {
        payment_type,
        project_id,
      })
      .then((r) => r.data),

  history: () =>
    apiClient.get<Payment[]>("/payments/history").then((r) => r.data),

  earnings: () =>
    apiClient
      .get<import("@/types").SellerEarnings>("/payments/earnings")
      .then((r) => r.data),

  settlements: () =>
    apiClient
      .get<import("@/types").SettlementItem[]>("/payments/settlements")
      .then((r) => r.data),
};

// ── Reports (moderation) ────────────────────────────────────────────────────

export const reportsApi = {
  create: (data: import("@/types").ReportCreatePayload) =>
    apiClient
      .post<import("@/types").Report>("/reports", { target_type: "project", ...data })
      .then((r) => r.data),
};

// ── Build Requests (build-for-me) ───────────────────────────────────────────

export const buildRequestsApi = {
  list: (params?: { search?: string; skill?: string }) =>
    apiClient
      .get<import("@/types").BuildRequestListItem[]>("/build-requests", { params })
      .then((r) => r.data),

  mine: () =>
    apiClient
      .get<import("@/types").BuildRequestListItem[]>("/build-requests/mine")
      .then((r) => r.data),

  assigned: () =>
    apiClient
      .get<import("@/types").BuildRequestListItem[]>("/build-requests/assigned")
      .then((r) => r.data),

  get: (id: string) =>
    apiClient
      .get<import("@/types").BuildRequest>(`/build-requests/${id}`)
      .then((r) => r.data),

  create: (data: import("@/types").BuildRequestCreatePayload) =>
    apiClient
      .post<import("@/types").BuildRequest>("/build-requests", data)
      .then((r) => r.data),

  updateStatus: (id: string, status: "completed" | "cancelled") =>
    apiClient
      .put<import("@/types").BuildRequest>(`/build-requests/${id}`, { status })
      .then((r) => r.data),

  apply: (id: string, data: import("@/types").BuildApplicationCreatePayload) =>
    apiClient
      .post<import("@/types").BuildApplication>(`/build-requests/${id}/applications`, data)
      .then((r) => r.data),

  applications: (id: string) =>
    apiClient
      .get<import("@/types").BuildApplication[]>(`/build-requests/${id}/applications`)
      .then((r) => r.data),

  acceptApplication: (applicationId: string) =>
    apiClient
      .put<import("@/types").BuildApplication>(`/build-applications/${applicationId}/accept`)
      .then((r) => r.data),

  rejectApplication: (applicationId: string) =>
    apiClient
      .put<import("@/types").BuildApplication>(`/build-applications/${applicationId}/reject`)
      .then((r) => r.data),

  withdrawApplication: (applicationId: string) =>
    apiClient
      .put<import("@/types").BuildApplication>(`/build-applications/${applicationId}/withdraw`)
      .then((r) => r.data),
};

// ── Subscriptions (Pro memberships) ─────────────────────────────────────────

export const subscriptionsApi = {
  me: () =>
    apiClient
      .get<import("@/types").Subscription>("/subscriptions/me")
      .then((r) => r.data),
};

// ── Notifications ─────────────────────────────────────────────────────────────

export interface NotificationRead { id: string; type: string; title: string; body: string | null; link: string | null; is_read: boolean; created_at: string }
export const notificationsApi = {
  list: (unread_only?: boolean) =>
    apiClient.get<NotificationRead[]>("/notifications", { params: unread_only ? { unread_only: true } : undefined }).then(r => r.data),
  unreadCount: () =>
    apiClient.get<{ count: number }>("/notifications/unread-count").then(r => r.data),
  markRead: (id: string) => apiClient.put(`/notifications/${id}/read`),
  markAllRead: () => apiClient.put("/notifications/mark-all-read"),
  delete: (id: string) => apiClient.delete(`/notifications/${id}`),
};

// ── Reviews ───────────────────────────────────────────────────────────────────

export interface ReviewCreate {
  overall_score: number;
  code_quality?: number;
  idea_score?: number;
  market_potential?: number;
  headline: string;
  body: string;
  is_public?: boolean;
}
export interface ReviewRead { id: string; project_id: string; reviewer_id: string; reviewer_role: string; overall_score: number; code_quality: number | null; idea_score: number | null; market_potential: number | null; headline: string; body: string; is_public: boolean; created_at: string }

export const reviewsApi = {
  list: (projectId: string) =>
    apiClient.get<ReviewRead[]>(`/projects/${projectId}/reviews`).then(r => r.data),
  create: (projectId: string, data: ReviewCreate) =>
    apiClient.post<ReviewRead>(`/projects/${projectId}/reviews`, data).then(r => r.data),
  delete: (projectId: string, reviewId: string) =>
    apiClient.delete(`/projects/${projectId}/reviews/${reviewId}`),
};

// ── Skills ────────────────────────────────────────────────────────────────────

export interface SkillRead { id: string; name: string; category: string | null }
export interface UserSkillRead { id: string; skill: SkillRead; proficiency: "beginner" | "intermediate" | "expert" | null }
export interface ProjectSkillRead { id: string; skill: SkillRead; is_required: boolean }
export const skillsApi = {
  search: (q?: string) =>
    apiClient.get<SkillRead[]>("/skills", { params: q ? { q } : undefined }).then(r => r.data),
  mySkills: () =>
    apiClient.get<UserSkillRead[]>("/users/me/skills").then(r => r.data),
  /** Public skills for any user — used by builder profile pages. */
  userSkills: (userId: string) =>
    apiClient.get<UserSkillRead[]>(`/users/${userId}/skills`).then(r => r.data),
  addSkill: (skill_name: string, proficiency?: string) =>
    apiClient.post<UserSkillRead>("/users/me/skills", { skill_name, proficiency }).then(r => r.data),
  removeSkill: (skillId: string) =>
    apiClient.delete(`/users/me/skills/${skillId}`),
  projectSkills: (projectId: string) =>
    apiClient.get<ProjectSkillRead[]>(`/projects/${projectId}/skills`).then(r => r.data),
  addProjectSkill: (projectId: string, skill_name: string, is_required = true) =>
    apiClient.post<ProjectSkillRead>(`/projects/${projectId}/skills`, { skill_name, is_required }).then(r => r.data),
  removeProjectSkill: (projectId: string, skillId: string) =>
    apiClient.delete(`/projects/${projectId}/skills/${skillId}`),
};

// ── Messaging ─────────────────────────────────────────────────────────────────

export interface MessageRead { id: string; thread_id: string; sender_id: string; body: string; is_read: boolean; created_at: string }
export interface ThreadRead { id: string; participant_a: string; participant_b: string; project_id: string | null; subject: string | null; created_at: string; messages: MessageRead[] }
export const messagingApi = {
  threads: () =>
    apiClient.get<ThreadRead[]>("/messages").then(r => r.data),
  thread: (id: string) =>
    apiClient.get<ThreadRead>(`/messages/${id}`).then(r => r.data),
  start: (data: { recipient_id: string; subject?: string; first_message: string; project_id?: string }) =>
    apiClient.post<ThreadRead>("/messages", data).then(r => r.data),
  send: (threadId: string, body: string) =>
    apiClient.post<MessageRead>(`/messages/${threadId}/messages`, { body }).then(r => r.data),
};

// ── Project access ────────────────────────────────────────────────────────────

export const projectAccessApi = {
  check: (projectId: string) =>
    apiClient.get<{ has_access: boolean }>(`/projects/${projectId}/access`).then(r => r.data),
};

// ── Verification (Verified Build Score™) ────────────────────────────────────

import type {
  BuildScore,
  ContractCreateInput,
  DisputeStatus,
  EscrowContract,
  EscrowContractDetail,
  FundingResponse,
  Milestone,
  ScoringMethodology,
} from "@/types";

export const verificationApi = {
  buildScore: (projectId: string) =>
    apiClient
      .get<BuildScore>(`/verification/projects/${projectId}/build-score`)
      .then((r) => r.data),

  /** The scoring rulebook — weights, flags and thresholds. Public. */
  methodology: () =>
    apiClient
      .get<ScoringMethodology>("/verification/methodology")
      .then((r) => r.data),

  triggerBuildScore: (projectId: string, githubToken?: string) =>
    apiClient
      .post<{ task_id: string; status: string }>(
        `/verification/projects/${projectId}/build-score`,
        {},
        githubToken ? { headers: { "x-github-token": githubToken } } : undefined
      )
      .then((r) => r.data),
};

// ── Public, unauthenticated surface ──────────────────────────────────────────

export const publicApi = {
  /** Live platform totals for the landing page. */
  stats: () =>
    apiClient
      .get<import("@/types").PlatformStats>("/public/stats")
      .then((r) => r.data),

  /** Full trust report for the shareable no-login verification page. */
  report: (projectId: string) =>
    apiClient
      .get<import("@/types").PublicReport>(`/public/projects/${projectId}/report`)
      .then((r) => r.data),

  /** README snippets for the embeddable badge. */
  badgeSnippets: (projectId: string) =>
    apiClient
      .get<import("@/types").BadgeSnippets>(`/badge/${projectId}/snippets`)
      .then((r) => r.data),
};

// ── Analytics + score history ────────────────────────────────────────────────

export const analyticsApi = {
  me: (days = 30) =>
    apiClient
      .get<import("@/types").BuilderAnalytics>("/analytics/me", { params: { days } })
      .then((r) => r.data),

  projectScoreHistory: (projectId: string) =>
    apiClient
      .get<import("@/types").ScoreSnapshot[]>(
        `/analytics/projects/${projectId}/score-history`
      )
      .then((r) => r.data),

  builderScoreHistory: (userId: string) =>
    apiClient
      .get<import("@/types").ScoreSnapshot[]>(
        `/analytics/builders/${userId}/score-history`
      )
      .then((r) => r.data),
};

// ── Recruiter / incubator pipeline ───────────────────────────────────────────

export const pipelineApi = {
  listSearches: () =>
    apiClient.get<import("@/types").SavedSearch[]>("/saved-searches").then((r) => r.data),

  createSearch: (data: {
    name: string;
    filters: import("@/types").SavedSearchFilters;
    alerts_enabled: boolean;
  }) =>
    apiClient.post<import("@/types").SavedSearch>("/saved-searches", data).then((r) => r.data),

  updateSearch: (id: string, data: { name?: string; alerts_enabled?: boolean }) =>
    apiClient.put<import("@/types").SavedSearch>(`/saved-searches/${id}`, data).then((r) => r.data),

  deleteSearch: (id: string) => apiClient.delete(`/saved-searches/${id}`),

  runSearch: (id: string) =>
    apiClient
      .post<{ total: number; new_since_last_check: number }>(`/saved-searches/${id}/run`)
      .then((r) => r.data),

  listShortlist: () =>
    apiClient.get<import("@/types").ShortlistEntry[]>("/shortlist").then((r) => r.data),

  addShortlist: (data: { project_id: string; note?: string; stage?: string }) =>
    apiClient.post<import("@/types").ShortlistEntry>("/shortlist", data).then((r) => r.data),

  updateShortlist: (id: string, data: { note?: string; stage?: string }) =>
    apiClient.put<import("@/types").ShortlistEntry>(`/shortlist/${id}`, data).then((r) => r.data),

  removeShortlist: (id: string) => apiClient.delete(`/shortlist/${id}`),
};

// ── Mentors ──────────────────────────────────────────────────────────────────

export const mentorsApi = {
  /** Public directory. */
  list: (acceptingOnly = true) =>
    apiClient
      .get<import("@/types").Mentor[]>("/mentors", {
        params: { accepting_only: acceptingOnly },
      })
      .then((r) => r.data),

  history: (projectId: string) =>
    apiClient
      .get<import("@/types").MentorChatMessage[]>(`/mentors/ai/${projectId}/history`)
      .then((r) => r.data),

  ask: (projectId: string, question: string) =>
    apiClient
      .post<import("@/types").MentorChatMessage>(`/mentors/ai/${projectId}/ask`, { question })
      .then((r) => r.data),

  clearHistory: (projectId: string) =>
    apiClient.delete(`/mentors/ai/${projectId}/history`),

  improvementPlan: (projectId: string) =>
    apiClient
      .get<import("@/types").ImprovementPlan>(`/mentors/ai/${projectId}/improvement-plan`)
      .then((r) => r.data),

  requestSession: (data: {
    mentor_id: string;
    topic: string;
    message: string;
    project_id?: string | null;
  }) =>
    apiClient
      .post<import("@/types").MentorSession>("/mentors/sessions", data)
      .then((r) => r.data),

  mySessions: () =>
    apiClient
      .get<import("@/types").MentorSession[]>("/mentors/sessions/mine")
      .then((r) => r.data),

  incomingSessions: () =>
    apiClient
      .get<import("@/types").MentorSession[]>("/mentors/sessions/incoming")
      .then((r) => r.data),

  respond: (id: string, data: { status: string; reply?: string }) =>
    apiClient
      .put<import("@/types").MentorSession>(`/mentors/sessions/${id}/respond`, data)
      .then((r) => r.data),

  withdraw: (id: string) => apiClient.delete(`/mentors/sessions/${id}`),
};

// ── AI buyer brief ───────────────────────────────────────────────────────────

export const buyerBriefApi = {
  get: (projectId: string) =>
    apiClient
      .get<import("@/types").BuyerBrief | null>(`/projects/${projectId}/buyer-brief`)
      .then((r) => r.data),

  generate: (projectId: string) =>
    apiClient
      .post<import("@/types").BuyerBrief>(`/projects/${projectId}/buyer-brief/generate`)
      .then((r) => r.data),
};

// ── Escrow ────────────────────────────────────────────────────────────────────

export const escrowApi = {
  listContracts: () =>
    apiClient.get<EscrowContract[]>("/escrow/contracts").then((r) => r.data),

  getContract: (id: string) =>
    apiClient
      .get<EscrowContractDetail>(`/escrow/contracts/${id}`)
      .then((r) => r.data),

  createContract: (data: ContractCreateInput) =>
    apiClient
      .post<EscrowContractDetail>("/escrow/contracts", data)
      .then((r) => r.data),

  fund: (id: string) =>
    apiClient
      .post<FundingResponse>(`/escrow/contracts/${id}/fund`)
      .then((r) => r.data),

  cancel: (id: string) =>
    apiClient
      .post<EscrowContract>(`/escrow/contracts/${id}/cancel`)
      .then((r) => r.data),

  submitMilestone: (
    milestoneId: string,
    data: { proof_url?: string; proof_note?: string }
  ) =>
    apiClient
      .post<Milestone>(`/escrow/milestones/${milestoneId}/submit`, data)
      .then((r) => r.data),

  approveMilestone: (milestoneId: string) =>
    apiClient
      .post<Milestone>(`/escrow/milestones/${milestoneId}/approve`)
      .then((r) => r.data),

  rejectMilestone: (milestoneId: string, note?: string) =>
    apiClient
      .post<Milestone>(`/escrow/milestones/${milestoneId}/reject`, {
        proof_note: note,
      })
      .then((r) => r.data),

  raiseDispute: (
    contractId: string,
    data: { milestone_id?: string; reason: string }
  ) =>
    apiClient
      .post(`/escrow/contracts/${contractId}/disputes`, data)
      .then((r) => r.data),

  resolveDispute: (
    disputeId: string,
    data: { resolution: DisputeStatus; note?: string }
  ) =>
    apiClient
      .post(`/escrow/disputes/${disputeId}/resolve`, data)
      .then((r) => r.data),
};

// ── Delivery Reliability ────────────────────────────────────────────────────

import type { DeliveryPrediction, DeliveryStats } from "@/types";

export const deliveryApi = {
  predict: (builder_id: string, promised_days: number, milestone_count = 1) =>
    apiClient
      .post<DeliveryPrediction>("/delivery/predict", {
        builder_id,
        promised_days,
        milestone_count,
      })
      .then((r) => r.data),

  stats: (builderId: string) =>
    apiClient
      .get<DeliveryStats>(`/delivery/builders/${builderId}`)
      .then((r) => r.data),
};

// ── Hackathon Authenticity ──────────────────────────────────────────────────

import type { HackathonClaim, HackathonClaimInput } from "@/types";

export const hackathonApi = {
  createClaim: (data: HackathonClaimInput) =>
    apiClient.post<HackathonClaim>("/hackathons/claims", data).then((r) => r.data),

  analyze: (claimId: string, githubToken: string) =>
    apiClient
      .post<HackathonClaim>(`/hackathons/claims/${claimId}/analyze`, {}, {
        headers: { "x-github-token": githubToken },
      })
      .then((r) => r.data),

  getClaim: (claimId: string) =>
    apiClient.get<HackathonClaim>(`/hackathons/claims/${claimId}`).then((r) => r.data),

  projectClaim: (projectId: string) =>
    apiClient
      .get<HackathonClaim | null>(`/hackathons/projects/${projectId}/claim`)
      .then((r) => r.data),

  adminPending: () =>
    apiClient.get<HackathonClaim[]>("/hackathons/admin/pending").then((r) => r.data),

  review: (claimId: string, approve: boolean, notes?: string) =>
    apiClient
      .post<HackathonClaim>(`/hackathons/claims/${claimId}/review`, { approve, notes })
      .then((r) => r.data),
};

// ── Growth: referrals + campus ambassadors ──────────────────────────────────

import type { CampusLeaderboard, ReferralInfo } from "@/types";

export const growthApi = {
  referral: () => apiClient.get<ReferralInfo>("/growth/referral").then((r) => r.data),
  applyAmbassador: () =>
    apiClient.post<ReferralInfo>("/growth/ambassador/apply").then((r) => r.data),
  campusLeaderboard: () =>
    apiClient.get<CampusLeaderboard>("/growth/leaderboard/campus").then((r) => r.data),
};

// ── Incubation ──────────────────────────────────────────────────────────────

import type { DiscoverProject, IncubationOffer, OfferCreateInput } from "@/types";

export const incubationApi = {
  discover: (limit = 20) =>
    apiClient.get<DiscoverProject[]>("/incubation/discover", { params: { limit } }).then((r) => r.data),
  createOffer: (data: OfferCreateInput) =>
    apiClient.post<IncubationOffer>("/incubation/offers", data).then((r) => r.data),
  received: () =>
    apiClient.get<IncubationOffer[]>("/incubation/offers/received").then((r) => r.data),
  sent: () =>
    apiClient.get<IncubationOffer[]>("/incubation/offers/sent").then((r) => r.data),
  respond: (offerId: string, accept: boolean, note?: string) =>
    apiClient.post<IncubationOffer>(`/incubation/offers/${offerId}/respond`, { accept, note }).then((r) => r.data),
  withdraw: (offerId: string) =>
    apiClient.post<IncubationOffer>(`/incubation/offers/${offerId}/withdraw`).then((r) => r.data),
};


// ── Advanced features ─────────────────────────────────────────────────────────
// Re-exported so every caller keeps importing from "@/lib/api" regardless of
// which module the group physically lives in.
export {
  trustApi,
  offersApi,
  bundlesApi,
  teamsApi,
  retentionApi,
  institutionsApi,
  verificationRequestsApi,
  discoveryApi,
} from "@/lib/api/advanced";
