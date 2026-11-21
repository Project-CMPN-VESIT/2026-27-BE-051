"""
Hackathon Authenticity engine.

Verifies whether a project was genuinely built during a claimed hackathon window
by analysing its GitHub commit timeline against the event dates.

NOTE the inversion vs the Verified Build Score: for a hackathon, a concentrated
commit burst *inside the event window* is a POSITIVE signal (that's how hackathons
work). The suspicious patterns here are the opposite: a repo mostly built long
before the event (prebuilt and re-badged), or one with no activity during the
event, or one where all work happened after the event (a back-dated claim).

Pure and deterministic — no DB, no network.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone


@dataclass
class HackathonSignals:
    event_start: datetime
    event_end: datetime
    commit_dates: list[datetime] = field(default_factory=list)
    repo_created_at: datetime | None = None
    is_fork: bool = False
    signals_available: bool = True


@dataclass
class AuthenticityResult:
    authenticity_score: int          # 0-100
    verdict: str                     # "likely_authentic" | "needs_review" | "likely_inauthentic"
    confidence: str                  # "low" | "medium" | "high"
    commits_in_window: int
    commits_before_event: int
    commits_after_event: int
    total_commits: int
    flags: list[str]
    reasoning: str


# Grace windows: contributors often push a few hours before kickoff or after the
# buzzer while wrapping up submissions.
_PRE_GRACE = timedelta(days=1)
_POST_GRACE = timedelta(days=2)
# A repo created well before the event is a prebuilt-project red flag.
_PREBUILT_THRESHOLD = timedelta(days=30)


def _aware(dt: datetime) -> datetime:
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def _clamp(v: float, lo: int = 0, hi: int = 100) -> int:
    return int(max(lo, min(hi, round(v))))


def compute_authenticity(signals: HackathonSignals) -> AuthenticityResult:
    if not signals.signals_available:
        return AuthenticityResult(
            0, "needs_review", "low", 0, 0, 0, 0,
            ["signals_unavailable"],
            "Could not fetch commit history from GitHub; manual review required.",
        )

    start = _aware(signals.event_start) - _PRE_GRACE
    end = _aware(signals.event_end) + _POST_GRACE
    commits = [_aware(c) for c in signals.commit_dates]
    total = len(commits)

    if total == 0:
        return AuthenticityResult(
            0, "likely_inauthentic", "low", 0, 0, 0, 0,
            ["no_commit_history"],
            "No commit history available to corroborate the hackathon claim.",
        )

    in_window = sum(1 for c in commits if start <= c <= end)
    before = sum(1 for c in commits if c < start)
    after = sum(1 for c in commits if c > end)

    in_ratio = in_window / total
    pre_ratio = before / total
    post_ratio = after / total

    flags: list[str] = []
    score = in_ratio * 100  # core: how much work happened during the event

    if in_window == 0:
        flags.append("no_activity_during_event")
    if pre_ratio > 0.5:
        flags.append("prebuilt_before_event")
        score -= 35
    if post_ratio > 0.6:
        flags.append("built_after_event")
        score -= 20
    if signals.is_fork:
        flags.append("forked_repo")
        score -= 20

    # Fresh-repo bonus: repo created specifically for the event.
    if signals.repo_created_at is not None:
        created = _aware(signals.repo_created_at)
        if _aware(signals.event_start) - _PREBUILT_THRESHOLD <= created <= end:
            score += 10
        elif created < _aware(signals.event_start) - _PREBUILT_THRESHOLD and pre_ratio > 0.3:
            if "prebuilt_before_event" not in flags:
                flags.append("prebuilt_before_event")
            score -= 15

    score_int = _clamp(score)

    serious = {"prebuilt_before_event", "no_activity_during_event", "no_commit_history"}
    if score_int >= 70 and not (serious & set(flags)):
        verdict = "likely_authentic"
    elif score_int >= 40 and "no_activity_during_event" not in flags:
        verdict = "needs_review"
    else:
        verdict = "likely_inauthentic"

    confidence = "high" if total >= 15 else "medium" if total >= 5 else "low"

    reasoning = (
        f"{in_window}/{total} commits ({round(in_ratio * 100)}%) fall within the event window; "
        f"{before} before, {after} after. "
        + ("Commit activity is concentrated during the event, consistent with a genuine hackathon build. "
           if in_ratio >= 0.6 else "")
        + ("A majority of the work predates the event, suggesting a prebuilt project. "
           if "prebuilt_before_event" in flags else "")
        + ("No commits occurred during the event window. " if "no_activity_during_event" in flags else "")
    ).strip()

    return AuthenticityResult(
        authenticity_score=score_int,
        verdict=verdict,
        confidence=confidence,
        commits_in_window=in_window,
        commits_before_event=before,
        commits_after_event=after,
        total_commits=total,
        flags=flags,
        reasoning=reasoning,
    )
