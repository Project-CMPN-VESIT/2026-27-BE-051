import uuid

from sqlalchemy.orm import Session

from app.core.exceptions import NotFoundError
from app.users.models import User
from app.users.repository import UserRepository
from app.users.schemas import ProfileUpdate


class UserService:
    def __init__(self, db: Session):
        self.repo = UserRepository(db)

    def get_me(self, user_id: uuid.UUID) -> User:
        user = self.repo.get_by_id(user_id)
        if not user:
            raise NotFoundError("User")
        return user

    def update_profile(self, user_id: uuid.UUID, data: ProfileUpdate) -> User:
        user = self.repo.get_by_id(user_id)
        if not user:
            raise NotFoundError("User")
        update_data = data.model_dump(exclude_none=True)
        if update_data:
            self.repo.update_profile(user_id, **update_data)
        return user

    def set_role(self, user_id: uuid.UUID, role) -> User:
        from app.users.models import UserRole
        user = self.repo.get_by_id(user_id)
        if not user:
            raise NotFoundError("User")
        if role == UserRole.ADMIN:
            from app.core.exceptions import ForbiddenError
            raise ForbiddenError("The admin role cannot be self-assigned")
        self.repo.update(user, role=role)
        self.repo.db.commit()
        return user

    def get_public_profile(self, user_id: uuid.UUID) -> User:
        user = self.repo.get_by_id(user_id)
        if not user or not user.is_active:
            raise NotFoundError("User")
        return user

    def get_reputation_detail(self, user_id: uuid.UUID) -> dict:
        from app.users.reputation import ReputationService, delivery_rate, ReputationInputs
        user = self.repo.get_by_id(user_id)
        if not user or not user.is_active:
            raise NotFoundError("User")
        rep_svc = ReputationService(self.repo.db)
        rep = self.repo.get_reputation(user_id)
        if not rep:
            rep = rep_svc.recompute(user_id)
        badges = rep_svc.badges_for(rep)
        dr = delivery_rate(ReputationInputs(
            contracts_total=rep.contracts_total,
            contracts_completed=rep.contracts_completed,
        ))
        data = {c.name: getattr(rep, c.name) for c in rep.__table__.columns}
        data["badges"] = badges
        data["delivery_rate"] = dr
        return data

    def recompute_reputation(self, user_id: uuid.UUID) -> dict:
        from app.users.reputation import ReputationService
        ReputationService(self.repo.db).recompute(user_id)
        return self.get_reputation_detail(user_id)

    def list_builders(self, search: str | None = None, limit: int = 30) -> list[dict]:
        """Directory of builders/contributors for hirers to discover."""
        from sqlalchemy import func, or_
        from app.users.models import BuilderReputation, Profile, User, UserRole

        q = (
            self.repo.db.query(User, Profile, BuilderReputation)
            .join(Profile, Profile.user_id == User.id)
            .outerjoin(BuilderReputation, BuilderReputation.user_id == User.id)
            .filter(
                User.is_active == True,  # noqa: E712
                User.role.in_([UserRole.BUILDER, UserRole.CONTRIBUTOR]),
            )
        )
        if search:
            like = f"%{search.strip()}%"
            q = q.filter(or_(Profile.display_name.ilike(like), Profile.college.ilike(like)))

        rows = (
            q.order_by(func.coalesce(BuilderReputation.reputation_points, 0).desc())
            .limit(limit)
            .all()
        )
        return [
            {
                "user_id": u.id,
                "display_name": p.display_name or "Builder",
                "avatar_url": p.avatar_url,
                "college": p.college,
                "bio": p.bio,
                "role": u.role.value,
                "tier": rep.tier if rep else "newcomer",
                "reputation_points": rep.reputation_points if rep else 0,
                "trust_score": rep.trust_score if rep else 0,
                "verified_projects": rep.verified_projects if rep else 0,
                "contracts_completed": rep.contracts_completed if rep else 0,
            }
            for u, p, rep in rows
        ]

    def get_leaderboard(self, limit: int = 20) -> list[dict]:
        from app.users.models import BuilderReputation, Profile
        rows = (
            self.repo.db.query(BuilderReputation, Profile)
            .join(Profile, Profile.user_id == BuilderReputation.user_id)
            .filter(BuilderReputation.reputation_points > 0)
            .order_by(BuilderReputation.reputation_points.desc())
            .limit(limit)
            .all()
        )
        return [
            {
                "user_id": rep.user_id,
                "display_name": profile.display_name or "Builder",
                "avatar_url": profile.avatar_url,
                "college": profile.college,
                "tier": rep.tier,
                "reputation_points": rep.reputation_points,
                "verified_projects": rep.verified_projects,
                "contracts_completed": rep.contracts_completed,
            }
            for rep, profile in rows
        ]
