"""Growth: referral tracking, campus ambassadors, and a campus leaderboard."""
import uuid

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.exceptions import NotFoundError, ValidationError
from app.users.models import Profile, User
from app.users.repository import UserRepository

settings = get_settings()


class GrowthService:
    def __init__(self, db: Session):
        self.db = db
        self.users = UserRepository(db)

    def get_referral(self, user: User) -> dict:
        # Lazily backfill a referral code for accounts created before this feature.
        if not user.referral_code:
            user.referral_code = self.users._generate_referral_code()
            self.db.commit()

        referred_count = (
            self.db.query(func.count(User.id))
            .filter(User.referred_by_id == user.id)
            .scalar()
        ) or 0

        recent = (
            self.db.query(User, Profile)
            .join(Profile, Profile.user_id == User.id)
            .filter(User.referred_by_id == user.id)
            .order_by(User.created_at.desc())
            .limit(10)
            .all()
        )
        link = f"{settings.frontend_url}/auth/register?ref={user.referral_code}"
        return {
            "referral_code": user.referral_code,
            "referral_link": link,
            "referred_count": int(referred_count),
            "is_campus_ambassador": user.is_campus_ambassador,
            "recent_referrals": [
                {
                    "user_id": u.id,
                    "display_name": p.display_name or "Builder",
                    "joined_at": u.created_at,
                }
                for u, p in recent
            ],
        }

    def apply_ambassador(self, user: User) -> dict:
        profile = self.users.get_profile(user.id)
        if not profile or not profile.college:
            raise ValidationError("Add your college to your profile before becoming a campus ambassador")
        if not user.is_campus_ambassador:
            self.users.update(user, is_campus_ambassador=True)
            self.db.commit()
        return self.get_referral(user)

    def campus_leaderboard(self, limit: int = 15) -> dict:
        college_rows = (
            self.db.query(Profile.college, func.count(Profile.id).label("cnt"))
            .filter(Profile.college.isnot(None), Profile.college != "")
            .group_by(Profile.college)
            .order_by(func.count(Profile.id).desc())
            .limit(limit)
            .all()
        )

        ref_counts = (
            self.db.query(
                User.referred_by_id.label("rid"),
                func.count(User.id).label("cnt"),
            )
            .filter(User.referred_by_id.isnot(None))
            .group_by(User.referred_by_id)
            .subquery()
        )
        amb_rows = (
            self.db.query(User, Profile, func.coalesce(ref_counts.c.cnt, 0).label("refs"))
            .join(Profile, Profile.user_id == User.id)
            .outerjoin(ref_counts, ref_counts.c.rid == User.id)
            .filter(User.is_campus_ambassador == True)  # noqa: E712
            .order_by(func.coalesce(ref_counts.c.cnt, 0).desc())
            .limit(limit)
            .all()
        )

        return {
            "colleges": [
                {"college": college, "builder_count": int(cnt)}
                for college, cnt in college_rows
            ],
            "ambassadors": [
                {
                    "user_id": u.id,
                    "display_name": p.display_name or "Builder",
                    "college": p.college,
                    "referrals": int(refs),
                }
                for u, p, refs in amb_rows
            ],
        }
