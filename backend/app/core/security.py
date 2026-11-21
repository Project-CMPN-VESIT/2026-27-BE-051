import hashlib
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

import bcrypt
from jose import JWTError, jwt

from app.core.config import get_settings

settings = get_settings()

BCRYPT_SHA256_PREFIX = "bcrypt_sha256$"
BCRYPT_ROUNDS = 12


# ── Passwords ─────────────────────────────────────────────────────────────────

def hash_password(plain: str) -> str:
    password_hash = bcrypt.hashpw(
        _bcrypt_secret(plain),
        bcrypt.gensalt(rounds=BCRYPT_ROUNDS),
    ).decode("ascii")
    return f"{BCRYPT_SHA256_PREFIX}{password_hash}"


def verify_password(plain: str, hashed: str) -> bool:
    try:
        if hashed.startswith(BCRYPT_SHA256_PREFIX):
            stored_hash = hashed.removeprefix(BCRYPT_SHA256_PREFIX).encode("ascii")
            return bcrypt.checkpw(_bcrypt_secret(plain), stored_hash)

        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("ascii"))
    except ValueError:
        return False


def _bcrypt_secret(plain: str) -> bytes:
    return hashlib.sha256(plain.encode("utf-8")).hexdigest().encode("ascii")


# ── JWT tokens ────────────────────────────────────────────────────────────────

def create_access_token(subject: str | uuid.UUID, extra: dict[str, Any] | None = None) -> str:
    expire = datetime.now(timezone.utc) + timedelta(
        minutes=settings.access_token_expire_minutes
    )
    payload: dict[str, Any] = {
        "sub": str(subject),
        "exp": expire,
        "iat": datetime.now(timezone.utc),
        "type": "access",
        **(extra or {}),
    }
    return jwt.encode(payload, settings.secret_key, algorithm=settings.algorithm)


def create_refresh_token() -> tuple[str, str]:
    """Returns (raw_token, hashed_token). Store the hash; send the raw."""
    raw = secrets.token_urlsafe(64)
    hashed = hashlib.sha256(raw.encode()).hexdigest()
    return raw, hashed


def hash_token(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()


def decode_access_token(token: str) -> dict[str, Any]:
    """Raises JWTError on invalid/expired token."""
    payload = jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
    if payload.get("type") != "access":
        raise JWTError("Not an access token")
    return payload
