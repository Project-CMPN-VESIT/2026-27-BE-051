import enum
import uuid
from datetime import datetime

from sqlalchemy import BigInteger, Boolean, Enum, ForeignKey, Integer, String, Text
from app.core.db_types import UUIDType
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class UserRole(str, enum.Enum):
    BUILDER = "builder"
    CONTRIBUTOR = "contributor"
    FOUNDER = "founder"
    MENTOR = "mentor"
    INCUBATOR = "incubator"
    # Faculty / placement-cell account for a partner institution. Read-only by
    # design: a college gets aggregate visibility into its own students' verified
    # output, and nothing else. It cannot see individual private data, cannot act
    # on a student's behalf, and has no marketplace powers.
    COLLEGE_PARTNER = "college_partner"
    ADMIN = "admin"


class User(Base):
    __tablename__ = "users"

    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    hashed_password: Mapped[str | None] = mapped_column(Text, nullable=True)
    role: Mapped[UserRole] = mapped_column(
        Enum(UserRole, name="user_role"), default=UserRole.BUILDER, nullable=False
    )
    is_verified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # OAuth identifiers
    github_id: Mapped[int | None] = mapped_column(BigInteger, unique=True, index=True, nullable=True)
    google_id: Mapped[str | None] = mapped_column(String(128), unique=True, index=True, nullable=True)

    # 2FA
    totp_secret: Mapped[str | None] = mapped_column(String(64), nullable=True)
    totp_enabled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    # Failed login tracking
    failed_login_attempts: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    locked_until: Mapped[datetime | None] = mapped_column(nullable=True)

    # ── Growth: referrals + campus ambassadors ───────────────────────────────
    referral_code: Mapped[str | None] = mapped_column(String(16), unique=True, index=True, nullable=True)
    referred_by_id: Mapped[uuid.UUID | None] = mapped_column(
        UUIDType, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    is_campus_ambassador: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    # Relationships
    profile: Mapped["Profile"] = relationship("Profile", back_populates="user", uselist=False, cascade="all, delete-orphan")
    refresh_tokens: Mapped[list["RefreshToken"]] = relationship("RefreshToken", back_populates="user", cascade="all, delete-orphan")
    reputation: Mapped["BuilderReputation"] = relationship("BuilderReputation", back_populates="user", uselist=False, cascade="all, delete-orphan")

    def __repr__(self) -> str:
        return f"<User id={self.id} email={self.email}>"


class Profile(Base):
    __tablename__ = "profiles"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUIDType, ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False
    )
    display_name: Mapped[str] = mapped_column(String(120), nullable=False, default="")
    bio: Mapped[str | None] = mapped_column(Text, nullable=True)
    avatar_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    github_username: Mapped[str | None] = mapped_column(String(60), nullable=True)
    location: Mapped[str | None] = mapped_column(String(120), nullable=True)
    college: Mapped[str | None] = mapped_column(String(200), nullable=True)
    graduation_year: Mapped[int | None] = mapped_column(Integer, nullable=True)
    linkedin_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    website_url: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Relationships
    user: Mapped["User"] = relationship("User", back_populates="profile")

    def __repr__(self) -> str:
        return f"<Profile user_id={self.user_id} display_name={self.display_name}>"


class BuilderReputation(Base):
    __tablename__ = "builder_reputations"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUIDType, ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False
    )
    contribution_score: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    trust_score: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    collab_score: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    completion_score: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    total_projects: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    verified_projects: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # ── Execution metrics (computed by ReputationService.recompute) ──────────
    contracts_completed: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    contracts_total: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    revenue_earned_paise: Mapped[int] = mapped_column(BigInteger, default=0, nullable=False)
    avg_build_score: Mapped[int | None] = mapped_column(Integer, nullable=True)
    reputation_points: Mapped[int] = mapped_column(Integer, default=0, nullable=False, index=True)
    tier: Mapped[str] = mapped_column(String(20), default="newcomer", nullable=False)
    last_computed_at: Mapped[datetime | None] = mapped_column(nullable=True)

    user: Mapped["User"] = relationship("User", back_populates="reputation")

    def __repr__(self) -> str:
        return f"<BuilderReputation user_id={self.user_id}>"


class RefreshToken(Base):
    __tablename__ = "refresh_tokens"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUIDType, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    family: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    is_revoked: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(nullable=False)
    user_agent: Mapped[str | None] = mapped_column(Text, nullable=True)
    ip_address: Mapped[str | None] = mapped_column(String(45), nullable=True)

    user: Mapped["User"] = relationship("User", back_populates="refresh_tokens")


class EmailVerification(Base):
    __tablename__ = "email_verifications"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUIDType, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(nullable=False)
    is_used: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)


class PasswordReset(Base):
    __tablename__ = "password_resets"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUIDType, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(nullable=False)
    is_used: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)


class AuditLog(Base):
    __tablename__ = "audit_logs"

    actor_id: Mapped[uuid.UUID | None] = mapped_column(
        UUIDType, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    action: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    target_type: Mapped[str | None] = mapped_column(String(50), nullable=True)
    target_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    details: Mapped[str | None] = mapped_column(Text, nullable=True)
    ip_address: Mapped[str | None] = mapped_column(String(45), nullable=True)

    actor: Mapped["User | None"] = relationship("User", foreign_keys=[actor_id])
