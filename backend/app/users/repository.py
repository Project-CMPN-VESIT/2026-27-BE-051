import uuid

from sqlalchemy.orm import Session

from app.users.models import BuilderReputation, Profile, User


class UserRepository:
    def __init__(self, db: Session):
        self.db = db

    def get_by_id(self, user_id: uuid.UUID) -> User | None:
        return self.db.get(User, user_id)

    def get_by_email(self, email: str) -> User | None:
        return self.db.query(User).filter(User.email == email.lower()).first()

    def get_by_github_id(self, github_id: int) -> User | None:
        return self.db.query(User).filter(User.github_id == github_id).first()

    def get_by_google_id(self, google_id: str) -> User | None:
        return self.db.query(User).filter(User.google_id == google_id).first()

    def create(self, **kwargs) -> User:
        # Separate profile fields from user fields
        display_name = kwargs.pop("display_name", "")
        user_kwargs = {k: v for k, v in kwargs.items()
                       if k in ("email", "hashed_password", "role", "is_verified",
                                "is_active", "github_id", "google_id", "totp_secret",
                                "referred_by_id")}
        user = User(**user_kwargs)
        user.email = user_kwargs.get("email", "").lower()
        user.referral_code = self._generate_referral_code()
        self.db.add(user)
        self.db.flush()
        # Auto-create profile and reputation
        profile = Profile(user_id=user.id, display_name=display_name)
        reputation = BuilderReputation(user_id=user.id)
        self.db.add(profile)
        self.db.add(reputation)
        self.db.flush()
        return user

    def update(self, user: User, **kwargs) -> User:
        for key, value in kwargs.items():
            setattr(user, key, value)
        self.db.flush()
        return user

    def increment_failed_login(self, user: User) -> None:
        user.failed_login_attempts += 1
        self.db.flush()

    def reset_failed_login(self, user: User) -> None:
        user.failed_login_attempts = 0
        user.locked_until = None
        self.db.flush()

    def get_profile(self, user_id: uuid.UUID) -> Profile | None:
        return self.db.query(Profile).filter(Profile.user_id == user_id).first()

    def update_profile(self, user_id: uuid.UUID, **kwargs) -> Profile | None:
        profile = self.get_profile(user_id)
        if profile:
            for key, value in kwargs.items():
                setattr(profile, key, value)
            self.db.flush()
        return profile

    def get_reputation(self, user_id: uuid.UUID) -> BuilderReputation | None:
        return (
            self.db.query(BuilderReputation)
            .filter(BuilderReputation.user_id == user_id)
            .first()
        )

    def get_by_referral_code(self, code: str) -> User | None:
        return self.db.query(User).filter(User.referral_code == code).first()

    def _generate_referral_code(self) -> str:
        """Generate a short, unique referral code."""
        for _ in range(5):
            code = uuid.uuid4().hex[:8]
            if not self.get_by_referral_code(code):
                return code
        return uuid.uuid4().hex[:12]  # fallback, effectively unique
