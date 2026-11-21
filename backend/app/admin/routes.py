import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, desc

from app.core.database import get_db
from app.core.dependencies import require_role
from app.core.exceptions import NotFoundError
from app.core.logging import get_logger
from app.payments.models import Payment, PaymentStatus
from app.payments.schemas import SettlementCreate
from app.moderation.schemas import ReportResolve
from app.projects.models import Project, ProjectVerification, AnalysisStatus
from app.projects.repository import ProjectRepository
from app.users.models import User, UserRole
from app.users.repository import UserRepository
from app.users.models import AuditLog
from app.core.audit import record_audit_log

router = APIRouter(prefix="/admin", tags=["admin"])
logger = get_logger("admin")

def get_admin_user(user: User = Depends(require_role(UserRole.ADMIN))) -> User:
    return user

AdminUser = Annotated[User, Depends(get_admin_user)]


# ── Projects ──────────────────────────────────────────────────────────────────

@router.get("/projects")
def list_all_projects(
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=100),
    is_verified: bool | None = None,
    _: User = Depends(require_role(UserRole.ADMIN)),
    db: Session = Depends(get_db),
):
    q = db.query(Project).filter(Project.is_deleted == False)
    if is_verified is not None:
        q = q.filter(Project.is_verified == is_verified)
    total = q.count()
    items = q.order_by(desc(Project.created_at)).offset((page - 1) * per_page).limit(per_page).all()
    return {"items": items, "total": total, "page": page}


@router.put("/projects/{project_id}/feature")
def toggle_featured(
    project_id: uuid.UUID,
    featured: bool,
    admin: AdminUser,
    db: Session = Depends(get_db),
):
    repo = ProjectRepository(db)
    project = repo.get_by_id(project_id)
    if not project:
        raise NotFoundError("Project")
    repo.update(project, is_featured=featured)
    record_audit_log(db, admin.id, "project.feature_toggle", "project", str(project_id), f"featured={featured}")
    db.commit()
    logger.info("Project featured toggled", project_id=str(project_id), featured=featured, admin=str(admin.id))
    return {"success": True}


@router.put("/projects/{project_id}/verify")
def admin_verify_project(
    project_id: uuid.UUID,
    verified: bool,
    notes: str | None = None,
    admin: AdminUser = None,
    db: Session = Depends(get_db),
):
    repo = ProjectRepository(db)
    project = repo.get_by_id(project_id)
    if not project:
        raise NotFoundError("Project")

    repo.update(project, is_verified=verified)
    verification = repo.get_verification(project_id)
    if verification:
        import datetime
        repo.update_verification(
            verification,
            reviewer_id=admin.id,
            notes=notes,
            verified_at=datetime.datetime.now(datetime.timezone.utc).isoformat() if verified else None,
        )
    record_audit_log(db, admin.id, "project.verify", "project", str(project_id), f"verified={verified}, notes={notes}")
    db.commit()
    return {"success": True}


@router.delete("/projects/{project_id}")
def admin_delete_project(
    project_id: uuid.UUID,
    admin: AdminUser,
    db: Session = Depends(get_db),
):
    repo = ProjectRepository(db)
    project = repo.get_by_id(project_id)
    if not project:
        raise NotFoundError("Project")
    repo.soft_delete(project)
    record_audit_log(db, admin.id, "project.delete", "project", str(project_id), project.title)
    db.commit()
    logger.info("Project deleted by admin", project_id=str(project_id), admin=str(admin.id))
    return {"success": True}


# ── Users ─────────────────────────────────────────────────────────────────────

@router.get("/users")
def list_users(
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=100),
    search: str | None = None,
    _: User = Depends(require_role(UserRole.ADMIN)),
    db: Session = Depends(get_db),
):
    q = db.query(User)
    if search:
        q = q.filter(User.email.ilike(f"%{search}%"))
    total = q.count()
    items = q.order_by(desc(User.created_at)).offset((page - 1) * per_page).limit(per_page).all()
    return {
        "items": [
            {
                "id": str(u.id),
                "email": u.email,
                "role": u.role.value,
                "is_verified": u.is_verified,
                "is_active": u.is_active,
                "created_at": u.created_at.isoformat(),
            }
            for u in items
        ],
        "total": total,
        "page": page,
    }


@router.post("/users/{user_id}/ban")
def ban_user(
    user_id: uuid.UUID,
    admin: AdminUser,
    db: Session = Depends(get_db),
):
    repo = UserRepository(db)
    user = repo.get_by_id(user_id)
    if not user:
        raise NotFoundError("User")
    if user.role == UserRole.ADMIN:
        from app.core.exceptions import ForbiddenError
        raise ForbiddenError("Cannot ban another admin")
    repo.update(user, is_active=False)
    record_audit_log(db, admin.id, "user.ban", "user", str(user_id), user.email)
    db.commit()
    logger.info("User banned", target_user=str(user_id), admin=str(admin.id))
    return {"success": True}


@router.post("/users/{user_id}/unban")
def unban_user(
    user_id: uuid.UUID,
    admin: AdminUser,
    db: Session = Depends(get_db),
):
    repo = UserRepository(db)
    user = repo.get_by_id(user_id)
    if not user:
        raise NotFoundError("User")
    repo.update(user, is_active=True)
    record_audit_log(db, admin.id, "user.unban", "user", str(user_id), user.email)
    db.commit()
    return {"success": True}


@router.put("/users/{user_id}/role")
def change_user_role(
    user_id: uuid.UUID,
    role: UserRole,
    admin: AdminUser,
    db: Session = Depends(get_db),
):
    repo = UserRepository(db)
    user = repo.get_by_id(user_id)
    if not user:
        raise NotFoundError("User")
    old_role = user.role.value
    repo.update(user, role=role)
    record_audit_log(db, admin.id, "user.role_change", "user", str(user_id), f"{old_role} -> {role.value}")
    db.commit()
    return {"success": True}


# ── Analytics ─────────────────────────────────────────────────────────────────

@router.get("/analytics")
def get_analytics(
    _: User = Depends(require_role(UserRole.ADMIN)),
    db: Session = Depends(get_db),
):
    total_users = db.query(func.count(User.id)).scalar()
    active_users = db.query(func.count(User.id)).filter(User.is_active == True).scalar()
    total_projects = db.query(func.count(Project.id)).filter(Project.is_deleted == False).scalar()
    verified_projects = db.query(func.count(Project.id)).filter(
        Project.is_deleted == False, Project.is_verified == True
    ).scalar()
    total_revenue_paise = (
        db.query(func.sum(Payment.amount_paise))
        .filter(Payment.status == PaymentStatus.PAID)
        .scalar()
        or 0
    )
    return {
        "users": {
            "total": total_users,
            "active": active_users,
            "inactive": total_users - active_users,
        },
        "projects": {
            "total": total_projects,
            "verified": verified_projects,
        },
        "payments": {
            "total_revenue_inr": total_revenue_paise / 100,
        },
    }


# ── Verification queue ────────────────────────────────────────────────────────

@router.get("/verification-queue")
def get_verification_queue(
    _: User = Depends(require_role(UserRole.ADMIN)),
    db: Session = Depends(get_db),
):
    """Projects with pending verification (ownership or hackathon unverified)."""
    items = (
        db.query(Project)
        .join(ProjectVerification, Project.id == ProjectVerification.project_id)
        .filter(
            Project.is_deleted == False,
            Project.is_verified == False,
        )
        .order_by(desc(Project.created_at))
        .limit(50)
        .all()
    )
    return {"items": items, "total": len(items)}


# ── Seller payouts ────────────────────────────────────────────────────────────

def _mask_tail(value: str | None, keep: int = 4) -> str | None:
    if not value:
        return None
    if len(value) <= keep:
        return "\u2022" * len(value)
    return "\u2022" * (len(value) - keep) + value[-keep:]


@router.get("/payout-details")
def list_payout_details(
    unverified_only: bool = Query(False),
    _: User = Depends(require_role(UserRole.ADMIN)),
    db: Session = Depends(get_db),
):
    """List seller payout/KYC details for verification (sensitive fields masked).

    Each row is enriched with the seller's outstanding balance so admins know
    how much to settle.
    """
    from app.payments.models import SellerPayoutDetail
    from app.payments.service import PaymentService
    from app.users.models import Profile

    q = (
        db.query(SellerPayoutDetail, User.email, Profile.display_name)
        .join(User, SellerPayoutDetail.user_id == User.id)
        .outerjoin(Profile, Profile.user_id == User.id)
    )
    if unverified_only:
        q = q.filter(SellerPayoutDetail.is_verified == False)
    rows = q.order_by(desc(SellerPayoutDetail.created_at)).all()

    svc = PaymentService(db)
    return {
        "items": [
            {
                "user_id": str(d.user_id),
                "email": email,
                "display_name": display_name,
                "method": d.method,
                "upi_id": d.upi_id,
                "account_holder_name": d.account_holder_name,
                "account_number_masked": _mask_tail(d.account_number),
                "ifsc": d.ifsc,
                "pan_masked": _mask_tail(d.pan),
                "is_verified": d.is_verified,
                "net_paise": svc._net_total(d.user_id),
                "settled_paise": svc._settled_total(d.user_id),
                "outstanding_paise": svc.get_outstanding(d.user_id),
                "created_at": d.created_at.isoformat(),
            }
            for d, email, display_name in rows
        ],
        "total": len(rows),
    }


@router.post("/payouts/{user_id}/settle")
def record_settlement(
    user_id: uuid.UUID,
    data: SettlementCreate,
    admin: AdminUser,
    db: Session = Depends(get_db),
):
    """Record a manual settlement paid to a seller (cannot exceed outstanding)."""
    from app.payments.service import PaymentService
    txn = PaymentService(db).record_settlement(
        seller_id=user_id,
        amount_paise=data.amount_paise,
        method=data.method,
        reference=data.reference,
        note=data.note,
        admin_id=admin.id,
    )
    record_audit_log(
        db, admin.id, "payout.settle", "user", str(user_id),
        f"amount_paise={data.amount_paise}, method={data.method}, ref={data.reference}",
    )
    db.commit()
    logger.info("Settlement recorded", seller=str(user_id), amount=data.amount_paise, admin=str(admin.id))
    return {"success": True, "settlement_id": str(txn.id)}


@router.put("/payout-details/{user_id}/verify")
def verify_payout_details(
    user_id: uuid.UUID,
    verified: bool,
    admin: AdminUser,
    db: Session = Depends(get_db),
):
    """Approve or revoke a seller's payout/KYC verification."""
    from app.payments.models import SellerPayoutDetail
    detail = (
        db.query(SellerPayoutDetail)
        .filter(SellerPayoutDetail.user_id == user_id)
        .first()
    )
    if not detail:
        raise NotFoundError("Payout details")
    detail.is_verified = verified
    record_audit_log(
        db, admin.id, "payout.verify", "user", str(user_id), f"verified={verified}"
    )
    db.commit()
    logger.info("Payout details verification set", target_user=str(user_id), verified=verified, admin=str(admin.id))
    return {"success": True}


# ── Moderation reports ────────────────────────────────────────────────────────

@router.get("/reports")
def list_reports(
    status: str | None = Query(None, pattern="^(open|resolved|dismissed)$"),
    _: User = Depends(require_role(UserRole.ADMIN)),
    db: Session = Depends(get_db),
):
    from app.moderation.service import ModerationService
    items = ModerationService(db).list_reports(status=status)
    return {"items": items, "total": len(items)}


@router.put("/reports/{report_id}/resolve")
def resolve_report(
    report_id: uuid.UUID,
    data: ReportResolve,
    admin: AdminUser,
    db: Session = Depends(get_db),
):
    from app.moderation.service import ModerationService
    report = ModerationService(db).resolve_report(report_id, admin.id, data)
    record_audit_log(
        db, admin.id, "report.resolve", "report", str(report_id),
        f"status={data.status}, action={data.action}",
    )
    db.commit()
    return {"success": True, "status": report.status, "action_taken": report.action_taken}


# ── Audit logs ────────────────────────────────────────────────────────────────

@router.get("/audit-logs")
def list_audit_logs(
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=100),
    action: str | None = None,
    target_type: str | None = None,
    _: User = Depends(require_role(UserRole.ADMIN)),
    db: Session = Depends(get_db),
):
    q = db.query(AuditLog)
    if action:
        q = q.filter(AuditLog.action.ilike(f"%{action}%"))
    if target_type:
        q = q.filter(AuditLog.target_type == target_type)

    total = q.count()
    items = (
        q.order_by(desc(AuditLog.created_at))
        .offset((page - 1) * per_page)
        .limit(per_page)
        .all()
    )

    return {
        "items": [
            {
                "id": str(log.id),
                "actor_id": str(log.actor_id) if log.actor_id else None,
                "actor_email": log.actor.email if log.actor else None,
                "action": log.action,
                "target_type": log.target_type,
                "target_id": log.target_id,
                "details": log.details,
                "ip_address": log.ip_address,
                "created_at": log.created_at.isoformat(),
            }
            for log in items
        ],
        "total": total,
        "page": page,
        "pages": -(-total // per_page),
    }
