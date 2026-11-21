"""
Buyer-side discovery aids: side-by-side comparison and related-project suggestions.

Both read only existing data. Neither invents a new score or ranking claim — the
comparison shows the same six components the verification panel shows, and the
recommendations are explainable ("shares 3 topics and its language") rather than
an opaque similarity number.
"""
from __future__ import annotations

import uuid

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.exceptions import ValidationError
from app.verification import scoring

MAX_COMPARE = 3


class DiscoveryService:
    def __init__(self, db: Session):
        self.db = db

    # ── Side-by-side comparison ──────────────────────────────────────────────

    def compare(self, project_ids: list[uuid.UUID]) -> dict:
        """Score breakdowns for 2–3 listings, aligned for a comparison table.

        Returns the component spec alongside the rows so the table's columns come
        from the engine rather than being restated in the frontend. If a weight
        changes, this table changes with it.
        """
        from app.projects.models import Project, ProjectVerification

        unique = list(dict.fromkeys(project_ids))
        if len(unique) < 2:
            raise ValidationError("Pick at least two projects to compare")
        if len(unique) > MAX_COMPARE:
            raise ValidationError(
                f"You can compare up to {MAX_COMPARE} projects at once"
            )

        rows = (
            self.db.query(Project)
            .filter(Project.id.in_(unique), Project.is_deleted == False)
            .all()
        )
        if len(rows) != len(unique):
            raise ValidationError("One or more of those projects could not be found")

        by_id = {p.id: p for p in rows}
        verifications = {
            v.project_id: v
            for v in self.db.query(ProjectVerification)
            .filter(ProjectVerification.project_id.in_(unique))
            .all()
        }

        projects = []
        for pid in unique:
            project = by_id[pid]
            verification = verifications.get(pid)
            analysis = getattr(project, "analysis", None)

            components = []
            for spec in scoring.COMPONENT_SPEC:
                components.append({
                    "key": spec["key"],
                    "label": spec["label"],
                    "weight": spec["weight"],
                    "score": getattr(verification, spec["field"], None) if verification else None,
                })

            projects.append({
                "project_id": pid,
                "title": project.title,
                "repo_full_name": project.repo_full_name,
                "primary_language": project.primary_language,
                "topics": list(project.topics or []),
                "stage": project.stage.value if project.stage else None,
                "is_verified": bool(project.is_verified),
                "verified_build_score": (
                    verification.verified_build_score if verification else None
                ),
                "confidence": verification.confidence if verification else None,
                "fraud_flags": list(verification.fraud_flags or []) if verification else [],
                "commits_analyzed": verification.commits_analyzed if verification else None,
                "contributors_count": verification.contributors_count if verification else None,
                "repo_age_days": verification.repo_age_days if verification else None,
                "components": components,
                "stars": project.stars,
                "forks": project.forks,
                "open_issues": project.open_issues,
                "is_for_sale": bool(project.is_for_sale),
                "price_paise": project.price_paise,
                "health_score": getattr(analysis, "health_score", None),
                "completion_score": getattr(analysis, "completion_score", None),
                "has_tests": bool((getattr(analysis, "repo_signals", None) or {}).get("has_tests")),
                "has_ci": bool((getattr(analysis, "repo_signals", None) or {}).get("has_ci")),
                "dependency_count": (getattr(analysis, "repo_signals", None) or {}).get("dependency_count"),
                "licence_class": (
                    (getattr(analysis, "dependency_audit", None) or {}).get("project_licence_class")
                ),
            })

        # Per-component leader, so the table can mark which project wins each row
        # rather than leaving the reader to scan numbers.
        leaders: dict[str, uuid.UUID | None] = {}
        for spec in scoring.COMPONENT_SPEC:
            best_id, best_score = None, None
            for entry in projects:
                score = next(
                    (c["score"] for c in entry["components"] if c["key"] == spec["key"]),
                    None,
                )
                if score is None:
                    continue
                if best_score is None or score > best_score:
                    best_id, best_score = entry["project_id"], score
            leaders[spec["key"]] = best_id

        overall_leader = None
        best = None
        for entry in projects:
            score = entry["verified_build_score"]
            if score is None:
                continue
            if best is None or score > best:
                overall_leader, best = entry["project_id"], score

        return {
            "component_spec": [
                {
                    "key": s["key"], "label": s["label"],
                    "weight": s["weight"], "explains": s["explains"],
                }
                for s in scoring.COMPONENT_SPEC
            ],
            "projects": projects,
            "component_leaders": leaders,
            "overall_leader": overall_leader,
            "threshold": scoring.VERIFIED_THRESHOLD,
        }

    # ── Similar projects ─────────────────────────────────────────────────────

    def similar(self, project_id: uuid.UUID, limit: int = 6) -> list[dict]:
        """Related listings, ranked by shared topics, language and stage.

        Deliberately explainable: each result carries the reasons it matched. A
        "you might also like" rail with no stated reason is indistinguishable
        from a random rail, and buyers notice.
        """
        from app.projects.models import Project, ProjectVerification

        project = (
            self.db.query(Project)
            .filter(Project.id == project_id, Project.is_deleted == False)
            .first()
        )
        if not project:
            return []

        topics = {t.lower() for t in (project.topics or [])}

        candidates = (
            self.db.query(Project, ProjectVerification.verified_build_score)
            .outerjoin(
                ProjectVerification, ProjectVerification.project_id == Project.id
            )
            .filter(
                Project.id != project_id,
                Project.is_deleted == False,
                # Withheld duplicates must not be recommended — surfacing a
                # suspected clone as "similar" would be an own goal.
                Project.duplicate_status != "withheld",
            )
            .order_by(ProjectVerification.verified_build_score.desc().nullslast())
            .limit(300)
            .all()
        )

        scored: list[tuple[int, dict]] = []
        for other, score in candidates:
            reasons: list[str] = []
            weight = 0

            other_topics = {t.lower() for t in (other.topics or [])}
            shared = topics & other_topics
            if shared:
                weight += 12 * min(len(shared), 4)
                label = ", ".join(sorted(shared)[:3])
                reasons.append(f"Shares topic{'s' if len(shared) > 1 else ''}: {label}")

            if (
                project.primary_language
                and other.primary_language == project.primary_language
            ):
                weight += 14
                reasons.append(f"Also {project.primary_language}")

            if other.stage == project.stage and other.stage is not None:
                weight += 6
                reasons.append(f"Same stage ({other.stage.value})")

            if project.is_for_sale and other.is_for_sale:
                weight += 8
                reasons.append("Also for sale")

            if other.is_verified:
                weight += 6
                reasons.append("Verified")

            # Never recommend on nothing. Without a real shared attribute this is
            # just "another project", which the browse page already does better.
            if weight < 14 or not reasons:
                continue

            scored.append((weight, {
                "project_id": other.id,
                "title": other.title,
                "repo_full_name": other.repo_full_name,
                "primary_language": other.primary_language,
                "stage": other.stage.value if other.stage else None,
                "is_verified": bool(other.is_verified),
                "verified_build_score": score,
                "is_for_sale": bool(other.is_for_sale),
                "price_paise": other.price_paise,
                "stars": other.stars,
                "match_score": weight,
                "reasons": reasons[:3],
            }))

        scored.sort(key=lambda pair: (-pair[0], -(pair[1]["verified_build_score"] or 0)))
        return [payload for _, payload in scored[:limit]]
