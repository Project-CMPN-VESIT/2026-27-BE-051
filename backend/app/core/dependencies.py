import uuid
from typing import Annotated

from fastapi import Depends, Header
from jose import JWTError
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.exceptions import ForbiddenError, UnauthorizedError
from app.core.security import decode_access_token
from app.users.models import User, UserRole


def _extract_token(authorization: str | None) -> str:
    if not authorization or not authorization.startswith("Bearer "):
        raise UnauthorizedError("Missing or invalid Authorization header")
    return authorization[7:]


def get_current_user(
    authorization: Annotated[str | None, Header()] = None,
    db: Session = Depends(get_db),
) -> User:
    token = _extract_token(authorization)
    try:
        payload = decode_access_token(token)
        user_id = uuid.UUID(payload["sub"])
    except (JWTError, ValueError, KeyError):
        raise UnauthorizedError("Invalid or expired token")

    user = db.get(User, user_id)
    if not user or not user.is_active:
        raise UnauthorizedError("User not found or inactive")
    return user


def get_current_verified_user(
    user: User = Depends(get_current_user),
) -> User:
    if not user.is_verified:
        raise ForbiddenError("Email not verified. Please verify your email address.")
    return user


def require_role(*roles: UserRole):
    def dependency(user: User = Depends(get_current_verified_user)) -> User:
        if user.role not in roles:
            raise ForbiddenError("Insufficient role")
        return user
    return dependency


def get_optional_user(
    authorization: Annotated[str | None, Header()] = None,
    db: Session = Depends(get_db),
) -> User | None:
    """Returns user if authenticated, None otherwise (for public endpoints)."""
    if not authorization:
        return None
    try:
        return get_current_user(authorization=authorization, db=db)
    except UnauthorizedError:
        return None
