// ── Auth ──────────────────────────────────────────────────────────────────────

export interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

export interface RegisterPayload {
  email: string;
  password: string;
  display_name: string;
  referral_code?: string;
  role?: string;
}

export interface LoginPayload {
  email: string;
  password: string;
  totp_code?: string;
}

// ── Users ─────────────────────────────────────────────────────────────────────

export type UserRole =
  | "builder"
  | "contributor"
  | "founder"
  | "mentor"
  | "incubator"
  | "admin";

export interface Profile {
  id: string;
  user_id: string;
  display_name: string;
  bio: string | null;
  avatar_url: string | null;
  github_username: string | null;
  location: string | null;
  college: string | null;
  graduation_year: number | null;
  linkedin_url: string | null;
  website_url: string | null;
  created_at: string;
}

export type BuilderTier = "newcomer" | "rising" | "trusted" | "elite";

export interface BuilderReputation {
  contribution_score: number;
  trust_score: number;
  collab_score: number;
  completion_score: number;
  total_projects: number;
  verified_projects: number;
  contracts_completed: number;
  contracts_total: number;
  revenue_earned_paise: number;
  avg_build_score: number | null;
  reputation_points: number;
  tier: BuilderTier;
}

export interface ReputationDetail extends BuilderReputation {
  badges: string[];
  delivery_rate: number | null;
  last_computed_at: string | null;
}

// ── Seller payout / KYC ─────────────────────────────────────────────────────

export type PayoutMethod = "upi" | "bank";

export interface PayoutDetail {
  method: PayoutMethod;
  upi_id: string | null;
  account_holder_name: string | null;
  account_number_masked: string | null;
  ifsc: string | null;
  pan_masked: string | null;
  is_verified: boolean;
}

export interface PayoutDetailInput {
  method: PayoutMethod;
  upi_id?: string | null;
  account_holder_name?: string | null;
  account_number?: string | null;
  ifsc?: string | null;
  pan?: string | null;
}

export interface LeaderboardEntry {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  college: string | null;
  tier: BuilderTier;
  reputation_points: number;
  verified_projects: number;
  contracts_completed: number;
}

// ── Delivery Reliability ────────────────────────────────────────────────────

export type DelayRisk = "low" | "medium" | "high";

export interface DeliveryPrediction {
  completion_probability: number;
  confidence: number;
  delay_risk: DelayRisk;
  realistic_timeline_days: number;
  promised_days: number;
  sample_size: number;
  rationale: string;
}

export interface DeliveryStats {
  builder_id: string;
  milestones_tracked: number;
  on_time_rate: number | null;
  avg_turnaround_days: number | null;
  contracts_completed: number;
  sample_size: number;
}

// ── Hackathon Authenticity ──────────────────────────────────────────────────

export type HackathonPlatform = "devfolio" | "unstop" | "mlh" | "other";
export type HackathonClaimStatus =
  | "pending" | "analyzed" | "verified" | "rejected" | "flagged";
export type HackathonVerdict =
  | "likely_authentic" | "needs_review" | "likely_inauthentic";

export interface HackathonSignalsSummary {
  commits_in_window: number;
  commits_before_event: number;
  commits_after_event: number;
  total_commits: number;
  confidence: string;
  flags: string[];
}

export interface HackathonClaim {
  id: string;
  project_id: string;
  claimed_by_id: string;
  event_name: string;
  event_url: string | null;
  platform: HackathonPlatform;
  event_start: string;
  event_end: string;
  proof_url: string | null;
  status: HackathonClaimStatus;
  authenticity_score: number | null;
  verdict: HackathonVerdict | null;
  signals: HackathonSignalsSummary | null;
  reasoning: string | null;
  review_notes: string | null;
  reviewed_at: string | null;
  created_at: string;
}

export interface HackathonClaimInput {
  project_id: string;
  event_name: string;
  event_url?: string;
  platform?: HackathonPlatform;
  event_start: string;
  event_end: string;
  proof_url?: string;
}

// ── Growth: referrals + campus ambassadors ──────────────────────────────────

export interface ReferredUser {
  user_id: string;
  display_name: string;
  joined_at: string;
}

export interface ReferralInfo {
  referral_code: string;
  referral_link: string;
  referred_count: number;
  is_campus_ambassador: boolean;
  recent_referrals: ReferredUser[];
}

export interface CollegeStanding {
  college: string;
  builder_count: number;
}

export interface AmbassadorStanding {
  user_id: string;
  display_name: string;
  college: string | null;
  referrals: number;
}

export interface CampusLeaderboard {
  colleges: CollegeStanding[];
  ambassadors: AmbassadorStanding[];
}

// ── Incubation ──────────────────────────────────────────────────────────────

export type OfferType = "incubation" | "mentorship" | "funding" | "acquisition";
export type OfferStatus = "pending" | "accepted" | "declined" | "withdrawn";

export interface IncubationOffer {
  id: string;
  incubator_id: string;
  project_id: string;
  offer_type: OfferType;
  title: string;
  message: string;
  amount_paise: number | null;
  equity_percent: number | null;
  status: OfferStatus;
  response_note: string | null;
  responded_at: string | null;
  created_at: string;
}

export interface OfferCreateInput {
  project_id: string;
  offer_type: OfferType;
  title: string;
  message: string;
  amount_paise?: number;
  equity_percent?: number;
}

export interface BuilderDirectoryEntry {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  college: string | null;
  bio: string | null;
  role: string;
  tier: BuilderTier;
  reputation_points: number;
  trust_score: number;
  verified_projects: number;
  contracts_completed: number;
}

export interface DiscoverProject {
  project_id: string;
  title: string;
  repo_full_name: string;
  owner_id: string;
  owner_name: string;
  owner_tier: BuilderTier;
  verified_build_score: number | null;
  startup_potential: number | null;
  stars: number;
}

export interface User {
  id: string;
  email: string;
  role: UserRole;
  is_verified: boolean;
  is_active: boolean;
  totp_enabled: boolean;
  created_at: string;
  profile: Profile | null;
  reputation: BuilderReputation | null;
}

export interface PublicUser {
  id: string;
  role: UserRole;
  profile: Profile | null;
  reputation: BuilderReputation | null;
}

// ── Projects ──────────────────────────────────────────────────────────────────

export type ProjectStage = "idea" | "prototype" | "mvp" | "production";
export type ProjectStatus = "active" | "dormant" | "archived" | "revived";
export type AnalysisStatus = "pending" | "running" | "completed" | "failed";
export type ContributorRequestStatus =
  | "pending"
  | "accepted"
  | "rejected"
  | "withdrawn";

export interface ProjectLanguage {
  language: string;
  bytes_count: number;
  percentage: number;
}

export interface RoadmapStep {
  step: number;
  title: string;
  description: string;
  priority: "high" | "medium" | "low";
}

export interface ProjectAnalysis {
  id: string;
  status: AnalysisStatus;
  health_score: number | null;
  completion_score: number | null;
  startup_potential: number | null;
  impact_potential: number | null;
  missing_features: string[];
  technical_debt_summary: string | null;
  roadmap_steps: { steps: RoadmapStep[] } | null;
  contributor_recommendations: string[];
  reasoning: string | null;
  model_used: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProjectVerification {
  verified_build_score: number | null;
  ownership_verified: boolean;
  hackathon_verified: boolean;
  originality_score: number | null;
  repo_age_days: number | null;
  activity_consistency: number | null;
  verified_at: string | null;
}

export interface ProjectDelivery {
  delivery_url: string | null;
  delivery_instructions: string | null;
  sale_license: string | null;
  has_delivery: boolean;
}

export interface Project {
  id: string;
  owner_id: string;
  github_repo_id: number;
  repo_full_name: string;
  title: string;
  description: string | null;
  homepage_url: string | null;
  stage: ProjectStage;
  status: ProjectStatus;
  stars: number;
  forks: number;
  open_issues: number;
  primary_language: string | null;
  topics: string[];
  is_seeking_contributors: boolean;
  is_featured: boolean;
  is_verified: boolean;
  progress_percent: number;
  // Adoption
  is_open_for_adoption: boolean;
  previous_owner_id: string | null;
  adopted_at: string | null;
  // Pricing
  is_for_sale: boolean;
  price_paise: number | null;
  price_label: string | null;
  sale_type: string | null;
  startup_report_unlocked: boolean;
  pitch_deck_unlocked: boolean;
  /** "clear" | "review" | "withheld" — set by the import-time duplicate screen. */
  duplicate_status?: string | null;
  has_access: boolean;
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
  owner?: PublicUser | null;
  analysis?: ProjectAnalysis | null;
  verification?: ProjectVerification | null;
  languages?: ProjectLanguage[];
}

export interface ProjectUpdateInput {
  title?: string;
  description?: string | null;
  stage?: ProjectStage;
  is_seeking_contributors?: boolean;
  status?: ProjectStatus;
  is_for_sale?: boolean;
  price_paise?: number | null;
  price_label?: string | null;
  sale_type?: string | null;
  delivery_url?: string | null;
  delivery_instructions?: string | null;
  sale_license?: string | null;
}

export interface ProjectListItem {
  id: string;
  repo_full_name: string;
  title: string;
  description: string | null;
  stage: ProjectStage;
  status: ProjectStatus;
  stars: number;
  forks: number;
  primary_language: string | null;
  topics: string[];
  is_seeking_contributors: boolean;
  is_verified: boolean;
  is_featured: boolean;
  is_open_for_adoption: boolean;
  is_for_sale: boolean;
  price_paise: number | null;
  sale_type: string | null;
  created_at: string;
  health_score: number | null;
  startup_potential: number | null;
}

export interface PaginatedProjects {
  items: ProjectListItem[];
  total: number;
  page: number;
  per_page: number;
  pages: number;
}

export interface ContributorRequest {
  id: string;
  project_id: string;
  requester_id: string;
  status: ContributorRequestStatus;
  message: string | null;
  skills_offered: string[];
  created_at: string;
  resolved_at: string | null;
  requester?: PublicUser | null;
}

// ── GitHub ────────────────────────────────────────────────────────────────────

export interface GitHubRepo {
  id: number;
  full_name: string;
  name: string;
  description: string | null;
  language: string | null;
  stars: number;
  forks: number;
  private: boolean;
  pushed_at: string | null;
  topics: string[];
  html_url: string;
}

// ── Payments ──────────────────────────────────────────────────────────────────

export type PaymentType =
  | "project_access"
  | "premium_listing"
  | "ai_audit"
  | "startup_report"
  | "featured_placement"
  | "recruiter_pro"
  | "incubator_pro"
  | "pitch_deck";

export type SubscriptionPlan = "recruiter_pro" | "incubator_pro";

export interface Subscription {
  plan: SubscriptionPlan | null;
  expires_at: string | null;
  is_active: boolean;
}

export interface ContactInfo {
  unlocked: boolean;
  email: string | null;
  github_username: string | null;
  linkedin_url: string | null;
  website_url: string | null;
}

export type PaymentStatus = "created" | "paid" | "failed" | "refunded";

export interface Payment {
  id: string;
  order_id: string;
  payment_type: PaymentType;
  amount_paise: number;
  currency: string;
  status: PaymentStatus;
  created_at: string;
}

export interface CreateOrderResponse {
  order_id: string;
  cf_order_token: string;
  amount_paise: number;
  currency: string;
  payment_type: PaymentType;
}

// ── Seller earnings ─────────────────────────────────────────────────────────

export interface SaleItem {
  payment_id: string;
  project_id: string | null;
  project_title: string;
  buyer_name: string;
  amount_paise: number;
  platform_fee_paise: number;
  seller_net_paise: number;
  created_at: string;
}

export interface SellerEarnings {
  total_sales: number;
  gross_paise: number;
  platform_fee_paise: number;
  net_paise: number;
  settled_paise: number;
  pending_payout_paise: number;
  payout_configured: boolean;
  payout_verified: boolean;
  sales: SaleItem[];
}

export interface SettlementItem {
  id: string;
  amount_paise: number;
  method: string;
  reference: string | null;
  note: string | null;
  status: string;
  created_at: string;
}

// ── Bug-risk assessment ─────────────────────────────────────────────────────

export type RiskBand = "low" | "moderate" | "elevated" | "high";
export type RiskSeverity = "high" | "medium" | "low";

export interface RiskFactor {
  label: string;
  points: number;
  detail: string;
}

export interface RiskArea {
  area: string;
  severity: RiskSeverity;
  reason: string;
}

export interface CodeSignals {
  file_count: number | null;
  source_file_count: number | null;
  test_file_count: number | null;
  has_tests: boolean | null;
  has_ci: boolean | null;
  has_docker: boolean | null;
  has_lockfile: boolean | null;
  has_readme: boolean | null;
  has_license: boolean | null;
  dependency_count: number | null;
}

export interface RiskAssessment {
  risk_score: number;
  band: RiskBand;
  confidence: "low" | "medium" | "high";
  summary: string;
  factors: RiskFactor[];
  risk_areas: RiskArea[];
  code_reviewed: boolean;
  code_signals: CodeSignals | null;
  /** Dependency + licence audit, delivered inside this report by design. */
  dependency_audit: DependencyAudit | null;
}

// `DependencyAudit` is declared in ./advanced and re-exported at the bottom of
// this file; imported here so `RiskAssessment` above can reference it.
import type { DependencyAudit } from "@/types/advanced";

// ── Project timeline ────────────────────────────────────────────────────────

export type ProjectEventType =
  | "created"
  | "progress_update"
  | "milestone"
  | "verified"
  | "hackathon_verified"
  | "analysis_completed"
  | "contributor_joined"
  | "adopted"
  | "listed_for_sale"
  | "sold"
  | "stage_changed";

export interface TimelineEvent {
  id: string;
  event_type: ProjectEventType;
  title: string;
  description: string | null;
  progress_percent: number | null;
  is_manual: boolean;
  actor_id: string | null;
  actor_name: string | null;
  created_at: string;
}

export interface TimelineEventPayload {
  title: string;
  description?: string;
  progress_percent?: number;
  is_milestone?: boolean;
}

// ── Contributor matching ────────────────────────────────────────────────────

export interface ContributorMatch {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  college: string | null;
  tier: string;
  match_score: number;
  skill_fit: number;
  reliability: number;
  track_record: number;
  collaboration: number;
  matched_skills: string[];
  missing_skills: string[];
  reasons: string[];
}

// ── AI pitch deck ───────────────────────────────────────────────────────────

/** Slide layout kind. Computed kinds are built from DB rows, never AI-written. */
export type PitchSlideKind = "cover" | "narrative" | "score" | "traction" | "ask";

export interface PitchScoreComponent {
  label: string;
  weight: number;
  score: number | null;
  contribution: number | null;
}

export interface PitchTractionMetric {
  label: string;
  value: string;
  has_data: boolean;
}

/** Payload attached to computed slides. Shape varies by `kind`. */
export interface PitchSlideData {
  // cover
  builder?: string;
  college?: string | null;
  repo?: string;
  score?: number | null;
  is_verified?: boolean;
  stage?: string;
  language?: string | null;
  // score
  scored?: boolean;
  threshold?: number;
  confidence?: string | null;
  components?: PitchScoreComponent[];
  flags?: string[];
  commits_analyzed?: number | null;
  contributors_count?: number | null;
  repo_age_days?: number | null;
  // traction
  metrics?: PitchTractionMetric[];
  pre_traction?: boolean;
  // ask
  basis?: string[];
  listing_paise?: number;
  median_contract_paise?: number;
}

export interface PitchDeckSlide {
  /** Absent on decks generated before layouts existed; treat as "narrative". */
  kind?: PitchSlideKind;
  title: string;
  headline: string;
  bullets: string[];
  speaker_note: string;
  data?: PitchSlideData;
}

export interface PitchDeck {
  status: "pending" | "running" | "completed" | "failed";
  tagline: string | null;
  slides: PitchDeckSlide[];
  model_used: string | null;
  generated_at: string | null;
  error_message: string | null;
}

// ── Project adoption (ownership transfer) ───────────────────────────────────

export type AdoptionStatus = "pending" | "approved" | "rejected" | "withdrawn";

export interface AdoptionRequest {
  id: string;
  project_id: string;
  requester_id: string;
  message: string;
  continuation_plan: string | null;
  status: AdoptionStatus;
  resolution_note: string | null;
  resolved_at: string | null;
  created_at: string;
  requester?: PublicUser | null;
}

export interface AdoptionRequestPayload {
  message: string;
  continuation_plan?: string;
}

// ── Moderation / reports ────────────────────────────────────────────────────

export type ReportReason =
  | "plagiarism"
  | "copied_repo"
  | "fake_hackathon"
  | "spam"
  | "misleading"
  | "inappropriate"
  | "other";

export type ReportStatus = "open" | "resolved" | "dismissed";

export interface ReportCreatePayload {
  target_type?: "project" | "user" | "review";
  target_id: string;
  reason: ReportReason;
  details?: string;
}

export interface Report {
  id: string;
  reporter_id: string;
  target_type: string;
  target_id: string;
  reason: ReportReason;
  details: string | null;
  status: ReportStatus;
  action_taken: string | null;
  resolution_note: string | null;
  resolved_at: string | null;
  created_at: string;
}

// ── Build Requests (build-for-me) ───────────────────────────────────────────

export type BuildRequestStatus = "open" | "in_progress" | "completed" | "cancelled";
export type BuildApplicationStatus = "pending" | "accepted" | "rejected" | "withdrawn";

export interface BuildApplication {
  id: string;
  request_id: string;
  builder_id: string;
  cover_note: string;
  quoted_paise: number | null;
  estimated_days: number | null;
  status: BuildApplicationStatus;
  created_at: string;
  builder?: PublicUser | null;
}

export interface BuildRequestListItem {
  id: string;
  poster_id: string;
  title: string;
  description: string;
  budget_paise: number;
  skills: string[];
  timeline_days: number | null;
  status: BuildRequestStatus;
  created_at: string;
  application_count: number;
}

export interface BuildRequest extends BuildRequestListItem {
  assigned_builder_id: string | null;
  completed_at: string | null;
  poster?: PublicUser | null;
  my_application?: BuildApplication | null;
}

export interface BuildRequestCreatePayload {
  title: string;
  description: string;
  budget_paise: number;
  skills?: string[];
  timeline_days?: number;
}

export interface BuildApplicationCreatePayload {
  cover_note: string;
  quoted_paise?: number;
  estimated_days?: number;
}

// ── API errors ────────────────────────────────────────────────────────────────

export interface ApiError {
  error: string;
  message: string;
}

// ── Verified Build Score™ ───────────────────────────────────────────────────

export type ScoreConfidence = "low" | "medium" | "high";

/** One of the six weighted components of the composite score. */
export interface ScoreComponent {
  key: string;
  label: string;
  /** 0..1 — share of the composite this component can influence. */
  weight: number;
  /** 0..100, or null when this component predates breakdown persistence. */
  score: number | null;
  /** weight x score — the points this component actually contributed. */
  contribution: number | null;
  explains: string;
}

export interface ScoreFlag {
  key: string;
  label: string;
  severity: "critical" | "warning";
  /** Points subtracted from the composite. 0 means informational only. */
  penalty: number;
  explains: string;
}

export interface BuildScore {
  project_id: string;
  verified_build_score: number | null;
  originality_score: number | null;
  activity_consistency: number | null;
  repo_age_days: number | null;
  ownership_verified: boolean;
  hackathon_verified: boolean;
  is_verified: boolean;
  reasoning: string | null;
  verified_at: string | null;

  // Explainability — see GET /verification/methodology for the rulebook.
  confidence: ScoreConfidence | null;
  components: ScoreComponent[];
  flags: ScoreFlag[];
  total_penalty: number;
  verified_threshold: number;
  commits_analyzed: number | null;
  contributors_count: number | null;
  breakdown_available: boolean;
}

// ── Public surface (no auth required) ────────────────────────────────────────

export interface PlatformStats {
  projects_total: number;
  projects_verified: number;
  projects_for_sale: number;
  builders_total: number;
  colleges_represented: number;
  /** Settled payments plus escrow funding, in paise. */
  transacted_paise: number;
  payments_settled: number;
  escrow_contracts: number;
  released_to_builders_paise: number;
  avg_verified_score: number | null;
  highest_score: number | null;
  verified_last_30_days: number;
  generated_at: string;
}

export interface BadgeSnippets {
  project_id: string;
  score: number | null;
  is_verified: boolean;
  badge_url: string;
  report_url: string;
  markdown: string;
  html: string;
  restructured_text: string;
}

export interface PublicReportOwner {
  id: string;
  display_name: string;
  college: string | null;
  avatar_url: string | null;
  github_username: string | null;
  tier: BuilderTier | null;
  reputation_points: number | null;
  verified_projects: number | null;
}

export interface PublicReport {
  project_id: string;
  title: string;
  description: string | null;
  repo_full_name: string;
  repo_url: string;
  homepage_url: string | null;
  primary_language: string | null;
  topics: string[];
  stars: number;
  stage: string;
  status: string;

  is_verified: boolean;
  verified_build_score: number | null;
  verified_threshold: number;
  confidence: ScoreConfidence | null;
  ownership_verified: boolean;
  hackathon_verified: boolean;
  repo_age_days: number | null;
  commits_analyzed: number | null;
  contributors_count: number | null;
  verified_at: string | null;
  reasoning: string | null;

  components: ScoreComponent[];
  flags: ScoreFlag[];
  total_penalty: number;
  breakdown_available: boolean;

  is_for_sale: boolean;
  price_paise: number | null;
  price_label: string | null;

  owner: PublicReportOwner;
  badge_url: string;
  report_url: string;
}

// ── Analytics, score history, pipeline ───────────────────────────────────────

export interface SeriesPoint {
  day: string;
  value: number;
}

export interface TopProjectViews {
  project_id: string;
  title: string;
  views: number;
}

export interface BuilderAnalytics {
  window_days: number;
  views_total: number;
  /** Owner's own views, excluded from views_total. */
  views_owner_excluded: number;
  views_series: SeriesPoint[];
  earnings_window_paise: number;
  earnings_series: SeriesPoint[];
  lifetime_sales_paise: number;
  sales_count: number;
  escrow_released_paise: number;
  projects_total: number;
  offers_received: number;
  contributor_requests: number;
  conversations_started: number;
  top_projects: TopProjectViews[];
}

export interface ScoreSnapshot {
  recorded_at: string;
  verified_build_score: number | null;
  confidence: ScoreConfidence | null;
  is_verified: boolean;
  fraud_flags: string[];
}

export interface SavedSearchFilters {
  search?: string | null;
  language?: string | null;
  stage?: string | null;
  verified_only?: boolean;
  for_sale?: boolean;
  seeking_contributors?: boolean;
  min_score?: number | null;
  max_price_paise?: number | null;
}

export interface SavedSearch {
  id: string;
  name: string;
  filters: SavedSearchFilters;
  alerts_enabled: boolean;
  last_checked_at: string | null;
  last_match_count: number;
  created_at: string;
}

export interface ShortlistProjectSummary {
  id: string;
  title: string;
  repo_full_name: string;
  is_verified: boolean;
  is_for_sale: boolean;
  price_paise: number | null;
  primary_language: string | null;
}

export interface ShortlistEntry {
  id: string;
  project_id: string;
  note: string | null;
  stage: string | null;
  created_at: string;
  project: ShortlistProjectSummary | null;
}

export interface BuyerBrief {
  summary: string;
  good_for: string[];
  watch_outs: string[];
  verdict: string;
  model_used: string | null;
  generated_at: string | null;
}

// ── Landing page showcase (seed-backed) ──────────────────────────────────────

export interface ShowcaseTestimonial {
  id: string;
  headline: string;
  body: string;
  overall_score: number;
  reviewer_name: string;
  reviewer_role: string;
  reviewer_id: string;
  project_id: string;
  project_title: string;
}

export interface ShowcaseCampusRow {
  college: string;
  builders: number;
  verified_projects: number;
  total_points: number;
}

export interface ShowcaseProject {
  id: string;
  title: string;
  repo_full_name: string;
  description: string | null;
  verified_build_score: number | null;
  confidence: ScoreConfidence | null;
  is_verified: boolean;
  price_paise: number | null;
  is_for_sale: boolean;
  owner_name: string;
  owner_college: string | null;
  components: ScoreComponent[];
  flags: ScoreFlag[];
  total_penalty: number;
  verified_threshold: number;
  commits_analyzed: number | null;
  contributors_count: number | null;
}

export interface Showcase {
  featured: ShowcaseProject | null;
  testimonials: ShowcaseTestimonial[];
  campus: ShowcaseCampusRow[];
}

// ── Mentors ──────────────────────────────────────────────────────────────────

export interface MentorChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
}

export interface ImprovementComponent {
  key: string;
  label: string;
  score: number;
  weight: number;
  /** Composite points still recoverable from this component. */
  points_available: number;
  explains: string;
}

export interface ImprovementPlan {
  verified_build_score: number | null;
  verified_threshold: number;
  is_verified: boolean;
  points_needed: number;
  weakest: ImprovementComponent[];
  suggested_questions: string[];
}

export interface Mentor {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  headline: string;
  bio: string;
  focus_areas: string[];
  years_experience: number | null;
  company: string | null;
  rate_paise_per_hour: number | null;
  is_accepting: boolean;
  sessions_completed: number;
}

export type MentorSessionStatus =
  | "pending" | "accepted" | "declined" | "completed" | "cancelled";

export interface MentorSession {
  id: string;
  mentor_id: string;
  builder_id: string;
  project_id: string | null;
  topic: string;
  message: string;
  status: MentorSessionStatus;
  mentor_reply: string | null;
  responded_at: string | null;
  created_at: string;
}

export interface ScoringMethodology {
  verified_threshold: number;
  components: Array<Pick<ScoreComponent, "key" | "label" | "weight" | "explains">>;
  flags: ScoreFlag[];
  disqualifying_flags: string[];
  notes: string;
}

// ── Escrow ────────────────────────────────────────────────────────────────────

export type EscrowContractStatus =
  | "draft"
  | "awaiting_funding"
  | "active"
  | "completed"
  | "disputed"
  | "cancelled"
  | "refunded";

export type MilestoneStatus =
  | "pending"
  | "funded"
  | "submitted"
  | "approved"
  | "released"
  | "rejected"
  | "disputed";

export type EscrowEntryType = "fund" | "release" | "commission" | "refund";

export type DisputeStatus =
  | "open"
  | "resolved_release"
  | "resolved_refund"
  | "resolved_split";

export interface Milestone {
  id: string;
  sequence: number;
  title: string;
  description: string | null;
  amount_paise: number;
  status: MilestoneStatus;
  proof_url: string | null;
  proof_note: string | null;
  due_date: string | null;
  submitted_at: string | null;
  approved_at: string | null;
  released_at: string | null;
}

export interface LedgerEntry {
  id: string;
  entry_type: EscrowEntryType;
  amount_paise: number;
  note: string | null;
  milestone_id: string | null;
  created_at: string;
}

export interface Dispute {
  id: string;
  milestone_id: string | null;
  raised_by_id: string;
  reason: string;
  status: DisputeStatus;
  resolution_note: string | null;
  resolved_at: string | null;
  created_at: string;
}

export interface EscrowContract {
  id: string;
  client_id: string;
  builder_id: string;
  project_id: string | null;
  title: string;
  description: string | null;
  total_amount_paise: number;
  currency: string;
  commission_bps: number;
  status: EscrowContractStatus;
  funded_at: string | null;
  completed_at: string | null;
  created_at: string;
  milestones: Milestone[];
}

export interface EscrowContractDetail extends EscrowContract {
  ledger_entries: LedgerEntry[];
  disputes: Dispute[];
}

export interface FundingResponse {
  contract_id: string;
  order_id: string | null;
  cf_order_token: string | null;
  amount_paise: number;
  dev_mode: boolean;
}

export interface MilestoneCreateInput {
  title: string;
  description?: string;
  amount_paise: number;
  due_date?: string;
}

export interface ContractCreateInput {
  builder_id: string;
  project_id?: string;
  title: string;
  description?: string;
  commission_bps?: number;
  milestones: MilestoneCreateInput[];
}


// ── Advanced features ─────────────────────────────────────────────────────────
// Re-exported so `@/types` remains the single import site even though the
// definitions live in their own module.
export type * from "@/types/advanced";
