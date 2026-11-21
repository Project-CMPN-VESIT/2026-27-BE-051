import { useEffect, useState } from "react";
import {
  useQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { projectsApi, usersApi, paymentsApi, githubApi, subscriptionsApi, buildRequestsApi, type ListProjectsParams } from "@/lib/api";
import { useAuthStore } from "@/stores/auth";
import type {
  Project,
  User,
  ContributorRequest,
  PaymentType,
} from "@/types";

// ── Query keys ────────────────────────────────────────────────────────────────
export const qk = {
  me: ["me"] as const,
  projects: (params?: ListProjectsParams) => ["projects", params] as const,
  project: (id: string) => ["project", id] as const,
  trending: ["projects", "trending"] as const,
  highPotential: ["projects", "high-potential"] as const,
  seekingContributors: ["projects", "seeking-contributors"] as const,
  verifiedProjects: ["projects", "verified"] as const,
  recentlyRevived: ["projects", "recently-revived"] as const,
  forSale: ["projects", "for-sale"] as const,
  myProjects: ["projects", "mine"] as const,
  analysisStatus: (id: string) => ["analysis-status", id] as const,
  contributorRequests: (projectId: string) =>
    ["contributor-requests", projectId] as const,
  githubRepos: (page: number) => ["github-repos", page] as const,
  paymentHistory: ["payment-history"] as const,
};

// ── UI timing ─────────────────────────────────────────────────────────────────

/**
 * True once `active` has been running longer than `afterMs`.
 *
 * Used to reassure the user during a free-tier cold start, where the first
 * request of a session can take up to a minute. Without it a slow boot is
 * indistinguishable from a broken form.
 */
export function useSlowRequest(active: boolean, afterMs = 6000): boolean {
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    if (!active) return;
    const timer = setTimeout(() => setSlow(true), afterMs);
    // Reset in cleanup rather than synchronously in the effect body, so the flag
    // clears when the request finishes without triggering a cascading render.
    return () => {
      clearTimeout(timer);
      setSlow(false);
    };
  }, [active, afterMs]);

  // Guard on `active` too: state updates are async, so this keeps the hook from
  // briefly reporting "slow" after a request has already completed.
  return active && slow;
}

// ── User / Auth ───────────────────────────────────────────────────────────────

export function useMe() {
  const token = useAuthStore((s) => s.accessToken);
  return useQuery({
    queryKey: qk.me,
    queryFn: usersApi.me,
    enabled: !!token,
    staleTime: 5 * 60 * 1000,
  });
}

export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<User["profile"]>) =>
      usersApi.updateProfile(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.me }),
  });
}

// ── Discovery feed ────────────────────────────────────────────────────────────

export function useTrending() {
  return useQuery({
    queryKey: qk.trending,
    queryFn: projectsApi.trending,
    staleTime: 2 * 60 * 1000,
  });
}

export function useHighPotential() {
  return useQuery({
    queryKey: qk.highPotential,
    queryFn: projectsApi.highPotential,
    staleTime: 5 * 60 * 1000,
  });
}

export function useSeekingContributors() {
  return useQuery({
    queryKey: qk.seekingContributors,
    queryFn: projectsApi.seekingContributors,
    staleTime: 2 * 60 * 1000,
  });
}

export function useVerifiedProjects() {
  return useQuery({
    queryKey: qk.verifiedProjects,
    queryFn: projectsApi.verified,
    staleTime: 10 * 60 * 1000,
  });
}

export function useRecentlyRevived() {
  return useQuery({
    queryKey: qk.recentlyRevived,
    queryFn: projectsApi.recentlyRevived,
    staleTime: 5 * 60 * 1000,
  });
}

export function useForSale() {
  return useQuery({
    queryKey: qk.forSale,
    queryFn: projectsApi.forSale,
    staleTime: 5 * 60 * 1000,
  });
}

// ── Projects ──────────────────────────────────────────────────────────────────

export function useProjects(params?: ListProjectsParams) {
  return useQuery({
    queryKey: qk.projects(params),
    queryFn: () => projectsApi.list(params),
    staleTime: 60 * 1000,
  });
}

export function useProject(id: string) {
  return useQuery({
    queryKey: qk.project(id),
    queryFn: () => projectsApi.get(id),
    enabled: !!id,
    staleTime: 60 * 1000,
  });
}

export function useMyProjects() {
  const token = useAuthStore((s) => s.accessToken);
  return useQuery({
    queryKey: qk.myProjects,
    queryFn: projectsApi.mine,
    enabled: !!token,
  });
}

export function useImportProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      data,
      githubToken,
    }: {
      data: Parameters<typeof projectsApi.import>[0];
      githubToken: string;
    }) => projectsApi.import(data, githubToken),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.myProjects });
    },
  });
}

export function useUpdateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Project> }) =>
      projectsApi.update(id, data),
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: qk.project(id) });
      qc.invalidateQueries({ queryKey: qk.myProjects });
    },
  });
}

export function useDeleteProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => projectsApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.myProjects }),
  });
}

export function useTriggerAnalysis() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      projectId,
      githubToken,
    }: {
      projectId: string;
      githubToken?: string;
    }) => projectsApi.triggerAnalysis(projectId, githubToken),
    onSuccess: (_, { projectId }) => {
      qc.invalidateQueries({ queryKey: qk.project(projectId) });
      qc.invalidateQueries({ queryKey: qk.analysisStatus(projectId) });
    },
  });
}

export function useAnalysisStatus(projectId: string, enabled = false) {
  return useQuery({
    queryKey: qk.analysisStatus(projectId),
    queryFn: () => projectsApi.analysisStatus(projectId),
    enabled,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === "running" || status === "pending" ? 3000 : false;
    },
  });
}

// ── Contributor requests ──────────────────────────────────────────────────────

export function useContributorRequests(projectId: string) {
  return useQuery({
    queryKey: qk.contributorRequests(projectId),
    queryFn: () => projectsApi.listContributorRequests(projectId),
    enabled: !!projectId,
  });
}

export function useCreateContributorRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      projectId,
      data,
    }: {
      projectId: string;
      data: { message?: string; skills_offered?: string[] };
    }) => projectsApi.createContributorRequest(projectId, data),
    onSuccess: (_, { projectId }) => {
      qc.invalidateQueries({ queryKey: qk.contributorRequests(projectId) });
    },
  });
}

export function useResolveContributorRequest() {
  const qc = useQueryClient();
  return useMutation({
    // projectId isn't needed to send the request, but stays in the variables type
    // because onMutate uses it to target the right cache entry.
    mutationFn: ({
      requestId,
      status,
    }: {
      requestId: string;
      status: "accepted" | "rejected";
      projectId: string;
    }) => projectsApi.resolveContributorRequest(requestId, status),
    onMutate: async ({ requestId, status, projectId }) => {
      // Optimistic update
      await qc.cancelQueries({ queryKey: qk.contributorRequests(projectId) });
      const prev = qc.getQueryData<ContributorRequest[]>(
        qk.contributorRequests(projectId)
      );
      qc.setQueryData<ContributorRequest[]>(
        qk.contributorRequests(projectId),
        (old) =>
          old?.map((r) => (r.id === requestId ? { ...r, status } : r)) ?? []
      );
      return { prev };
    },
    onError: (_, { projectId }, ctx) => {
      if (ctx?.prev)
        qc.setQueryData(qk.contributorRequests(projectId), ctx.prev);
    },
    onSettled: (_, __, { projectId }) => {
      qc.invalidateQueries({ queryKey: qk.contributorRequests(projectId) });
    },
  });
}

// ── GitHub ────────────────────────────────────────────────────────────────────

export function useGitHubRepos(githubToken: string | null, page = 1) {
  return useQuery({
    queryKey: qk.githubRepos(page),
    queryFn: () => githubApi.listRepos(githubToken!, page),
    enabled: !!githubToken,
    staleTime: 2 * 60 * 1000,
  });
}

// ── Payments ──────────────────────────────────────────────────────────────────

export function usePaymentHistory() {
  const token = useAuthStore((s) => s.accessToken);
  return useQuery({
    queryKey: qk.paymentHistory,
    queryFn: paymentsApi.history,
    enabled: !!token,
  });
}

export function useCreateOrder() {
  return useMutation({
    mutationFn: ({
      type,
      projectId,
    }: {
      type: PaymentType;
      projectId?: string;
    }) => paymentsApi.createOrder(type, projectId),
  });
}

export function useSellerEarnings() {
  const token = useAuthStore((s) => s.accessToken);
  return useQuery({
    queryKey: ["seller-earnings"],
    queryFn: paymentsApi.earnings,
    enabled: !!token,
  });
}

export function useSettlements() {
  const token = useAuthStore((s) => s.accessToken);
  return useQuery({
    queryKey: ["settlements"],
    queryFn: paymentsApi.settlements,
    enabled: !!token,
  });
}

// ── Subscriptions ────────────────────────────────────────────────────────────

export function useMySubscription() {
  const token = useAuthStore((s) => s.accessToken);
  return useQuery({
    queryKey: ["subscription", "me"],
    queryFn: subscriptionsApi.me,
    enabled: !!token,
  });
}

export function useUserContact(userId: string, enabled = false) {
  return useQuery({
    queryKey: ["user-contact", userId],
    queryFn: () => usersApi.contact(userId),
    enabled: enabled && !!userId,
    retry: false,
  });
}

// ── Bug-risk assessment ──────────────────────────────────────────────────────

export function useProjectRisk(projectId: string) {
  return useQuery({
    queryKey: ["project-risk", projectId],
    queryFn: () => projectsApi.risk(projectId),
    enabled: !!projectId,
    retry: false,
  });
}

// ── Project timeline ─────────────────────────────────────────────────────────

export function useProjectTimeline(projectId: string) {
  return useQuery({
    queryKey: ["project-timeline", projectId],
    queryFn: () => projectsApi.timeline(projectId),
    enabled: !!projectId,
  });
}

export function useAddTimelineUpdate(projectId: string) {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["project-timeline", projectId] });
    qc.invalidateQueries({ queryKey: qk.project(projectId) });
  };
  return {
    add: useMutation({
      mutationFn: (data: import("@/types").TimelineEventPayload) =>
        projectsApi.addTimelineUpdate(projectId, data),
      onSuccess: invalidate,
    }),
    remove: useMutation({
      mutationFn: (eventId: string) => projectsApi.deleteTimelineEvent(eventId),
      onSuccess: invalidate,
    }),
  };
}

// ── Contributor matching ─────────────────────────────────────────────────────

export function useContributorMatches(projectId: string, enabled = false, limit = 10) {
  return useQuery({
    queryKey: ["contributor-matches", projectId, limit] as const,
    queryFn: () => projectsApi.contributorMatches(projectId, limit),
    enabled: enabled && !!projectId,
    retry: false,
  });
}

// ── AI pitch deck ────────────────────────────────────────────────────────────

export function usePitchDeck(projectId: string) {
  return useQuery({
    queryKey: ["pitch-deck", projectId],
    queryFn: () => projectsApi.pitchDeck(projectId),
    enabled: !!projectId,
    retry: false,
  });
}

export function useRefinePitchSlide(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ slideIndex, instruction }: { slideIndex: number; instruction: string }) =>
      projectsApi.refinePitchSlide(projectId, slideIndex, instruction),
    // The response is the whole updated deck, so seed the cache directly rather
    // than refetching — the viewer stays on the slide being edited.
    onSuccess: (deck) => qc.setQueryData(["pitch-deck", projectId], deck),
  });
}

export function useGeneratePitchDeck(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (githubToken?: string) => projectsApi.generatePitchDeck(projectId, githubToken),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pitch-deck", projectId] }),
  });
}

// ── Project adoption ─────────────────────────────────────────────────────────

export const adoptionKeys = {
  requests: (projectId: string) => ["adoption-requests", projectId] as const,
  mine: (projectId: string) => ["adoption-request-mine", projectId] as const,
};

export function useAdoptionRequests(projectId: string, enabled = false) {
  return useQuery({
    queryKey: adoptionKeys.requests(projectId),
    queryFn: () => projectsApi.adoptionRequests(projectId),
    enabled: enabled && !!projectId,
    retry: false,
  });
}

export function useMyAdoptionRequest(projectId: string, enabled = false) {
  return useQuery({
    queryKey: adoptionKeys.mine(projectId),
    queryFn: () => projectsApi.myAdoptionRequest(projectId),
    enabled: enabled && !!projectId,
    retry: false,
  });
}

export function useRequestAdoption(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: import("@/types").AdoptionRequestPayload) =>
      projectsApi.requestAdoption(projectId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: adoptionKeys.mine(projectId) });
      qc.invalidateQueries({ queryKey: qk.project(projectId) });
    },
  });
}

export function useSetAdoptionStatus(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (isOpen: boolean) => projectsApi.setAdoptionStatus(projectId, isOpen),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.project(projectId) });
      qc.invalidateQueries({ queryKey: qk.myProjects });
    },
  });
}

export function useResolveAdoption(projectId: string) {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: adoptionKeys.requests(projectId) });
    qc.invalidateQueries({ queryKey: qk.project(projectId) });
    qc.invalidateQueries({ queryKey: qk.myProjects });
  };
  return {
    resolve: useMutation({
      mutationFn: ({ requestId, approve, note }: { requestId: string; approve: boolean; note?: string }) =>
        projectsApi.resolveAdoption(requestId, approve, note),
      onSuccess: invalidate,
    }),
    withdraw: useMutation({
      mutationFn: (requestId: string) => projectsApi.withdrawAdoption(requestId),
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: adoptionKeys.mine(projectId) });
      },
    }),
  };
}

// ── Build Requests ───────────────────────────────────────────────────────────

export const buildReqKeys = {
  list: (params?: { search?: string; skill?: string }) => ["build-requests", params] as const,
  mine: ["build-requests", "mine"] as const,
  assigned: ["build-requests", "assigned"] as const,
  detail: (id: string) => ["build-request", id] as const,
  applications: (id: string) => ["build-request-apps", id] as const,
};

export function useBuildRequests(params?: { search?: string; skill?: string }) {
  return useQuery({
    queryKey: buildReqKeys.list(params),
    queryFn: () => buildRequestsApi.list(params),
    staleTime: 30 * 1000,
  });
}

export function useMyBuildRequests() {
  const token = useAuthStore((s) => s.accessToken);
  return useQuery({
    queryKey: buildReqKeys.mine,
    queryFn: buildRequestsApi.mine,
    enabled: !!token,
  });
}

export function useAssignedBuildRequests() {
  const token = useAuthStore((s) => s.accessToken);
  return useQuery({
    queryKey: buildReqKeys.assigned,
    queryFn: buildRequestsApi.assigned,
    enabled: !!token,
  });
}

export function useBuildRequest(id: string) {
  return useQuery({
    queryKey: buildReqKeys.detail(id),
    queryFn: () => buildRequestsApi.get(id),
    enabled: !!id,
  });
}

export function useBuildRequestApplications(id: string, enabled = false) {
  return useQuery({
    queryKey: buildReqKeys.applications(id),
    queryFn: () => buildRequestsApi.applications(id),
    enabled: enabled && !!id,
    retry: false,
  });
}

export function useCreateBuildRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: import("@/types").BuildRequestCreatePayload) => buildRequestsApi.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["build-requests"] });
    },
  });
}

export function useApplyToBuildRequest(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: import("@/types").BuildApplicationCreatePayload) => buildRequestsApi.apply(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: buildReqKeys.detail(id) }),
  });
}

export function useUpdateBuildRequestStatus(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (status: "completed" | "cancelled") => buildRequestsApi.updateStatus(id, status),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: buildReqKeys.detail(id) });
      qc.invalidateQueries({ queryKey: buildReqKeys.mine });
    },
  });
}

export function useResolveBuildApplication(requestId: string) {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: buildReqKeys.applications(requestId) });
    qc.invalidateQueries({ queryKey: buildReqKeys.detail(requestId) });
  };
  return {
    accept: useMutation({ mutationFn: (appId: string) => buildRequestsApi.acceptApplication(appId), onSuccess: invalidate }),
    reject: useMutation({ mutationFn: (appId: string) => buildRequestsApi.rejectApplication(appId), onSuccess: invalidate }),
    withdraw: useMutation({ mutationFn: (appId: string) => buildRequestsApi.withdrawApplication(appId), onSuccess: invalidate }),
  };
}

// ── Verification (Verified Build Score™) ────────────────────────────────────

import { escrowApi, verificationApi } from "@/lib/api";
import type { ContractCreateInput, DisputeStatus } from "@/types";

export const escrowKeys = {
  contracts: ["escrow", "contracts"] as const,
  contract: (id: string) => ["escrow", "contract", id] as const,
  buildScore: (projectId: string) => ["build-score", projectId] as const,
};

export function useBuildScore(projectId: string) {
  return useQuery({
    queryKey: escrowKeys.buildScore(projectId),
    queryFn: () => verificationApi.buildScore(projectId),
    enabled: !!projectId,
    retry: false,
  });
}

export function useTriggerBuildScore() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ projectId, githubToken }: { projectId: string; githubToken?: string }) =>
      verificationApi.triggerBuildScore(projectId, githubToken),
    onSuccess: (_, { projectId }) =>
      qc.invalidateQueries({ queryKey: escrowKeys.buildScore(projectId) }),
  });
}

// ── Escrow ────────────────────────────────────────────────────────────────────

export function useEscrowContracts() {
  const token = useAuthStore((s) => s.accessToken);
  return useQuery({
    queryKey: escrowKeys.contracts,
    queryFn: escrowApi.listContracts,
    enabled: !!token,
  });
}

export function useEscrowContract(id: string) {
  return useQuery({
    queryKey: escrowKeys.contract(id),
    queryFn: () => escrowApi.getContract(id),
    enabled: !!id,
  });
}

export function useCreateContract() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: ContractCreateInput) => escrowApi.createContract(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: escrowKeys.contracts }),
  });
}

function useContractAction<TArgs>(fn: (args: TArgs) => Promise<unknown>, contractId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: escrowKeys.contracts });
      if (contractId) qc.invalidateQueries({ queryKey: escrowKeys.contract(contractId) });
    },
  });
}

export function useFundContract(contractId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => escrowApi.fund(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: escrowKeys.contracts });
      if (contractId) qc.invalidateQueries({ queryKey: escrowKeys.contract(contractId) });
    },
  });
}

export function useCancelContract(contractId?: string) {
  return useContractAction((id: string) => escrowApi.cancel(id), contractId);
}

export function useSubmitMilestone(contractId: string) {
  return useContractAction(
    ({ milestoneId, proof_url, proof_note }: { milestoneId: string; proof_url?: string; proof_note?: string }) =>
      escrowApi.submitMilestone(milestoneId, { proof_url, proof_note }),
    contractId
  );
}

export function useApproveMilestone(contractId: string) {
  return useContractAction((milestoneId: string) => escrowApi.approveMilestone(milestoneId), contractId);
}

export function useRejectMilestone(contractId: string) {
  return useContractAction(
    ({ milestoneId, note }: { milestoneId: string; note?: string }) =>
      escrowApi.rejectMilestone(milestoneId, note),
    contractId
  );
}

export function useRaiseDispute(contractId: string) {
  return useContractAction(
    ({ milestone_id, reason }: { milestone_id?: string; reason: string }) =>
      escrowApi.raiseDispute(contractId, { milestone_id, reason }),
    contractId
  );
}

export function useResolveDispute(contractId: string) {
  return useContractAction(
    ({ disputeId, resolution, note }: { disputeId: string; resolution: DisputeStatus; note?: string }) =>
      escrowApi.resolveDispute(disputeId, { resolution, note }),
    contractId
  );
}

// ── Builder Reputation ──────────────────────────────────────────────────────

export const reputationKeys = {
  reputation: (userId: string) => ["reputation", userId] as const,
  leaderboard: (limit: number) => ["leaderboard", limit] as const,
};

export function useReputation(userId: string) {
  return useQuery({
    queryKey: reputationKeys.reputation(userId),
    queryFn: () => usersApi.reputation(userId),
    enabled: !!userId,
  });
}

export function useLeaderboard(limit = 20) {
  return useQuery({
    queryKey: reputationKeys.leaderboard(limit),
    queryFn: () => usersApi.leaderboard(limit),
    staleTime: 60 * 1000,
  });
}

export function useRecomputeMyReputation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => usersApi.recomputeMyReputation(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.me });
      qc.invalidateQueries({ queryKey: ["leaderboard"] });
    },
  });
}

export function useUpdateMyRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (role: string) => usersApi.updateMyRole(role),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.me }),
  });
}

// ── Delivery Reliability ────────────────────────────────────────────────────

import { deliveryApi } from "@/lib/api";

export function useDeliveryStats(builderId: string) {
  return useQuery({
    queryKey: ["delivery-stats", builderId],
    queryFn: () => deliveryApi.stats(builderId),
    enabled: !!builderId,
    retry: false,
  });
}

export function usePredictDelivery() {
  return useMutation({
    mutationFn: ({ builderId, promisedDays, milestoneCount }: {
      builderId: string; promisedDays: number; milestoneCount?: number;
    }) => deliveryApi.predict(builderId, promisedDays, milestoneCount ?? 1),
  });
}

// ── Hackathon Authenticity ──────────────────────────────────────────────────

import { hackathonApi } from "@/lib/api";
import type { HackathonClaimInput } from "@/types";

export const hackathonKeys = {
  projectClaim: (projectId: string) => ["hackathon-claim", projectId] as const,
  adminPending: ["hackathon-admin-pending"] as const,
};

export function useProjectHackathonClaim(projectId: string) {
  return useQuery({
    queryKey: hackathonKeys.projectClaim(projectId),
    queryFn: () => hackathonApi.projectClaim(projectId),
    enabled: !!projectId,
    retry: false,
  });
}

export function useCreateHackathonClaim() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: HackathonClaimInput) => hackathonApi.createClaim(data),
    onSuccess: (claim) =>
      qc.invalidateQueries({ queryKey: hackathonKeys.projectClaim(claim.project_id) }),
  });
}

export function useAnalyzeHackathonClaim(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ claimId, githubToken }: { claimId: string; githubToken: string }) =>
      hackathonApi.analyze(claimId, githubToken),
    onSuccess: () => qc.invalidateQueries({ queryKey: hackathonKeys.projectClaim(projectId) }),
  });
}

export function useHackathonPending() {
  return useQuery({
    queryKey: hackathonKeys.adminPending,
    queryFn: hackathonApi.adminPending,
  });
}

export function useReviewHackathonClaim() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ claimId, approve, notes }: { claimId: string; approve: boolean; notes?: string }) =>
      hackathonApi.review(claimId, approve, notes),
    onSuccess: () => qc.invalidateQueries({ queryKey: hackathonKeys.adminPending }),
  });
}

// ── Growth ──────────────────────────────────────────────────────────────────

import { growthApi } from "@/lib/api";

export function useReferral() {
  const token = useAuthStore((s) => s.accessToken);
  return useQuery({
    queryKey: ["referral"],
    queryFn: growthApi.referral,
    enabled: !!token,
  });
}

export function useApplyAmbassador() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => growthApi.applyAmbassador(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["referral"] }),
  });
}

export function useCampusLeaderboard() {
  return useQuery({
    queryKey: ["campus-leaderboard"],
    queryFn: growthApi.campusLeaderboard,
    staleTime: 60 * 1000,
  });
}

export function useBuilderDirectory(search: string) {
  return useQuery({
    queryKey: ["builder-directory", search],
    queryFn: () => usersApi.directory(search, 40),
    staleTime: 30 * 1000,
  });
}

// ── Incubation ──────────────────────────────────────────────────────────────

import { incubationApi } from "@/lib/api";
import type { OfferCreateInput } from "@/types";

export const incubationKeys = {
  discover: ["incubation-discover"] as const,
  received: ["incubation-received"] as const,
  sent: ["incubation-sent"] as const,
};

export function useIncubationDiscover() {
  return useQuery({ queryKey: incubationKeys.discover, queryFn: () => incubationApi.discover(24), staleTime: 60_000 });
}

export function useReceivedOffers() {
  const token = useAuthStore((s) => s.accessToken);
  return useQuery({ queryKey: incubationKeys.received, queryFn: incubationApi.received, enabled: !!token });
}

export function useSentOffers() {
  const token = useAuthStore((s) => s.accessToken);
  return useQuery({ queryKey: incubationKeys.sent, queryFn: incubationApi.sent, enabled: !!token });
}

export function useCreateOffer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: OfferCreateInput) => incubationApi.createOffer(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: incubationKeys.sent }),
  });
}

export function useRespondOffer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ offerId, accept, note }: { offerId: string; accept: boolean; note?: string }) =>
      incubationApi.respond(offerId, accept, note),
    onSuccess: () => qc.invalidateQueries({ queryKey: incubationKeys.received }),
  });
}

export function useWithdrawOffer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (offerId: string) => incubationApi.withdraw(offerId),
    onSuccess: () => qc.invalidateQueries({ queryKey: incubationKeys.sent }),
  });
}
