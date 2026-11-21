import uuid
from datetime import datetime

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import get_current_verified_user
from app.core.exceptions import ConflictError, NotFoundError
from app.skills.models import ProjectSkill, Skill, UserSkill
from app.users.models import User


# ── Schemas ───────────────────────────────────────────────────────────────────

class SkillRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    name: str
    category: str | None


class UserSkillCreate(BaseModel):
    skill_name: str = Field(..., min_length=1, max_length=80)
    proficiency: str | None = Field(None, pattern="^(beginner|intermediate|expert)$")


class UserSkillRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    skill: SkillRead
    proficiency: str | None


class ProjectSkillCreate(BaseModel):
    skill_name: str = Field(..., min_length=1, max_length=80)
    is_required: bool = True


class ProjectSkillRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    skill: SkillRead
    is_required: bool


# ── Helpers ───────────────────────────────────────────────────────────────────

def _get_or_create_skill(db: Session, name: str) -> Skill:
    name = name.strip().lower()
    skill = db.query(Skill).filter(Skill.name == name).first()
    if not skill:
        skill = Skill(name=name)
        db.add(skill)
        db.flush()
    return skill


# ── Routers ───────────────────────────────────────────────────────────────────

router = APIRouter(tags=["skills"])


# User skills
@router.get("/users/me/skills", response_model=list[UserSkillRead])
def get_my_skills(
    current_user: User = Depends(get_current_verified_user),
    db: Session = Depends(get_db),
):
    return db.query(UserSkill).filter(UserSkill.user_id == current_user.id).all()


@router.get("/users/{user_id}/skills", response_model=list[UserSkillRead])
def get_user_skills(user_id: uuid.UUID, db: Session = Depends(get_db)):
    return db.query(UserSkill).filter(UserSkill.user_id == user_id).all()


@router.post("/users/me/skills", response_model=UserSkillRead, status_code=201)
def add_my_skill(
    data: UserSkillCreate,
    current_user: User = Depends(get_current_verified_user),
    db: Session = Depends(get_db),
):
    skill = _get_or_create_skill(db, data.skill_name)
    existing = db.query(UserSkill).filter(
        UserSkill.user_id == current_user.id, UserSkill.skill_id == skill.id
    ).first()
    if existing:
        raise ConflictError(f"Skill '{skill.name}' already added")
    us = UserSkill(user_id=current_user.id, skill_id=skill.id, proficiency=data.proficiency)
    db.add(us)
    db.commit()
    db.refresh(us)
    return us


@router.delete("/users/me/skills/{skill_id}", status_code=204)
def remove_my_skill(
    skill_id: uuid.UUID,
    current_user: User = Depends(get_current_verified_user),
    db: Session = Depends(get_db),
):
    us = db.query(UserSkill).filter(
        UserSkill.skill_id == skill_id, UserSkill.user_id == current_user.id
    ).first()
    if not us:
        raise NotFoundError("Skill")
    db.delete(us)
    db.commit()


# Project skills
@router.get("/projects/{project_id}/skills", response_model=list[ProjectSkillRead])
def get_project_skills(project_id: uuid.UUID, db: Session = Depends(get_db)):
    return db.query(ProjectSkill).filter(ProjectSkill.project_id == project_id).all()


@router.post("/projects/{project_id}/skills", response_model=ProjectSkillRead, status_code=201)
def add_project_skill(
    project_id: uuid.UUID,
    data: ProjectSkillCreate,
    current_user: User = Depends(get_current_verified_user),
    db: Session = Depends(get_db),
):
    from app.projects.models import Project
    from app.core.exceptions import ForbiddenError
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise NotFoundError("Project")
    if project.owner_id != current_user.id and current_user.role.value != "admin":
        raise ForbiddenError("Not your project")

    skill = _get_or_create_skill(db, data.skill_name)
    existing = db.query(ProjectSkill).filter(
        ProjectSkill.project_id == project_id, ProjectSkill.skill_id == skill.id
    ).first()
    if existing:
        raise ConflictError(f"Skill already added to project")

    ps = ProjectSkill(project_id=project_id, skill_id=skill.id, is_required=data.is_required)
    db.add(ps)
    db.commit()
    db.refresh(ps)
    return ps


@router.delete("/projects/{project_id}/skills/{skill_id}", status_code=204)
def remove_project_skill(
    project_id: uuid.UUID,
    skill_id: uuid.UUID,
    current_user: User = Depends(get_current_verified_user),
    db: Session = Depends(get_db),
):
    from app.projects.models import Project
    from app.core.exceptions import ForbiddenError
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise NotFoundError("Project")
    if project.owner_id != current_user.id and current_user.role.value != "admin":
        raise ForbiddenError("Not your project")

    ps = db.query(ProjectSkill).filter(
        ProjectSkill.project_id == project_id, ProjectSkill.skill_id == skill_id
    ).first()
    if not ps:
        raise NotFoundError("Skill")
    db.delete(ps)
    db.commit()


# Skill search
@router.get("/skills", response_model=list[SkillRead])
def search_skills(q: str = "", db: Session = Depends(get_db)):
    query = db.query(Skill)
    if q:
        query = query.filter(Skill.name.ilike(f"%{q}%"))
    return query.order_by(Skill.name).limit(30).all()
