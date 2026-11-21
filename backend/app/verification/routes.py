import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Header
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import get_current_verified_user
from app.core.exceptions import ForbiddenError, NotFoundError
from app.projects.repository import ProjectRepository
from app.users.models import User
from app.verification import scoring

router = APIRouter(prefix="/verification", tags=["verification"])


class ScoreComponent(BaseModel):
    key: str
    label: str
    weight: float
    score: int | None
    """Weighted points this component contributed to the composite (weight x score)."""
    contribution: float | None
    explains: str


class ScoreFlag(BaseModel):
    key: str
    label: str
    severity: str
    penalty: int
    explains: str


class BuildScoreRead(BaseModel):
    project_id: uuid.UUID
    verified_build_score: int | None
    originality_score: int | None
    activity_consistency: int | None
    repo_age_days: int | None
    ownership_verified: bool
    hackathon_verified: bool
    is_verified: bool
    reasoning: str | None
    verified_at: str | None

    # ── Explainability ────────────────────────────────────────────────────────
    confidence: str | None
    components: list[ScoreComponent]
    flags: list[ScoreFlag]
    total_penalty: int
    verified_threshold: int
    commits_analyzed: int | None
    contributors_count: int | None
    """True when this row predates breakdown persistence and has no components."""
    breakdown_available: bool


def _build_breakdown(verification) -> tuple[list[ScoreComponent], bool]:
    components: list[ScoreComponent] = []
    any_present = False
    for spec in scoring.COMPONENT_SPEC:
        raw = getattr(verification, spec["field"], None)
        if raw is not None:
            any_present = True
        components.append(
            ScoreComponent(
                key=spec["key"],
                label=spec["label"],
                weight=spec["weight"],
                score=raw,
                contribution=round(spec["weight"] * raw, 1) if raw is not None else None,
                explains=spec["explains"],
            )
        )
    return components, any_present


def _build_flags(verification) -> tuple[list[ScoreFlag], int]:
    keys = verification.fraud_flags or []
    flags: list[ScoreFlag] = []
    total_penalty = 0
    for key in keys:
        spec = scoring.FLAG_SPEC.get(key)
        if not spec:
            # Unknown flag from an older run — surface it rather than hide it.
            flags.append(
                ScoreFlag(
                    key=key,
                    label=key.replace("_", " ").capitalize(),
                    severity="warning",
                    penalty=0,
                    explains="No description recorded for this flag.",
                )
            )
            continue
        total_penalty += spec["penalty"]
        flags.append(
            ScoreFlag(
                key=key,
                label=spec["label"],
                severity=spec["severity"],
                penalty=spec["penalty"],
                explains=spec["explains"],
            )
        )
    return flags, total_penalty


def _serialise(project_id: uuid.UUID, project, verification) -> BuildScoreRead:
    components, breakdown_available = _build_breakdown(verification)
    flags, total_penalty = _build_flags(verification)
    return BuildScoreRead(
        project_id=project_id,
        verified_build_score=verification.verified_build_score,
        originality_score=verification.originality_score,
        activity_consistency=verification.activity_consistency,
        repo_age_days=verification.repo_age_days,
        ownership_verified=verification.ownership_verified,
        hackathon_verified=verification.hackathon_verified,
        is_verified=project.is_verified,
        reasoning=verification.notes,
        verified_at=verification.verified_at,
        confidence=verification.confidence,
        components=components,
        flags=flags,
        total_penalty=total_penalty,
        verified_threshold=scoring.VERIFIED_THRESHOLD,
        commits_analyzed=verification.commits_analyzed,
        contributors_count=verification.contributors_count,
        breakdown_available=breakdown_available,
    )


@router.post("/projects/{project_id}/build-score", status_code=202)
def trigger_build_score(
    project_id: uuid.UUID,
    x_github_token: Annotated[str | None, Header()] = None,
    current_user: User = Depends(get_current_verified_user),
    db: Session = Depends(get_db),
):
    """Queue a Verified Build Score™ computation for a project (owner or admin)."""
    repo = ProjectRepository(db)
    project = repo.get_by_id(project_id)
    if not project:
        raise NotFoundError("Project")
    if project.owner_id != current_user.id and current_user.role.value != "admin":
        raise ForbiddenError("Only the project owner can request verification")

    from app.tasks.verification_tasks import run_verified_build_score

    task = run_verified_build_score.delay(str(project_id), x_github_token)
    return {"task_id": task.id, "status": "queued"}


@router.get("/projects/{project_id}/build-score", response_model=BuildScoreRead)
def get_build_score(project_id: uuid.UUID, db: Session = Depends(get_db)):
    """Read the current Verified Build Score™ and its full, explainable breakdown."""
    repo = ProjectRepository(db)
    project = repo.get_by_id(project_id)
    if not project:
        raise NotFoundError("Project")
    verification = repo.get_verification(project_id)
    if not verification:
        raise NotFoundError("Verification record")

    return _serialise(project_id, project, verification)


@router.get("/methodology")
def get_methodology():
    """The scoring rulebook, served so the UI and docs never restate the weights.

    Public and unauthenticated on purpose: a score nobody can audit is not
    evidence, and buyers/recruiters land on the public report before signing up.
    """
    return {
        "verified_threshold": scoring.VERIFIED_THRESHOLD,
        "components": [
            {
                "key": s["key"],
                "label": s["label"],
                "weight": s["weight"],
                "explains": s["explains"],
            }
            for s in scoring.COMPONENT_SPEC
        ],
        "flags": [
            {
                "key": key,
                "label": spec["label"],
                "severity": spec["severity"],
                "penalty": spec["penalty"],
                "explains": spec["explains"],
            }
            for key, spec in scoring.FLAG_SPEC.items()
        ],
        "disqualifying_flags": sorted(scoring.DISQUALIFYING_FLAGS),
        "notes": (
            "The composite is a weighted sum of six components, minus penalties "
            "for fraud signals. A project is marked verified only when the "
            "composite meets the threshold, ownership is proved, and no "
            "disqualifying flag is present."
        ),
    }
