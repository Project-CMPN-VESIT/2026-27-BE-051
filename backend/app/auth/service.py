import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import NamedTuple

import httpx
import pyotp
import qrcode
import qrcode.image.svg
from io import BytesIO
import base64

from sqlalchemy.orm import Session

from app.auth.repository import AuthRepository
from app.users.models import UserRole
from app.auth.schemas import (
    LoginRequest,
    OAuthCallbackResponse,
    RegisterRequest,
    ResetPasswordRequest,
    TokenResponse,
)
from app.core.config import get_settings
from app.core.email import send_password_reset_email, send_verification_email
from app.core.exceptions import (
    ConflictError,
    ForbiddenError,
    NotFoundError,
    UnauthorizedError,
    ValidationError,
)
from app.core.logging import get_logger
from app.core.time import as_utc, is_expired, is_still_active
from app.core.security import (
    create_access_token,
    create_refresh_token,
    hash_password,
    hash_token,
    verify_password,
)
from app.users.models import User
from app.users.repository import UserRepository

settings = get_settings()
logger = get_logger("auth")

MAX_FAILED_ATTEMPTS = 5
LOCKOUT_DURATION_MINUTES = 15


class IssuedTokens(NamedTuple):
    """Result of minting a session.

    The access token travels in the response body; the refresh token is handed
    back separately so the route layer can put it in an httpOnly cookie. Keeping
    it out of the body means JavaScript — and therefore any XSS — cannot read a
    long-lived credential.
    """

    tokens: TokenResponse
    raw_refresh: str


class IssuedOAuthSession(NamedTuple):
    """Same split as IssuedTokens, for the OAuth callback path."""

    result: OAuthCallbackResponse
    raw_refresh: str
EMAIL_VERIFY_EXPIRE_HOURS = 24
PASSWORD_RESET_EXPIRE_HOURS = 1


class AuthService:
    def __init__(self, db: Session):
        self.db = db
        self.user_repo = UserRepository(db)
        self.auth_repo = AuthRepository(db)

    def register(self, data: RegisterRequest, request_ip: str | None = None) -> IssuedTokens:
        if self.user_repo.get_by_email(data.email):
            raise ConflictError("An account with this email already exists")

        # Referral attribution (optional)
        referred_by_id = None
        if data.referral_code:
            referrer = self.user_repo.get_by_referral_code(data.referral_code.strip())
            if referrer:
                referred_by_id = referrer.id

        user = self.user_repo.create(
            email=data.email,
            hashed_password=hash_password(data.password),
            display_name=data.display_name,
            is_verified=not settings.require_email_verification,
            referred_by_id=referred_by_id,
            role=data.role or UserRole.BUILDER,
        )
        self.db.flush()

        verification_token: str | None = None
        if settings.require_email_verification:
            raw_token = secrets.token_urlsafe(32)
            token_hash = hash_token(raw_token)
            self.auth_repo.create_email_verification(
                user_id=user.id,
                token_hash=token_hash,
                expires_at=datetime.now(timezone.utc) + timedelta(hours=EMAIL_VERIFY_EXPIRE_HOURS),
            )
            verification_token = raw_token

        self.db.commit()
        logger.info("User registered", user_id=str(user.id), email=user.email)

        # Send only after committing. Sending inside the transaction meant a slow
        # or blocked SMTP server held the row locks and the pooled connection for
        # the whole duration — on a host that blocks outbound SMTP that stalled
        # registration for minutes, so the client timed out on a request that had
        # in fact succeeded.
        if verification_token:
            try:
                send_verification_email(user.email, verification_token)
            except Exception as exc:
                logger.warning(
                    "Verification email failed; account was still created",
                    user_id=str(user.id),
                    error=str(exc),
                )

        return self._issue_tokens(user, request_ip=request_ip)

    def login(
        self,
        data: LoginRequest,
        user_agent: str | None = None,
        request_ip: str | None = None,
    ) -> IssuedTokens:
        user = self.user_repo.get_by_email(data.email)
        if not user or not user.hashed_password:
            raise UnauthorizedError("Invalid email or password")

        # Account lockout check
        if is_still_active(user.locked_until):
            raise ForbiddenError(
                f"Account locked due to too many failed attempts. Try again after {as_utc(user.locked_until).strftime('%H:%M UTC')}"
            )

        if not verify_password(data.password, user.hashed_password):
            self.user_repo.increment_failed_login(user)
            if user.failed_login_attempts >= MAX_FAILED_ATTEMPTS:
                user.locked_until = datetime.now(timezone.utc) + timedelta(
                    minutes=LOCKOUT_DURATION_MINUTES
                )
            self.db.commit()
            raise UnauthorizedError("Invalid email or password")

        if not user.is_active:
            raise ForbiddenError("Account is deactivated")

        if not settings.require_email_verification and not user.is_verified:
            self.user_repo.update(user, is_verified=True)

        # TOTP check
        if user.totp_enabled:
            if not data.totp_code:
                raise ValidationError("2FA code required")
            totp = pyotp.TOTP(user.totp_secret)
            if not totp.verify(data.totp_code, valid_window=1):
                raise UnauthorizedError("Invalid 2FA code")

        self.user_repo.reset_failed_login(user)
        self.db.commit()
        logger.info("User logged in", user_id=str(user.id))
        return self._issue_tokens(user, user_agent=user_agent, request_ip=request_ip)

    def refresh(
        self,
        raw_token: str,
        user_agent: str | None = None,
        request_ip: str | None = None,
    ) -> IssuedTokens:
        token_hash = hash_token(raw_token)
        rt = self.auth_repo.get_refresh_token(token_hash)

        if not rt:
            raise UnauthorizedError("Invalid refresh token")

        if rt.is_revoked:
            # Token reuse detected — revoke entire family
            logger.warning("Refresh token reuse detected — revoking family", family=rt.family)
            self.auth_repo.revoke_family(rt.family)
            self.db.commit()
            raise UnauthorizedError("Token reuse detected. Please log in again.")

        if not self.auth_repo.is_token_valid(rt):
            raise UnauthorizedError("Refresh token expired")

        user = self.user_repo.get_by_id(rt.user_id)
        if not user or not user.is_active:
            raise UnauthorizedError("User not found or inactive")

        # Rotate: revoke old token, issue new one in same family
        self.auth_repo.revoke_token(rt)
        self.db.commit()
        return self._issue_tokens(user, family=rt.family, user_agent=user_agent, request_ip=request_ip)

    def logout(self, raw_token: str) -> None:
        token_hash = hash_token(raw_token)
        rt = self.auth_repo.get_refresh_token(token_hash)
        if rt:
            self.auth_repo.revoke_token(rt)
            self.db.commit()

    def logout_all(self, user_id: uuid.UUID) -> None:
        self.auth_repo.revoke_all_for_user(user_id)
        self.db.commit()

    def verify_email(self, raw_token: str) -> None:
        token_hash = hash_token(raw_token)
        ev = self.auth_repo.get_email_verification(token_hash)

        if not ev or ev.is_used:
            raise ValidationError("Invalid or already used verification link")
        if is_expired(ev.expires_at):
            raise ValidationError("Verification link has expired. Please request a new one.")

        user = self.user_repo.get_by_id(ev.user_id)
        if not user:
            raise NotFoundError("User")

        self.user_repo.update(user, is_verified=True)
        self.auth_repo.mark_email_verification_used(ev)
        self.db.commit()
        logger.info("Email verified", user_id=str(user.id))

    def forgot_password(self, email: str) -> None:
        user = self.user_repo.get_by_email(email)
        if not user:
            return  # Silent — don't reveal if email exists

        raw_token = secrets.token_urlsafe(32)
        token_hash = hash_token(raw_token)
        self.auth_repo.create_password_reset(
            user_id=user.id,
            token_hash=token_hash,
            expires_at=datetime.now(timezone.utc) + timedelta(hours=PASSWORD_RESET_EXPIRE_HOURS),
        )
        self.db.commit()
        try:
            send_password_reset_email(user.email, raw_token)
        except Exception:
            pass

    def reset_password(self, data: ResetPasswordRequest) -> None:
        token_hash = hash_token(data.token)
        pr = self.auth_repo.get_password_reset(token_hash)

        if not pr or pr.is_used:
            raise ValidationError("Invalid or already used reset link")
        if is_expired(pr.expires_at):
            raise ValidationError("Reset link has expired. Please request a new one.")

        user = self.user_repo.get_by_id(pr.user_id)
        if not user:
            raise NotFoundError("User")

        self.user_repo.update(user, hashed_password=hash_password(data.new_password))
        self.auth_repo.mark_password_reset_used(pr)
        self.auth_repo.revoke_all_for_user(user.id)  # Invalidate all sessions
        self.db.commit()
        logger.info("Password reset", user_id=str(user.id))

    # ── OAuth ─────────────────────────────────────────────────────────────────

    async def github_callback(
        self, code: str, request_ip: str | None = None
    ) -> IssuedOAuthSession:
        # Exchange code for access token
        async with httpx.AsyncClient() as client:
            token_resp = await client.post(
                "https://github.com/login/oauth/access_token",
                data={
                    "client_id": settings.github_client_id,
                    "client_secret": settings.github_client_secret,
                    "code": code,
                },
                headers={"Accept": "application/json"},
                timeout=10.0,
            )
            token_data = token_resp.json()
            github_access_token = token_data.get("access_token")
            if not github_access_token:
                raise UnauthorizedError("GitHub OAuth failed")

            # Fetch user info
            user_resp = await client.get(
                "https://api.github.com/user",
                headers={
                    "Authorization": f"Bearer {github_access_token}",
                    "Accept": "application/vnd.github.v3+json",
                },
                timeout=10.0,
            )
            gh_user = user_resp.json()

            # Fetch primary email
            email_resp = await client.get(
                "https://api.github.com/user/emails",
                headers={
                    "Authorization": f"Bearer {github_access_token}",
                    "Accept": "application/vnd.github.v3+json",
                },
                timeout=10.0,
            )
            emails = email_resp.json()

        primary_email = next(
            (e["email"] for e in emails if e.get("primary") and e.get("verified")),
            None,
        )
        if not primary_email:
            raise ValidationError("No verified primary email found on GitHub account")

        # Find or create user
        is_new = False
        user = self.user_repo.get_by_github_id(gh_user["id"])
        if not user:
            user = self.user_repo.get_by_email(primary_email)
            if user:
                # Link GitHub to existing account
                self.user_repo.update(
                    user,
                    github_id=gh_user["id"],
                )
            else:
                # New user via GitHub
                is_new = True
                user = self.user_repo.create(
                    email=primary_email,
                    hashed_password=None,
                    display_name=gh_user.get("name") or gh_user.get("login", ""),
                    is_verified=True,
                    github_id=gh_user["id"],
                )
                self.user_repo.update_profile(
                    user.id,
                    github_username=gh_user.get("login"),
                    avatar_url=gh_user.get("avatar_url"),
                )

        self.db.commit()
        issued = self._issue_tokens(user, request_ip=request_ip)
        return IssuedOAuthSession(
            result=OAuthCallbackResponse(
                access_token=issued.tokens.access_token,
                is_new_user=is_new,
            ),
            raw_refresh=issued.raw_refresh,
        )

    # ── 2FA ───────────────────────────────────────────────────────────────────

    def setup_totp(self, user: User) -> dict:
        secret = pyotp.random_base32()
        totp = pyotp.TOTP(secret)
        provisioning_url = totp.provisioning_uri(
            name=user.email, issuer_name="CodeBazaar"
        )
        # Generate QR code as base64 data URI
        qr = qrcode.QRCode(version=1, box_size=10, border=4)
        qr.add_data(provisioning_url)
        qr.make(fit=True)
        img = qr.make_image(fill_color="black", back_color="white")
        buffer = BytesIO()
        img.save(buffer, format="PNG")
        qr_b64 = base64.b64encode(buffer.getvalue()).decode()

        # Store secret (not yet enabled — enabled after verification)
        self.user_repo.update(user, totp_secret=secret)
        self.db.commit()
        return {
            "secret": secret,
            "qr_code_url": f"data:image/png;base64,{qr_b64}",
        }

    def verify_totp_setup(self, user: User, code: str) -> None:
        if not user.totp_secret:
            raise ValidationError("2FA setup not initiated")
        totp = pyotp.TOTP(user.totp_secret)
        if not totp.verify(code, valid_window=1):
            raise UnauthorizedError("Invalid 2FA code")
        self.user_repo.update(user, totp_enabled=True)
        self.db.commit()

    def disable_totp(self, user: User, code: str) -> None:
        if not user.totp_enabled:
            raise ValidationError("2FA is not enabled")
        totp = pyotp.TOTP(user.totp_secret)
        if not totp.verify(code, valid_window=1):
            raise UnauthorizedError("Invalid 2FA code")
        self.user_repo.update(user, totp_enabled=False, totp_secret=None)
        self.db.commit()

    def issue_session(
        self,
        user: User,
        user_agent: str | None = None,
        request_ip: str | None = None,
    ) -> IssuedTokens:
        """Mint a session for an already-authenticated user.

        Public entry point for flows that establish identity themselves, such as
        the Google OAuth callback, so route code doesn't reach into a private
        method.
        """
        return self._issue_tokens(user, user_agent=user_agent, request_ip=request_ip)

    # ── Internal ──────────────────────────────────────────────────────────────

    def _issue_tokens(
        self,
        user: User,
        family: str | None = None,
        user_agent: str | None = None,
        request_ip: str | None = None,
    ) -> IssuedTokens:
        access_token = create_access_token(
            subject=user.id,
            extra={"role": user.role.value, "email": user.email},
        )
        raw_refresh, hashed_refresh = create_refresh_token()
        token_family = family or secrets.token_hex(16)
        self.auth_repo.create_refresh_token(
            user_id=user.id,
            token_hash=hashed_refresh,
            family=token_family,
            expires_at=datetime.now(timezone.utc)
            + timedelta(days=settings.refresh_token_expire_days),
            user_agent=user_agent,
            ip_address=request_ip,
        )
        # Must commit here. Every caller commits its own work *before* issuing
        # tokens, so without this the refresh_tokens row is only flushed and is
        # rolled back when the request's session closes — handing the client a
        # token that was never persisted and can never be redeemed.
        self.db.commit()

        return IssuedTokens(
            tokens=TokenResponse(
                access_token=access_token,
                expires_in=settings.access_token_expire_minutes * 60,
            ),
            raw_refresh=raw_refresh,
        )
