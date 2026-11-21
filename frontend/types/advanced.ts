/**
 * Types for the advanced feature set: trust receipts, health monitoring,
 * dependency audits, duplicate screening, offers, bundles, teams, streaks and
 * institutions.
 *
 * Kept in their own module rather than appended to `types/index.ts` — that file
 * is already 1000+ lines and these are a cohesive group.
 */

/* ── Trust receipts ───────────────────────────────────────────────────────── */

export interface TrustReceipt {
  id: string;
  receipt_code: string;
  payment_id: string;
  project_id: string;
  buyer_id: string;
  seller_id: string;

  amount_paise: number;
  platform_fee_paise: number | null;
  seller_net_paise: number | null;
  sale_type: string | null;
  sale_license: string | null;

  verified_build_score: number | null;
  was_verified: boolean;
  confidence: string | null;
  ownership_verified: boolean;
  hackathon_verified: boolean;
  components: Record<string, number | null>;
  fraud_flags: string[];
  commits_analyzed: number | null;
  contributors_count: number | null;
  repo_age_days: number | null;

  repo_full_name: string | null;
  project_title: string | null;
  stars: number | null;
  github_pushed_at: string | null;
  code_signals: Record<string, unknown>;
  risk_score: number | null;
  risk_band: string | null;

  issued_at: string;
}

/* ── Post-purchase health ─────────────────────────────────────────────────── */

export interface HealthReading {
  recorded_at: string;
  score: number | null;
  is_verified: boolean;
  confidence: string | null;
  components: Record<string, number | null>;
  fraud_flags: string[];
}

export interface HealthTrend {
  project_id: string;
  project_title: string | null;
  repo_full_name: string | null;
  baseline_score: number | null;
  latest_score: number | null;
  delta: number | null;
  direction: "up" | "down" | "flat" | "unknown";
  readings: number;
  last_checked_at: string | null;
  purchased_at: string;
  receipt_code: string | null;
  receipt_id: string | null;
  days_since_push: number | null;
  series: HealthReading[];
}

/* ── Dependency + licence audit ───────────────────────────────────────────── */

export type LicenceClass =
  | "permissive"
  | "weak_copyleft"
  | "strong_copyleft"
  | "non_commercial"
  | "unknown";

export interface DependencyFinding {
  package: string;
  version: string | null;
  kind: "licence" | "abandoned" | "vulnerability";
  severity: "low" | "moderate" | "high" | "critical";
  detail: string;
  licence: string | null;
  licence_class: LicenceClass | null;
  advisory_id: string | null;
  fixed_in: string | null;
  replacement: string | null;
}

export interface DependencyAudit {
  scanned: boolean;
  dependencies_scanned: number;
  manifests_read: string[];
  findings: DependencyFinding[];
  licence_summary: Record<string, number>;
  project_licence: string | null;
  project_licence_class: LicenceClass;
  counts: Record<string, number>;
  /** Where the advisory data came from. Never presented as a live feed. */
  advisory_source: string | null;
  /** Always false today — the UI must say so rather than imply a clean bill. */
  is_complete_scan: boolean;
}

/* ── Duplicate screening ──────────────────────────────────────────────────── */

export interface DuplicateSignal {
  signal: string;
  weight: number;
  detail: string;
}

export interface DuplicateFlag {
  id: string;
  project_id: string;
  matched_project_id: string;
  similarity: number;
  signals: DuplicateSignal[];
  status: "pending" | "confirmed" | "dismissed";
  review_note: string | null;
  reviewed_at: string | null;
  created_at: string;
  project_title: string | null;
  matched_project_title: string | null;
  matched_repo_full_name: string | null;
  matched_owner_name: string | null;
}

/* ── Purchase offers ──────────────────────────────────────────────────────── */

export type OfferStatus =
  | "pending"
  | "countered"
  | "accepted"
  | "declined"
  | "withdrawn"
  | "expired"
  | "completed";

export interface OfferRound {
  sequence: number;
  actor: "buyer" | "seller";
  action: "offer" | "counter" | "accept" | "decline" | "withdraw";
  amount_paise: number | null;
  message: string | null;
  created_at: string;
}

export interface PurchaseOffer {
  id: string;
  project_id: string;
  buyer_id: string;
  seller_id: string;
  list_price_paise: number;
  initial_offer_paise: number;
  current_offer_paise: number;
  awaiting: "buyer" | "seller";
  status: OfferStatus;
  buyer_message: string | null;
  seller_message: string | null;
  agreed_price_paise: number | null;
  expires_at: string | null;
  resolved_at: string | null;
  created_at: string;
  rounds: OfferRound[];
  project_title: string | null;
  buyer_name: string | null;
}

export interface OfferSummary {
  total_offers: number;
  open_offers: number;
  has_accepted: boolean;
}

/* ── Bundles ──────────────────────────────────────────────────────────────── */

export interface BundleItem {
  project_id: string;
  sequence: number;
  note: string | null;
  title: string | null;
  repo_full_name: string | null;
  primary_language: string | null;
  is_verified: boolean;
  verified_build_score: number | null;
  price_paise: number | null;
}

export interface ProjectBundle {
  id: string;
  owner_id: string;
  title: string;
  slug: string;
  description: string | null;
  price_paise: number;
  combined_list_price_paise: number;
  is_published: boolean;
  average_score: number | null;
  created_at: string;
  items: BundleItem[];
  owner_name: string | null;
  savings_paise: number;
}

/* ── Teams ────────────────────────────────────────────────────────────────── */

export interface TeamMember {
  id: string;
  project_id: string;
  user_id: string;
  revenue_share_bps: number;
  contribution: string | null;
  role: string;
  status: "pending" | "accepted" | "declined" | "removed";
  is_lead: boolean;
  created_at: string;
  display_name: string | null;
  avatar_url: string | null;
  github_username: string | null;
}

export interface Team {
  project_id: string;
  is_team_project: boolean;
  members: TeamMember[];
  total_bps: number;
  is_fully_accepted: boolean;
}

export interface SplitItem {
  project_id: string;
  project_title: string | null;
  amount_paise: number;
  revenue_share_bps: number;
  is_lead: boolean;
  created_at: string;
}

export interface MemberEarnings {
  total_paise: number;
  sales_count: number;
  items: SplitItem[];
}

export interface TeamMembership {
  project_id: string;
  project_title: string | null;
  revenue_share_bps: number;
  contribution: string | null;
  role: string;
  status: string;
  is_lead: boolean;
}

/* ── Streaks ──────────────────────────────────────────────────────────────── */

export interface StreakMilestone {
  days: number;
  label: string;
  blurb: string;
}

export interface Streak {
  current_streak_days: number;
  longest_streak_days: number;
  total_active_days: number;
  last_active_on: string | null;
  milestones: number[];
  milestone_details: StreakMilestone[];
  is_live: boolean;
  next_milestone: number | null;
  computed_at: string | null;
  /** False when no commit history is tracked — render "not tracked", not zero. */
  has_data: boolean;
}

export interface StreakCalendarDay {
  day: string;
  active: boolean;
}

export interface StreakLeader {
  user_id: string;
  display_name: string;
  current_streak_days: number;
  longest_streak_days: number;
  last_active_on: string | null;
}

/* ── Weekly digest ────────────────────────────────────────────────────────── */

export interface DigestItem {
  title: string | null;
  detail: string | null;
  link: string | null;
  project_id: string | null;
  score: number | null;
  delta: number | null;
  direction: string | null;
  views: number | null;
  status: string | null;
  kind: string | null;
}

export interface DigestSection {
  key: string;
  title: string;
  items: DigestItem[];
}

export interface Digest {
  window_days: number;
  generated_at: string;
  item_count: number;
  is_worth_sending: boolean;
  sections: DigestSection[];
}

/* ── Institutions ─────────────────────────────────────────────────────────── */

export interface CollegePartner {
  id: string;
  user_id: string;
  college_name: string;
  department: string | null;
  contact_name: string | null;
  contact_title: string | null;
  website_url: string | null;
  is_verified: boolean;
  verified_at: string | null;
  notes: string | null;
  created_at: string;
  contact_email: string | null;
}

export interface CollegeTopProject {
  project_id: string;
  title: string;
  score: number | null;
  builder_name: string;
  link: string;
}

export interface CollegeDashboard {
  college_name: string;
  department: string | null;
  is_verified: boolean;
  students_total: number;
  projects_total: number;
  verified_projects: number;
  total_earned_paise: number;
  avg_score: number | null;
  leaderboard_rank: number | null;
  leaderboard_total: number;
  top_projects: CollegeTopProject[];
  score_distribution: { band: string; count: number }[];
  cohort_too_small_for_averages: boolean;
  empty_reason: string | null;
}

/* ── Employer verification requests ───────────────────────────────────────── */

export interface VerificationReportComponent {
  key: string;
  label: string;
  weight: number;
  score: number | null;
  explains: string;
}

export interface VerificationReport {
  verified_build_score: number;
  confidence: string;
  reasoning: string;
  repo_age_days: number | null;
  commits_analyzed: number;
  contributors_count: number;
  fraud_flags: string[];
  components: VerificationReportComponent[];
  flags: { key: string; label?: string; severity?: string; explains?: string }[];
  threshold: number;
  meets_threshold: boolean;
  repo_is_private: boolean;
  generated_at: string;
}

export interface EmployerVerificationRequest {
  id: string;
  requester_id: string;
  builder_id: string;
  role_title: string;
  company: string | null;
  message: string;
  looking_for: string | null;
  status: "pending" | "fulfilled" | "declined" | "withdrawn" | "expired";
  repo_full_name: string | null;
  builder_note: string | null;
  report: VerificationReport | null;
  verified_build_score: number | null;
  report_code: string | null;
  fulfilled_at: string | null;
  expires_at: string | null;
  created_at: string;
  requester_name: string | null;
  builder_name: string | null;
}

/* ── Comparison + similar ─────────────────────────────────────────────────── */

export interface ComparisonComponent {
  key: string;
  label: string;
  weight: number;
  score: number | null;
}

export interface ComparisonProject {
  project_id: string;
  title: string;
  repo_full_name: string | null;
  primary_language: string | null;
  topics: string[];
  stage: string | null;
  is_verified: boolean;
  verified_build_score: number | null;
  confidence: string | null;
  fraud_flags: string[];
  commits_analyzed: number | null;
  contributors_count: number | null;
  repo_age_days: number | null;
  components: ComparisonComponent[];
  stars: number;
  forks: number;
  open_issues: number;
  is_for_sale: boolean;
  price_paise: number | null;
  health_score: number | null;
  completion_score: number | null;
  has_tests: boolean;
  has_ci: boolean;
  dependency_count: number | null;
  licence_class: LicenceClass | null;
}

export interface Comparison {
  component_spec: { key: string; label: string; weight: number; explains: string }[];
  projects: ComparisonProject[];
  component_leaders: Record<string, string | null>;
  overall_leader: string | null;
  threshold: number;
}

export interface SimilarProject {
  project_id: string;
  title: string;
  repo_full_name: string | null;
  primary_language: string | null;
  stage: string | null;
  is_verified: boolean;
  verified_build_score: number | null;
  is_for_sale: boolean;
  price_paise: number | null;
  stars: number;
  match_score: number;
  reasons: string[];
}
