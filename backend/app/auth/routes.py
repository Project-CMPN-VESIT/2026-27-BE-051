import base64
import json

import httpx
from fastapi import APIRouter, Depends, Request, Response
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from app.core.exceptions import AppError, UnauthorizedError, ValidationError
from app.core.logging import get_logger

from app.auth.schemas import (
    ForgotPasswordRequest,
    LoginRequest,
    OAuthCallbackResponse,
    RefreshRequest,
    RegisterRequest,
    ResetPasswordRequest,
    TOTPSetupResponse,
    TOTPVerifyRequest,
    TokenResponse,
)
from app.auth.service import AuthService
from app.core.config import get_settings
from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.users.models import User

router = APIRouter(prefix="/auth", tags=["auth"])
settings = get_settings()
logger = get_logger("auth")

REFRESH_COOKIE = "cb_refresh"
# Scoped to the auth routes so the token isn't attached to every request, but
# prefixed when a proxy mounts the API under a subpath (e.g. /api/auth/refresh).
REFRESH_COOKIE_PATH = f"{settings.api_path_prefix}/auth"


# SameSite/Secure are derived from FRONTEND_URL vs API_BASE_URL — see
# Settings.cookie_cross_site. Split hosts need None+Secure or the browser drops
# the cookie; a single host prefers Lax, which is also safer against CSRF.
def _set_refresh_cookie(response: Response, raw_token: str) -> None:
    response.set_cookie(
        key=REFRESH_COOKIE,
        value=raw_token,
        httponly=True,
        secure=settings.cookie_secure,
        samesite=settings.cookie_samesite,
        max_age=settings.refresh_token_expire_days * 86400,
        path=REFRESH_COOKIE_PATH,
    )


def _clear_refresh_cookie(response: Response) -> None:
    response.delete_cookie(
        key=REFRESH_COOKIE,
        path=REFRESH_COOKIE_PATH,
        httponly=True,
        secure=settings.cookie_secure,
        samesite=settings.cookie_samesite,
    )


def _refresh_token_from(request: Request, data: RefreshRequest | None) -> str:
    """Prefer the httpOnly cookie; fall back to the request body.

    The body path exists for non-browser clients and for any session issued
    before the cookie was introduced.
    """
    cookie_token = request.cookies.get(REFRESH_COOKIE)
    if cookie_token:
        return cookie_token
    if data and data.refresh_token:
        return data.refresh_token
    raise UnauthorizedError("No refresh token supplied")


@router.post("/register", response_model=TokenResponse, status_code=201)
def register(data: RegisterRequest, request: Request, response: Response, db: Session = Depends(get_db)):
    svc = AuthService(db)
    issued = svc.register(data, request_ip=request.client.host if request.client else None)
    _set_refresh_cookie(response, issued.raw_refresh)
    return issued.tokens


@router.post("/login", response_model=TokenResponse)
def login(data: LoginRequest, request: Request, response: Response, db: Session = Depends(get_db)):
    svc = AuthService(db)
    issued = svc.login(
        data,
        user_agent=request.headers.get("user-agent"),
        request_ip=request.client.host if request.client else None,
    )
    _set_refresh_cookie(response, issued.raw_refresh)
    return issued.tokens


@router.post("/refresh", response_model=TokenResponse)
def refresh_token(
    request: Request,
    response: Response,
    data: RefreshRequest | None = None,
    db: Session = Depends(get_db),
):
    svc = AuthService(db)
    issued = svc.refresh(
        _refresh_token_from(request, data),
        user_agent=request.headers.get("user-agent"),
        request_ip=request.client.host if request.client else None,
    )
    # Refresh tokens rotate on every use, so the cookie must be replaced too —
    # otherwise the next refresh presents a revoked token and the family-reuse
    # guard logs the user out.
    _set_refresh_cookie(response, issued.raw_refresh)
    return issued.tokens


@router.post("/logout", status_code=204)
def logout(
    request: Request,
    response: Response,
    data: RefreshRequest | None = None,
    db: Session = Depends(get_db),
):
    svc = AuthService(db)
    raw = request.cookies.get(REFRESH_COOKIE) or (data.refresh_token if data else None)
    if raw:
        svc.logout(raw)
    # Clear regardless, so a stale cookie can never linger after sign-out.
    _clear_refresh_cookie(response)


@router.post("/logout-all", status_code=204)
def logout_all(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    svc = AuthService(db)
    svc.logout_all(current_user.id)


@router.get("/verify-email/{token}", status_code=204)
def verify_email(token: str, db: Session = Depends(get_db)):
    svc = AuthService(db)
    svc.verify_email(token)


@router.post("/forgot-password", status_code=204)
def forgot_password(data: ForgotPasswordRequest, db: Session = Depends(get_db)):
    svc = AuthService(db)
    svc.forgot_password(data.email)


@router.post("/reset-password", status_code=204)
def reset_password(data: ResetPasswordRequest, db: Session = Depends(get_db)):
    svc = AuthService(db)
    svc.reset_password(data)


@router.get("/github")
def github_oauth_redirect():
    """Redirect browser to GitHub OAuth consent screen."""
    url = (
        f"https://github.com/login/oauth/authorize"
        f"?client_id={settings.github_client_id}"
        f"&redirect_uri={settings.github_redirect_uri}"
        f"&scope=user:email,read:user"
    )
    return RedirectResponse(url=url)


def _oauth_success_redirect(raw_refresh: str, is_new: bool) -> RedirectResponse:
    """Send the browser back to the frontend with the session established.

    The provider redirects the browser straight to this API, so returning JSON
    left the user staring at a raw payload instead of being signed in. We set the
    refresh cookie and bounce to a frontend page that exchanges it for an access
    token — deliberately not putting a token in the URL, where it would end up in
    browser history, server logs and the Referer header.
    """
    redirect = RedirectResponse(
        url=f"{settings.frontend_url}/auth/callback?new={'1' if is_new else '0'}"
    )
    _set_refresh_cookie(redirect, raw_refresh)
    return redirect


def _oauth_failure_redirect(reason: str) -> RedirectResponse:
    return RedirectResponse(url=f"{settings.frontend_url}/auth/login?error={reason}")


@router.get("/github/callback")
async def github_callback(
    request: Request,
    db: Session = Depends(get_db),
    code: str | None = None,
    error: str | None = None,
):
    # GitHub sends ?error=access_denied when the user cancels on the consent screen.
    if error or not code:
        return _oauth_failure_redirect("github_cancelled" if error else "github_no_code")

    svc = AuthService(db)
    try:
        issued = await svc.github_callback(
            code, request_ip=request.client.host if request.client else None
        )
    except AppError as exc:
        logger.warning("GitHub OAuth callback failed", error=str(exc))
        return _oauth_failure_redirect("github_failed")

    return _oauth_success_redirect(issued.raw_refresh, issued.result.is_new_user)


# ── 2FA ───────────────────────────────────────────────────────────────────────

@router.post("/2fa/setup", response_model=TOTPSetupResponse)
def setup_2fa(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    svc = AuthService(db)
    result = svc.setup_totp(current_user)
    return TOTPSetupResponse(secret=result["secret"], qr_code_url=result["qr_code_url"])


@router.post("/2fa/verify", status_code=204)
def verify_2fa_setup(
    data: TOTPVerifyRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    svc = AuthService(db)
    svc.verify_totp_setup(current_user, data.code)


@router.delete("/2fa", status_code=204)
def disable_2fa(
    data: TOTPVerifyRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    svc = AuthService(db)
    svc.disable_totp(current_user, data.code)


@router.get("/google")
def google_oauth_redirect():
    """Redirect browser to Google OAuth consent screen."""
    from urllib.parse import urlencode
    params = urlencode({
        "client_id": settings.google_client_id,
        "redirect_uri": settings.google_redirect_uri,
        "response_type": "code",
        "scope": "openid email profile",
        "access_type": "offline",
    })
    return RedirectResponse(url=f"https://accounts.google.com/o/oauth2/v2/auth?{params}")


@router.get("/google/callback")
async def google_callback(
    request: Request,
    db: Session = Depends(get_db),
    code: str | None = None,
    error: str | None = None,
):
    """Exchange Google code for tokens, find or create user."""
    if error or not code:
        return _oauth_failure_redirect("google_cancelled" if error else "google_no_code")

    async with httpx.AsyncClient(timeout=15.0) as client:
        token_resp = await client.post(
            "https://oauth2.googleapis.com/token",
            data={
                "code": code,
                "client_id": settings.google_client_id,
                "client_secret": settings.google_client_secret,
                "redirect_uri": settings.google_redirect_uri,
                "grant_type": "authorization_code",
            },
        )
        tokens = token_resp.json()
        id_token = tokens.get("id_token")
        if not id_token:
            logger.warning("Google OAuth returned no id_token", body=str(tokens)[:200])
            return _oauth_failure_redirect("google_failed")

        # Decode JWT payload (no verification here — Google signed it)
        payload_b64 = id_token.split(".")[1]
        # Add padding
        payload_b64 += "=" * (4 - len(payload_b64) % 4)
        ginfo = json.loads(base64.b64decode(payload_b64))

    google_id = ginfo.get("sub")
    email = ginfo.get("email")
    name = ginfo.get("name", "")
    avatar = ginfo.get("picture")

    if not email or not google_id:
        return _oauth_failure_redirect("google_no_email")

    from app.users.repository import UserRepository

    user_repo = UserRepository(db)
    is_new = False
    user = user_repo.get_by_google_id(google_id)
    if not user:
        user = user_repo.get_by_email(email)
        if user:
            user_repo.update(user, google_id=google_id)
        else:
            is_new = True
            user = user_repo.create(
                email=email,
                hashed_password=None,
                display_name=name,
                is_verified=True,
                google_id=google_id,
            )
            if avatar:
                user_repo.update_profile(user.id, avatar_url=avatar)

    db.commit()
    svc = AuthService(db)
    issued = svc.issue_session(user, request_ip=request.client.host if request.client else None)
    return _oauth_success_redirect(issued.raw_refresh, is_new)
