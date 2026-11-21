"""
Weekly digest: what changed for one user in the last seven days.

## Two design choices worth stating

**The content is computed, not templated at send time.** `build_digest()` returns
a structured payload; rendering to HTML is a separate step. That means the digest
can be previewed in-app at `/me/digest`, asserted on in tests, and demoed without
an SMTP server. A digest that can only be seen by receiving an email is a digest
nobody can verify is correct.

**An empty digest is not sent.** A weekly email that says "nothing happened" is
how a product teaches people to filter it. `build_digest()` reports
`is_worth_sending`, and the task honours it.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.logging import get_logger
from app.core.time import as_utc

logger = get_logger("digest")

DIGEST_WINDOW_DAYS = 7
# Below this, the email is noise. One new matching project is not news.
MIN_ITEMS_TO_SEND = 2


def _now() -> datetime:
    return datetime.now(timezone.utc)


class DigestService:
    def __init__(self, db: Session):
        self.db = db

    # ── Composition ──────────────────────────────────────────────────────────

    def build_digest(self, user, *, days: int = DIGEST_WINDOW_DAYS) -> dict:
        """Everything worth telling one user about the past week."""
        since = _now() - timedelta(days=days)
        sections: list[dict] = []

        from app.users.models import UserRole

        # Builders and recruiters care about opposite things, so the digest is
        # role-shaped rather than one list everybody gets a diluted version of.
        is_builder = user.role in (UserRole.BUILDER, UserRole.CONTRIBUTOR, UserRole.FOUNDER)
        is_scout = user.role in (UserRole.INCUBATOR, UserRole.MENTOR, UserRole.ADMIN)

        if is_builder:
            sections.extend(filter(None, [
                self._score_movement(user, since),
                self._profile_interest(user, since),
                self._inbound_offers(user, since),
                self._streak(user),
                self._team_earnings(user, since),
            ]))
        if is_scout or not is_builder:
            sections.extend(filter(None, [
                self._saved_search_matches(user),
                self._new_verified(user, since),
            ]))
        # Everyone gets purchase-health alerts — a buyer is a buyer regardless
        # of what role they signed up as.
        sections.extend(filter(None, [self._purchase_health(user)]))

        item_count = sum(len(s.get("items") or []) for s in sections)
        return {
            "user_id": user.id,
            "email": user.email,
            "window_days": days,
            "generated_at": _now().isoformat(),
            "sections": sections,
            "item_count": item_count,
            "is_worth_sending": item_count >= MIN_ITEMS_TO_SEND,
        }

    # ── Sections ─────────────────────────────────────────────────────────────

    def _score_movement(self, user, since: datetime) -> dict | None:
        """Verified Build Score changes on the user's own projects."""
        from app.growth.models import ScoreSnapshot
        from app.projects.models import Project

        project_ids = [
            pid for (pid,) in self.db.query(Project.id).filter(
                Project.owner_id == user.id, Project.is_deleted == False
            )
        ]
        if not project_ids:
            return None

        items = []
        for pid in project_ids:
            snaps = (
                self.db.query(ScoreSnapshot)
                .filter(ScoreSnapshot.project_id == pid)
                .order_by(ScoreSnapshot.recorded_at.desc())
                .limit(8)
                .all()
            )
            recent = [
                s for s in snaps if s.recorded_at and as_utc(s.recorded_at) >= since
            ]
            if not recent or len(snaps) < 2:
                continue
            latest = snaps[0]
            # Compare against the last reading from before the window, so the
            # delta describes the week rather than the gap between two runs that
            # both happened this week.
            prior = next(
                (s for s in snaps if s.recorded_at and as_utc(s.recorded_at) < since),
                snaps[-1],
            )
            if latest.verified_build_score is None or prior.verified_build_score is None:
                continue
            delta = latest.verified_build_score - prior.verified_build_score
            if delta == 0:
                continue
            project = self.db.get(Project, pid)
            items.append({
                "project_id": pid,
                "title": project.title if project else "Project",
                "score": latest.verified_build_score,
                "delta": delta,
                "direction": "up" if delta > 0 else "down",
                "link": f"/projects/{pid}",
            })

        if not items:
            return None
        items.sort(key=lambda i: -abs(i["delta"]))
        return {
            "key": "score_movement",
            "title": "Your score moved",
            "items": items[:5],
        }

    def _profile_interest(self, user, since: datetime) -> dict | None:
        """Views on the user's projects this week."""
        from app.growth.models import ProjectView

        since_day = since.date().isoformat()
        total = int(
            self.db.query(func.coalesce(func.sum(ProjectView.count), 0))
            .filter(
                ProjectView.owner_id == user.id,
                ProjectView.day >= since_day,
                ProjectView.viewer_kind != "owner",
            )
            .scalar() or 0
        )
        if total <= 0:
            return None

        top = (
            self.db.query(ProjectView.project_id, func.sum(ProjectView.count))
            .filter(
                ProjectView.owner_id == user.id,
                ProjectView.day >= since_day,
                ProjectView.viewer_kind != "owner",
            )
            .group_by(ProjectView.project_id)
            .order_by(func.sum(ProjectView.count).desc())
            .limit(3)
            .all()
        )
        from app.projects.models import Project

        items = []
        for pid, count in top:
            project = self.db.get(Project, pid)
            items.append({
                "project_id": pid,
                "title": project.title if project else "Project",
                "views": int(count or 0),
                "link": f"/projects/{pid}",
            })
        return {
            "key": "views",
            "title": f"{total} view{'s' if total != 1 else ''} on your work",
            "items": items,
        }

    def _inbound_offers(self, user, since: datetime) -> dict | None:
        """New purchase offers and incubation/funding offers received."""
        from app.deals.models import PurchaseOffer
        from app.incubation.models import IncubationOffer
        from app.projects.models import Project

        items = []

        offers = (
            self.db.query(PurchaseOffer)
            .filter(
                PurchaseOffer.seller_id == user.id,
                PurchaseOffer.created_at >= since,
            )
            .order_by(PurchaseOffer.current_offer_paise.desc())
            .limit(5)
            .all()
        )
        for offer in offers:
            project = self.db.get(Project, offer.project_id)
            items.append({
                "kind": "purchase_offer",
                "title": project.title if project else "Your project",
                "detail": (
                    f"₹{offer.current_offer_paise / 100:.0f} offered "
                    f"(asking ₹{offer.list_price_paise / 100:.0f})"
                ),
                "status": offer.status,
                "link": f"/projects/{offer.project_id}#offers",
            })

        project_ids = [
            pid for (pid,) in self.db.query(Project.id).filter(
                Project.owner_id == user.id, Project.is_deleted == False
            )
        ]
        if project_ids:
            deals = (
                self.db.query(IncubationOffer)
                .filter(
                    IncubationOffer.project_id.in_(project_ids),
                    IncubationOffer.created_at >= since,
                )
                .limit(5)
                .all()
            )
            for deal in deals:
                items.append({
                    "kind": deal.offer_type.value,
                    "title": deal.title,
                    "detail": (
                        f"₹{deal.amount_paise / 100:.0f}" if deal.amount_paise
                        else deal.offer_type.value.replace("_", " ").title()
                    ),
                    "status": deal.status.value,
                    "link": "/offers",
                })

        if not items:
            return None
        return {"key": "offers", "title": "New interest in your projects", "items": items}

    def _streak(self, user) -> dict | None:
        from app.growth.streaks import StreakService

        streak = StreakService(self.db).get(user.id)
        if not streak.get("has_data") or streak["current_streak_days"] <= 0:
            return None
        next_milestone = streak.get("next_milestone")
        detail = f"{streak['current_streak_days']} day streak"
        if next_milestone:
            remaining = next_milestone - streak["current_streak_days"]
            detail += f" — {remaining} more day{'s' if remaining != 1 else ''} to {next_milestone}"
        return {
            "key": "streak",
            "title": "Your commit streak",
            "items": [{
                "title": detail,
                "detail": f"Longest ever: {streak['longest_streak_days']} days",
                "link": "/dashboard",
            }],
        }

    def _team_earnings(self, user, since: datetime) -> dict | None:
        from app.teams.models import SaleSplit
        from app.projects.models import Project

        rows = (
            self.db.query(SaleSplit)
            .filter(SaleSplit.user_id == user.id, SaleSplit.created_at >= since)
            .all()
        )
        if not rows:
            return None
        total = sum(r.amount_paise or 0 for r in rows)
        items = []
        for row in rows[:4]:
            project = self.db.get(Project, row.project_id)
            items.append({
                "title": project.title if project else "Team project",
                "detail": (
                    f"₹{row.amount_paise / 100:.0f} — your "
                    f"{row.revenue_share_bps / 100:.2f}% share"
                ),
                "link": "/earnings",
            })
        return {
            "key": "team_earnings",
            "title": f"₹{total / 100:.0f} from team projects",
            "items": items,
        }

    def _saved_search_matches(self, user) -> dict | None:
        """New matches on saved searches, using the existing baseline mechanism."""
        from app.growth.analytics import PipelineService
        from app.growth.models import SavedSearch

        searches = (
            self.db.query(SavedSearch)
            .filter(
                SavedSearch.user_id == user.id,
                SavedSearch.alerts_enabled == True,
            )
            .all()
        )
        if not searches:
            return None

        pipeline = PipelineService(self.db)
        items = []
        for search in searches:
            count = pipeline._count_matches(search.filters)
            new = max(0, count - (search.last_match_count or 0))
            if new <= 0:
                continue
            items.append({
                "title": search.name,
                "detail": f"{new} new match{'es' if new != 1 else ''} ({count} total)",
                "link": "/pipeline",
            })
            # Advance the baseline so the same matches are not reported again
            # next week. The digest is a consumer of the alert mechanism, so it
            # has to move the high-water mark like any other consumer.
            search.last_match_count = count
            search.last_checked_at = _now()

        if not items:
            return None
        self.db.commit()
        return {"key": "saved_searches", "title": "Your saved searches", "items": items}

    def _new_verified(self, user, since: datetime) -> dict | None:
        from app.projects.models import Project, ProjectVerification

        rows = (
            self.db.query(Project, ProjectVerification.verified_build_score)
            .join(ProjectVerification, ProjectVerification.project_id == Project.id)
            .filter(
                Project.is_verified == True,
                Project.is_deleted == False,
                Project.duplicate_status != "withheld",
                Project.created_at >= since,
            )
            .order_by(ProjectVerification.verified_build_score.desc())
            .limit(4)
            .all()
        )
        if not rows:
            return None
        return {
            "key": "new_verified",
            "title": "Newly verified this week",
            "items": [
                {
                    "project_id": p.id,
                    "title": p.title,
                    "detail": f"Score {score}/100 · {p.primary_language or 'mixed'}",
                    "link": f"/projects/{p.id}",
                }
                for p, score in rows
            ],
        }

    def _purchase_health(self, user) -> dict | None:
        """Health movement on projects the user bought."""
        from app.trust.service import HealthMonitorService

        try:
            trends = HealthMonitorService(self.db).list_for_buyer(user.id)
        except Exception:
            return None
        moved = [t for t in trends if t.get("delta") not in (None, 0)]
        if not moved:
            return None
        return {
            "key": "purchase_health",
            "title": "Health of what you bought",
            "items": [
                {
                    "project_id": t["project_id"],
                    "title": t["project_title"] or "Purchased project",
                    "detail": (
                        f"Score {t['latest_score']} "
                        f"({'+' if t['delta'] > 0 else ''}{t['delta']} since purchase)"
                    ),
                    "direction": t["direction"],
                    "link": f"/purchases/{t['project_id']}",
                }
                for t in moved[:4]
            ],
        }

    # ── Rendering + delivery ─────────────────────────────────────────────────

    def render_html(self, digest: dict) -> str:
        """Render a digest payload to the platform's standard email shell."""
        from app.core.email import _wrap

        blocks: list[str] = []
        for section in digest["sections"]:
            rows = []
            for item in section.get("items") or []:
                label = item.get("title", "")
                detail = item.get("detail") or ""
                if "delta" in item and item.get("delta") is not None:
                    arrow = "▲" if item["delta"] > 0 else "▼"
                    detail = f"{arrow} {item['delta']:+d} → {item.get('score')}/100"
                rows.append(
                    '<li style="margin:0 0 6px 0;">'
                    f'<strong>{label}</strong>'
                    + (f' <span style="color:#6b6b6b;">— {detail}</span>' if detail else "")
                    + "</li>"
                )
            blocks.append(
                f'<p style="margin:18px 0 6px 0;font-weight:600;">{section["title"]}</p>'
                f'<ul style="margin:0;padding-left:18px;">{"".join(rows)}</ul>'
            )

        body = (
            '<p style="margin:0 0 4px 0;">Here\'s what moved on CodeBazaar this week.</p>'
            + "".join(blocks)
        )
        return _wrap(
            "Your week on CodeBazaar",
            body,
            cta_text="Open your dashboard",
            cta_link="/dashboard",
        )

    def send(self, user, *, days: int = DIGEST_WINDOW_DAYS, force: bool = False) -> bool:
        """Build and email one user's digest. Returns True if sent."""
        from app.core.email import enqueue_email

        digest = self.build_digest(user, days=days)
        if not digest["is_worth_sending"] and not force:
            return False
        enqueue_email(
            user.email,
            "Your week on CodeBazaar",
            self.render_html(digest),
        )
        logger.info(
            "digest_sent",
            extra={"user": str(user.id), "items": digest["item_count"]},
        )
        return True

    # ── Audience ─────────────────────────────────────────────────────────────

    def active_recipients(self, *, limit: int = 1000) -> list:
        """Users worth emailing: active, verified, and not obviously dormant.

        Excludes unverified accounts — sending a weekly digest to an address that
        never confirmed it is how a domain gets a spam reputation.
        """
        from app.users.models import User

        return (
            self.db.query(User)
            .filter(
                User.is_active == True,
                User.is_verified == True,
            )
            .order_by(User.created_at.asc())
            .limit(limit)
            .all()
        )
