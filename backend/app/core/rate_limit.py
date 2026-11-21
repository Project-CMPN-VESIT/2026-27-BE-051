import os
import time

from fastapi import Request, status
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from app.core.config import get_settings
from app.core.logging import get_logger
from app.core.redis_client import get_redis

logger = get_logger("rate_limit")


class RateLimitMiddleware(BaseHTTPMiddleware):
    """
    Sliding window rate limiter.
    - Unauthenticated: 100 req/min per IP
    - Authenticated: 500 req/min per user_id

    Redis is treated as optional: if it is unreachable the limiter fails open.
    A short-circuit breaker makes that failure cheap — without it, every request
    pays a fresh connection attempt while Redis is down, which turns a missing
    cache into site-wide latency.
    """

    ANON_LIMIT = 100
    ANON_WINDOW = 60
    AUTH_LIMIT = 500
    AUTH_WINDOW = 60

    # Tighter limits for sensitive endpoints
    SENSITIVE_PATHS = {
        "/auth/login": (10, 60),
        "/auth/register": (10, 60),
        "/auth/forgot-password": (5, 300),
        "/auth/reset-password": (5, 300),
    }

    # Paths that must never be throttled: the health check is what a load
    # balancer polls, and throttling it takes the service out of rotation.
    EXEMPT_PATHS = {"/health", "/"}

    # Prefixes exempt from per-IP throttling. The README badge is hotlinked and
    # served through GitHub's image proxy, so a single popular repo arrives as
    # many requests from a handful of Camo IPs — per-IP limits would rate-limit
    # the badge into a broken image for everyone. It is a cached, read-only,
    # unauthenticated SVG, so the throttle buys little here anyway.
    EXEMPT_PREFIXES = ("/badge/",)

    def __init__(self, app):
        super().__init__(app)
        settings = get_settings()
        self._cooldown = settings.rate_limit_breaker_cooldown_seconds
        # Monotonic timestamp until which Redis is considered down.
        self._breaker_until = 0.0
        # The test suite runs without Redis and asserts nothing about limits.
        # Paying a failed connect per request there costs minutes across a run.
        self._disabled = os.getenv("TESTING") == "1"

    def _redis_available(self) -> bool:
        return time.monotonic() >= self._breaker_until

    def _trip_breaker(self) -> None:
        was_closed = self._redis_available()
        self._breaker_until = time.monotonic() + self._cooldown
        if was_closed:
            # Log the transition only, not every subsequent skipped request.
            logger.warning(
                "redis_unavailable_rate_limiting_disabled",
                extra={"cooldown_seconds": self._cooldown},
            )

    async def dispatch(self, request: Request, call_next):
        path = request.url.path

        if (
            self._disabled
            or path in self.EXEMPT_PATHS
            or path.startswith(self.EXEMPT_PREFIXES)
        ):
            return await call_next(request)

        client_ip = request.client.host if request.client else "unknown"

        # Check sensitive path overrides
        if path in self.SENSITIVE_PATHS:
            limit, window = self.SENSITIVE_PATHS[path]
            key = f"rl:sensitive:{client_ip}:{path}"
        else:
            # Try to get user id from Authorization header
            auth_header = request.headers.get("Authorization", "")
            if auth_header.startswith("Bearer "):
                # We only have the raw token here; use a hash as key
                import hashlib
                token_hash = hashlib.sha256(auth_header[7:].encode()).hexdigest()[:16]
                key = f"rl:auth:{token_hash}"
                limit, window = self.AUTH_LIMIT, self.AUTH_WINDOW
            else:
                key = f"rl:anon:{client_ip}"
                limit, window = self.ANON_LIMIT, self.ANON_WINDOW

        count = 0
        if self._redis_available():
            now = int(time.time())
            window_key = f"{key}:{now // window}"
            try:
                redis = get_redis()
                pipe = redis.pipeline()
                pipe.incr(window_key)
                pipe.expire(window_key, window)
                count, _ = pipe.execute()
            except Exception:
                # Redis unavailable — fail open (allow request) and stop dialling
                # it for a cooldown period.
                self._trip_breaker()
                count = 0

        if count > limit:
            retry_after = window - (int(time.time()) % window)
            return JSONResponse(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                content={
                    "error": "rate_limited",
                    "message": (
                        "You're doing that a bit too quickly. "
                        f"Please wait {retry_after}s and try again."
                    ),
                    "retry_after": retry_after,
                },
                headers={
                    "Retry-After": str(retry_after),
                    "X-RateLimit-Limit": str(limit),
                    "X-RateLimit-Remaining": "0",
                },
            )

        response = await call_next(request)
        response.headers["X-RateLimit-Limit"] = str(limit)
        response.headers["X-RateLimit-Remaining"] = str(max(0, limit - count))
        return response
