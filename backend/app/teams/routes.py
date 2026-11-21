import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import get_current_user, get_current_verified_user, get_optional_user
from app.core.exceptions import NotFoundError
from app.teams.schemas import (
    MemberEarningsRead, TeamRead, TeamRespondRequest, TeamSetRequest,
)
from app.teams.service import TeamService
from app.users.models import User

router = APIRouter(prefix="/teams", tags=["teams"])


def _team_payload(project_id: uuid.UUID, db: Session) -> TeamRead:
    from app.users.models import Profile

    service = TeamService(db)
    members = service.list_members(project_id)
    out = []
    accepted_bps = 0
    for member in members:
        profile = (
            db.query(Profile).filter(Profile.user_id == member.user_id).first()
        )
        if member.status == "accepted":
            accepted_bps += member.revenue_share_bps
        out.append({
            "id": member.id,
            "project_id": member.project_id,
            "user_id": member.user_id,
            "revenue_share_bps": member.revenue_share_bps,
            "contribution": member.contribution,
            "role": member.role,
            "status": member.status,
            "is_lead": member.is_lead,
            "created_at": member.created_at,
            "display_name": getattr(profile, "display_name", None),
            "avatar_url": getattr(profile, "avatar_url", None),
            "github_username": getattr(profile, "github_username", None),
        })
    return TeamRead(
        project_id=project_id,
        is_team_project=len([m for m in members if m.status == "accepted"]) > 1,
        members=out,
        total_bps=sum(m.revenue_share_bps for m in members),
        is_fully_accepted=accepted_bps == 10_000,
    )


@router.get("/projects/{project_id}", response_model=TeamRead)
def get_team(
    project_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: User | None = Depends(get_optional_user),
):
    """A project's co-owners and their revenue splits.

    Public: who built a project is part of what makes it credible, and a buyer
    should know they are dealing with a team rather than one person.
    """
    from app.projects.repository import ProjectRepository

    if not ProjectRepository(db).get_by_id(project_id):
        raise NotFoundError("Project")
    return _team_payload(project_id, db)


@router.put("/projects/{project_id}", response_model=TeamRead)
def set_team(
    project_id: uuid.UUID,
    data: TeamSetRequest,
    current_user: User = Depends(get_current_verified_user),
    db: Session = Depends(get_db),
):
    """Define the whole team and their splits. Lead owner only."""
    from app.projects.repository import ProjectRepository

    project = ProjectRepository(db).get_by_id(project_id)
    if not project:
        raise NotFoundError("Project")

    TeamService(db).set_team(
        project,
        current_user.id,
        [m.model_dump() for m in data.members],
    )
    return _team_payload(project_id, db)


@router.post("/projects/{project_id}/respond", response_model=TeamRead)
def respond_to_invite(
    project_id: uuid.UUID,
    data: TeamRespondRequest,
    current_user: User = Depends(get_current_verified_user),
    db: Session = Depends(get_db),
):
    """Accept or decline a co-ownership invite."""
    TeamService(db).respond(project_id, current_user.id, accept=data.accept)
    return _team_payload(project_id, db)


@router.get("/my-memberships", response_model=list[dict])
def my_memberships(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Team projects the current user co-owns, including pending invites."""
    rows = TeamService(db).team_projects_for(current_user.id)
    return [
        {
            "project_id": row.project_id,
            "project_title": getattr(row.project, "title", None),
            "revenue_share_bps": row.revenue_share_bps,
            "contribution": row.contribution,
            "role": row.role,
            "status": row.status,
            "is_lead": row.is_lead,
        }
        for row in rows
    ]


@router.get("/my-splits", response_model=MemberEarningsRead)
def my_splits(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Earnings the current user received as a co-owner."""
    return TeamService(db).member_earnings(current_user.id)
