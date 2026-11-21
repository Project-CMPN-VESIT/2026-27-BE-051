import uuid
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.core.time import is_expired
from app.users.models import EmailVerification, PasswordReset, RefreshToken


class AuthRepository:
    def __init__(self, db: Session):
        self.db = db

    # ── Refresh tokens ────────────────────────────────────────────────────────

    def create_refresh_token(
        self,
        user_id: uuid.UUID,
        token_hash: str,
        family: str,
        expires_at: datetime,
        user_agent: str | None,
        ip_address: str | None,
    ) -> RefreshToken:
        rt = RefreshToken(
            user_id=user_id,
            token_hash=token_hash,
            family=family,
            expires_at=expires_at,
            user_agent=user_agent,
            ip_address=ip_address,
        )
        self.db.add(rt)
        self.db.flush()
        return rt

    def get_refresh_token(self, token_hash: str) -> RefreshToken | None:
        return (
            self.db.query(RefreshToken)
            .filter(RefreshToken.token_hash == token_hash)
            .first()
        )

    def revoke_token(self, rt: RefreshToken) -> None:
        rt.is_revoked = True
        self.db.flush()

    def revoke_family(self, family: str) -> None:
        """Revoke all tokens in a family — theft detection response."""
        self.db.query(RefreshToken).filter(
            RefreshToken.family == family
        ).update({"is_revoked": True})
        self.db.flush()

    def revoke_all_for_user(self, user_id: uuid.UUID) -> None:
        self.db.query(RefreshToken).filter(
            RefreshToken.user_id == user_id
        ).update({"is_revoked": True})
        self.db.flush()

    def is_token_valid(self, rt: RefreshToken) -> bool:
        return not rt.is_revoked and not is_expired(rt.expires_at)

    # ── Email verification ────────────────────────────────────────────────────

    def create_email_verification(
        self, user_id: uuid.UUID, token_hash: str, expires_at: datetime
    ) -> EmailVerification:
        ev = EmailVerification(
            user_id=user_id, token_hash=token_hash, expires_at=expires_at
        )
        self.db.add(ev)
        self.db.flush()
        return ev

    def get_email_verification(self, token_hash: str) -> EmailVerification | None:
        return (
            self.db.query(EmailVerification)
            .filter(EmailVerification.token_hash == token_hash)
            .first()
        )

    def mark_email_verification_used(self, ev: EmailVerification) -> None:
        ev.is_used = True
        self.db.flush()

    # ── Password reset ────────────────────────────────────────────────────────

    def create_password_reset(
        self, user_id: uuid.UUID, token_hash: str, expires_at: datetime
    ) -> PasswordReset:
        # Invalidate existing resets for this user
        self.db.query(PasswordReset).filter(
            PasswordReset.user_id == user_id, PasswordReset.is_used == False
        ).update({"is_used": True})
        pr = PasswordReset(
            user_id=user_id, token_hash=token_hash, expires_at=expires_at
        )
        self.db.add(pr)
        self.db.flush()
        return pr

    def get_password_reset(self, token_hash: str) -> PasswordReset | None:
        return (
            self.db.query(PasswordReset)
            .filter(PasswordReset.token_hash == token_hash)
            .first()
        )

    def mark_password_reset_used(self, pr: PasswordReset) -> None:
        pr.is_used = True
        self.db.flush()
