"""AI pitch deck generation for a project (paid SKU)."""
import uuid
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.ai.service import AIAnalysisService
from app.core.exceptions import ForbiddenError, NotFoundError, ValidationError
from app.core.logging import get_logger
from app.github.service import GitHubClient
from app.projects.models import AnalysisStatus, ProjectPitchDeck
from app.projects.repository import ProjectRepository

logger = get_logger("pitchdeck")


class PitchDeckService:
    def __init__(self, db: Session):
        self.db = db
        self.repo = ProjectRepository(db)

    def get_record(self, project_id: uuid.UUID) -> ProjectPitchDeck | None:
        return (
            self.db.query(ProjectPitchDeck)
            .filter(ProjectPitchDeck.project_id == project_id)
            .first()
        )

    def _get_or_create(self, project_id: uuid.UUID) -> ProjectPitchDeck:
        rec = self.get_record(project_id)
        if not rec:
            rec = ProjectPitchDeck(project_id=project_id, status=AnalysisStatus.PENDING)
            self.db.add(rec)
            self.db.flush()
        return rec

    async def generate(
        self,
        project_id: uuid.UUID,
        requester_id: uuid.UUID,
        is_admin: bool = False,
        github_token: str | None = None,
    ) -> ProjectPitchDeck:
        project = self.repo.get_by_id(project_id)
        if not project:
            raise NotFoundError("Project")
        if project.owner_id != requester_id and not is_admin:
            raise ForbiddenError("Only the project owner can generate a pitch deck")
        if not project.pitch_deck_unlocked and not is_admin:
            raise ValidationError("Purchase the pitch deck to generate it")

        rec = self._get_or_create(project_id)
        if rec.status == AnalysisStatus.RUNNING:
            raise ValidationError("A pitch deck is already being generated")

        rec.status = AnalysisStatus.RUNNING
        rec.error_message = None
        self.db.commit()

        # Best-effort README fetch for richer context (needs a GitHub token).
        readme = None
        if github_token:
            try:
                readme = await GitHubClient(github_token).get_readme(project.repo_full_name)
            except Exception as exc:
                logger.info("README fetch skipped for pitch deck", error=str(exc))

        analysis = self.repo.get_analysis(project_id)
        analysis_summary = None
        if analysis and analysis.reasoning:
            analysis_summary = (
                f"health={analysis.health_score}, completion={analysis.completion_score}, "
                f"startup_potential={analysis.startup_potential}. {analysis.reasoning[:800]}"
            )

        try:
            result = await AIAnalysisService().generate_pitch_deck(
                title=project.title,
                repo_full_name=project.repo_full_name,
                description=project.description,
                readme=readme,
                languages=[l.language for l in (project.languages or [])] or (
                    [project.primary_language] if project.primary_language else []
                ),
                topics=project.topics or [],
                stars=project.stars,
                contributors_count=len(self.repo.get_collaborators(project_id)) + 1,
                analysis_summary=analysis_summary,
            )
        except Exception as exc:
            rec.status = AnalysisStatus.FAILED
            rec.error_message = str(exc)[:1000]
            self.db.commit()
            logger.error("Pitch deck generation failed", project_id=str(project_id), error=str(exc))
            raise

        # Interleave the model's narrative with computed, verifiable slides. The
        # score and traction slides are built from database rows, never written by
        # the model — a hallucinated traction figure would discredit the deck and
        # the platform that produced it.
        from app.projects.deck_builder import assemble_deck

        verification = self.repo.get_verification(project_id)
        owner_profile = None
        try:
            from app.users.models import Profile
            owner_profile = (
                self.db.query(Profile).filter(Profile.user_id == project.owner_id).first()
            )
        except Exception:
            owner_profile = None

        slides = assemble_deck(
            self.db, project, verification, owner_profile, result,
        )

        rec.slides = {"slides": slides}
        rec.tagline = result["tagline"]
        rec.model_used = result["model_used"]
        rec.status = AnalysisStatus.COMPLETED
        rec.generated_at = datetime.now(timezone.utc).isoformat()
        self.db.commit()
        self.db.refresh(rec)

        logger.info("Pitch deck generated", project_id=str(project_id), slides=len(slides))
        return rec

    async def refine_slide(
        self,
        project_id: uuid.UUID,
        requester_id: uuid.UUID,
        slide_index: int,
        instruction: str,
        is_admin: bool = False,
    ) -> ProjectPitchDeck:
        """Rewrite one narrative slide from a plain-English instruction.

        Only narrative slides can be refined. The score and traction slides are
        computed from data, so "make it more impressive" must not be able to touch
        them — that would turn a verifiable claim back into a marketing one.
        """
        from app.ai.service import AIAnalysisService, AIUnavailableError
        from app.projects.deck_builder import KIND_NARRATIVE, KIND_ASK

        project = self.repo.get_by_id(project_id)
        if not project:
            raise NotFoundError("Project")
        if project.owner_id != requester_id and not is_admin:
            raise ForbiddenError("Only the project owner can edit the pitch deck")

        rec = self.get_record(project_id)
        if not rec or rec.status != AnalysisStatus.COMPLETED:
            raise ValidationError("Generate the deck before editing it")

        slides = list((rec.slides or {}).get("slides") or [])
        if slide_index < 0 or slide_index >= len(slides):
            raise ValidationError("That slide doesn't exist")

        slide = slides[slide_index]
        kind = slide.get("kind", KIND_NARRATIVE)
        if kind not in (KIND_NARRATIVE, KIND_ASK):
            raise ValidationError(
                "This slide is generated from your project's verified data, so it "
                "can't be rewritten. Only narrative slides can be edited."
            )

        svc = AIAnalysisService()
        if not svc.available:
            raise ValidationError(
                "Editing needs an AI provider configured. Set an OpenRouter or "
                "Gemini API key to enable it."
            )

        try:
            updated = await svc.refine_slide(
                project_title=project.title,
                project_description=project.description,
                slide=slide,
                instruction=instruction,
            )
        except AIUnavailableError as exc:
            raise ValidationError(str(exc)) from exc
        except Exception as exc:
            logger.warning("slide_refine_failed", error=str(exc))
            raise ValidationError(f"Couldn't rewrite that slide: {exc}") from exc

        # Preserve kind and data — the model only supplies the prose.
        slides[slide_index] = {
            **slide,
            "headline": updated.get("headline") or slide.get("headline", ""),
            "bullets": updated.get("bullets") or slide.get("bullets", []),
            "speaker_note": updated.get("speaker_note") or slide.get("speaker_note", ""),
        }
        rec.slides = {"slides": slides}
        self.db.commit()
        self.db.refresh(rec)
        return rec
