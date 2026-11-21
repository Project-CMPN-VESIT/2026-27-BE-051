import uuid
from datetime import datetime, timezone

from sqlalchemy import create_engine, DateTime, func
from app.core.db_types import UUIDType
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, sessionmaker

from app.core.config import get_settings

settings = get_settings()

_db_url = settings.database_url
_is_sqlite = _db_url.startswith("sqlite")

# Pool sizing is env-tunable because the right values depend on where Postgres is.
# A local/RDS instance in the same network tolerates a large pool; a serverless
# provider caps connections by compute size, and every uvicorn worker plus every
# Celery worker keeps its own pool — so the real total is
# (pool_size + max_overflow) x process count.
#
# pool_recycle matters when the database can drop idle connections (Neon suspends
# its compute after 5 minutes). pool_pre_ping already recovers from that, but
# recycling first avoids paying for a failed round trip.
#
# TCP keepalives exist for the long-running jobs, not the API. A request handler
# never holds a connection long enough to matter, but the demo seed and the
# rescore tasks do meaningful CPU work in Python *between* statements — computing
# build scores, for instance. During those gaps the socket carries no traffic, and
# a managed provider or any NAT in between is free to consider it idle and drop
# it. The failure then surfaces on the next statement as
# `server closed the connection unexpectedly`, mid-transaction, where pre-ping
# cannot help because the connection was already checked out.
#
# 30s idle before probing, retried 5 times at 10s intervals, keeps the socket
# alive across those pauses at negligible cost.
_pg_connect_args = {
    "keepalives": 1,
    "keepalives_idle": 30,
    "keepalives_interval": 10,
    "keepalives_count": 5,
}

engine = create_engine(
    _db_url,
    pool_pre_ping=not _is_sqlite,
    **(
        {}
        if _is_sqlite
        else {
            "pool_size": settings.db_pool_size,
            "max_overflow": settings.db_max_overflow,
            "pool_recycle": settings.db_pool_recycle_seconds,
            "connect_args": _pg_connect_args,
        }
    ),
    echo=settings.db_echo,
)

SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)


class Base(DeclarativeBase):
    """Base model with common columns."""

    id: Mapped[uuid.UUID] = mapped_column(
        UUIDType, primary_key=True, default=uuid.uuid4
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )


def get_db():
    """FastAPI dependency that yields a DB session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
