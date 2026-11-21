"""
Team project membership, revenue splits, and split-aware earnings.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.core.exceptions import (
    ConflictError, ForbiddenError, NotFoundError, ValidationError,
)
from app.core.logging import get_logger
from app.teams.models import TOTAL_BPS, ProjectMember, SaleSplit

logger = get_logger("teams")

MAX_MEMBERS = 8


def _now() -> datetime:
    return datetime.now(timezone.utc)


class TeamService:
    def __init__(self, db: Session):
        self.db = db

    # ── Reading ──────────────────────────────────────────────────────────────

    def list_members(
        self, project_id: uuid.UUID, *, include_inactive: bool = False
    ) -> list[ProjectMember]:
        q = (
            self.db.query(ProjectMember)
            .options(joinedload(ProjectMember.user))
            .filter(ProjectMember.project_id == project_id)
        )
        if not include_inactive:
            q = q.filter(ProjectMember.status.in_(("pending", "accepted")))
        return q.order_by(
            ProjectMember.is_lead.desc(), ProjectMember.revenue_share_bps.desc()
        ).all()

    def active_splits(self, project_id: uuid.UUID) -> list[ProjectMember]:
        """Members who are actually owed money: accepted only.

        A pending invite carries no entitlement. If it did, a lead could invite
        someone, never get a response, and silently divert their revenue.
        """
        return (
            self.db.query(ProjectMember)
            .filter(
                ProjectMember.project_id == project_id,
                ProjectMember.status == "accepted",
                ProjectMember.revenue_share_bps > 0,
            )
            .all()
        )

    def is_team_project(self, project_id: uuid.UUID) -> bool:
        return len(self.active_splits(project_id)) > 1

    # ── Writing ──────────────────────────────────────────────────────────────

    def _assert_lead(self, project, user_id: uuid.UUID) -> None:
        if project.owner_id != user_id:
            raise ForbiddenError("Only the project's lead owner can manage the team")

    def set_team(
        self,
        project,
        actor_id: uuid.UUID,
        members: list[dict],
    ) -> list[ProjectMember]:
        """Define the whole team in one call.

        Replacing the roster atomically rather than patching member-by-member is
        deliberate: shares must always sum to 100%, and an incremental API makes
        every intermediate state invalid. One call, one validation, one commit.

        `members` entries: {user_id, revenue_share_bps, contribution?, role?}
        The lead owner must be included.
        """
        self._assert_lead(project, actor_id)

        if not members:
            raise ValidationError("A team needs at least one member")
        if len(members) > MAX_MEMBERS:
            raise ValidationError(f"A team can have at most {MAX_MEMBERS} members")

        seen: set[uuid.UUID] = set()
        total = 0
        parsed: list[dict] = []
        for entry in members:
            raw_id = entry.get("user_id")
            try:
                user_id = raw_id if isinstance(raw_id, uuid.UUID) else uuid.UUID(str(raw_id))
            except (ValueError, TypeError, AttributeError):
                raise ValidationError("Invalid member id")
            if user_id in seen:
                raise ValidationError("The same person is listed twice")
            seen.add(user_id)

            bps = int(entry.get("revenue_share_bps") or 0)
            if bps < 0 or bps > TOTAL_BPS:
                raise ValidationError("Each share must be between 0% and 100%")
            total += bps
            parsed.append({
                "user_id": user_id,
                "revenue_share_bps": bps,
                "contribution": (entry.get("contribution") or None),
                "role": (entry.get("role") or "co-owner"),
            })

        if project.owner_id not in seen:
            raise ValidationError(
                "The lead owner must be included in the team with their own share"
            )
        if total != TOTAL_BPS:
            pct = total / 100
            raise ValidationError(
                f"Shares must add up to exactly 100% — they currently total {pct:.2f}%"
            )

        from app.users.models import User

        found = {
            u.id for u in self.db.query(User.id).filter(User.id.in_(seen)).all()
        } if seen else set()
        found = {row[0] if isinstance(row, tuple) else row for row in found}
        missing = seen - found
        if missing:
            raise ValidationError("One or more of those people no longer exist")

        existing = {
            m.user_id: m
            for m in self.db.query(ProjectMember)
            .filter(ProjectMember.project_id == project.id)
            .all()
        }

        result: list[ProjectMember] = []
        for entry in parsed:
            user_id = entry["user_id"]
            is_lead = user_id == project.owner_id
            row = existing.get(user_id)
            if row:
                row.revenue_share_bps = entry["revenue_share_bps"]
                row.contribution = entry["contribution"]
                row.role = "lead" if is_lead else entry["role"]
                row.is_lead = is_lead
                # A member who already accepted stays accepted; changing their
                # share does not silently re-open their consent, but it does
                # notify them below.
                if row.status in ("declined", "removed"):
                    row.status = "pending"
            else:
                row = ProjectMember(
                    project_id=project.id,
                    user_id=user_id,
                    revenue_share_bps=entry["revenue_share_bps"],
                    contribution=entry["contribution"],
                    role="lead" if is_lead else entry["role"],
                    is_lead=is_lead,
                    # The lead is their own agreement — no handshake needed.
                    status="accepted" if is_lead else "pending",
                )
                self.db.add(row)
            result.append(row)

        for user_id, row in existing.items():
            if user_id not in seen:
                row.status = "removed"
                row.revenue_share_bps = 0

        self.db.flush()
        self._notify_invites(project, result)
        self.db.commit()
        logger.info(
            "team_set",
            extra={"project": str(project.id), "members": len(result)},
        )
        return self.list_members(project.id)

    def _notify_invites(self, project, members: list[ProjectMember]) -> None:
        from app.notifications.models import NotificationType
        from app.notifications.service import NotificationService

        notif = NotificationService(self.db)
        for member in members:
            if member.is_lead or member.status != "pending":
                continue
            notif.create(
                recipient_id=member.user_id,
                type=NotificationType.SYSTEM,
                title=f"Co-owner invite: {project.title}",
                body=(
                    f"You've been offered {member.revenue_share_bps / 100:.2f}% of "
                    f"revenue from '{project.title}'. Accept to make it binding."
                ),
                link=f"/projects/{project.id}/team",
            )

    def respond(
        self, project_id: uuid.UUID, user_id: uuid.UUID, *, accept: bool
    ) -> ProjectMember:
        member = (
            self.db.query(ProjectMember)
            .filter(
                ProjectMember.project_id == project_id,
                ProjectMember.user_id == user_id,
            )
            .first()
        )
        if not member:
            raise NotFoundError("Team invite")
        if member.status != "pending":
            raise ConflictError("You've already responded to this invite")

        member.status = "accepted" if accept else "declined"
        self.db.flush()

        from app.notifications.models import NotificationType
        from app.notifications.service import NotificationService
        from app.projects.models import Project
        from app.users.models import Profile

        project = self.db.get(Project, project_id)
        profile = (
            self.db.query(Profile).filter(Profile.user_id == user_id).first()
        )
        name = (profile.display_name if profile else None) or "A collaborator"
        if project:
            NotificationService(self.db).create(
                recipient_id=project.owner_id,
                type=NotificationType.SYSTEM,
                title=f"Co-owner invite {'accepted' if accept else 'declined'}",
                body=f"{name} {'accepted' if accept else 'declined'} their share of '{project.title}'.",
                link=f"/projects/{project_id}/team",
            )
        self.db.commit()
        self.db.refresh(member)
        return member

    # ── Sale distribution ────────────────────────────────────────────────────

    def record_sale_splits(self, payment, project, seller_net_paise: int) -> list[SaleSplit]:
        """Divide a sale's net proceeds across accepted co-owners.

        No-ops for a solo project, which keeps every existing single-owner
        earnings path byte-identical. Only flushes — the payment transaction owns
        the commit.

        Remainder handling: integer division loses paise. The shortfall is given
        to the lead owner rather than dropped, so the splits always sum to
        exactly the net. Money that vanishes into rounding is a bug someone
        eventually notices in their payout.

        Like `TrustReceiptService.issue`, the write is wrapped in a SAVEPOINT and
        identifiers are captured up front. Without the savepoint a failed flush
        poisons the session and takes the completed sale down with it, which is
        the opposite of the best-effort behaviour intended here.
        """
        payment_id = getattr(payment, "id", None)
        project_id = getattr(project, "id", None)
        try:
            members = self.active_splits(project.id)
            if len(members) < 2:
                return []

            existing = (
                self.db.query(func.count(SaleSplit.id))
                .filter(SaleSplit.payment_id == payment_id)
                .scalar() or 0
            )
            if existing:
                return []  # replayed webhook

            total_bps = sum(m.revenue_share_bps for m in members)
            if total_bps <= 0:
                return []

            splits: list[SaleSplit] = []
            allocated = 0
            ordered = sorted(members, key=lambda m: (not m.is_lead, -m.revenue_share_bps))
            for member in ordered[1:]:
                amount = (seller_net_paise * member.revenue_share_bps) // total_bps
                allocated += amount
                splits.append(SaleSplit(
                    payment_id=payment_id, project_id=project_id,
                    user_id=member.user_id,
                    revenue_share_bps=member.revenue_share_bps,
                    amount_paise=amount,
                ))
            lead = ordered[0]
            splits.append(SaleSplit(
                payment_id=payment_id, project_id=project_id,
                user_id=lead.user_id,
                revenue_share_bps=lead.revenue_share_bps,
                amount_paise=max(0, seller_net_paise - allocated),
            ))

            with self.db.begin_nested():
                for split in splits:
                    self.db.add(split)
                self.db.flush()

            from app.notifications.models import NotificationType
            from app.notifications.service import NotificationService
            notif = NotificationService(self.db)
            for split in splits:
                if split.user_id == project.owner_id:
                    continue
                notif.create(
                    recipient_id=split.user_id,
                    type=NotificationType.PAYMENT_SUCCESS,
                    title=f"Your share of a sale: {project.title}",
                    body=(
                        f"₹{split.amount_paise / 100:.0f} is your "
                        f"{split.revenue_share_bps / 100:.2f}% share of this sale."
                    ),
                    link="/earnings",
                )

            logger.info(
                "sale_split_recorded",
                extra={"payment": str(payment_id), "parts": len(splits)},
            )
            return splits
        except Exception as exc:  # pragma: no cover - defensive
            # A split failure must not roll back a completed sale. The money is
            # still recorded against the project owner, which is recoverable;
            # a failed purchase after charging the buyer is not.
            logger.error(
                "sale_split_failed",
                extra={"payment": str(payment_id), "error": str(exc)},
            )
            return []

    def member_earnings(self, user_id: uuid.UUID) -> dict:
        """Earnings owed to someone as a co-owner of projects they don't lead.

        Complements `PaymentService.get_seller_earnings`, which answers the
        owner-of-record question. Both are needed: a builder can be lead on one
        project and a 20% member on another.
        """
        from app.projects.models import Project

        rows = (
            self.db.query(SaleSplit, Project.title, Project.owner_id)
            .join(Project, SaleSplit.project_id == Project.id)
            .filter(SaleSplit.user_id == user_id)
            .order_by(SaleSplit.created_at.desc())
            .all()
        )
        items = []
        total = 0
        for split, title, owner_id in rows:
            total += split.amount_paise or 0
            items.append({
                "project_id": split.project_id,
                "project_title": title,
                "amount_paise": split.amount_paise,
                "revenue_share_bps": split.revenue_share_bps,
                "is_lead": owner_id == user_id,
                "created_at": split.created_at,
            })
        return {
            "total_paise": total,
            "sales_count": len(items),
            "items": items,
        }

    def team_projects_for(self, user_id: uuid.UUID) -> list[ProjectMember]:
        """Team memberships for a user, for their dashboard."""
        return (
            self.db.query(ProjectMember)
            .options(joinedload(ProjectMember.project))
            .filter(
                ProjectMember.user_id == user_id,
                ProjectMember.status.in_(("pending", "accepted")),
            )
            .order_by(ProjectMember.created_at.desc())
            .all()
        )
