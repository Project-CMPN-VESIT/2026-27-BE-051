from functools import lru_cache
from urllib.parse import urlparse

from pydantic_settings import BaseSettings, SettingsConfigDict

# Names that all resolve to the local loopback interface.
_LOOPBACK_ALIASES = ("localhost", "127.0.0.1", "::1")


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # App
    app_env: str = "development"
    secret_key: str = "change-me"
    allowed_origins: list[str] = ["http://localhost:3000"]
    # Hosts allowed in production (TrustedHostMiddleware). Set ALLOWED_HOSTS in
    # your env to your real domain(s), e.g. '["api.yoursite.com"]'.
    allowed_hosts: list[str] = ["api.codebazaar.dev", "*.codebazaar.dev"]

    # Database
    database_url: str = "postgresql+psycopg2://codebazaar:password@localhost:5432/codebazaar"
    # Log every SQL statement. Opt-in rather than implied by APP_ENV: echoing was
    # previously tied to `app_env == "development"`, which meant a local demo
    # against a remote database logged tens of thousands of statements and slowed
    # a seed run to a crawl. Debugging SQL is a separate decision from which
    # environment you are in.
    db_echo: bool = False

    # Redis
    redis_url: str = "redis://localhost:6379/0"
    # Cap on Redis socket operations. Redis is optional infrastructure here —
    # rate limiting fails open without it — so a connection attempt must fail
    # fast rather than adding the OS TCP timeout to every request.
    redis_timeout_seconds: float = 0.25
    # How long the rate limiter stops dialling Redis after a failure. Prevents
    # a dead cache from costing a connect attempt on every single request.
    rate_limit_breaker_cooldown_seconds: float = 30.0

    # JWT
    access_token_expire_minutes: int = 15
    refresh_token_expire_days: int = 30
    algorithm: str = "HS256"

    # GitHub OAuth
    github_client_id: str = ""
    github_client_secret: str = ""
    github_redirect_uri: str = "http://localhost:8000/auth/github/callback"

    # Google OAuth
    google_client_id: str = ""
    google_client_secret: str = ""
    google_redirect_uri: str = "http://localhost:8000/auth/google/callback"

    # ── AI providers ──────────────────────────────────────────────────────────
    # Two transports are supported and either is sufficient:
    #   openrouter — one key, any model including Google's (google/gemini-3.6-flash)
    #   gemini     — Google's own Generative Language API, no intermediary
    # "auto" picks whichever is configured, preferring OpenRouter because a single
    # key there covers every model.
    ai_provider: str = "auto"  # auto | openrouter | gemini

    openrouter_api_key: str = ""
    openrouter_model: str = "mistralai/mistral-7b-instruct"

    gemini_api_key: str = ""
    gemini_model: str = "gemini-2.5-flash"

    # AI calls are user-visible and queued in Celery; an unbounded request would
    # hold a worker indefinitely if the provider stalls.
    ai_request_timeout_seconds: float = 90.0

    @property
    def resolved_ai_provider(self) -> str:
        """Which transport will actually be used, or "" when none is configured."""
        if self.ai_provider == "openrouter":
            return "openrouter" if self.openrouter_api_key else ""
        if self.ai_provider == "gemini":
            return "gemini" if self.gemini_api_key else ""
        # auto
        if self.openrouter_api_key:
            return "openrouter"
        if self.gemini_api_key:
            return "gemini"
        return ""

    @property
    def ai_enabled(self) -> bool:
        return bool(self.resolved_ai_provider)

    @property
    def ai_model_label(self) -> str:
        """Human-readable provider/model, recorded against generated content."""
        provider = self.resolved_ai_provider
        if provider == "openrouter":
            return f"openrouter/{self.openrouter_model}"
        if provider == "gemini":
            return f"gemini/{self.gemini_model}"
        return "unavailable"

    # Cashfree
    cashfree_app_id: str = ""
    cashfree_secret_key: str = ""
    cashfree_env: str = "sandbox"

    # Marketplace economics
    # Platform commission on project sales, in basis points (1000 = 10%).
    commission_bps: int = 1000
    # Days of Pro membership granted per subscription payment.
    subscription_days: int = 30

    # S3
    s3_endpoint_url: str = ""
    s3_access_key: str = ""
    s3_secret_key: str = ""
    s3_bucket_name: str = "codebazaar"

    # Email
    smtp_host: str = "smtp.gmail.com"
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    email_from: str = "noreply@codebazaar.dev"
    email_verification_required: bool | None = None

    # ── Escrow settlement ─────────────────────────────────────────────────────
    # No automated payout rail is integrated. Approving a milestone records a
    # RELEASE entry in the escrow ledger; moving the money to the builder happens
    # out of band (a manual transfer, or a future Cashfree Payouts integration).
    #
    # Because of that, taking real escrow funding is refused in production until
    # this is explicitly turned on — otherwise the platform would collect a
    # client's money with no mechanism to pay the builder.
    escrow_manual_settlement: bool = False
    # Hard cap on SMTP socket operations. Without one, smtplib inherits the OS
    # TCP timeout (minutes) — and some hosts, including Render's free tier,
    # block outbound SMTP so the connect never completes. An unbounded send
    # blocks the request thread and any transaction open around it.
    smtp_timeout_seconds: int = 10

    # ── Connection pool ───────────────────────────────────────────────────────
    # Effective connections = (db_pool_size + db_max_overflow) x process count,
    # counting every uvicorn worker and every Celery worker separately. Defaults
    # suit a local or same-VPC database. Serverless Postgres caps connections by
    # compute size — Neon at 0.25 CU allows roughly 104 — so lower these when
    # pointing at one.
    db_pool_size: int = 10
    db_max_overflow: int = 20
    # Recycle before the provider drops the connection itself; Neon suspends idle
    # compute after 5 minutes. pool_pre_ping recovers either way, but recycling
    # avoids paying for a failed round trip first.
    db_pool_recycle_seconds: int = 1800

    # Sentry
    sentry_dsn: str = ""

    # Frontend
    frontend_url: str = "http://localhost:3000"
    # Public base URL of THIS API. Used for payment webhooks (notify_url) and
    # OAuth callbacks, so it must be reachable from the internet in a deploy.
    api_base_url: str = "http://localhost:8000"

    @property
    def is_production(self) -> bool:
        return self.app_env == "production"

    @property
    def effective_allowed_hosts(self) -> list[str]:
        """Hosts TrustedHostMiddleware will accept.

        The API's own `API_BASE_URL` host is always included. Without this, a
        deployment running with APP_ENV=production but the default ALLOWED_HOSTS
        rejects *every* request with a bare 400 — including its own health check —
        and nothing in the response says why. That is a genuinely hard failure to
        diagnose, and the host the API is served on cannot sensibly be untrusted.
        """
        hosts = list(self.allowed_hosts)
        own = self._api_host
        if not own:
            return hosts

        # Starlette compares the Host header (minus port) against these strings,
        # so a bare hostname entry covers any port.
        candidates = [own]
        # localhost and 127.0.0.1 are the same interface; a browser may use
        # either, so accepting one and rejecting the other is just a trap.
        if own in _LOOPBACK_ALIASES:
            candidates = list(_LOOPBACK_ALIASES)

        for host in candidates:
            if host not in hosts:
                hosts.append(host)
        return hosts

    @property
    def host_config_looks_unset(self) -> bool:
        """True when running production against the shipped placeholder domains."""
        return self.is_production and set(self.allowed_hosts) == {
            "api.codebazaar.dev",
            "*.codebazaar.dev",
        }

    # ── Refresh-cookie flags ──────────────────────────────────────────────────
    # Derived from the actual URLs rather than APP_ENV, because the right answer
    # depends on topology, not environment name:
    #
    #   split hosts (Vercel + Render)  -> SameSite=None; Secure  (or it's dropped)
    #   one host / subdomains (EC2)    -> SameSite=Lax            (CSRF-safer)
    #
    # Keying this off APP_ENV=production forced None+Secure everywhere, which
    # silently breaks a single-host deployment that hasn't got TLS yet.

    @property
    def _frontend_host(self) -> str:
        return (urlparse(self.frontend_url).hostname or "").lower()

    @property
    def _api_host(self) -> str:
        return (urlparse(self.api_base_url).hostname or "").lower()

    @property
    def cookie_cross_site(self) -> bool:
        """True when frontend and API are on different sites.

        Same host, or one a subdomain of the other, counts as same-site — which
        covers `example.com` + `api.example.com`. Anything else is treated as
        cross-site, erring toward None+Secure because that at least works over
        HTTPS, whereas a wrongly-Lax cookie is never sent at all.
        """
        fe, api = self._frontend_host, self._api_host
        if not fe or not api:
            return False
        if fe == api:
            return False
        return not (fe.endswith(f".{api}") or api.endswith(f".{fe}"))

    @property
    def cookie_samesite(self) -> str:
        return "none" if self.cookie_cross_site else "lax"

    @property
    def api_path_prefix(self) -> str:
        """Path prefix the API is reachable under, e.g. "" or "/api".

        Taken from API_BASE_URL so that a reverse proxy mounting the API under a
        subpath still gets a cookie path the browser will match. A cookie scoped
        to /auth is never sent to /api/auth/refresh.
        """
        return urlparse(self.api_base_url).path.rstrip("/")

    @property
    def cookie_secure(self) -> bool:
        # SameSite=None is only accepted alongside Secure, so cross-site forces it.
        # Otherwise follow the API scheme, which keeps plain-HTTP bring-up working.
        return self.cookie_cross_site or self.api_base_url.startswith("https://")

    @property
    def require_email_verification(self) -> bool:
        if self.email_verification_required is not None:
            return self.email_verification_required
        return self.is_production


@lru_cache
def get_settings() -> Settings:
    return Settings()
