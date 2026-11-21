import sentry_sdk
from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.admin.routes import router as admin_router
from app.auth.routes import router as auth_router
from app.core.config import get_settings
from app.core.exceptions import (
    AppError,
    app_error_handler,
    http_error_handler,
    unhandled_error_handler,
    validation_error_handler,
)
from app.core.logging import get_logger, setup_logging
from app.core.rate_limit import RateLimitMiddleware
from app.github.routes import router as github_router
from app.payments.routes import router as payments_router
from app.projects.routes import router as projects_router
from app.users.routes import router as users_router
from app.notifications.routes import router as notifications_router
from app.reviews.routes import router as reviews_router
from app.skills.routes import router as skills_router
from app.messaging.routes import router as messaging_router
from app.verification.routes import router as verification_router
from app.escrow.routes import router as escrow_router
from app.delivery.routes import router as delivery_router
from app.hackathon.routes import router as hackathon_router
from app.growth.routes import router as growth_router
from app.incubation.routes import router as incubation_router
from app.subscriptions.routes import router as subscriptions_router
from app.moderation.routes import router as moderation_router
from app.build_requests.routes import router as build_requests_router, app_router as build_applications_router
from app.adoption.routes import router as adoption_router, action_router as adoption_action_router
from app.public.routes import router as public_router
from app.growth.analytics_routes import (
    analytics_router,
    pipeline_router,
)
from app.growth.mentor_routes import router as mentors_router
from app.growth.retention_routes import router as retention_router
from app.trust.routes import router as trust_router
from app.deals.routes import router as offers_router, bundle_router as bundles_router
from app.teams.routes import router as teams_router
from app.institutions.routes import (
    router as institutions_router,
    verification_requests_router,
)
from app.projects.discovery_routes import router as discovery_router

settings = get_settings()

# ── Logging ───────────────────────────────────────────────────────────────────
setup_logging(settings.app_env)

# ── Sentry ────────────────────────────────────────────────────────────────────
if settings.sentry_dsn:
    sentry_sdk.init(
        dsn=settings.sentry_dsn,
        environment=settings.app_env,
        traces_sample_rate=0.2,
        profiles_sample_rate=0.1,
    )

# ── App ───────────────────────────────────────────────────────────────────────
app = FastAPI(
    title="CodeBazaar API",
    description="Where student-built software projects get discovered, revived, and incubated.",
    version="1.0.0",
    docs_url="/docs" if not settings.is_production else None,
    redoc_url="/redoc" if not settings.is_production else None,
    openapi_url="/openapi.json" if not settings.is_production else None,
)

# ── Middleware ────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

if settings.is_production:
    app.add_middleware(
        TrustedHostMiddleware, allowed_hosts=settings.effective_allowed_hosts
    )
    if settings.host_config_looks_unset:
        # Loud, because the symptom otherwise is every request returning a bare
        # 400 with no explanation — including the health check, which takes the
        # service out of load-balancer rotation.
        logger = get_logger("startup")
        logger.warning(
            "production_allowed_hosts_are_defaults",
            extra={
                "allowed_hosts": settings.effective_allowed_hosts,
                "hint": (
                    "APP_ENV=production with the shipped placeholder ALLOWED_HOSTS. "
                    "Requests to any other host will be rejected with 400. Set "
                    "ALLOWED_HOSTS to your real domain, or use APP_ENV=development "
                    "for local work."
                ),
            },
        )

app.add_middleware(RateLimitMiddleware)

# ── Exception handlers ────────────────────────────────────────────────────────
app.add_exception_handler(AppError, app_error_handler)
app.add_exception_handler(RequestValidationError, validation_error_handler)
app.add_exception_handler(StarletteHTTPException, http_error_handler)
app.add_exception_handler(Exception, unhandled_error_handler)

# ── Routers ───────────────────────────────────────────────────────────────────
app.include_router(auth_router)
app.include_router(users_router)
app.include_router(projects_router)
app.include_router(github_router)
app.include_router(payments_router)
app.include_router(admin_router)
app.include_router(notifications_router)
app.include_router(reviews_router)
app.include_router(skills_router)
app.include_router(messaging_router)
app.include_router(verification_router)
app.include_router(escrow_router)
app.include_router(delivery_router)
app.include_router(hackathon_router)
app.include_router(growth_router)
app.include_router(incubation_router)
app.include_router(subscriptions_router)
app.include_router(moderation_router)
app.include_router(build_requests_router)
app.include_router(build_applications_router)
app.include_router(adoption_router)
app.include_router(adoption_action_router)
app.include_router(public_router)
app.include_router(analytics_router)
app.include_router(pipeline_router)
app.include_router(mentors_router)
app.include_router(retention_router)
app.include_router(trust_router)
app.include_router(offers_router)
app.include_router(bundles_router)
app.include_router(teams_router)
app.include_router(institutions_router)
app.include_router(verification_requests_router)
app.include_router(discovery_router)


# ── Health check ──────────────────────────────────────────────────────────────
@app.get("/health", tags=["health"])
def health_check():
    return {"status": "ok", "version": "1.0.0"}


@app.get("/", tags=["health"])
def root():
    return {"message": "CodeBazaar API", "docs": "/docs"}
