import uuid
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.core.email import send_contributor_request_email
from app.core.exceptions import (
    ConflictError,
    ForbiddenError,
    NotFoundError,
    ValidationError,
)
from app.core.logging import get_logger
from app.github.service import GitHubClient, build_project_metadata_from_repo
from app.projects.models import (
    AnalysisStatus,
    ContributorRequestStatus,
    Project,
)
from app.projects.repository import ProjectRepository
from app.projects.schemas import (
    ContributorRequestCreate,
    ProjectCreate,
    ProjectUpdate,
)
from app.users.models import User
from app.users.repository import UserRepository

logger = get_logger("projects")


class ProjectService:
    def __init__(self, db: Session):
        self.db = db
        self.repo = ProjectRepository(db)
        self.user_repo = UserRepository(db)

    # ── Import / Create ───────────────────────────────────────────────────────

    async def import_from_github(
        self,
        owner: User,
        github_token: str,
        data: ProjectCreate,
    ) -> Project:
        # Check duplicate
        if self.repo.get_by_github_repo_id(data.github_repo_id):
            raise ConflictError("This repository has already been imported to CodeBazaar")

        # Verify ownership via GitHub API
        gh = GitHubClient(github_token)
        if owner.github_id:
            is_owner = await gh.verify_ownership(data.repo_full_name, owner.github_id)
            if not is_owner:
                raise ForbiddenError("You do not own this GitHub repository")

        # Fetch live metadata
        try:
            gh_repo = await gh.get_repo(data.repo_full_name)
            metadata = build_project_metadata_from_repo(gh_repo)
        except Exception as exc:
            logger.warning("GitHub fetch failed — using provided data", error=str(exc))
            metadata = {
                "github_repo_id": data.github_repo_id,
                "repo_full_name": data.repo_full_name,
                "title": data.title,
                "description": data.description,
            }

        # Merge user overrides
        metadata["title"] = data.title or metadata.get("title", data.repo_full_name)
        if data.description:
            metadata["description"] = data.description
        metadata["stage"] = data.stage
        metadata["is_seeking_contributors"] = data.is_seeking_contributors

        project = self.repo.create(owner_id=owner.id, **metadata)
        self._update_owner_reputation(owner.id)

        # Screen for near-duplicates of existing listings before this becomes
        # marketplace-visible. Runs on metadata only at this point — the accurate
        # pass, with dependency and layout fingerprints, happens after analysis.
        # Deliberately best-effort: an unscreened project is the status quo, but a
        # failed import over a similarity check would be indefensible.
        from app.trust.service import DuplicateService
        DuplicateService(self.db).screen(project, commit=False)

        from app.projects.models import ProjectEventType
        from app.projects.timeline import record_event
        record_event(
            self.db, project.id, ProjectEventType.CREATED,
            "Project imported to CodeBazaar",
            f"Imported from {data.repo_full_name}",
            actor_id=owner.id,
        )
        self.db.commit()

        logger.info(
            "Project imported",
            project_id=str(project.id),
            repo=data.repo_full_name,
        )
        return project

    # ── Read ──────────────────────────────────────────────────────────────────

    def get_project(self, project_id: uuid.UUID) -> Project:
        project = self.repo.get_full(project_id)
        if not project:
            raise NotFoundError("Project")
        return project

    def list_projects(self, **kwargs):
        items, total = self.repo.list_projects(**kwargs)
        per_page = kwargs.get("per_page", 20)
        page = kwargs.get("page", 1)
        return items, total, -(-total // per_page)  # ceiling division for pages

    def get_discovery_feed(self) -> dict:
        return {
            "trending": self.repo.get_trending(),
            "high_potential": self.repo.get_high_potential(),
            "seeking_contributors": self.repo.get_seeking_contributors(),
            "verified": self.repo.get_verified(),
            "recently_revived": self.repo.get_recently_revived(),
        }

    def get_my_projects(self, owner_id: uuid.UUID) -> list[Project]:
        return self.repo.get_by_owner(owner_id)

    # ── Update ────────────────────────────────────────────────────────────────

    def update_project(
        self, project_id: uuid.UUID, owner: User, data: ProjectUpdate
    ) -> Project:
        project = self._get_owned_project(project_id, owner)
        was_for_sale = project.is_for_sale
        previous_stage = project.stage
        update_data = data.model_dump(exclude_none=True)
        if update_data:
            self.repo.update(project, **update_data)

        from app.projects.models import ProjectEventType
        from app.projects.timeline import record_event

        # Newly listed for sale is a notable, public milestone.
        if not was_for_sale and project.is_for_sale:
            price = f"₹{project.price_paise / 100:.0f}" if project.price_paise else "an undisclosed price"
            record_event(
                self.db, project.id, ProjectEventType.LISTED_FOR_SALE,
                "Listed for sale", f"Now available for {price}", actor_id=owner.id,
            )
        if project.stage != previous_stage:
            record_event(
                self.db, project.id, ProjectEventType.STAGE_CHANGED,
                f"Stage moved to {project.stage.value}", actor_id=owner.id,
            )

        self.db.commit()
        return project

    # ── Delete ────────────────────────────────────────────────────────────────

    def delete_project(self, project_id: uuid.UUID, owner: User) -> None:
        project = self._get_owned_project(project_id, owner)
        self.repo.soft_delete(project)
        self._update_owner_reputation(owner.id)
        self.db.commit()

    # ── Sync ──────────────────────────────────────────────────────────────────

    def trigger_sync(self, project_id: uuid.UUID, owner: User, github_token: str) -> None:
        project = self._get_owned_project(project_id, owner)
        from app.tasks.sync_tasks import sync_project_metadata
        sync_project_metadata.delay(str(project.id), github_token)

    # ── Analysis ──────────────────────────────────────────────────────────────

    def trigger_analysis(
        self, project_id: uuid.UUID, requester: User, github_token: str | None = None
    ) -> dict:
        project = self.repo.get_by_id(project_id)
        if not project:
            raise NotFoundError("Project")

        # Only owner or admin can trigger
        if project.owner_id != requester.id and requester.role.value != "admin":
            raise ForbiddenError("Only the project owner can trigger an analysis")

        analysis = self.repo.get_analysis(project_id)
        if analysis and analysis.status == AnalysisStatus.RUNNING:
            raise ConflictError("An analysis is already in progress")

        if analysis:
            self.repo.update_analysis(
                analysis,
                status=AnalysisStatus.PENDING,
                health_score=None,
                completion_score=None,
                startup_potential=None,
                impact_potential=None,
                error_message=None,
            )
            self.db.commit()

        from app.tasks.analysis_tasks import run_project_analysis
        task = run_project_analysis.delay(str(project_id), github_token)
        return {"task_id": task.id, "status": "queued"}

    def get_analysis_status(self, project_id: uuid.UUID) -> dict:
        analysis = self.repo.get_analysis(project_id)
        if not analysis:
            raise NotFoundError("Analysis")
        return {"status": analysis.status.value, "error": analysis.error_message}

    # ── Contributor requests ──────────────────────────────────────────────────

    def create_contributor_request(
        self,
        project_id: uuid.UUID,
        requester: User,
        data: ContributorRequestCreate,
    ) -> object:
        project = self.repo.get_by_id(project_id)
        if not project:
            raise NotFoundError("Project")

        if project.owner_id == requester.id:
            raise ValidationError("You cannot request to contribute to your own project")

        if not project.is_seeking_contributors:
            raise ValidationError("This project is not currently seeking contributors")

        if self.repo.get_pending_request(project_id, requester.id):
            raise ConflictError("You already have a pending request for this project")

        if self.repo.is_collaborator(project_id, requester.id):
            raise ConflictError("You are already a collaborator on this project")

        req = self.repo.create_contributor_request(
            project_id=project_id,
            requester_id=requester.id,
            message=data.message,
            skills_offered=data.skills_offered,
        )
        self.db.commit()

        # Notify owner
        owner = self.user_repo.get_by_id(project.owner_id)
        if owner and owner.profile:
            try:
                send_contributor_request_email(
                    to=owner.email,
                    project_title=project.title,
                    requester_name=requester.profile.display_name if requester.profile else requester.email,
                )
            except Exception:
                pass

        return req

    def list_contributor_requests(
        self, project_id: uuid.UUID, owner: User
    ) -> list:
        project = self._get_owned_project(project_id, owner)
        return self.repo.list_contributor_requests(project_id)

    def resolve_contributor_request(
        self,
        request_id: uuid.UUID,
        owner: User,
        status: ContributorRequestStatus,
    ) -> object:
        req = self.repo.get_contributor_request(request_id)
        if not req:
            raise NotFoundError("Contributor request")

        project = self.repo.get_by_id(req.project_id)
        if not project or project.owner_id != owner.id:
            raise ForbiddenError("Not your project")

        if req.status != ContributorRequestStatus.PENDING:
            raise ValidationError("Request has already been resolved")

        self.repo.update_contributor_request(
            req,
            status=status,
            resolved_at=datetime.now(timezone.utc).isoformat(),
        )

        if status == ContributorRequestStatus.ACCEPTED:
            self.repo.add_collaborator(req.project_id, req.requester_id)
            self._update_collab_scores(owner.id, req.requester_id)

            from app.projects.models import ProjectEventType
            from app.projects.timeline import record_event
            requester = self.user_repo.get_by_id(req.requester_id)
            name = (
                requester.profile.display_name
                if requester and requester.profile and requester.profile.display_name
                else "A new contributor"
            )
            record_event(
                self.db, req.project_id, ProjectEventType.CONTRIBUTOR_JOINED,
                f"{name} joined as a contributor",
                actor_id=req.requester_id,
            )

        self.db.commit()
        return req

    def get_collaborators(self, project_id: uuid.UUID) -> list:
        project = self.repo.get_by_id(project_id)
        if not project:
            raise NotFoundError("Project")
        return self.repo.get_collaborators(project_id)

    # ── Verification ──────────────────────────────────────────────────────────

    async def verify_ownership(
        self, project_id: uuid.UUID, owner: User, github_token: str
    ) -> object:
        project = self._get_owned_project(project_id, owner)
        if not owner.github_id:
            raise ValidationError("GitHub account not connected")

        gh = GitHubClient(github_token)
        is_owner = await gh.verify_ownership(project.repo_full_name, owner.github_id)

        verification = self.repo.get_verification(project_id)
        if not verification:
            raise NotFoundError("Verification record")

        self.repo.update_verification(verification, ownership_verified=is_owner)
        self._recalculate_verified_build_score(verification)
        self.db.commit()
        return verification

    def _recalculate_verified_build_score(self, verification) -> None:
        """Provisional Verified Build Score from component checks.

        This is only a lightweight fallback used before the full deterministic
        engine (app.verification.scoring) has run. Once that engine has produced
        a composite score, we must NOT clobber it here — the engine is the source
        of truth. To recompute the full score, enqueue
        app.tasks.verification_tasks.run_verified_build_score instead.
        """
        if verification.verified_build_score is not None:
            # Full engine score already exists; leave it untouched.
            return
        score = 0
        if verification.ownership_verified:
            score += 40
        if verification.hackathon_verified:
            score += 25
        originality = verification.originality_score or 0
        score += int(originality * 0.15)  # up to 15 points
        activity = verification.activity_consistency or 0
        score += int(activity * 0.20)  # up to 20 points
        verification.verified_build_score = min(100, score)

    # ── Internals ─────────────────────────────────────────────────────────────

    def _get_owned_project(self, project_id: uuid.UUID, owner: User) -> Project:
        project = self.repo.get_by_id(project_id)
        if not project:
            raise NotFoundError("Project")
        if project.owner_id != owner.id and owner.role.value != "admin":
            raise ForbiddenError("You do not own this project")
        return project

    def _update_owner_reputation(self, user_id: uuid.UUID) -> None:
        projects = self.repo.get_by_owner(user_id)
        total = len(projects)
        verified = sum(1 for p in projects if p.is_verified)
        rep = self.user_repo.get_reputation(user_id)
        if rep:
            rep.total_projects = total
            rep.verified_projects = verified
            self.db.flush()

    def _update_collab_scores(self, owner_id: uuid.UUID, contributor_id: uuid.UUID) -> None:
        for uid in (owner_id, contributor_id):
            rep = self.user_repo.get_reputation(uid)
            if rep:
                rep.collab_score = min(100, rep.collab_score + 5)
                self.db.flush()
