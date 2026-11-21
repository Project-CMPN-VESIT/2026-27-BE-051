"""
Commit-consistency streaks.

Activity consistency is already one of the six scored components, so this adds no
new claim about a builder — it surfaces an existing measurement in a form people
actually respond to.

## The honesty constraint on a streak counter

A streak is a promise that someone worked on N consecutive days. Two ways to get
that wrong, both of which this module avoids:

1. **Counting a streak as live when it isn't.** A streak that ended three weeks
   ago is not a current streak. `current_streak_days` only counts if the last
   active day is today or yesterday — one day of grace for timezone edges, not a
   week of flattery.

2. **Rewarding gaps.** Consecutive means consecutive. There is no "freeze",
   no weekend exemption, no vacation credit. A 30-day badge that survives a
   two-week gap means nothing.

Milestone badges are sticky once earned, because "you sustained 30 days once" is
a true statement forever. But the *current* streak is always live and can be 0
while the badge still shows.
"""
from __future__ import annotations

import uuid
from datetime import date, datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app.core.logging import get_logger
from app.growth.models import BuilderActivity

logger = get_logger("streaks")

# Thresholds a builder can earn a badge for.
MILESTONES: tuple[int, ...] = (7, 30, 90, 180, 365)

MILESTONE_LABELS: dict[int, dict] = {
    7: {
        "label": "One week",
        "blurb": "Committed on seven consecutive days.",
    },
    30: {
        "label": "One month",
        "blurb": "Thirty consecutive days of commits — past the point where most side projects stop.",
    },
    90: {
        "label": "One quarter",
        "blurb": "Ninety consecutive days. This is the band where a project stops looking like coursework.",
    },
    180: {
        "label": "Half a year",
        "blurb": "A hundred and eighty consecutive days of shipping.",
    },
    365: {
        "label": "One year",
        "blurb": "A full year without breaking the chain.",
    },
}

# A streak counts as live if the last commit was today or yesterday. One day of
# slack absorbs timezone differences between the committer and UTC; two would
# start describing a lapsed streak as current.
LIVE_GRACE_DAYS = 1


def _parse_days(values) -> list[date]:
    out: set[date] = set()
    for value in values or []:
        try:
            if isinstance(value, date) and not isinstance(value, datetime):
                out.add(value)
            elif isinstance(value, datetime):
                out.add(value.date())
            else:
                out.add(date.fromisoformat(str(value)[:10]))
        except (ValueError, TypeError):
            continue
    return sorted(out)


def longest_run(days: list[date]) -> int:
    """Longest run of consecutive dates in a sorted, deduplicated list."""
    if not days:
        return 0
    best = run = 1
    for i in range(1, len(days)):
        if (days[i] - days[i - 1]).days == 1:
            run += 1
            best = max(best, run)
        else:
            run = 1
    return best


def current_run(days: list[date], *, today: date | None = None) -> int:
    """Length of the streak that is still live as of `today`.

    Returns 0 when the last active day is older than the grace window — a lapsed
    streak is reported as lapsed, not carried forward.
    """
    if not days:
        return 0
    today = today or datetime.now(timezone.utc).date()
    last = days[-1]
    if (today - last).days > LIVE_GRACE_DAYS:
        return 0

    run = 1
    for i in range(len(days) - 1, 0, -1):
        if (days[i] - days[i - 1]).days == 1:
            run += 1
        else:
            break
    return run


def compute_streak(activity_days, *, today: date | None = None) -> dict:
    """Pure streak computation. Same input, same output, no clock unless given one."""
    days = _parse_days(activity_days)
    current = current_run(days, today=today)
    longest = longest_run(days)
    earned = [m for m in MILESTONES if longest >= m]
    return {
        "current_streak_days": current,
        "longest_streak_days": longest,
        "total_active_days": len(days),
        "last_active_on": days[-1].isoformat() if days else None,
        "milestones": earned,
        "is_live": current > 0,
        "next_milestone": next((m for m in MILESTONES if m > current), None),
    }


def calendar(activity_days, *, weeks: int = 26, today: date | None = None) -> list[dict]:
    """Dense day-by-day activity for a heatmap.

    Dense, not sparse: a gap has to render as a gap. A sparse series drawn as a
    contribution graph silently closes its own holes.
    """
    days = set(_parse_days(activity_days))
    today = today or datetime.now(timezone.utc).date()
    span = weeks * 7
    return [
        {
            "day": (today - timedelta(days=offset)).isoformat(),
            "active": (today - timedelta(days=offset)) in days,
        }
        for offset in range(span - 1, -1, -1)
    ]


class StreakService:
    def __init__(self, db: Session):
        self.db = db

    def get(self, user_id: uuid.UUID) -> dict:
        row = (
            self.db.query(BuilderActivity)
            .filter(BuilderActivity.user_id == user_id)
            .first()
        )
        if not row:
            return {
                **compute_streak([]),
                "computed_at": None,
                "has_data": False,
                "milestone_details": [],
            }

        # Recomputed on read rather than trusting the cached integers: the cached
        # value goes stale the moment a day passes without a commit, and a streak
        # that only decays when a background job happens to run would be wrong
        # most of the time.
        live = compute_streak(row.activity_days)
        # Earned milestones are sticky — union with whatever was previously stored.
        stored = set(row.milestones or [])
        merged = sorted(stored | set(live["milestones"]))
        live["milestones"] = merged
        live["milestone_details"] = [
            {"days": m, **MILESTONE_LABELS.get(m, {"label": f"{m} days", "blurb": ""})}
            for m in merged
        ]
        live["computed_at"] = row.computed_at.isoformat() if row.computed_at else None
        live["has_data"] = bool(row.activity_days)
        return live

    def calendar(self, user_id: uuid.UUID, weeks: int = 26) -> list[dict]:
        row = (
            self.db.query(BuilderActivity)
            .filter(BuilderActivity.user_id == user_id)
            .first()
        )
        return calendar(row.activity_days if row else [], weeks=weeks)

    def record_days(
        self, user_id: uuid.UUID, days, *, commit: bool = True
    ) -> BuilderActivity:
        """Merge new active days into a builder's history and refresh the cache.

        Additive: history is never truncated by a run that happens to see less
        data than a previous one. A recompute that shortens someone's record
        because one GitHub call returned fewer commits would be a silent
        regression in a number people care about.
        """
        row = (
            self.db.query(BuilderActivity)
            .filter(BuilderActivity.user_id == user_id)
            .first()
        )
        incoming = {d.isoformat() for d in _parse_days(days)}

        if not row:
            row = BuilderActivity(user_id=user_id, activity_days=[])
            self.db.add(row)
            self.db.flush()

        merged = sorted(set(row.activity_days or []) | incoming)
        row.activity_days = merged

        stats = compute_streak(merged)
        row.current_streak_days = stats["current_streak_days"]
        row.longest_streak_days = max(
            row.longest_streak_days or 0, stats["longest_streak_days"]
        )
        row.total_active_days = stats["total_active_days"]
        row.last_active_on = stats["last_active_on"]
        row.milestones = sorted(set(row.milestones or []) | set(stats["milestones"]))
        row.computed_at = datetime.now(timezone.utc)

        self.db.flush()
        if commit:
            self.db.commit()
        return row

    def leaderboard(self, limit: int = 10) -> list[dict]:
        """Builders with the longest live streaks.

        Filters to genuinely live streaks by recomputing — ordering by the cached
        column would rank people whose streak ended weeks ago.
        """
        from app.users.models import Profile

        rows = (
            self.db.query(BuilderActivity, Profile)
            .outerjoin(Profile, Profile.user_id == BuilderActivity.user_id)
            .filter(BuilderActivity.current_streak_days > 0)
            .order_by(BuilderActivity.current_streak_days.desc())
            .limit(limit * 4)  # over-fetch, then drop the lapsed ones
            .all()
        )
        out = []
        for row, profile in rows:
            live = compute_streak(row.activity_days)
            if live["current_streak_days"] <= 0:
                continue
            out.append({
                "user_id": row.user_id,
                "display_name": (profile.display_name if profile else None) or "Builder",
                "current_streak_days": live["current_streak_days"],
                "longest_streak_days": max(
                    row.longest_streak_days or 0, live["longest_streak_days"]
                ),
                "last_active_on": live["last_active_on"],
            })
        out.sort(key=lambda r: -r["current_streak_days"])
        return out[:limit]
