import type {
  DisputeStatus,
  EscrowContractStatus,
  MilestoneStatus,
} from "@/types";

/** Format paise (INR smallest unit) as a rupee string. */
export function rupees(paise: number): string {
  return "\u20b9" + (paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

type BadgeVariant = "default" | "secondary" | "success" | "warning" | "info" | "ghost" | "destructive";

export const contractStatusVariant: Record<EscrowContractStatus, BadgeVariant> = {
  draft: "ghost",
  awaiting_funding: "warning",
  active: "info",
  completed: "success",
  disputed: "destructive",
  cancelled: "ghost",
  refunded: "secondary",
};

export const milestoneStatusVariant: Record<MilestoneStatus, BadgeVariant> = {
  pending: "ghost",
  funded: "info",
  submitted: "warning",
  approved: "info",
  // Not "success": the amount is approved but the transfer hasn't happened yet,
  // and a green badge read as "paid".
  released: "info",
  rejected: "destructive",
  disputed: "destructive",
};

export const disputeStatusVariant: Record<DisputeStatus, BadgeVariant> = {
  open: "warning",
  resolved_release: "success",
  resolved_refund: "secondary",
  resolved_split: "info",
};

export function humanize(s: string): string {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Milestone labels written to match what actually happened.
 *
 * "released" is the backend's terminal state, but it only means the amount was
 * approved and recorded as owed — the bank transfer is a separate manual step.
 * Labelling it "Released" implied the builder had been paid.
 */
export const milestoneStatusLabel: Record<MilestoneStatus, string> = {
  pending: "Pending",
  funded: "Funded",
  submitted: "Awaiting review",
  approved: "Approved",
  released: "Approved · payout pending",
  rejected: "Changes requested",
  disputed: "Disputed",
};
