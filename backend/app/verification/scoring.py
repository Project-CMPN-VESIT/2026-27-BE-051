"""
Verified Build Score™ — deterministic scoring engine.

This module is INTENTIONALLY pure: no network, no DB, no framework imports.
It takes a plain `BuildSignals` dataclass (collected elsewhere from the GitHub
API) and returns a `BuildScoreResult` with component sub-scores, a composite
Verified Build Score, a confidence level, and any fraud flags.

Design principles:
  * Deterministic and explainable. Every sub-score has a documented formula so
    a builder can be told exactly why they scored what they did.
  * No "fake AI". Scores are derived from observable repository signals. The
    only proxy is `originality` (real code-similarity scanning is a later,
    separate subsystem — see ORIGINALITY note below).
  * Honest about missing data. When a signal is unavailable, confidence drops
    rather than the score being silently inflated.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from statistics import pstdev


# ── Inputs ──────────────────────────────────────────────────────────────────

@dataclass
class BuildSignals:
    """Raw signals gathered from the GitHub API for a single repository."""

    # Repo metadata
    repo_created_at: datetime | None = None
    repo_pushed_at: datetime | None = None
    is_fork: bool = False
    has_license: bool = False
    has_description: bool = False
    topics_count: int = 0
    stars: int = 0
    forks: int = 0
    open_issues: int = 0

    # Documentation
    readme_length: int = 0  # characters of rendered README

    # Commit history (author dates, UTC). May be a truncated window (e.g. last 100).
    commit_dates: list[datetime] = field(default_factory=list)
    commit_history_complete: bool = False  # True if commit_dates covers the whole repo

    # Contributors
    contributors_count: int = 0
    top_contributor_share: float = 0.0  # fraction of commits by the single top contributor (0..1)

    # External proof / verification (passed through from other subsystems)
    ownership_verified: bool = False
    hackathon_verified: bool = False

    # Bookkeeping
    signals_available: bool = True  # False when the GitHub fetch failed entirely


# ── Outputs ─────────────────────────────────────────────────────────────────

@dataclass
class BuildScoreResult:
    verified_build_score: int              # 0-100 composite
    repo_maturity_score: int               # 0-100
    commit_cadence_score: int              # 0-100
    contributor_authenticity_score: int    # 0-100
    documentation_score: int               # 0-100
    activity_consistency_score: int        # 0-100
    originality_score: int                 # 0-100 (proxy)
    confidence: str                        # "low" | "medium" | "high"
    fraud_flags: list[str]
    reasoning: str
    repo_age_days: int | None

    # Evidence the score was drawn from, carried through for display.
    commits_analyzed: int = 0
    contributors_count: int = 0

    def as_verification_fields(self) -> dict:
        """Map the full result onto the ProjectVerification columns.

        Every component is persisted, not just the composite. The score is only
        defensible if a reader can see which parts produced it, so discarding
        four of the six components would make the panel unexplainable.
        """
        return {
            "verified_build_score": self.verified_build_score,
            "originality_score": self.originality_score,
            "activity_consistency": self.activity_consistency_score,
            "repo_age_days": self.repo_age_days,
            "repo_maturity_score": self.repo_maturity_score,
            "commit_cadence_score": self.commit_cadence_score,
            "contributor_authenticity_score": self.contributor_authenticity_score,
            "documentation_score": self.documentation_score,
            "confidence": self.confidence,
            "fraud_flags": list(self.fraud_flags),
            "commits_analyzed": self.commits_analyzed,
            "contributors_count": self.contributors_count,
        }


# ── Weights ───────────────────────────────────────────────────────────────────
# Sum to 1.0. Tuned so that ownership + genuine, sustained activity dominate,
# while raw popularity (stars) contributes little (easy to game).
_WEIGHTS = {
    "repo_maturity": 0.15,
    "commit_cadence": 0.20,
    "contributor_authenticity": 0.15,
    "documentation": 0.15,
    "activity_consistency": 0.20,
    "originality": 0.15,
}

VERIFIED_THRESHOLD = 70  # composite >= this AND ownership_verified => is_verified

# Penalties subtracted from the weighted composite when a serious flag fires.
FRAUD_PENALTIES: dict[str, int] = {
    "forked_repo": 20,
    "single_burst_commits": 25,
    "no_commit_history": 20,
    "stale_low_activity": 15,
}

# Flags that block "verified" status outright, regardless of the composite.
DISQUALIFYING_FLAGS = frozenset({"forked_repo", "single_burst_commits", "no_commit_history"})


# ── Public, self-describing spec ──────────────────────────────────────────────
# Served by the API so the UI renders the real weights and the real explanations
# instead of duplicating them. If a weight changes here, the product's
# "Why this score?" panel changes with it and cannot drift out of sync.

COMPONENT_SPEC: tuple[dict, ...] = (
    {
        "key": "repo_maturity",
        "field": "repo_maturity_score",
        "label": "Repo maturity",
        "weight": _WEIGHTS["repo_maturity"],
        "explains": "How long the repository has existed, balanced against how recently it was touched. A repo created yesterday has no track record; one abandoned two years ago has a stale one.",
    },
    {
        "key": "commit_cadence",
        "field": "commit_cadence_score",
        "label": "Commit cadence",
        "weight": _WEIGHTS["commit_cadence"],
        "explains": "Volume of commits and how many distinct days they land on. A single 'initial commit' scores poorly; steady work over weeks scores well.",
    },
    {
        "key": "contributor_authenticity",
        "field": "contributor_authenticity_score",
        "label": "Contributor authenticity",
        "weight": _WEIGHTS["contributor_authenticity"],
        "explains": "How many genuine contributors touched the code. Solo work is not penalised heavily — plenty of strong student projects are solo — but multiple real contributors are harder to fake.",
    },
    {
        "key": "documentation",
        "field": "documentation_score",
        "label": "Documentation",
        "weight": _WEIGHTS["documentation"],
        "explains": "README depth plus description, licence and topics. The cheapest and strongest signal that a project is real and usable by someone else.",
    },
    {
        "key": "activity_consistency",
        "field": "activity_consistency",
        "label": "Activity consistency",
        "weight": _WEIGHTS["activity_consistency"],
        "explains": "How evenly the commits spread across the project's active life, measured by variation in the gaps between commit days. One overnight burst scores low.",
    },
    {
        "key": "originality",
        "field": "originality_score",
        "label": "Originality (proxy)",
        "weight": _WEIGHTS["originality"],
        "explains": "A deliberately capped proxy. Real originality needs code-similarity scanning against a corpus, which is not implemented — so this is inferred from fork status, description and README, and can never exceed 90.",
    },
)

FLAG_SPEC: dict[str, dict] = {
    "ownership_unverified": {
        "label": "Ownership not verified",
        "severity": "warning",
        "penalty": 0,
        "explains": "The builder has not proved they control this GitHub account. The score stands, but the project cannot reach verified status.",
    },
    "forked_repo": {
        "label": "Repository is a fork",
        "severity": "critical",
        "penalty": FRAUD_PENALTIES["forked_repo"],
        "explains": "The repository is a fork of someone else's work, so the code is derivative by definition.",
    },
    "no_commit_history": {
        "label": "No commit history",
        "severity": "critical",
        "penalty": FRAUD_PENALTIES["no_commit_history"],
        "explains": "No commits could be read, so there is no evidence of how or when the code was written.",
    },
    "missing_or_thin_readme": {
        "label": "Missing or thin README",
        "severity": "warning",
        "penalty": 0,
        "explains": "Under 100 characters of README. Lowers the documentation component but is not treated as fraud on its own.",
    },
    "single_burst_commits": {
        "label": "Entire history in one burst",
        "severity": "critical",
        "penalty": FRAUD_PENALTIES["single_burst_commits"],
        "explains": "The complete commit history lands inside a single day, which is the signature of a code dump or back-dated import rather than sustained work.",
    },
    "stale_low_activity": {
        "label": "Old repo, almost no activity",
        "severity": "warning",
        "penalty": FRAUD_PENALTIES["stale_low_activity"],
        "explains": "Older than six months with fewer than three commits — typically a placeholder or a squatted repository name.",
    },
    "signals_unavailable": {
        "label": "GitHub signals unavailable",
        "severity": "warning",
        "penalty": 0,
        "explains": "The repository could not be read from GitHub, so no score could be computed.",
    },
}


def _clamp(value: float, lo: int = 0, hi: int = 100) -> int:
    return int(max(lo, min(hi, round(value))))


def _now() -> datetime:
    return datetime.now(timezone.utc)


# ── Sub-score computations ────────────────────────────────────────────────────

def _repo_age_days(signals: BuildSignals) -> int | None:
    if not signals.repo_created_at:
        return None
    created = signals.repo_created_at
    if created.tzinfo is None:
        created = created.replace(tzinfo=timezone.utc)
    return max(0, (_now() - created).days)


def score_repo_maturity(signals: BuildSignals, age_days: int | None) -> int:
    """
    Older repositories with recent activity are more trustworthy than brand-new
    ones. A repo created yesterday can't have a track record. But age alone is
    not enough — a repo untouched for years is penalised via recency.
    """
    if age_days is None:
        return 0

    # Age component: ramps to full credit around ~1 year.
    age_component = min(1.0, age_days / 365.0)

    # Recency component: how recently was it pushed relative to now.
    recency_component = 1.0
    if signals.repo_pushed_at:
        pushed = signals.repo_pushed_at
        if pushed.tzinfo is None:
            pushed = pushed.replace(tzinfo=timezone.utc)
        days_since_push = max(0, (_now() - pushed).days)
        # Full credit within 30 days, decaying to ~0 by ~1 year of inactivity.
        recency_component = max(0.0, 1.0 - (days_since_push / 365.0))

    return _clamp(100 * (0.5 * age_component + 0.5 * recency_component))


def score_commit_cadence(signals: BuildSignals) -> int:
    """
    Rewards a meaningful volume of commits spread over time. A single giant
    'initial commit' scores poorly; steady development scores well.
    """
    commits = signals.commit_dates
    n = len(commits)
    if n == 0:
        return 0

    # Volume: diminishing returns; ~40+ commits earns near-full volume credit.
    volume_component = min(1.0, n / 40.0)

    # Span: how many distinct days had commits (proxy for sustained work).
    distinct_days = len({c.date() for c in commits})
    span_component = min(1.0, distinct_days / 20.0)

    return _clamp(100 * (0.5 * volume_component + 0.5 * span_component))


def score_contributor_authenticity(signals: BuildSignals) -> int:
    """
    A repo with multiple genuine contributors is harder to fake than a solo dump.
    We reward contributor count but do NOT punish legitimate solo builders too
    hard (many great student projects are solo). Heavy concentration combined
    with almost no history is what looks suspicious (handled in fraud flags).
    """
    count = max(signals.contributors_count, 0)
    # 1 contributor -> baseline 55, 2 -> 75, 3 -> 88, 4+ -> ~95-100.
    if count <= 0:
        return 0
    base = 55 + (count - 1) * 15
    return _clamp(base)


def score_documentation(signals: BuildSignals) -> int:
    """
    README depth + description + license + topics. Documentation is the single
    cheapest, strongest signal that a project is real and usable by others.
    """
    score = 0.0
    # README: ramps to full credit around ~1500 chars of real content.
    score += 55 * min(1.0, signals.readme_length / 1500.0)
    if signals.has_description:
        score += 15
    if signals.has_license:
        score += 15
    score += 15 * min(1.0, signals.topics_count / 3.0)
    return _clamp(score)


def score_activity_consistency(signals: BuildSignals) -> int:
    """
    Measures how evenly commits are distributed over the project's active life.
    A project built in one overnight burst (all commits in ~1 day) scores low;
    one worked on across many weeks scores high. Uses the coefficient of
    variation of gaps between commit days.
    """
    commits = sorted(signals.commit_dates)
    if len(commits) < 3:
        return 30 if commits else 0  # not enough data to reward consistency

    day_numbers = sorted({(c.date() - commits[0].date()).days for c in commits})
    if len(day_numbers) < 2:
        return 20  # all commits on a single day => burst

    active_span_days = day_numbers[-1] - day_numbers[0]
    if active_span_days <= 0:
        return 20

    gaps = [day_numbers[i + 1] - day_numbers[i] for i in range(len(day_numbers) - 1)]
    mean_gap = sum(gaps) / len(gaps)
    if mean_gap == 0:
        return 50
    cv = pstdev(gaps) / mean_gap  # lower CV => more regular
    regularity_component = max(0.0, 1.0 - min(cv, 1.0))

    # Reward longer active spans too (a week beats a day).
    span_component = min(1.0, active_span_days / 30.0)

    return _clamp(100 * (0.6 * regularity_component + 0.4 * span_component))


def score_originality_proxy(signals: BuildSignals) -> int:
    """
    ORIGINALITY (proxy). Real originality requires code-similarity / plagiarism
    scanning against a corpus — that is a separate subsystem and is NOT implemented
    here. Until then we compute an honest proxy from cheap signals and cap it so it
    can never masquerade as a verified-originality result.

    Signals used:
      * Not a fork (forks of other people's work are inherently derivative).
      * Has its own description and README (copied templates often lack these).
      * Has topics (indicates deliberate authorship).
    """
    if signals.is_fork:
        return 20  # forks are derivative by definition; capped low

    score = 40.0  # base for a non-fork original repo
    if signals.has_description:
        score += 15
    if signals.readme_length >= 500:
        score += 20
    score += 15 * min(1.0, signals.topics_count / 3.0)
    # Cap at 90: without real similarity scanning we never claim full certainty.
    return _clamp(min(score, 90))


# ── Fraud detection ────────────────────────────────────────────────────────────

def detect_fraud_flags(signals: BuildSignals, age_days: int | None) -> list[str]:
    flags: list[str] = []

    if not signals.ownership_verified:
        flags.append("ownership_unverified")

    if signals.is_fork:
        flags.append("forked_repo")

    if len(signals.commit_dates) == 0:
        flags.append("no_commit_history")

    if signals.readme_length < 100:
        flags.append("missing_or_thin_readme")

    # Burst pattern: a repo that claims maturity but whose entire (complete)
    # commit history lands inside a tiny window looks back-dated / dumped.
    commits = signals.commit_dates
    if len(commits) >= 5 and signals.commit_history_complete:
        span_days = (max(commits).date() - min(commits).date()).days
        if span_days <= 1:
            flags.append("single_burst_commits")

    # A repo that is old but has only a handful of commits smells like a
    # placeholder or a squatted name.
    if age_days is not None and age_days > 180 and 0 < len(commits) < 3:
        flags.append("stale_low_activity")

    return flags


# ── Composite ──────────────────────────────────────────────────────────────────

def _confidence(signals: BuildSignals) -> str:
    if not signals.signals_available:
        return "low"
    have_commits = len(signals.commit_dates) > 0
    have_contributors = signals.contributors_count > 0
    have_readme = signals.readme_length > 0
    present = sum([have_commits, have_contributors, have_readme, signals.ownership_verified])
    if present >= 3:
        return "high"
    if present == 2:
        return "medium"
    return "low"


def compute_build_score(signals: BuildSignals) -> BuildScoreResult:
    """Top-level entry point: signals in, full scored result out."""
    if not signals.signals_available:
        return BuildScoreResult(
            verified_build_score=0,
            repo_maturity_score=0,
            commit_cadence_score=0,
            contributor_authenticity_score=0,
            documentation_score=0,
            activity_consistency_score=0,
            originality_score=0,
            confidence="low",
            fraud_flags=["signals_unavailable"],
            reasoning="Could not fetch repository signals from GitHub; scoring skipped.",
            repo_age_days=None,
            commits_analyzed=0,
            contributors_count=0,
        )

    age_days = _repo_age_days(signals)

    maturity = score_repo_maturity(signals, age_days)
    cadence = score_commit_cadence(signals)
    authenticity = score_contributor_authenticity(signals)
    documentation = score_documentation(signals)
    consistency = score_activity_consistency(signals)
    originality = score_originality_proxy(signals)

    composite_raw = (
        _WEIGHTS["repo_maturity"] * maturity
        + _WEIGHTS["commit_cadence"] * cadence
        + _WEIGHTS["contributor_authenticity"] * authenticity
        + _WEIGHTS["documentation"] * documentation
        + _WEIGHTS["activity_consistency"] * consistency
        + _WEIGHTS["originality"] * originality
    )

    flags = detect_fraud_flags(signals, age_days)

    # Penalties: serious fraud flags subtract from the composite so a slick-looking
    # but suspicious repo can't sail past the verified threshold.
    penalty = 0
    if "forked_repo" in flags:
        penalty += 20
    if "single_burst_commits" in flags:
        penalty += 25
    if "no_commit_history" in flags:
        penalty += 20
    if "stale_low_activity" in flags:
        penalty += 15

    composite = _clamp(composite_raw - penalty)

    reasoning = _build_reasoning(
        signals, age_days,
        maturity, cadence, authenticity, documentation, consistency, originality,
        composite, penalty, flags,
    )

    return BuildScoreResult(
        verified_build_score=composite,
        repo_maturity_score=maturity,
        commit_cadence_score=cadence,
        contributor_authenticity_score=authenticity,
        documentation_score=documentation,
        activity_consistency_score=consistency,
        originality_score=originality,
        confidence=_confidence(signals),
        fraud_flags=flags,
        reasoning=reasoning,
        repo_age_days=age_days,
        commits_analyzed=len(signals.commit_dates),
        contributors_count=signals.contributors_count,
    )


def _build_reasoning(
    signals, age_days,
    maturity, cadence, authenticity, documentation, consistency, originality,
    composite, penalty, flags,
) -> str:
    parts = [
        f"Verified Build Score {composite}/100.",
        f"Repo maturity {maturity} (age {age_days if age_days is not None else 'unknown'} days),",
        f"commit cadence {cadence} ({len(signals.commit_dates)} commits sampled),",
        f"contributor authenticity {authenticity} ({signals.contributors_count} contributors),",
        f"documentation {documentation} (README {signals.readme_length} chars),",
        f"activity consistency {consistency},",
        f"originality proxy {originality}.",
    ]
    if penalty:
        parts.append(f"Applied -{penalty} penalty for fraud signals: {', '.join(flags)}.")
    elif flags:
        parts.append(f"Non-penalising warnings: {', '.join(flags)}.")
    return " ".join(parts)
