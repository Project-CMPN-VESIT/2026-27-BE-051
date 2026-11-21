import uuid

from sqlalchemy import ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.core.db_types import UUIDType


class Skill(Base):
    __tablename__ = "skills"
    __table_args__ = (UniqueConstraint("name"),)

    name: Mapped[str] = mapped_column(String(80), nullable=False, unique=True, index=True)
    category: Mapped[str | None] = mapped_column(String(60), nullable=True)


class UserSkill(Base):
    __tablename__ = "user_skills"
    __table_args__ = (UniqueConstraint("user_id", "skill_id"),)

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUIDType, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    skill_id: Mapped[uuid.UUID] = mapped_column(
        UUIDType, ForeignKey("skills.id", ondelete="CASCADE"), nullable=False
    )
    proficiency: Mapped[str | None] = mapped_column(String(20), nullable=True)  # beginner/intermediate/expert

    skill: Mapped["Skill"] = relationship("Skill")
    user: Mapped["User"] = relationship("User", foreign_keys=[user_id])  # type: ignore


class ProjectSkill(Base):
    __tablename__ = "project_skills"
    __table_args__ = (UniqueConstraint("project_id", "skill_id"),)

    project_id: Mapped[uuid.UUID] = mapped_column(
        UUIDType, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    skill_id: Mapped[uuid.UUID] = mapped_column(
        UUIDType, ForeignKey("skills.id", ondelete="CASCADE"), nullable=False
    )
    is_required: Mapped[bool] = mapped_column(default=True, nullable=False)

    skill: Mapped["Skill"] = relationship("Skill")
    project: Mapped["Project"] = relationship("Project", foreign_keys=[project_id])  # type: ignore
