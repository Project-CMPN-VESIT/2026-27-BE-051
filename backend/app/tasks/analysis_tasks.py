import uuid

from celery import shared_task
from sqlalchemy.orm import Session

from app.ai.service import AIAnalysisService
from app.core.celery_app import run_async
from app.core.database import SessionLocal
from app.core.logging import get_logger
from app.github.service import GitHubClient, compute_language_distribution
from app.projects.models import AnalysisStatus
from app.projects.repository import ProjectRepository
from app.users.repository import UserRepository

logger = get_logger("tasks.analysis")


@shared_task(
    bind=True,
    max_retries=3,
    default_retry_delay=60,
    name="app.tasks.analysis_tasks.run_project_analysis",
)
def run_project_analysis(self, project_id: str, github_token: str | None = None):
    """
    Full AI analysis pipeline for a project.
    1. Fetch repo metadata from GitHub
    2. Generate AI scores via OpenRouter
    3. Persist results
    """
    db: Session = SessionLocal()
    try:
        project_uuid = uuid.UUID(project_id)
        repo = ProjectRepository(db)
        project = repo.get_full(project_uuid)

        if not project:
            logger.error("Project not found for analysis", project_id=project_id)
            return

        analysis = repo.get_analysis(project_uuid)
        if not analysis:
            logger.error("Analysis record not found", project_id=project_id)
            return

        # Mark running
        repo.update_analysis(analysis, status=AnalysisStatus.RUNNING)
        db.commit()

        # Fetch enriched data from GitHub if token available
        readme = None
        contributors_count = 0
        languages = [project.primary_language] if project.primary_language else []
        code_digest = None
        commit_summary = None
        repo_signals: dict = {}
        dependency_audit: dict | None = None

        if github_token:
            try:
                gh = GitHubClient(github_token)
                gh_data = run_async(_fetch_github_enrichment(gh, project.repo_full_name))
                readme = gh_data.get("readme")
                contributors_count = gh_data.get("contributors_count", 0)
                code_digest = gh_data.get("code_digest")
                commit_summary = gh_data.get("commit_summary")
                repo_signals = gh_data.get("repo_signals") or {}
                dependency_audit = build_dependency_audit(
                    gh_data.get("manifests") or {}, repo_signals
                )
                raw_languages = gh_data.get("languages", {})
                if raw_languages:
                    lang_dist = compute_language_distribution(raw_languages)
                    repo.replace_languages(project_uuid, lang_dist)
                    languages = list(raw_languages.keys())
            except Exception as gh_exc:
                logger.warning(
                    "GitHub enrichment failed — proceeding without it",
                    project_id=project_id,
                    error=str(gh_exc),
                )

        # Run AI analysis
        ai_svc = AIAnalysisService()
        result = run_async(
            ai_svc.analyze_project(
                repo_full_name=project.repo_full_name,
                description=project.description,
                readme=readme,
                languages=languages,
                stars=project.stars,
                forks=project.forks,
                contributors_count=contributors_count,
                topics=project.topics,
                github_created_at=project.github_created_at,
                github_pushed_at=project.github_pushed_at,
                code_digest=code_digest,
                commit_summary=commit_summary,
            )
        )

        repo.update_analysis(
            analysis,
            status=AnalysisStatus.COMPLETED,
            repo_signals=repo_signals or None,
            dependency_audit=dependency_audit,
            code_reviewed=bool(code_digest),
            **result,
        )

        # Re-screen for duplicates now that the dependency fingerprint and
        # directory layout exist. The import-time screen only had title, topics
        # and description to work with; this pass is the accurate one.
        try:
            from app.trust.service import DuplicateService
            DuplicateService(db).screen(project, commit=False)
        except Exception as dup_exc:
            logger.warning(
                "duplicate_rescreen_failed", project_id=project_id, error=str(dup_exc)
            )

        from app.projects.models import ProjectEventType
        from app.projects.timeline import record_event
        health = result.get("health_score")
        record_event(
            db, uuid.UUID(project_id), ProjectEventType.ANALYSIS_COMPLETED,
            "AI analysis completed",
            f"Health {health}/100" if health is not None else None,
        )

        db.commit()
        logger.info("Analysis completed", project_id=project_id)

    except Exception as exc:
        logger.error("Analysis task failed", project_id=project_id, error=str(exc))
        try:
            analysis = ProjectRepository(db).get_analysis(uuid.UUID(project_id))
            if analysis:
                ProjectRepository(db).update_analysis(
                    analysis,
                    status=AnalysisStatus.FAILED,
                    error_message=str(exc)[:500],
                )
                db.commit()
        except Exception:
            pass
        raise self.retry(exc=exc)
    finally:
        db.close()


async def _fetch_github_enrichment(gh: GitHubClient, full_name: str) -> dict:
    import asyncio

    from app.github.code_digest import build_code_digest, summarise_commits

    readme, languages, contributors, commits, digest = await asyncio.gather(
        gh.get_readme(full_name),
        gh.get_languages(full_name),
        gh.get_contributors(full_name),
        gh.get_commits(full_name, per_page=30),
        build_code_digest(gh, full_name),
        return_exceptions=True,
    )

    digest_data = digest if isinstance(digest, dict) else {}
    commit_list = commits if isinstance(commits, list) else []

    return {
        "readme": readme if not isinstance(readme, Exception) else None,
        "languages": languages if not isinstance(languages, Exception) else {},
        "contributors_count": len(contributors) if isinstance(contributors, list) else 0,
        "commit_summary": summarise_commits(commit_list),
        "code_digest": digest_data.get("digest"),
        "repo_signals": digest_data.get("signals") or {},
        "manifests": digest_data.get("manifests") or {},
    }


def build_dependency_audit(manifests: dict, repo_signals: dict) -> dict | None:
    """Run the licence/dependency audit over fetched manifests.

    Returns the serialised audit, or None when no manifest could be read — an
    empty audit and an unread one are different claims, and only the second is
    honest when we never saw a manifest.
    """
    if not manifests:
        return None
    from app.trust.dependency_audit import audit_dependencies, parse_manifest

    audit = audit_dependencies(
        manifests,
        has_lockfile=bool(repo_signals.get("has_lockfile", True)),
    )
    if not audit.scanned:
        return None

    payload = audit.as_dict()
    # Package names are kept for the duplicate screen's dependency fingerprint.
    # Versions are not — they add nothing to similarity and change every install.
    names: set[str] = set()
    for path, content in manifests.items():
        deps, _ = parse_manifest(path, content or "")
        names.update(deps.keys())
    payload["dependency_names"] = sorted(names)
    return payload
