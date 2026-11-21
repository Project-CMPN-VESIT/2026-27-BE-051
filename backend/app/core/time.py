"""Timezone helpers.

The original auth tables declare their timestamps as plain `DateTime`, which maps
to `TIMESTAMP WITHOUT TIME ZONE` on PostgreSQL and to naive values on SQLite. We
always *write* timezone-aware UTC values, but they come back naive — so comparing
one against `datetime.now(timezone.utc)` raises:

    TypeError: can't compare offset-naive and offset-aware datetimes

Rather than scatter that hazard across expiry checks, normalise before comparing.
Newer tables (e.g. subscriptions) use `DateTime(timezone=True)` and are already
aware; `as_utc` leaves those untouched.
"""

from datetime import datetime, timezone


def as_utc(value: datetime) -> datetime:
    """Return `value` as a timezone-aware UTC datetime.

    Naive input is assumed to already be UTC, which matches how these columns are
    written. Aware input is converted rather than relabelled.
    """
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def utc_now() -> datetime:
    """Current time as an aware UTC datetime."""
    return datetime.now(timezone.utc)


def is_expired(expires_at: datetime | None) -> bool:
    """True when `expires_at` is in the past. A missing value never expires."""
    if expires_at is None:
        return False
    return as_utc(expires_at) <= utc_now()


def is_still_active(until: datetime | None) -> bool:
    """True when `until` is in the future — e.g. a lockout still in force."""
    if until is None:
        return False
    return as_utc(until) > utc_now()
