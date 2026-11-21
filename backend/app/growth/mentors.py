"""
Mentor support: an AI mentor scoped to a single project, plus a human mentor
directory with a lightweight request/accept handshake.

The AI mentor's value over a generic chatbot is entirely that it is grounded in
one project's real verification data, so `build_project_facts` is the important
part of this module — it assembles the ground truth the model is bound to.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.core.exceptions import ForbiddenError, NotFoundError, ValidationError
from app.core.logging import get_logger
from app.growth.models import MentorChatMessage, MentorProfile, MentorSession
from app.verification import scoring

logger = get_logger("mentors")

MAX_HISTORY = 40
SESSION_STATUSES = {"pending", "accepted", "declined", "completed", "cancelled"}


def build_project_facts(db: Session, project) -> str:
    """Assemble the ground truth the AI mentor is allowed to reason from.

    Deliberately includes the weak numbers as well as the strong ones. A mentor
    that only sees what's going well cannot tell a builder what to fix.
    """
    from app.projects.repository import ProjectRepository

    repo = ProjectRepository(db)
    v = repo.get_verification(project.id)
    analysis = repo.get_analysis(project.id)

    lines = [
        f"Project title: {project.title}",
        f"Repository: {project.repo_full_name}",
        f"Description: {project.description or 'none provided'}",
        f"Primary language: {project.primary_language or 'unknown'}",
        f"Stage: {project.stage.value}, status: {project.status.value}",
        f"Owner-reported progress: {project.progress_percent}%",
        f"GitHub stars: {project.stars}, forks: {project.forks}",
        f"Listed for sale: {'yes at ' + str(project.price_paise // 100) + ' INR' if project.is_for_sale and project.price_paise else 'no'}",
    ]

    if v:
        lines.append("")
        lines.append("VERIFICATION RESULT:")
        lines.append(
            f"Verified Build Score: "
            f"{v.verified_build_score if v.verified_build_score is not None else 'not yet scored'} / 100"
        )
        lines.append(f"Verified status: {'yes' if project.is_verified else 'no'}")
        lines.append(f"Threshold for verified: {scoring.VERIFIED_THRESHOLD}")
        lines.append(f"Confidence in the score: {v.confidence or 'unknown'}")
        lines.append(f"GitHub ownership proved: {'yes' if v.ownership_verified else 'no'}")
        lines.append(f"Repository age: {v.repo_age_days if v.repo_age_days is not None else 'unknown'} days")
        lines.append(f"Commits analysed: {v.commits_analyzed if v.commits_analyzed is not None else 'unknown'}")
        lines.append(f"Contributors: {v.contributors_count if v.contributors_count is not None else 'unknown'}")

        lines.append("")
        lines.append("COMPONENT SCORES (each 0-100, with its weight):")
        for spec in scoring.COMPONENT_SPEC:
            raw = getattr(v, spec["field"], None)
            lines.append(
                f"  {spec['label']} (weight {int(spec['weight'] * 100)}%): "
                f"{raw if raw is not None else 'not recorded'}"
            )

        flags = list(v.fraud_flags or [])
        lines.append("")
        if flags:
            lines.append("TRUST FLAGS RAISED:")
            for key in flags:
                spec = scoring.FLAG_SPEC.get(key)
                if spec:
                    lines.append(
                        f"  {key}: {spec['label']} — {spec['explains']} "
                        f"(penalty {spec['penalty']} points, severity {spec['severity']})"
                    )
                else:
                    lines.append(f"  {key}")
        else:
            lines.append("TRUST FLAGS RAISED: none")

    if analysis and analysis.status.value == "completed":
        lines.append("")
        lines.append("TECHNICAL ANALYSIS:")
        if analysis.health_score is not None:
            lines.append(f"  Health: {analysis.health_score}/100")
        if analysis.completion_score is not None:
            lines.append(f"  Completion: {analysis.completion_score}/100")
        if analysis.startup_potential is not None:
            lines.append(f"  Startup potential: {analysis.startup_potential}/100")
        if analysis.missing_features:
            lines.append(f"  Missing features noted: {', '.join(analysis.missing_features[:6])}")
        if analysis.technical_debt_summary:
            lines.append(f"  Technical debt: {analysis.technical_debt_summary}")

    return "\n".join(lines)


def weakest_components(db: Session, project) -> list[dict]:
    """The lowest-scoring components, worst first.

    Used to turn a low score into a specific next step rather than a dead end.
    Weight matters as much as the score: a 40 on a 20%-weighted component costs
    more than a 30 on a 15%-weighted one.
    """
    from app.projects.repository import ProjectRepository

    v = ProjectRepository(db).get_verification(project.id)
    if not v:
        return []

    out = []
    for spec in scoring.COMPONENT_SPEC:
        raw = getattr(v, spec["field"], None)
        if raw is None:
            continue
        # Points still available from this component if it were perfect.
        headroom = round((100 - raw) * spec["weight"], 1)
        out.append({
            "key": spec["key"],
            "label": spec["label"],
            "score": raw,
            "weight": spec["weight"],
            "points_available": headroom,
            "explains": spec["explains"],
        })
    out.sort(key=lambda c: -c["points_available"])
    return out


class AIMentorService:
    def __init__(self, db: Session):
        self.db = db

    def _own_project(self, project_id: uuid.UUID, user):
        from app.projects.repository import ProjectRepository

        project = ProjectRepository(self.db).get_by_id(project_id)
        if not project:
            raise NotFoundError("Project")
        # Scoped to the owner: the facts handed to the model include weaknesses
        # and unpublished analysis notes, which are not another user's business.
        if project.owner_id != user.id and user.role.value != "admin":
            raise ForbiddenError("You can only use the mentor on your own project")
        return project

    def history(self, project_id: uuid.UUID, user) -> list[MentorChatMessage]:
        self._own_project(project_id, user)
        return (
            self.db.query(MentorChatMessage)
            .filter(
                MentorChatMessage.project_id == project_id,
                MentorChatMessage.user_id == user.id,
            )
            .order_by(MentorChatMessage.created_at.asc())
            .limit(MAX_HISTORY)
            .all()
        )

    def clear(self, project_id: uuid.UUID, user) -> None:
        self._own_project(project_id, user)
        self.db.query(MentorChatMessage).filter(
            MentorChatMessage.project_id == project_id,
            MentorChatMessage.user_id == user.id,
        ).delete()
        self.db.commit()

    async def ask(self, project_id: uuid.UUID, user, question: str) -> MentorChatMessage:
        from app.ai.service import AIAnalysisService, AIUnavailableError

        project = self._own_project(project_id, user)
        question = question.strip()
        if not question:
            raise ValidationError("Ask a question first.")

        svc = AIAnalysisService()
        if not svc.available:
            raise ValidationError(
                "The AI mentor needs an AI provider configured on this deployment. "
                "Set an OpenRouter or Gemini API key to enable it."
            )

        prior = self.history(project_id, user)
        history = [{"role": m.role, "content": m.content} for m in prior]

        # Persist the question before calling out, so a provider failure doesn't
        # lose what the builder typed.
        self.db.add(MentorChatMessage(
            project_id=project_id, user_id=user.id, role="user", content=question[:4000],
        ))
        self.db.commit()

        try:
            reply = await svc.mentor_reply(
                question=question,
                history=history,
                project_facts=build_project_facts(self.db, project),
            )
        except AIUnavailableError as exc:
            raise ValidationError(str(exc)) from exc
        except Exception as exc:
            logger.warning("mentor_reply_failed", extra={"error": str(exc)})
            raise ValidationError(f"The mentor couldn't answer just now: {exc}") from exc

        message = MentorChatMessage(
            project_id=project_id, user_id=user.id, role="assistant",
            content=reply[:8000],
        )
        self.db.add(message)
        self.db.commit()
        self.db.refresh(message)
        return message


class MentorDirectoryService:
    def __init__(self, db: Session):
        self.db = db

    def list_mentors(self, accepting_only: bool = True) -> list[MentorProfile]:
        q = self.db.query(MentorProfile).options(joinedload(MentorProfile.user))
        if accepting_only:
            q = q.filter(MentorProfile.is_accepting == True)
        return q.order_by(MentorProfile.sessions_completed.desc()).all()

    def get_mentor(self, mentor_user_id: uuid.UUID) -> MentorProfile:
        profile = (
            self.db.query(MentorProfile)
            .options(joinedload(MentorProfile.user))
            .filter(MentorProfile.user_id == mentor_user_id)
            .first()
        )
        if not profile:
            raise NotFoundError("Mentor")
        return profile

    def request_session(
        self, builder, mentor_user_id: uuid.UUID, topic: str,
        message: str, project_id: uuid.UUID | None,
    ) -> MentorSession:
        profile = self.get_mentor(mentor_user_id)
        if profile.user_id == builder.id:
            raise ValidationError("You can't request a session with yourself.")
        if not profile.is_accepting:
            raise ValidationError("This mentor isn't taking new sessions right now.")

        # One open request per mentor at a time keeps the inbox meaningful.
        existing = (
            self.db.query(func.count(MentorSession.id))
            .filter(
                MentorSession.mentor_id == mentor_user_id,
                MentorSession.builder_id == builder.id,
                MentorSession.status == "pending",
            )
            .scalar() or 0
        )
        if existing:
            raise ValidationError(
                "You already have a pending request with this mentor. "
                "Wait for a reply before sending another."
            )

        session = MentorSession(
            mentor_id=mentor_user_id,
            builder_id=builder.id,
            project_id=project_id,
            topic=topic.strip()[:200],
            message=message.strip()[:4000],
            status="pending",
        )
        self.db.add(session)
        self.db.commit()
        self.db.refresh(session)

        self._notify(
            profile.user_id,
            f"Mentorship request from {builder.profile.display_name if builder.profile else 'a builder'}",
            topic, "/mentors/requests",
        )
        return session

    def respond(self, mentor, session_id: uuid.UUID, status: str, reply: str | None) -> MentorSession:
        if status not in {"accepted", "declined", "completed"}:
            raise ValidationError("Status must be accepted, declined or completed.")

        session = self.db.get(MentorSession, session_id)
        if not session:
            raise NotFoundError("Mentor session")
        if session.mentor_id != mentor.id and mentor.role.value != "admin":
            raise ForbiddenError("Not your mentorship request")

        session.status = status
        session.mentor_reply = (reply or "").strip()[:4000] or None
        session.responded_at = datetime.now(timezone.utc)

        if status == "completed":
            profile = (
                self.db.query(MentorProfile)
                .filter(MentorProfile.user_id == session.mentor_id)
                .first()
            )
            if profile:
                profile.sessions_completed += 1

        self.db.commit()
        self.db.refresh(session)

        self._notify(
            session.builder_id,
            f"Your mentorship request was {status}",
            session.topic, "/mentors/requests",
        )
        return session

    def withdraw(self, builder, session_id: uuid.UUID) -> None:
        session = self.db.get(MentorSession, session_id)
        if not session:
            raise NotFoundError("Mentor session")
        if session.builder_id != builder.id:
            raise ForbiddenError("Not your request")
        session.status = "cancelled"
        self.db.commit()

    def for_mentor(self, mentor_id: uuid.UUID) -> list[MentorSession]:
        return (
            self.db.query(MentorSession)
            .filter(MentorSession.mentor_id == mentor_id)
            .order_by(MentorSession.created_at.desc())
            .all()
        )

    def for_builder(self, builder_id: uuid.UUID) -> list[MentorSession]:
        return (
            self.db.query(MentorSession)
            .filter(MentorSession.builder_id == builder_id)
            .order_by(MentorSession.created_at.desc())
            .all()
        )

    def _notify(self, recipient_id: uuid.UUID, title: str, body: str, link: str) -> None:
        """Best-effort: a notification failure must not fail the request itself."""
        try:
            from app.notifications.models import Notification, NotificationType

            self.db.add(Notification(
                recipient_id=recipient_id, type=NotificationType.SYSTEM,
                title=title[:200], body=body[:500], link=link, is_read=False,
            ))
            self.db.commit()
        except Exception:
            self.db.rollback()
