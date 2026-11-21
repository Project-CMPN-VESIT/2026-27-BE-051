import uuid

from fastapi import APIRouter, Depends, Header
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import get_current_user, get_current_verified_user, require_role
from app.core.exceptions import ValidationError
from app.institutions.schemas import (
    CollegeDashboardRead, CollegePartnerRead, CollegePartnerRegisterRequest,
    CollegePartnerVerifyRequest, VerificationDeclineRequest, VerificationFulfilRequest,
    VerificationRequestCreate, VerificationRequestRead,
)
from app.institutions.service import CollegePartnerService, EmployerVerificationService
from app.users.models import User, UserRole

router = APIRouter(prefix="/institutions", tags=["institutions"])
verification_requests_router = APIRouter(
    prefix="/verification-requests", tags=["verification-requests"]
)


def _partner_payload(partner, db: Session) -> CollegePartnerRead:
    from app.users.models import User as UserModel

    user = db.get(UserModel, partner.user_id)
    return CollegePartnerRead(
        id=partner.id,
        user_id=partner.user_id,
        college_name=partner.college_name,
        department=partner.department,
        contact_name=partner.contact_name,
        contact_title=partner.contact_title,
        website_url=partner.website_url,
        is_verified=partner.is_verified,
        verified_at=partner.verified_at,
        notes=partner.notes,
        created_at=partner.created_at,
        contact_email=user.email if user else None,
    )


# ── College partner ───────────────────────────────────────────────────────────

@router.post("/college-partners", response_model=CollegePartnerRead, status_code=201)
def register_partner(
    data: CollegePartnerRegisterRequest,
    current_user: User = Depends(get_current_verified_user),
    db: Session = Depends(get_db),
):
    """Apply for a faculty/placement dashboard. Requires admin verification."""
    partner = CollegePartnerService(db).register(
        current_user,
        college_name=data.college_name,
        department=data.department,
        contact_name=data.contact_name,
        contact_title=data.contact_title,
        website_url=data.website_url,
    )
    return _partner_payload(partner, db)


@router.get("/college-partners/me", response_model=CollegePartnerRead | None)
def my_partner_profile(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    partner = CollegePartnerService(db).get_for_user(current_user.id)
    return _partner_payload(partner, db) if partner else None


@router.get("/college-partners/dashboard", response_model=CollegeDashboardRead)
def college_dashboard(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Aggregate stats for the partner's own institution.

    Read-only and aggregate by design — see the module docstring in
    `app/institutions/models.py` for why no student-level private data is here.
    """
    return CollegePartnerService(db).dashboard(current_user)


@router.get("/college-partners/pending", response_model=list[CollegePartnerRead])
def list_pending_partners(
    _: User = Depends(require_role(UserRole.ADMIN)),
    db: Session = Depends(get_db),
):
    return [
        _partner_payload(p, db) for p in CollegePartnerService(db).list_pending()
    ]


@router.post("/college-partners/{partner_id}/verify", response_model=CollegePartnerRead)
def verify_partner(
    partner_id: uuid.UUID,
    data: CollegePartnerVerifyRequest,
    admin: User = Depends(require_role(UserRole.ADMIN)),
    db: Session = Depends(get_db),
):
    partner = CollegePartnerService(db).verify(
        partner_id, admin, approve=data.approve, note=data.note
    )
    return _partner_payload(partner, db)


# ── Employer verification requests ────────────────────────────────────────────

def _request_payload(row, db: Session) -> VerificationRequestRead:
    from app.users.models import Profile

    def name_of(user_id):
        profile = db.query(Profile).filter(Profile.user_id == user_id).first()
        return getattr(profile, "display_name", None)

    return VerificationRequestRead(
        id=row.id,
        requester_id=row.requester_id,
        builder_id=row.builder_id,
        role_title=row.role_title,
        company=row.company,
        message=row.message,
        looking_for=row.looking_for,
        status=row.status,
        repo_full_name=row.repo_full_name,
        builder_note=row.builder_note,
        report=row.report,
        verified_build_score=row.verified_build_score,
        report_code=row.report_code,
        fulfilled_at=row.fulfilled_at,
        expires_at=row.expires_at,
        created_at=row.created_at,
        requester_name=name_of(row.requester_id),
        builder_name=name_of(row.builder_id),
    )


@verification_requests_router.post("", response_model=VerificationRequestRead, status_code=201)
def create_verification_request(
    data: VerificationRequestCreate,
    current_user: User = Depends(get_current_verified_user),
    db: Session = Depends(get_db),
):
    """Ask a builder to verify a private repo for a hiring decision."""
    row = EmployerVerificationService(db).request(
        current_user,
        builder_id=data.builder_id,
        role_title=data.role_title,
        message=data.message,
        company=data.company,
        looking_for=data.looking_for,
    )
    return _request_payload(row, db)


@verification_requests_router.get("", response_model=list[VerificationRequestRead])
def list_verification_requests(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Requests involving the current user, in both directions."""
    service = EmployerVerificationService(db)
    received = service.list_for_builder(current_user.id)
    sent = service.list_for_requester(current_user.id)
    seen: set[uuid.UUID] = set()
    out = []
    for row in [*received, *sent]:
        if row.id in seen:
            continue
        seen.add(row.id)
        out.append(_request_payload(row, db))
    out.sort(key=lambda r: r.created_at, reverse=True)
    return out


@verification_requests_router.get("/{request_id}", response_model=VerificationRequestRead)
def get_verification_request(
    request_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    row = EmployerVerificationService(db).get(request_id, current_user)
    return _request_payload(row, db)


@verification_requests_router.post("/{request_id}/fulfil", response_model=VerificationRequestRead)
async def fulfil_verification_request(
    request_id: uuid.UUID,
    data: VerificationFulfilRequest,
    x_github_token: str | None = Header(default=None, alias="X-GitHub-Token"),
    current_user: User = Depends(get_current_verified_user),
    db: Session = Depends(get_db),
):
    """Run the scoring engine against a private repo you own and share the report.

    Requires the builder's own GitHub token: the repo is private, so only the
    builder can grant the read. That is the point — nobody can produce a hiring
    report about someone else's private code.
    """
    if not x_github_token:
        raise ValidationError(
            "Connect your GitHub account first — a private repo can only be read "
            "with your own authorisation."
        )
    row = await EmployerVerificationService(db).fulfil(
        request_id,
        current_user,
        repo_full_name=data.repo_full_name,
        github_token=x_github_token,
        note=data.note,
    )
    return _request_payload(row, db)


@verification_requests_router.post("/{request_id}/decline", response_model=VerificationRequestRead)
def decline_verification_request(
    request_id: uuid.UUID,
    data: VerificationDeclineRequest,
    current_user: User = Depends(get_current_verified_user),
    db: Session = Depends(get_db),
):
    row = EmployerVerificationService(db).decline(request_id, current_user, data.note)
    return _request_payload(row, db)
