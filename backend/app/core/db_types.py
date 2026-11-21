"""
Cross-database column types.

In PostgreSQL (production): native ARRAY, JSONB, UUID.
In SQLite (tests): JSON / TypeDecorator-based String equivalents that
properly coerce Python UUID objects and lists to/from storage format.
"""
import os
import uuid as _uuid_mod
from sqlalchemy import JSON, String, TypeDecorator
from sqlalchemy.dialects.postgresql import ARRAY, JSONB
from sqlalchemy.dialects.postgresql import UUID as PG_UUID

_TESTING = os.environ.get("TESTING", "").lower() in ("1", "true", "yes")


class _UUIDStr(TypeDecorator):
    """Stores UUID as VARCHAR(36); coerces UUID objects ↔ strings."""
    impl = String(36)
    cache_ok = True

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        return str(value)

    def process_result_value(self, value, dialect):
        if value is None:
            return None
        return _uuid_mod.UUID(str(value))


if _TESTING:
    StringArray = JSON          # list ↔ JSON text, handled by SQLAlchemy JSON type
    JsonB       = JSON          # dict ↔ JSON text
    UUIDType    = _UUIDStr()    # UUID ↔ VARCHAR(36) with proper coercion
else:
    StringArray = ARRAY(String)
    JsonB       = JSONB
    UUIDType    = PG_UUID(as_uuid=True)
