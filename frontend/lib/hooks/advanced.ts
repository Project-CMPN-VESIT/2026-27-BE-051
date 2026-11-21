"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  bundlesApi,
  discoveryApi,
  institutionsApi,
  offersApi,
  retentionApi,
  teamsApi,
  trustApi,
  verificationRequestsApi,
} from "@/lib/api";
import { useAuthStore } from "@/stores/auth";

export const advKeys = {
  receipts: ["trust", "receipts"] as const,
  receipt: (id: string) => ["trust", "receipt", id] as const,
  purchases: ["trust", "purchases"] as const,
  purchase: (id: string) => ["trust", "purchase", id] as const,
  duplicateQueue: ["trust", "duplicates"] as const,
  projectDuplicates: (id: string) => ["trust", "duplicates", id] as const,

  myOffers: ["offers", "mine"] as const,
  receivedOffers: ["offers", "received"] as const,
  projectOffers: (id: string) => ["offers", "project", id] as const,
  myOfferOn: (id: string) => ["offers", "project", id, "mine"] as const,
  offerSummary: (id: string) => ["offers", "project", id, "summary"] as const,

  bundles: ["bundles"] as const,
  myBundles: ["bundles", "mine"] as const,
  bundle: (slug: string) => ["bundles", slug] as const,

  team: (projectId: string) => ["teams", projectId] as const,
  myMemberships: ["teams", "memberships"] as const,
  mySplits: ["teams", "splits"] as const,

  myStreak: ["retention", "streak"] as const,
  myCalendar: (weeks: number) => ["retention", "calendar", weeks] as const,
  userStreak: (id: string) => ["retention", "streak", id] as const,
  userCalendar: (id: string, weeks: number) =>
    ["retention", "calendar", id, weeks] as const,
  streakLeaders: (limit: number) => ["retention", "leaders", limit] as const,
  digest: (days: number) => ["retention", "digest", days] as const,

  partnerMe: ["institutions", "me"] as const,
  partnerDashboard: ["institutions", "dashboard"] as const,
  pendingPartners: ["institutions", "pending"] as const,

  verificationRequests: ["verification-requests"] as const,
  verificationRequest: (id: string) => ["verification-requests", id] as const,

  compare: (ids: string[]) => ["discovery", "compare", ...ids] as const,
  similar: (id: string, limit: number) => ["discovery", "similar", id, limit] as const,
};

/* ── Trust receipts ───────────────────────────────────────────────────────── */

export function useMyReceipts() {
  const token = useAuthStore((s) => s.accessToken);
  return useQuery({
    queryKey: advKeys.receipts,
    queryFn: trustApi.myReceipts,
    enabled: !!token,
    retry: false,
  });
}

export function useTrustReceipt(id: string | null | undefined) {
  const token = useAuthStore((s) => s.accessToken);
  return useQuery({
    queryKey: advKeys.receipt(id ?? ""),
    queryFn: () => trustApi.receipt(id as string),
    enabled: !!token && !!id,
    retry: false,
  });
}

/* ── Post-purchase health ─────────────────────────────────────────────────── */

export function useMyPurchases() {
  const token = useAuthStore((s) => s.accessToken);
  return useQuery({
    queryKey: advKeys.purchases,
    queryFn: trustApi.purchases,
    enabled: !!token,
    retry: false,
  });
}

export function usePurchaseHealth(projectId: string, enabled = true) {
  const token = useAuthStore((s) => s.accessToken);
  return useQuery({
    queryKey: advKeys.purchase(projectId),
    queryFn: () => trustApi.purchaseHealth(projectId),
    enabled: enabled && !!token && !!projectId,
    retry: false,
  });
}

export function useRecheckHealth(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (githubToken?: string | null) =>
      trustApi.recheck(projectId, githubToken),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: advKeys.purchase(projectId) });
      qc.invalidateQueries({ queryKey: advKeys.purchases });
    },
  });
}

/* ── Duplicate review ─────────────────────────────────────────────────────── */

export function useDuplicateQueue(enabled = true) {
  const token = useAuthStore((s) => s.accessToken);
  return useQuery({
    queryKey: advKeys.duplicateQueue,
    queryFn: trustApi.duplicateQueue,
    enabled: enabled && !!token,
    retry: false,
  });
}

export function useProjectDuplicates(projectId: string, enabled = true) {
  const token = useAuthStore((s) => s.accessToken);
  return useQuery({
    queryKey: advKeys.projectDuplicates(projectId),
    queryFn: () => trustApi.projectDuplicates(projectId),
    enabled: enabled && !!token && !!projectId,
    retry: false,
  });
}

export function useReviewDuplicate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      flagId,
      confirm,
      note,
    }: {
      flagId: string;
      confirm: boolean;
      note?: string;
    }) => trustApi.reviewDuplicate(flagId, { confirm, note }),
    onSuccess: () => qc.invalidateQueries({ queryKey: advKeys.duplicateQueue }),
  });
}

/* ── Offers ───────────────────────────────────────────────────────────────── */

export function useMyOffers() {
  const token = useAuthStore((s) => s.accessToken);
  return useQuery({
    queryKey: advKeys.myOffers,
    queryFn: offersApi.mine,
    enabled: !!token,
    retry: false,
  });
}

export function useReceivedOffers() {
  const token = useAuthStore((s) => s.accessToken);
  return useQuery({
    queryKey: advKeys.receivedOffers,
    queryFn: offersApi.received,
    enabled: !!token,
    retry: false,
  });
}

export function useProjectOffers(projectId: string, enabled = true) {
  const token = useAuthStore((s) => s.accessToken);
  return useQuery({
    queryKey: advKeys.projectOffers(projectId),
    queryFn: () => offersApi.forProject(projectId),
    enabled: enabled && !!token && !!projectId,
    retry: false,
  });
}

export function useMyOfferOn(projectId: string, enabled = true) {
  const token = useAuthStore((s) => s.accessToken);
  return useQuery({
    queryKey: advKeys.myOfferOn(projectId),
    queryFn: () => offersApi.myOfferOn(projectId),
    enabled: enabled && !!token && !!projectId,
    retry: false,
  });
}

/** Public — counts only, safe without auth. */
export function useOfferSummary(projectId: string, enabled = true) {
  return useQuery({
    queryKey: advKeys.offerSummary(projectId),
    queryFn: () => offersApi.summary(projectId),
    enabled: enabled && !!projectId,
    retry: false,
  });
}

function useOfferMutation<TArgs>(fn: (args: TArgs) => Promise<unknown>, projectId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: advKeys.myOffers });
      qc.invalidateQueries({ queryKey: advKeys.receivedOffers });
      if (projectId) {
        qc.invalidateQueries({ queryKey: advKeys.projectOffers(projectId) });
        qc.invalidateQueries({ queryKey: advKeys.myOfferOn(projectId) });
        qc.invalidateQueries({ queryKey: advKeys.offerSummary(projectId) });
      }
    },
  });
}

export function useMakeOffer(projectId: string) {
  return useOfferMutation<{ amount_paise: number; message?: string }>(
    (data) => offersApi.create(projectId, data),
    projectId,
  );
}

export function useCounterOffer(projectId?: string) {
  return useOfferMutation<{ offerId: string; amount_paise: number; message?: string }>(
    ({ offerId, ...data }) => offersApi.counter(offerId, data),
    projectId,
  );
}

export function useAcceptOffer(projectId?: string) {
  return useOfferMutation<string>((offerId) => offersApi.accept(offerId), projectId);
}

export function useDeclineOffer(projectId?: string) {
  return useOfferMutation<{ offerId: string; message?: string }>(
    ({ offerId, message }) => offersApi.decline(offerId, message),
    projectId,
  );
}

export function useWithdrawPurchaseOffer(projectId?: string) {
  return useOfferMutation<string>((offerId) => offersApi.withdraw(offerId), projectId);
}

/* ── Bundles ──────────────────────────────────────────────────────────────── */

export function useBundles() {
  return useQuery({ queryKey: advKeys.bundles, queryFn: bundlesApi.list });
}

export function useMyBundles() {
  const token = useAuthStore((s) => s.accessToken);
  return useQuery({
    queryKey: advKeys.myBundles,
    queryFn: bundlesApi.mine,
    enabled: !!token,
    retry: false,
  });
}

export function useBundle(slug: string) {
  return useQuery({
    queryKey: advKeys.bundle(slug),
    queryFn: () => bundlesApi.get(slug),
    enabled: !!slug,
  });
}

export function useCreateBundle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: bundlesApi.create,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: advKeys.myBundles });
      qc.invalidateQueries({ queryKey: advKeys.bundles });
    },
  });
}

export function usePublishBundle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ bundleId, publish }: { bundleId: string; publish: boolean }) =>
      bundlesApi.setPublished(bundleId, publish),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: advKeys.myBundles });
      qc.invalidateQueries({ queryKey: advKeys.bundles });
    },
  });
}

export function useDeleteBundle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (bundleId: string) => bundlesApi.remove(bundleId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: advKeys.myBundles });
      qc.invalidateQueries({ queryKey: advKeys.bundles });
    },
  });
}

/* ── Teams ────────────────────────────────────────────────────────────────── */

/** Public — a project's co-owners are part of its credibility. */
export function useTeam(projectId: string, enabled = true) {
  return useQuery({
    queryKey: advKeys.team(projectId),
    queryFn: () => teamsApi.get(projectId),
    enabled: enabled && !!projectId,
    retry: false,
  });
}

export function useSetTeam(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (
      members: {
        user_id: string;
        revenue_share_bps: number;
        contribution?: string;
        role?: string;
      }[],
    ) => teamsApi.set(projectId, members),
    onSuccess: () => qc.invalidateQueries({ queryKey: advKeys.team(projectId) }),
  });
}

export function useRespondToTeamInvite(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (accept: boolean) => teamsApi.respond(projectId, accept),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: advKeys.team(projectId) });
      qc.invalidateQueries({ queryKey: advKeys.myMemberships });
    },
  });
}

export function useMyMemberships() {
  const token = useAuthStore((s) => s.accessToken);
  return useQuery({
    queryKey: advKeys.myMemberships,
    queryFn: teamsApi.myMemberships,
    enabled: !!token,
    retry: false,
  });
}

export function useMySplits() {
  const token = useAuthStore((s) => s.accessToken);
  return useQuery({
    queryKey: advKeys.mySplits,
    queryFn: teamsApi.mySplits,
    enabled: !!token,
    retry: false,
  });
}

/* ── Streaks + digest ─────────────────────────────────────────────────────── */

export function useMyStreak() {
  const token = useAuthStore((s) => s.accessToken);
  return useQuery({
    queryKey: advKeys.myStreak,
    queryFn: retentionApi.myStreak,
    enabled: !!token,
    retry: false,
  });
}

export function useMyStreakCalendar(weeks = 26) {
  const token = useAuthStore((s) => s.accessToken);
  return useQuery({
    queryKey: advKeys.myCalendar(weeks),
    queryFn: () => retentionApi.myCalendar(weeks),
    enabled: !!token,
    retry: false,
  });
}

/** Public — a builder's streak shows on their public profile. */
export function useUserStreak(userId: string, enabled = true) {
  return useQuery({
    queryKey: advKeys.userStreak(userId),
    queryFn: () => retentionApi.userStreak(userId),
    enabled: enabled && !!userId,
    retry: false,
  });
}

export function useUserStreakCalendar(userId: string, weeks = 26, enabled = true) {
  return useQuery({
    queryKey: advKeys.userCalendar(userId, weeks),
    queryFn: () => retentionApi.userCalendar(userId, weeks),
    enabled: enabled && !!userId,
    retry: false,
  });
}

export function useStreakLeaders(limit = 10) {
  return useQuery({
    queryKey: advKeys.streakLeaders(limit),
    queryFn: () => retentionApi.leaderboard(limit),
  });
}

export function useDigest(days = 7) {
  const token = useAuthStore((s) => s.accessToken);
  return useQuery({
    queryKey: advKeys.digest(days),
    queryFn: () => retentionApi.digest(days),
    enabled: !!token,
    retry: false,
  });
}

/* ── Institutions ─────────────────────────────────────────────────────────── */

export function useMyPartnerProfile() {
  const token = useAuthStore((s) => s.accessToken);
  return useQuery({
    queryKey: advKeys.partnerMe,
    queryFn: institutionsApi.me,
    enabled: !!token,
    retry: false,
  });
}

export function useCollegeDashboard(enabled = true) {
  const token = useAuthStore((s) => s.accessToken);
  return useQuery({
    queryKey: advKeys.partnerDashboard,
    queryFn: institutionsApi.dashboard,
    enabled: enabled && !!token,
    retry: false,
  });
}

export function useRegisterPartner() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: institutionsApi.register,
    onSuccess: () => qc.invalidateQueries({ queryKey: advKeys.partnerMe }),
  });
}

export function usePendingPartners(enabled = true) {
  const token = useAuthStore((s) => s.accessToken);
  return useQuery({
    queryKey: advKeys.pendingPartners,
    queryFn: institutionsApi.pending,
    enabled: enabled && !!token,
    retry: false,
  });
}

export function useVerifyPartner() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      partnerId,
      approve,
      note,
    }: {
      partnerId: string;
      approve: boolean;
      note?: string;
    }) => institutionsApi.verify(partnerId, { approve, note }),
    onSuccess: () => qc.invalidateQueries({ queryKey: advKeys.pendingPartners }),
  });
}

/* ── Employer verification requests ───────────────────────────────────────── */

export function useVerificationRequests() {
  const token = useAuthStore((s) => s.accessToken);
  return useQuery({
    queryKey: advKeys.verificationRequests,
    queryFn: verificationRequestsApi.list,
    enabled: !!token,
    retry: false,
  });
}

export function useVerificationRequest(id: string) {
  const token = useAuthStore((s) => s.accessToken);
  return useQuery({
    queryKey: advKeys.verificationRequest(id),
    queryFn: () => verificationRequestsApi.get(id),
    enabled: !!token && !!id,
    retry: false,
  });
}

export function useCreateVerificationRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: verificationRequestsApi.create,
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: advKeys.verificationRequests }),
  });
}

export function useFulfilVerificationRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      repo_full_name,
      note,
      githubToken,
    }: {
      id: string;
      repo_full_name: string;
      note?: string;
      githubToken: string;
    }) =>
      verificationRequestsApi.fulfil(id, { repo_full_name, note }, githubToken),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: advKeys.verificationRequests }),
  });
}

export function useDeclineVerificationRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, note }: { id: string; note?: string }) =>
      verificationRequestsApi.decline(id, note),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: advKeys.verificationRequests }),
  });
}

/* ── Comparison + similar ─────────────────────────────────────────────────── */

export function useComparison(projectIds: string[], enabled = true) {
  return useQuery({
    queryKey: advKeys.compare(projectIds),
    queryFn: () => discoveryApi.compare(projectIds),
    enabled: enabled && projectIds.length >= 2 && projectIds.length <= 3,
    retry: false,
  });
}

export function useSimilarProjects(projectId: string, limit = 6, enabled = true) {
  return useQuery({
    queryKey: advKeys.similar(projectId, limit),
    queryFn: () => discoveryApi.similar(projectId, limit),
    enabled: enabled && !!projectId,
    retry: false,
  });
}
