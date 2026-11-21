"""
Unauthenticated public surface.

Three things live here, and they share one property: they must work for someone
who has never signed in, because that is the whole point of them.

  * the embeddable badge a builder pastes into a GitHub README
  * the platform stats the landing page counts up
  * a consolidated trust report for the shareable verification page

The report is one endpoint rather than three round trips because it is the page a
buyer or recruiter lands on cold, and it should not need a waterfall to paint.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Query, Response
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.database import get_db
from app.core.exceptions import NotFoundError
from app.escrow.models import EscrowEntryType, EscrowLedgerEntry
from app.payments.models import Payment, PaymentStatus, PaymentType
from app.projects.models import Project, ProjectVerification
from app.public.badge import render_badge
from app.users.models import BuilderReputation, Profile, User, UserRole
from app.verification import scoring

router = APIRouter(tags=["public"])
settings = get_settings()

# The badge is hotlinked from READMEs and proxied by GitHub's image cache. A
# short max-age keeps a freshly-recomputed score from being stale for hours,
# while still absorbing traffic spikes from a popular repo.
_BADGE_CACHE_SECONDS = 600
_STATS_CACHE_SECONDS = 120


# ══════════════════════════════════════════════════════════════════════════════
# Badge
# ══════════════════════════════════════════════════════════════════════════════

@router.get(
    "/badge/{project_id}/verified-build.svg",
    response_class=Response,
    summary="Embeddable Verified Build badge (SVG)",
)
def verified_build_badge(
    project_id: uuid.UUID,
    style: str = Query("flat", pattern="^(flat|rounded)$"),
    label: str = Query("verified build", max_length=40),
    db: Session = Depends(get_db),
):
    """SVG badge for a project's Verified Build Score.

    Always returns 200, even for an unknown project. GitHub's proxy caches
    non-200 responses and renders them as a broken image, which reads as "this
    product is broken" rather than "this link is wrong".
    """
    row = (
        db.query(ProjectVerification.verified_build_score, Project.is_verified)
        .join(Project, Project.id == ProjectVerification.project_id)
        .filter(Project.id == project_id, Project.is_deleted == False)
        .first()
    )
    score, verified = (row[0], bool(row[1])) if row else (None, False)

    svg = render_badge(score=score, verified=verified, label=label, style=style)
    return Response(
        content=svg,
        media_type="image/svg+xml",
        headers={
            "Cache-Control": f"public, max-age={_BADGE_CACHE_SECONDS}",
            # Camo requires this to avoid sniffing the SVG as something else.
            "X-Content-Type-Options": "nosniff",
        },
    )


class BadgeSnippets(BaseModel):
    """Copy-paste snippets for a builder's README."""
    project_id: uuid.UUID
    score: int | None
    is_verified: bool
    badge_url: str
    report_url: str
    markdown: str
    html: str
    restructured_text: str


@router.get("/badge/{project_id}/snippets", response_model=BadgeSnippets)
def badge_snippets(project_id: uuid.UUID, db: Session = Depends(get_db)):
    """The markdown a builder pastes into their README, ready to copy."""
    row = (
        db.query(Project, ProjectVerification)
        .join(ProjectVerification, ProjectVerification.project_id == Project.id)
        .filter(Project.id == project_id, Project.is_deleted == False)
        .first()
    )
    if not row:
        raise NotFoundError("Project")
    project, verification = row

    badge_url = f"{settings.api_base_url}/badge/{project_id}/verified-build.svg"
    report_url = f"{settings.frontend_url}/verify/{project_id}"
    alt = "Verified Build Score on CodeBazaar"

    return BadgeSnippets(
        project_id=project_id,
        score=verification.verified_build_score,
        is_verified=project.is_verified,
        badge_url=badge_url,
        report_url=report_url,
        markdown=f"[![{alt}]({badge_url})]({report_url})",
        html=f'<a href="{report_url}"><img src="{badge_url}" alt="{alt}"></a>',
        restructured_text=f".. image:: {badge_url}\n   :target: {report_url}\n   :alt: {alt}",
    )


# ══════════════════════════════════════════════════════════════════════════════
# Platform stats — real numbers for the landing page
# ══════════════════════════════════════════════════════════════════════════════

class PlatformStats(BaseModel):
    projects_total: int
    projects_verified: int
    projects_for_sale: int
    builders_total: int
    colleges_represented: int
    """Money that has actually moved: settled payments plus escrow funding."""
    transacted_paise: int
    payments_settled: int
    escrow_contracts: int
    """Sum of RELEASE ledger entries — what builders have been credited."""
    released_to_builders_paise: int
    avg_verified_score: int | None
    highest_score: int | None
    verified_last_30_days: int
    generated_at: datetime


@router.get("/public/stats", response_model=PlatformStats)
def platform_stats(response: Response, db: Session = Depends(get_db)):
    """Live platform totals, read straight from the database.

    The landing page counts these up on load. They are queried rather than
    cached in application memory so a demo reseed is reflected immediately;
    the Cache-Control header is what absorbs repeat traffic.
    """
    def scalar(q, default=0):
        return q.scalar() or default

    projects_total = scalar(
        db.query(func.count(Project.id)).filter(Project.is_deleted == False)
    )
    projects_verified = scalar(
        db.query(func.count(Project.id)).filter(
            Project.is_deleted == False, Project.is_verified == True
        )
    )
    projects_for_sale = scalar(
        db.query(func.count(Project.id)).filter(
            Project.is_deleted == False, Project.is_for_sale == True
        )
    )
    builders_total = scalar(
        db.query(func.count(User.id)).filter(
            User.is_active == True,
            User.role.in_([UserRole.BUILDER, UserRole.CONTRIBUTOR]),
        )
    )
    colleges = scalar(
        db.query(func.count(func.distinct(Profile.college))).filter(
            Profile.college.isnot(None), Profile.college != ""
        )
    )

    payments_sum = scalar(
        db.query(func.coalesce(func.sum(Payment.amount_paise), 0)).filter(
            Payment.status == PaymentStatus.PAID
        )
    )
    payments_count = scalar(
        db.query(func.count(Payment.id)).filter(Payment.status == PaymentStatus.PAID)
    )
    escrow_funded = scalar(
        db.query(func.coalesce(func.sum(EscrowLedgerEntry.amount_paise), 0)).filter(
            EscrowLedgerEntry.entry_type == EscrowEntryType.FUND
        )
    )
    released = scalar(
        db.query(func.coalesce(func.sum(EscrowLedgerEntry.amount_paise), 0)).filter(
            EscrowLedgerEntry.entry_type == EscrowEntryType.RELEASE
        )
    )
    from app.escrow.models import EscrowContract
    escrow_contracts = scalar(db.query(func.count(EscrowContract.id)))

    avg_score = db.query(func.avg(ProjectVerification.verified_build_score)).filter(
        ProjectVerification.verified_build_score.isnot(None)
    ).scalar()
    max_score = db.query(func.max(ProjectVerification.verified_build_score)).scalar()

    cutoff = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
    verified_recently = scalar(
        db.query(func.count(ProjectVerification.id)).filter(
            ProjectVerification.verified_at.isnot(None),
            ProjectVerification.verified_at >= cutoff,
        )
    )

    response.headers["Cache-Control"] = f"public, max-age={_STATS_CACHE_SECONDS}"

    return PlatformStats(
        projects_total=projects_total,
        projects_verified=projects_verified,
        projects_for_sale=projects_for_sale,
        builders_total=builders_total,
        colleges_represented=colleges,
        transacted_paise=int(payments_sum) + int(escrow_funded),
        payments_settled=payments_count,
        escrow_contracts=escrow_contracts,
        released_to_builders_paise=int(released),
        avg_verified_score=int(round(float(avg_score))) if avg_score is not None else None,
        highest_score=int(max_score) if max_score is not None else None,
        verified_last_30_days=verified_recently,
        generated_at=datetime.now(timezone.utc),
    )


# ══════════════════════════════════════════════════════════════════════════════
# Landing page showcase — real records, not frontend fixtures
# ══════════════════════════════════════════════════════════════════════════════

class ShowcaseTestimonial(BaseModel):
    """A real published review, used as social proof.

    Sourced from the reviews table rather than a hardcoded quotes array: an
    invented testimonial is both dishonest and obvious, whereas these are
    attributable to a profile a visitor can click through to.
    """
    id: uuid.UUID
    headline: str
    body: str
    overall_score: int
    reviewer_name: str
    reviewer_role: str
    reviewer_id: uuid.UUID
    project_id: uuid.UUID
    project_title: str


class ShowcaseCampusRow(BaseModel):
    college: str
    builders: int
    verified_projects: int
    total_points: int


class ShowcaseProject(BaseModel):
    id: uuid.UUID
    title: str
    repo_full_name: str
    description: str | None
    verified_build_score: int | None
    confidence: str | None
    is_verified: bool
    price_paise: int | None
    is_for_sale: bool
    owner_name: str
    owner_college: str | None
    components: list[ReportComponent]
    flags: list[ReportFlag]
    total_penalty: int
    verified_threshold: int
    commits_analyzed: int | None
    contributors_count: int | None


class Showcase(BaseModel):
    """Everything the landing page needs that isn't a raw count."""
    featured: ShowcaseProject | None
    testimonials: list[ShowcaseTestimonial]
    campus: list[ShowcaseCampusRow]


@router.get("/public/showcase", response_model=Showcase)
def public_showcase(response: Response, db: Session = Depends(get_db)):
    """Seed-backed content for the landing page.

    One request rather than several so the page paints without a waterfall. The
    featured project is chosen by score, so the transparency demo on the landing
    page is a genuine record — a visitor can open its full report and check.
    """
    from app.reviews.models import Review
    from app.projects.models import Project as P

    response.headers["Cache-Control"] = f"public, max-age={_STATS_CACHE_SECONDS}"

    # ── Featured project: highest-scoring verified listing ───────────────────
    featured = None
    row = (
        db.query(P, ProjectVerification)
        .join(ProjectVerification, ProjectVerification.project_id == P.id)
        .filter(
            P.is_deleted == False,
            P.is_verified == True,
            ProjectVerification.verified_build_score.isnot(None),
        )
        .order_by(ProjectVerification.verified_build_score.desc())
        .first()
    )
    if row:
        project, v = row
        owner = (
            db.query(User, Profile)
            .outerjoin(Profile, Profile.user_id == User.id)
            .filter(User.id == project.owner_id)
            .first()
        )
        components: list[ReportComponent] = []
        for spec in scoring.COMPONENT_SPEC:
            raw = getattr(v, spec["field"], None)
            components.append(ReportComponent(
                key=spec["key"], label=spec["label"], weight=spec["weight"],
                score=raw,
                contribution=round(spec["weight"] * raw, 1) if raw is not None else None,
                explains=spec["explains"],
            ))
        flags: list[ReportFlag] = []
        penalty = 0
        for key in (v.fraud_flags or []):
            spec = scoring.FLAG_SPEC.get(key)
            if not spec:
                continue
            penalty += spec["penalty"]
            flags.append(ReportFlag(
                key=key, label=spec["label"], severity=spec["severity"],
                penalty=spec["penalty"], explains=spec["explains"],
            ))

        featured = ShowcaseProject(
            id=project.id,
            title=project.title,
            repo_full_name=project.repo_full_name,
            description=project.description,
            verified_build_score=v.verified_build_score,
            confidence=v.confidence,
            is_verified=project.is_verified,
            price_paise=project.price_paise,
            is_for_sale=project.is_for_sale,
            owner_name=(owner[1].display_name if owner and owner[1] else "A builder"),
            owner_college=(owner[1].college if owner and owner[1] else None),
            components=components,
            flags=flags,
            total_penalty=penalty,
            verified_threshold=scoring.VERIFIED_THRESHOLD,
            commits_analyzed=v.commits_analyzed,
            contributors_count=v.contributors_count,
        )

    # ── Testimonials: the strongest public reviews ───────────────────────────
    review_rows = (
        db.query(Review, Profile, P)
        .join(Profile, Profile.user_id == Review.reviewer_id)
        .join(P, P.id == Review.project_id)
        .filter(
            Review.is_public == True,
            Review.overall_score >= 4,
            P.is_deleted == False,
        )
        .order_by(Review.overall_score.desc(), Review.created_at.desc())
        .limit(6)
        .all()
    )
    testimonials = [
        ShowcaseTestimonial(
            id=r.id,
            headline=r.headline,
            body=r.body,
            overall_score=r.overall_score,
            reviewer_name=prof.display_name or "Verified buyer",
            reviewer_role=r.reviewer_role.value,
            reviewer_id=r.reviewer_id,
            project_id=proj.id,
            project_title=proj.title,
        )
        for r, prof, proj in review_rows
    ]

    # ── Campus leaderboard teaser ───────────────────────────────────────────
    campus_rows = (
        db.query(
            Profile.college,
            func.count(func.distinct(User.id)).label("builders"),
            func.coalesce(func.sum(BuilderReputation.verified_projects), 0).label("verified"),
            func.coalesce(func.sum(BuilderReputation.reputation_points), 0).label("points"),
        )
        .join(User, User.id == Profile.user_id)
        .outerjoin(BuilderReputation, BuilderReputation.user_id == User.id)
        .filter(Profile.college.isnot(None), Profile.college != "")
        .group_by(Profile.college)
        .order_by(func.coalesce(func.sum(BuilderReputation.reputation_points), 0).desc())
        .limit(5)
        .all()
    )
    campus = [
        ShowcaseCampusRow(
            college=college,
            builders=int(builders or 0),
            verified_projects=int(verified or 0),
            total_points=int(points or 0),
        )
        for college, builders, verified, points in campus_rows
    ]

    return Showcase(featured=featured, testimonials=testimonials, campus=campus)


# ══════════════════════════════════════════════════════════════════════════════
# Public trust report — the shareable, no-login verification page
# ══════════════════════════════════════════════════════════════════════════════

class ReportOwner(BaseModel):
    id: uuid.UUID
    display_name: str
    college: str | None
    avatar_url: str | None
    github_username: str | None
    tier: str | None
    reputation_points: int | None
    verified_projects: int | None


class ReportComponent(BaseModel):
    key: str
    label: str
    weight: float
    score: int | None
    contribution: float | None
    explains: str


class ReportFlag(BaseModel):
    key: str
    label: str
    severity: str
    penalty: int
    explains: str


class PublicReport(BaseModel):
    project_id: uuid.UUID
    title: str
    description: str | None
    repo_full_name: str
    repo_url: str
    homepage_url: str | None
    primary_language: str | None
    topics: list[str]
    stars: int
    stage: str
    status: str

    is_verified: bool
    verified_build_score: int | None
    verified_threshold: int
    confidence: str | None
    ownership_verified: bool
    hackathon_verified: bool
    repo_age_days: int | None
    commits_analyzed: int | None
    contributors_count: int | None
    verified_at: str | None
    reasoning: str | None

    components: list[ReportComponent]
    flags: list[ReportFlag]
    total_penalty: int
    breakdown_available: bool

    is_for_sale: bool
    price_paise: int | None
    price_label: str | None

    owner: ReportOwner
    badge_url: str
    report_url: str


@router.get("/public/projects/{project_id}/report", response_model=PublicReport)
def public_report(project_id: uuid.UUID, db: Session = Depends(get_db)):
    """Everything the shareable verification page needs, in one request.

    Deliberately excludes anything gated: no delivery URL, no contact details,
    no private notes. A buyer should be able to audit the trust claim without an
    account, and without us leaking what they haven't paid for.
    """
    row = (
        db.query(Project, ProjectVerification)
        .join(ProjectVerification, ProjectVerification.project_id == Project.id)
        .filter(Project.id == project_id, Project.is_deleted == False)
        .first()
    )
    if not row:
        raise NotFoundError("Project")
    project, v = row

    owner_row = (
        db.query(User, Profile, BuilderReputation)
        .outerjoin(Profile, Profile.user_id == User.id)
        .outerjoin(BuilderReputation, BuilderReputation.user_id == User.id)
        .filter(User.id == project.owner_id)
        .first()
    )

    components: list[ReportComponent] = []
    breakdown_available = False
    for spec in scoring.COMPONENT_SPEC:
        raw = getattr(v, spec["field"], None)
        if raw is not None:
            breakdown_available = True
        components.append(ReportComponent(
            key=spec["key"], label=spec["label"], weight=spec["weight"],
            score=raw,
            contribution=round(spec["weight"] * raw, 1) if raw is not None else None,
            explains=spec["explains"],
        ))

    flags: list[ReportFlag] = []
    total_penalty = 0
    for key in (v.fraud_flags or []):
        spec = scoring.FLAG_SPEC.get(key)
        if not spec:
            flags.append(ReportFlag(
                key=key, label=key.replace("_", " ").capitalize(),
                severity="warning", penalty=0,
                explains="No description recorded for this flag.",
            ))
            continue
        total_penalty += spec["penalty"]
        flags.append(ReportFlag(
            key=key, label=spec["label"], severity=spec["severity"],
            penalty=spec["penalty"], explains=spec["explains"],
        ))

    if owner_row:
        user, profile, rep = owner_row
        owner = ReportOwner(
            id=user.id,
            display_name=(profile.display_name if profile else None) or "Unknown builder",
            college=profile.college if profile else None,
            avatar_url=profile.avatar_url if profile else None,
            github_username=profile.github_username if profile else None,
            tier=rep.tier if rep else None,
            reputation_points=rep.reputation_points if rep else None,
            verified_projects=rep.verified_projects if rep else None,
        )
    else:
        owner = ReportOwner(
            id=project.owner_id, display_name="Unknown builder", college=None,
            avatar_url=None, github_username=None, tier=None,
            reputation_points=None, verified_projects=None,
        )

    return PublicReport(
        project_id=project.id,
        title=project.title,
        description=project.description,
        repo_full_name=project.repo_full_name,
        repo_url=f"https://github.com/{project.repo_full_name}",
        homepage_url=project.homepage_url,
        primary_language=project.primary_language,
        topics=list(project.topics or []),
        stars=project.stars,
        stage=project.stage.value,
        status=project.status.value,
        is_verified=project.is_verified,
        verified_build_score=v.verified_build_score,
        verified_threshold=scoring.VERIFIED_THRESHOLD,
        confidence=v.confidence,
        ownership_verified=v.ownership_verified,
        hackathon_verified=v.hackathon_verified,
        repo_age_days=v.repo_age_days,
        commits_analyzed=v.commits_analyzed,
        contributors_count=v.contributors_count,
        verified_at=v.verified_at,
        reasoning=v.notes,
        components=components,
        flags=flags,
        total_penalty=total_penalty,
        breakdown_available=breakdown_available,
        is_for_sale=project.is_for_sale,
        price_paise=project.price_paise,
        price_label=project.price_label,
        owner=owner,
        badge_url=f"{settings.api_base_url}/badge/{project.id}/verified-build.svg",
        report_url=f"{settings.frontend_url}/verify/{project.id}",
    )
