"""
Verified Build Score™ orchestration.

Bridges the pure scoring engine (`app.verification.scoring`) with:
  * the GitHub API (signal collection), and
  * the existing `ProjectVerification` table (persistence).

Signal collection is async (network); scoring and persistence are sync.
"""
from __future__ import annotations

import asyncio
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.core.exceptions import NotFoundError
from app.core.logging import get_logger
from app.github.service import GitHubClient
from app.projects.repository import ProjectRepository
from app.verification import scoring
from app.verification.scoring import BuildSignals, BuildScoreResult

logger = get_logger("verification")


def _parse_gh_datetime(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        # GitHub returns e.g. "2023-05-01T12:00:00Z"
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except (ValueError, AttributeError):
        return None


async def collect_signals(
    gh: GitHubClient,
    repo_full_name: str,
    *,
    ownership_verified: bool,
    hackathon_verified: bool,
) -> BuildSignals:
    """Gather all repository signals from GitHub concurrently.

    Any individual call failing degrades gracefully (that signal is treated as
    missing) rather than aborting the whole score.
    """
    try:
        repo, commits, contributors, readme = await asyncio.gather(
            gh.get_repo(repo_full_name),
            gh.get_commits(repo_full_name, per_page=100),
            gh.get_contributors(repo_full_name),
            gh.get_readme(repo_full_name),
            return_exceptions=True,
        )
    except Exception as exc:  # pragma: no cover - defensive
        logger.warning("Signal collection failed entirely", repo=repo_full_name, error=str(exc))
        return BuildSignals(signals_available=False)

    if isinstance(repo, Exception):
        logger.warning("Repo fetch failed", repo=repo_full_name, error=str(repo))
        return BuildSignals(signals_available=False)

    commits = commits if isinstance(commits, list) else []
    contributors = contributors if isinstance(contributors, list) else []
    readme_text = readme if isinstance(readme, str) else None

    commit_dates: list[datetime] = []
    for c in commits:
        date_str = (
            c.get("commit", {}).get("author", {}).get("date")
            if isinstance(c, dict) else None
        )
        parsed = _parse_gh_datetime(date_str)
        if parsed:
            commit_dates.append(parsed)

    # Top contributor share (concentration signal).
    contributions = [
        c.get("contributions", 0) for c in contributors if isinstance(c, dict)
    ]
    total_contrib = sum(contributions)
    top_share = (max(contributions) / total_contrib) if total_contrib > 0 else 0.0

    license_info = repo.get("license") if isinstance(repo, dict) else None

    return BuildSignals(
        repo_created_at=_parse_gh_datetime(repo.get("created_at")),
        repo_pushed_at=_parse_gh_datetime(repo.get("pushed_at")),
        is_fork=bool(repo.get("fork", False)),
        has_license=license_info is not None,
        has_description=bool(repo.get("description")),
        topics_count=len(repo.get("topics", []) or []),
        stars=repo.get("stargazers_count", 0),
        forks=repo.get("forks_count", 0),
        open_issues=repo.get("open_issues_count", 0),
        readme_length=len(readme_text) if readme_text else 0,
        commit_dates=commit_dates,
        # We requested up to 100 commits; treat history as complete only if
        # fewer than 100 came back (otherwise it's a truncated window).
        commit_history_complete=len(commits) < 100,
        contributors_count=len(contributors),
        top_contributor_share=top_share,
        ownership_verified=ownership_verified,
        hackathon_verified=hackathon_verified,
        signals_available=True,
    )


class VerificationService:
    """Computes and persists the Verified Build Score for a project."""

    def __init__(self, db: Session):
        self.db = db
        self.repo = ProjectRepository(db)

    async def compute_and_store(
        self, project_id, github_token: str | None
    ) -> BuildScoreResult:
        project = self.repo.get_by_id(project_id)
        if not project:
            raise NotFoundError("Project")

        verification = self.repo.get_verification(project_id)
        if not verification:
            raise NotFoundError("Verification record")

        if not github_token:
            # No token: we can still score using stored metadata but confidence is low.
            signals = BuildSignals(
                repo_created_at=_parse_gh_datetime(project.github_created_at),
                repo_pushed_at=_parse_gh_datetime(project.github_pushed_at),
                has_description=bool(project.description),
                topics_count=len(project.topics or []),
                stars=project.stars,
                forks=project.forks,
                open_issues=project.open_issues,
                ownership_verified=verification.ownership_verified,
                hackathon_verified=verification.hackathon_verified,
                signals_available=True,
            )
        else:
            gh = GitHubClient(github_token)
            signals = await collect_signals(
                gh,
                project.repo_full_name,
                ownership_verified=verification.ownership_verified,
                hackathon_verified=verification.hackathon_verified,
            )

        result = scoring.compute_build_score(signals)
        self._persist(project, verification, result)
        return result

    def _persist(self, project, verification, result: BuildScoreResult) -> None:
        self.repo.update_verification(
            verification,
            verified_at=datetime.now(timezone.utc).isoformat(),
            notes=result.reasoning,
            **result.as_verification_fields(),
        )

        # A project becomes "verified" only with a strong score, confirmed
        # ownership, and no disqualifying fraud flags.
        was_verified = bool(project.is_verified)
        is_verified = (
            result.verified_build_score >= scoring.VERIFIED_THRESHOLD
            and verification.ownership_verified
            and not (scoring.DISQUALIFYING_FLAGS & set(result.fraud_flags))
        )
        self.repo.update(project, is_verified=is_verified)

        # Append an immutable snapshot so the score has a defensible history.
        # Done here rather than in the route because every path that recomputes a
        # score goes through _persist, and a history with gaps is worse than none.
        from app.growth.analytics import record_score_snapshot
        record_score_snapshot(
            self.db,
            project=project,
            verification=verification,
            components={
                spec["key"]: getattr(verification, spec["field"], None)
                for spec in scoring.COMPONENT_SPEC
            },
        )

        # Timeline entry only on the false -> true transition.
        if is_verified and not was_verified:
            from app.projects.models import ProjectEventType
            from app.projects.timeline import record_event
            record_event(
                self.db, project.id, ProjectEventType.VERIFIED,
                f"Verified Build Score: {result.verified_build_score}/100",
                "Passed CodeBazaar's automated verification checks.",
            )

        self.db.commit()

        # Email the owner only on the false -> true transition.
        if is_verified and not was_verified:
            from app.users.models import User
            from app.core.email import send_project_verified_email
            owner = self.db.get(User, project.owner_id)
            if owner and owner.email:
                send_project_verified_email(owner.email, project.title, result.verified_build_score)
        logger.info(
            "Verified Build Score computed",
            project_id=str(project.id),
            score=result.verified_build_score,
            verified=is_verified,
            flags=result.fraud_flags,
        )
