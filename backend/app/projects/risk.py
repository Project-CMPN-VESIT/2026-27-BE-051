"""Bug-risk assessment for a project.

Two layers, deliberately kept separate:

  1. A DETERMINISTIC risk score computed from observable repo signals
     (staleness, issue backlog, activity consistency, solo maintainer,
     completeness, history depth). Same inputs always give the same score, and
     every contributing factor is returned so a buyer can audit it.

  2. AI-identified RISK AREAS (stored on the analysis) which are qualitative.
     These describe where defects are *likely*, not confirmed bugs — the model
     sees repo metadata and the README, never the source code.

Higher score = higher risk.
"""
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.core.exceptions import NotFoundError
from app.projects.models import Project
from app.projects.repository import ProjectRepository


@dataclass
class RiskFactor:
    label: str
    points: int
    detail: str


@dataclass
class RiskAssessment:
    risk_score: int                  # 0-100, higher = riskier
    band: str                        # "low" | "moderate" | "elevated" | "high"
    confidence: str                  # "low" | "medium" | "high" — how much data backed it
    factors: list[RiskFactor] = field(default_factory=list)
    risk_areas: list[dict] = field(default_factory=list)   # AI-identified
    summary: str = ""
    # Hard facts read from the repo tree, surfaced as evidence.
    code_signals: dict = field(default_factory=dict)
    code_reviewed: bool = False
    # Dependency + licence audit, folded into this report rather than given its
    # own page — a buyer assessing risk should not have to visit two screens to
    # learn the project is GPL-licensed and ships an abandoned HTTP client.
    dependency_audit: dict = field(default_factory=dict)


def _days_since(iso: str | None) -> int | None:
    if not iso:
        return None
    try:
        dt = datetime.fromisoformat(iso.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return max(0, (datetime.now(timezone.utc) - dt).days)
    except Exception:
        return None


def _band(score: int) -> str:
    if score >= 70:
        return "high"
    if score >= 45:
        return "elevated"
    if score >= 22:
        return "moderate"
    return "low"


class RiskService:
    def __init__(self, db: Session):
        self.db = db
        self.repo = ProjectRepository(db)

    def assess(self, project_id: uuid.UUID) -> RiskAssessment:
        project: Project | None = self.repo.get_by_id(project_id)
        if not project:
            raise NotFoundError("Project")

        verification = self.repo.get_verification(project_id)
        analysis = self.repo.get_analysis(project_id)
        collaborators = len(self.repo.get_collaborators(project_id))

        factors: list[RiskFactor] = []
        signals_used = 0

        # ── 1. Staleness ─────────────────────────────────────────────────────
        stale_days = _days_since(project.github_pushed_at)
        if stale_days is not None:
            signals_used += 1
            if stale_days >= 365:
                factors.append(RiskFactor(
                    "Unmaintained", 25,
                    f"No commits in {stale_days} days — dependencies and APIs have likely drifted.",
                ))
            elif stale_days >= 180:
                factors.append(RiskFactor(
                    "Stale codebase", 16,
                    f"Last commit {stale_days} days ago.",
                ))
            elif stale_days >= 60:
                factors.append(RiskFactor(
                    "Slowing activity", 7,
                    f"Last commit {stale_days} days ago.",
                ))

        # ── 2. Issue backlog ─────────────────────────────────────────────────
        if project.open_issues:
            signals_used += 1
            if project.open_issues >= 40:
                factors.append(RiskFactor(
                    "Large open issue backlog", 15,
                    f"{project.open_issues} open issues.",
                ))
            elif project.open_issues >= 15:
                factors.append(RiskFactor(
                    "Open issue backlog", 8,
                    f"{project.open_issues} open issues.",
                ))

        # ── 3. Activity consistency (from verification engine) ───────────────
        if verification and verification.activity_consistency is not None:
            signals_used += 1
            ac = verification.activity_consistency
            if ac < 30:
                factors.append(RiskFactor(
                    "Erratic development", 14,
                    f"Activity consistency {ac}/100 — bursty work correlates with untested edges.",
                ))
            elif ac < 55:
                factors.append(RiskFactor(
                    "Uneven development rhythm", 7,
                    f"Activity consistency {ac}/100.",
                ))

        # ── 4. Solo maintainer ───────────────────────────────────────────────
        if collaborators == 0:
            factors.append(RiskFactor(
                "Single maintainer", 10,
                "No collaborators — no second pair of eyes reviewing changes.",
            ))
            signals_used += 1

        # ── 5. Incompleteness ────────────────────────────────────────────────
        if analysis and analysis.completion_score is not None:
            signals_used += 1
            cs = analysis.completion_score
            if cs < 40:
                factors.append(RiskFactor(
                    "Incomplete implementation", 18,
                    f"Completion {cs}/100 — unfinished paths are the most common defect source.",
                ))
            elif cs < 65:
                factors.append(RiskFactor(
                    "Partially complete", 9,
                    f"Completion {cs}/100.",
                ))

        missing_count = len(analysis.missing_features) if analysis and analysis.missing_features else 0
        if missing_count >= 4:
            factors.append(RiskFactor(
                "Several modules missing", 8,
                f"{missing_count} gaps identified by analysis.",
            ))

        # ── 6. Hard code signals (only when the repo tree was actually read) ──
        signals = (analysis.repo_signals or {}) if analysis else {}
        if signals:
            signals_used += 2  # these are facts, not inferences

            source_count = signals.get("source_file_count") or 0
            if source_count >= 5:
                if not signals.get("has_tests"):
                    factors.append(RiskFactor(
                        "No automated tests", 20,
                        f"No test files found across {source_count} source files — "
                        "regressions will not be caught.",
                    ))
                else:
                    ratio = (signals.get("test_file_count") or 0) / source_count
                    if ratio < 0.08:
                        factors.append(RiskFactor(
                            "Thin test coverage", 9,
                            f"Only {signals.get('test_file_count')} test file(s) for "
                            f"{source_count} source files.",
                        ))

            if not signals.get("has_ci"):
                factors.append(RiskFactor(
                    "No CI pipeline", 10,
                    "No CI configuration found — nothing verifies a build before merge.",
                ))

            if not signals.get("has_lockfile") and signals.get("dependency_count"):
                factors.append(RiskFactor(
                    "Unpinned dependencies", 8,
                    "No dependency lockfile — builds are not reproducible.",
                ))

            deps = signals.get("dependency_count") or 0
            if deps >= 120:
                factors.append(RiskFactor(
                    "Heavy dependency surface", 8,
                    f"~{deps} declared dependencies widen the vulnerability and breakage surface.",
                ))
            elif deps >= 70:
                factors.append(RiskFactor(
                    "Large dependency surface", 4,
                    f"~{deps} declared dependencies.",
                ))

            if not signals.get("has_readme"):
                factors.append(RiskFactor(
                    "No README", 6,
                    "No README found — a buyer cannot set the project up unaided.",
                ))

        # ── 6b. Dependency + licence audit ───────────────────────────────────
        # Licence obligations are the one risk here that can make a project
        # legally unsellable, so they belong in the headline assessment rather
        # than a footnote.
        dep_audit: dict = {}
        if analysis and analysis.dependency_audit:
            from app.trust.dependency_audit import (
                DependencyAudit, DependencyFinding, audit_to_risk_factors,
            )

            dep_audit = analysis.dependency_audit or {}
            try:
                rebuilt = DependencyAudit(
                    dependencies_scanned=dep_audit.get("dependencies_scanned", 0),
                    manifests_read=list(dep_audit.get("manifests_read") or []),
                    findings=[
                        DependencyFinding(
                            package=f.get("package", "?"),
                            version=f.get("version"),
                            kind=f.get("kind", "licence"),
                            severity=f.get("severity", "low"),
                            detail=f.get("detail", ""),
                            licence=f.get("licence"),
                            licence_class=f.get("licence_class"),
                            advisory_id=f.get("advisory_id"),
                            fixed_in=f.get("fixed_in"),
                            replacement=f.get("replacement"),
                        )
                        for f in (dep_audit.get("findings") or [])
                        if isinstance(f, dict)
                    ],
                    project_licence=dep_audit.get("project_licence"),
                    project_licence_class=dep_audit.get("project_licence_class", "unknown"),
                    scanned=bool(dep_audit.get("scanned")),
                )
                for label, points, detail in audit_to_risk_factors(rebuilt):
                    factors.append(RiskFactor(label, points, detail))
                if rebuilt.scanned:
                    signals_used += 2  # parsed manifests are facts, not inferences
            except Exception:
                # A malformed stored audit must not break the risk report.
                dep_audit = dep_audit if isinstance(dep_audit, dict) else {}

        # ── 7. Thin history ──────────────────────────────────────────────────
        if verification and verification.repo_age_days is not None:
            signals_used += 1
            if verification.repo_age_days < 21:
                factors.append(RiskFactor(
                    "Very young codebase", 9,
                    f"Repo is {verification.repo_age_days} days old — little real-world exercise.",
                ))

        # ── Score ────────────────────────────────────────────────────────────
        raw = sum(f.points for f in factors)
        score = max(0, min(100, raw))

        # A verified, healthy project earns a reduction — it passed real checks.
        if project.is_verified and verification and (verification.verified_build_score or 0) >= 70:
            score = max(0, score - 8)
            factors.append(RiskFactor(
                "Verified build (mitigating)", -8,
                f"Verified Build Score {verification.verified_build_score}/100 lowers overall risk.",
            ))

        confidence = "high" if signals_used >= 5 else "medium" if signals_used >= 3 else "low"

        risk_areas = []
        if analysis and analysis.potential_bugs:
            risk_areas = (analysis.potential_bugs or {}).get("items", []) or []

        band = _band(score)
        if not factors:
            summary = "No elevated risk signals detected from the available repo data."
        else:
            top = max((f for f in factors if f.points > 0), key=lambda f: f.points, default=None)
            summary = (
                f"{band.capitalize()} bug risk"
                + (f" — driven mainly by: {top.label.lower()}." if top else ".")
            )
        if confidence == "low":
            summary += " Limited data available, treat as indicative only."

        factors.sort(key=lambda f: -abs(f.points))
        return RiskAssessment(
            risk_score=score,
            band=band,
            confidence=confidence,
            factors=factors,
            risk_areas=risk_areas,
            summary=summary,
            code_signals={
                k: v for k, v in signals.items()
                if k in (
                    "file_count", "source_file_count", "test_file_count", "has_tests",
                    "has_ci", "has_docker", "has_lockfile", "has_readme",
                    "has_license", "dependency_count",
                )
            },
            code_reviewed=bool(analysis and analysis.code_reviewed),
            dependency_audit=dep_audit,
        )
