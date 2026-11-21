"""Contributor matching engine.

Ranks builders against a project using explainable, deterministic signals:

  skill_fit      (0-55)  overlap between the project's needed skills and the
                         builder's declared skills, weighted by proficiency
  reliability    (0-25)  reputation tier + delivery/completion track record
  track_record   (0-15)  verified projects shipped
  collaboration  (0-5)   how well they've worked with others historically

Every match carries the reasons that produced its score, so a project owner
can see *why* someone was suggested rather than trusting a black box.
"""
import uuid
from dataclasses import dataclass, field

from sqlalchemy.orm import Session, joinedload

from app.core.exceptions import ForbiddenError, NotFoundError
from app.projects.models import Collaboration, Project
from app.skills.models import ProjectSkill, Skill, UserSkill
from app.users.models import BuilderReputation, Profile, User, UserRole

PROFICIENCY_WEIGHT = {"expert": 1.0, "intermediate": 0.75, "beginner": 0.5}

TIER_SCORE = {"elite": 25, "trusted": 19, "rising": 12, "newcomer": 5}

MAX_SKILL_POINTS = 55
MAX_TRACK_POINTS = 15
MAX_COLLAB_POINTS = 5


@dataclass
class ContributorMatch:
    user_id: uuid.UUID
    display_name: str
    avatar_url: str | None
    college: str | None
    tier: str
    match_score: int
    skill_fit: int
    reliability: int
    track_record: int
    collaboration: int
    matched_skills: list[str] = field(default_factory=list)
    missing_skills: list[str] = field(default_factory=list)
    reasons: list[str] = field(default_factory=list)


class ContributorMatchingService:
    def __init__(self, db: Session):
        self.db = db

    def _needed_skill_ids(self, project: Project) -> tuple[dict[uuid.UUID, str], set[uuid.UUID]]:
        """Return {skill_id: name} for all tagged skills, plus the required subset."""
        rows = (
            self.db.query(ProjectSkill, Skill)
            .join(Skill, ProjectSkill.skill_id == Skill.id)
            .filter(ProjectSkill.project_id == project.id)
            .all()
        )
        names = {skill.id: skill.name for _, skill in rows}
        required = {ps.skill_id for ps, _ in rows if ps.is_required}
        return names, required

    def _fallback_skill_ids(self, project: Project) -> dict[uuid.UUID, str]:
        """If the owner hasn't tagged skills, infer them from the repo's language
        and topics so matching still returns something useful."""
        terms = set()
        if project.primary_language:
            terms.add(project.primary_language.strip().lower())
        for t in (project.topics or [])[:8]:
            terms.add(str(t).strip().lower())
        if not terms:
            return {}
        rows = self.db.query(Skill).filter(Skill.name.in_(terms)).all()
        return {s.id: s.name for s in rows}

    def find_matches(
        self,
        project_id: uuid.UUID,
        requester: User,
        limit: int = 10,
    ) -> list[ContributorMatch]:
        project = (
            self.db.query(Project)
            .filter(Project.id == project_id, Project.is_deleted == False)
            .first()
        )
        if not project:
            raise NotFoundError("Project")
        if project.owner_id != requester.id and requester.role != UserRole.ADMIN:
            raise ForbiddenError("Only the project owner can view contributor matches")

        skill_names, required_ids = self._needed_skill_ids(project)
        inferred = False
        if not skill_names:
            skill_names = self._fallback_skill_ids(project)
            required_ids = set(skill_names.keys())
            inferred = True

        # People already on the project (or the owner) aren't candidates.
        excluded = {project.owner_id}
        excluded.update(
            r[0] for r in self.db.query(Collaboration.user_id)
            .filter(Collaboration.project_id == project_id, Collaboration.is_active == True)
            .all()
        )

        # Candidate pool: active, verified builders with a profile.
        candidates = (
            self.db.query(User)
            .options(joinedload(User.profile), joinedload(User.reputation))
            .filter(
                User.is_active == True,
                User.is_verified == True,
                User.id.notin_(excluded) if excluded else True,
                User.role.in_([UserRole.BUILDER, UserRole.CONTRIBUTOR]),
            )
            .limit(300)
            .all()
        )
        if not candidates:
            return []

        # Pull all candidate skills in one query.
        cand_ids = [c.id for c in candidates]
        skill_rows = (
            self.db.query(UserSkill.user_id, UserSkill.skill_id, UserSkill.proficiency)
            .filter(UserSkill.user_id.in_(cand_ids))
            .all()
        )
        by_user: dict[uuid.UUID, dict[uuid.UUID, str | None]] = {}
        for uid, sid, prof in skill_rows:
            by_user.setdefault(uid, {})[sid] = prof

        matches: list[ContributorMatch] = []
        for cand in candidates:
            match = self._score(
                cand,
                by_user.get(cand.id, {}),
                skill_names,
                required_ids,
                inferred,
            )
            # Only surface people with at least some signal.
            if match.match_score > 0:
                matches.append(match)

        matches.sort(key=lambda m: (m.match_score, m.skill_fit), reverse=True)
        return matches[:limit]

    def _score(
        self,
        cand: User,
        cand_skills: dict[uuid.UUID, str | None],
        needed: dict[uuid.UUID, str],
        required_ids: set[uuid.UUID],
        inferred: bool,
    ) -> ContributorMatch:
        reasons: list[str] = []
        matched: list[str] = []
        missing: list[str] = []

        # ── Skill fit ─────────────────────────────────────────────────────────
        skill_fit = 0
        if needed:
            weight_total = 0.0
            weight_hit = 0.0
            for sid, name in needed.items():
                # Required skills count double.
                w = 2.0 if sid in required_ids else 1.0
                weight_total += w
                if sid in cand_skills:
                    prof = (cand_skills[sid] or "beginner").lower()
                    weight_hit += w * PROFICIENCY_WEIGHT.get(prof, 0.5)
                    matched.append(name)
                else:
                    missing.append(name)
            if weight_total > 0:
                skill_fit = round(MAX_SKILL_POINTS * (weight_hit / weight_total))
            if matched:
                label = ", ".join(matched[:4])
                reasons.append(
                    f"Has {len(matched)} of {len(needed)} needed skills ({label})"
                    + (" — inferred from repo language/topics" if inferred else "")
                )

        rep: BuilderReputation | None = cand.reputation

        # ── Reliability ───────────────────────────────────────────────────────
        reliability = 0
        if rep:
            reliability = TIER_SCORE.get(rep.tier, 5)
            if rep.contracts_total > 0:
                rate = rep.contracts_completed / rep.contracts_total
                if rate >= 0.8:
                    reasons.append(
                        f"Completed {rep.contracts_completed}/{rep.contracts_total} contracts on record"
                    )
                else:
                    reliability = max(0, reliability - 5)
            if rep.tier in ("elite", "trusted"):
                reasons.append(f"{rep.tier.title()} tier builder")

        # ── Track record ──────────────────────────────────────────────────────
        track_record = 0
        if rep and rep.verified_projects > 0:
            track_record = min(MAX_TRACK_POINTS, rep.verified_projects * 5)
            reasons.append(f"{rep.verified_projects} verified project(s) shipped")
        if rep and rep.avg_build_score:
            reasons.append(f"Avg Verified Build Score {rep.avg_build_score}")

        # ── Collaboration ─────────────────────────────────────────────────────
        collaboration = 0
        if rep and rep.collab_score > 0:
            collaboration = min(MAX_COLLAB_POINTS, round(rep.collab_score / 20))
            if rep.collab_score >= 40:
                reasons.append("Strong collaboration history")

        total = min(100, skill_fit + reliability + track_record + collaboration)

        profile: Profile | None = cand.profile
        return ContributorMatch(
            user_id=cand.id,
            display_name=(profile.display_name if profile and profile.display_name else cand.email.split("@")[0]),
            avatar_url=profile.avatar_url if profile else None,
            college=profile.college if profile else None,
            tier=rep.tier if rep else "newcomer",
            match_score=total,
            skill_fit=skill_fit,
            reliability=reliability,
            track_record=track_record,
            collaboration=collaboration,
            matched_skills=matched[:8],
            missing_skills=missing[:8],
            reasons=reasons[:5],
        )
