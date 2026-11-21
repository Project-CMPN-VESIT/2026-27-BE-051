"""Reusable field validators shared across request schemas.

Kept deliberately simple: rules a real user can satisfy on the first try, and
which block the passwords that actually get compromised. No arbitrary symbol
requirements (they push users toward "Password1!" and nothing safer).
"""

import re

# The passwords that dominate every credential-stuffing list. Checked after
# lowercasing, so "Password123" is caught too.
_COMMON_PASSWORDS = {
    "password", "password1", "password123", "passw0rd", "p@ssword",
    "12345678", "123456789", "1234567890", "qwerty123", "qwertyui",
    "iloveyou", "welcome1", "admin123", "letmein1", "abc12345",
    "football", "baseball", "sunshine", "princess", "dragon123",
    "monkey123", "trustno1", "asdfghjk", "zxcvbnm1", "changeme",
    "codebazaar", "india123", "student1",
}

MIN_PASSWORD_LENGTH = 8
MAX_PASSWORD_LENGTH = 128


def validate_password_strength(value: str) -> str:
    """Enforce a practical password policy.

    Raises ValueError with a user-facing message — the request validation
    handler surfaces it verbatim.
    """
    if value != value.strip():
        raise ValueError("Password cannot start or end with a space")
    if len(value) < MIN_PASSWORD_LENGTH:
        raise ValueError(
            f"Password must be at least {MIN_PASSWORD_LENGTH} characters"
        )
    if len(value) > MAX_PASSWORD_LENGTH:
        raise ValueError(
            f"Password must be {MAX_PASSWORD_LENGTH} characters or fewer"
        )
    if not re.search(r"[A-Za-z]", value):
        raise ValueError("Password must include at least one letter")
    if not re.search(r"\d", value):
        raise ValueError("Password must include at least one number")
    if len(set(value)) < 4:
        raise ValueError("Password is too repetitive — use a more varied mix")
    if value.lower() in _COMMON_PASSWORDS:
        raise ValueError(
            "That password is too common and appears in known breach lists. "
            "Pick something less predictable."
        )
    return value


def validate_non_blank(value: str, label: str = "This field") -> str:
    """Reject whitespace-only input and normalise surrounding space.

    `min_length=1` alone happily accepts "   ", which then renders as an empty
    name across the product.
    """
    cleaned = " ".join(value.split())
    if not cleaned:
        raise ValueError(f"{label} cannot be blank")
    return cleaned
