from functools import lru_cache

import redis

from app.core.config import get_settings


@lru_cache
def get_redis() -> redis.Redis:
    """Shared Redis handle.

    Timeouts are set explicitly and kept short. redis-py defaults both socket
    timeouts to None, which means a request that touches Redis while the server
    is unreachable blocks on the OS TCP timeout instead of failing fast. Every
    caller here treats Redis as optional (rate limiting fails open), so a slow
    failure is strictly worse than an immediate one: it converts an unavailable
    cache into request latency on the hot path.
    """
    settings = get_settings()
    return redis.from_url(
        settings.redis_url,
        decode_responses=True,
        socket_connect_timeout=settings.redis_timeout_seconds,
        socket_timeout=settings.redis_timeout_seconds,
        # Don't let a dead host be re-dialled on every single command.
        retry_on_timeout=False,
        health_check_interval=30,
    )
