import uuid
from typing import Any

from sqlalchemy import func, or_, desc, asc
from sqlalchemy.orm import Session, joinedload

from app.projects.models import (
    Collaboration,
    ContributorRequest,
    ContributorRequestStatus,
    Project,
    ProjectAnalysis,
    ProjectLanguage,
    ProjectStatus,
    ProjectVerification,
    AnalysisStatus,
)


# Applied to every public discovery query, and deliberately NOT to `get_by_id`,
# `get_full` or `get_by_owner`.
#
# A listing withheld by the duplicate screen disappears from browse, search and
# the marketplace rails, but stays fully visible to its owner and to admins.
# Hiding a project from the person who built it — over an automated similarity
# guess they cannot see or appeal — would be the wrong failure mode.
NOT_WITHHELD = Project.duplicate_status != "withheld"


class ProjectRepository:
    def __init__(self, db: Session):
        self.db = db

    # ── Core CRUD ─────────────────────────────────────────────────────────────

    def get_by_id(self, project_id: uuid.UUID, include_deleted: bool = False) -> Project | None:
        q = self.db.query(Project).filter(Project.id == project_id)
        if not include_deleted:
            q = q.filter(Project.is_deleted == False)
        return q.first()

    def get_by_github_repo_id(self, github_repo_id: int) -> Project | None:
        return (
            self.db.query(Project)
            .filter(Project.github_repo_id == github_repo_id, Project.is_deleted == False)
            .first()
        )

    def get_full(self, project_id: uuid.UUID) -> Project | None:
        """Eager-load all relations for detail view."""
        return (
            self.db.query(Project)
            .options(
                joinedload(Project.owner),
                joinedload(Project.analysis),
                joinedload(Project.verification),
                joinedload(Project.languages),
            )
            .filter(Project.id == project_id, Project.is_deleted == False)
            .first()
        )

    def create(self, owner_id: uuid.UUID, **kwargs) -> Project:
        project = Project(owner_id=owner_id, **kwargs)
        self.db.add(project)
        self.db.flush()
        # Auto-create analysis and verification placeholders
        analysis = ProjectAnalysis(project_id=project.id, status=AnalysisStatus.PENDING)
        verification = ProjectVerification(project_id=project.id)
        self.db.add(analysis)
        self.db.add(verification)
        self.db.flush()
        return project

    def update(self, project: Project, **kwargs) -> Project:
        for key, value in kwargs.items():
            setattr(project, key, value)
        self.db.flush()
        return project

    def soft_delete(self, project: Project) -> None:
        project.is_deleted = True
        self.db.flush()

    # ── Discovery / Feed queries ──────────────────────────────────────────────

    def list_projects(
        self,
        page: int = 1,
        per_page: int = 20,
        search: str | None = None,
        language: str | None = None,
        stage: str | None = None,
        status: str | None = None,
        seeking_contributors: bool | None = None,
        for_sale: bool | None = None,
        sort_by: str = "created_at",
        sort_dir: str = "desc",
    ) -> tuple[list[Project], int]:
        q = (
            self.db.query(Project)
            .options(
                joinedload(Project.analysis),
                joinedload(Project.verification),
            )
            .filter(
                Project.is_deleted == False,
                Project.is_private == False,
                NOT_WITHHELD,
                NOT_WITHHELD,
            )
        )

        if search:
            term = f"%{search}%"
            q = q.filter(
                or_(
                    Project.title.ilike(term),
                    Project.description.ilike(term),
                    Project.repo_full_name.ilike(term),
                )
            )
        if language:
            q = q.filter(Project.primary_language.ilike(language))
        if stage:
            q = q.filter(Project.stage == stage)
        if status:
            q = q.filter(Project.status == status)
        if seeking_contributors is not None:
            q = q.filter(Project.is_seeking_contributors == seeking_contributors)
        if for_sale is not None:
            q = q.filter(Project.is_for_sale == for_sale)

        total = q.count()

        sort_col = getattr(Project, sort_by, Project.created_at)
        q = q.order_by(desc(sort_col) if sort_dir == "desc" else asc(sort_col))
        items = q.offset((page - 1) * per_page).limit(per_page).all()
        return items, total

    def get_trending(self, limit: int = 12) -> list[Project]:
        """Projects with most stars + recent activity."""
        return (
            self.db.query(Project)
            .options(joinedload(Project.analysis))
            .filter(
                Project.is_deleted == False,
                Project.is_private == False,
                NOT_WITHHELD,
                Project.status != ProjectStatus.ARCHIVED,
            )
            .order_by(desc(Project.stars), desc(Project.updated_at))
            .limit(limit)
            .all()
        )

    def get_high_potential(self, limit: int = 12) -> list[Project]:
        """Projects with highest AI startup_potential score."""
        return (
            self.db.query(Project)
            .join(ProjectAnalysis, Project.id == ProjectAnalysis.project_id)
            .filter(
                Project.is_deleted == False,
                Project.is_private == False,
                NOT_WITHHELD,
                ProjectAnalysis.startup_potential.isnot(None),
                ProjectAnalysis.status == AnalysisStatus.COMPLETED,
            )
            .order_by(desc(ProjectAnalysis.startup_potential))
            .limit(limit)
            .all()
        )

    def get_seeking_contributors(self, limit: int = 12) -> list[Project]:
        return (
            self.db.query(Project)
            .options(joinedload(Project.analysis))
            .filter(
                Project.is_deleted == False,
                Project.is_private == False,
                NOT_WITHHELD,
                Project.is_seeking_contributors == True,
                Project.status != ProjectStatus.ARCHIVED,
            )
            .order_by(desc(Project.updated_at))
            .limit(limit)
            .all()
        )

    def get_verified(self, limit: int = 12) -> list[Project]:
        return (
            self.db.query(Project)
            .options(joinedload(Project.verification))
            .filter(
                Project.is_deleted == False,
                Project.is_private == False,
                NOT_WITHHELD,
                Project.is_verified == True,
            )
            .order_by(desc(Project.updated_at))
            .limit(limit)
            .all()
        )

    def get_for_sale(self, limit: int = 12) -> list[Project]:
        """Projects listed for sale — the core marketplace feed."""
        return (
            self.db.query(Project)
            .options(joinedload(Project.analysis), joinedload(Project.verification))
            .filter(
                Project.is_deleted == False,
                Project.is_private == False,
                NOT_WITHHELD,
                Project.is_for_sale == True,
                Project.price_paise.isnot(None),
            )
            .order_by(desc(Project.is_featured), desc(Project.updated_at))
            .limit(limit)
            .all()
        )

    def get_recently_revived(self, limit: int = 12) -> list[Project]:
        return (
            self.db.query(Project)
            .options(joinedload(Project.analysis))
            .filter(
                Project.is_deleted == False,
                Project.is_private == False,
                NOT_WITHHELD,
                Project.status == ProjectStatus.REVIVED,
            )
            .order_by(desc(Project.updated_at))
            .limit(limit)
            .all()
        )

    def get_by_owner(self, owner_id: uuid.UUID) -> list[Project]:
        return (
            self.db.query(Project)
            .options(joinedload(Project.analysis), joinedload(Project.verification))
            .filter(Project.owner_id == owner_id, Project.is_deleted == False)
            .order_by(desc(Project.created_at))
            .all()
        )

    # ── Languages ─────────────────────────────────────────────────────────────

    def replace_languages(
        self, project_id: uuid.UUID, languages: list[dict[str, Any]]
    ) -> None:
        self.db.query(ProjectLanguage).filter(
            ProjectLanguage.project_id == project_id
        ).delete()
        for lang in languages:
            self.db.add(ProjectLanguage(project_id=project_id, **lang))
        self.db.flush()

    # ── Analysis ──────────────────────────────────────────────────────────────

    def get_analysis(self, project_id: uuid.UUID) -> ProjectAnalysis | None:
        return (
            self.db.query(ProjectAnalysis)
            .filter(ProjectAnalysis.project_id == project_id)
            .first()
        )

    def update_analysis(self, analysis: ProjectAnalysis, **kwargs) -> ProjectAnalysis:
        for key, value in kwargs.items():
            setattr(analysis, key, value)
        self.db.flush()
        return analysis

    # ── Verification ──────────────────────────────────────────────────────────

    def get_verification(self, project_id: uuid.UUID) -> ProjectVerification | None:
        return (
            self.db.query(ProjectVerification)
            .filter(ProjectVerification.project_id == project_id)
            .first()
        )

    def update_verification(self, v: ProjectVerification, **kwargs) -> ProjectVerification:
        for key, value in kwargs.items():
            setattr(v, key, value)
        self.db.flush()
        return v

    # ── Contributor requests ──────────────────────────────────────────────────

    def get_contributor_request(self, request_id: uuid.UUID) -> ContributorRequest | None:
        return self.db.get(ContributorRequest, request_id)

    def get_pending_request(
        self, project_id: uuid.UUID, requester_id: uuid.UUID
    ) -> ContributorRequest | None:
        return (
            self.db.query(ContributorRequest)
            .filter(
                ContributorRequest.project_id == project_id,
                ContributorRequest.requester_id == requester_id,
                ContributorRequest.status == ContributorRequestStatus.PENDING,
            )
            .first()
        )

    def list_contributor_requests(
        self, project_id: uuid.UUID
    ) -> list[ContributorRequest]:
        return (
            self.db.query(ContributorRequest)
            .options(joinedload(ContributorRequest.requester))
            .filter(ContributorRequest.project_id == project_id)
            .order_by(desc(ContributorRequest.created_at))
            .all()
        )

    def create_contributor_request(
        self, project_id: uuid.UUID, requester_id: uuid.UUID, **kwargs
    ) -> ContributorRequest:
        req = ContributorRequest(
            project_id=project_id, requester_id=requester_id, **kwargs
        )
        self.db.add(req)
        self.db.flush()
        return req

    def update_contributor_request(
        self, req: ContributorRequest, **kwargs
    ) -> ContributorRequest:
        for key, value in kwargs.items():
            setattr(req, key, value)
        self.db.flush()
        return req

    # ── Collaborations ────────────────────────────────────────────────────────

    def get_collaborators(self, project_id: uuid.UUID) -> list[Collaboration]:
        return (
            self.db.query(Collaboration)
            .options(joinedload(Collaboration.user))
            .filter(
                Collaboration.project_id == project_id,
                Collaboration.is_active == True,
            )
            .all()
        )

    def add_collaborator(
        self, project_id: uuid.UUID, user_id: uuid.UUID, role: str = "contributor"
    ) -> Collaboration:
        collab = Collaboration(project_id=project_id, user_id=user_id, role=role)
        self.db.add(collab)
        self.db.flush()
        return collab

    def is_collaborator(self, project_id: uuid.UUID, user_id: uuid.UUID) -> bool:
        return (
            self.db.query(Collaboration)
            .filter(
                Collaboration.project_id == project_id,
                Collaboration.user_id == user_id,
                Collaboration.is_active == True,
            )
            .count()
            > 0
        )
