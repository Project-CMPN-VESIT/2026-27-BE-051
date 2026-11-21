import uuid

from sqlalchemy.orm import Session

from app.users.models import AuditLog


def record_audit_log(
    db: Session,
    actor_id: uuid.UUID | None,
    action: str,
    target_type: str | None = None,
    target_id: str | None = None,
    details: str | None = None,
    ip_address: str | None = None,
) -> None:
    """
    Record an admin/system action for the audit trail.
    Caller is responsible for committing the session.
    """
    log = AuditLog(
        actor_id=actor_id,
        action=action,
        target_type=target_type,
        target_id=target_id,
        details=details,
        ip_address=ip_address,
    )
    db.add(log)
    db.flush()
