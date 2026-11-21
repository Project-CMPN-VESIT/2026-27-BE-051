from fastapi import Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException


class AppError(Exception):
    def __init__(self, message: str, status_code: int = 400, code: str = "error"):
        self.message = message
        self.status_code = status_code
        self.code = code
        super().__init__(message)


class NotFoundError(AppError):
    def __init__(self, resource: str = "Resource"):
        super().__init__(f"{resource} not found", 404, "not_found")


class UnauthorizedError(AppError):
    def __init__(self, message: str = "Authentication required"):
        super().__init__(message, 401, "unauthorized")


class ForbiddenError(AppError):
    def __init__(self, message: str = "Insufficient permissions"):
        super().__init__(message, 403, "forbidden")


class ConflictError(AppError):
    def __init__(self, message: str = "Resource already exists"):
        super().__init__(message, 409, "conflict")


class ValidationError(AppError):
    def __init__(self, message: str):
        super().__init__(message, 422, "validation_error")


class PaymentError(AppError):
    def __init__(self, message: str):
        super().__init__(message, 402, "payment_error")


async def app_error_handler(request: Request, exc: AppError) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": exc.code, "message": exc.message},
    )


# ── Request validation (Pydantic) ─────────────────────────────────────────────
# FastAPI's default handler returns {"detail": [...]} which clients cannot render.
# We normalise it to the same {"error", "message"} envelope as AppError, plus a
# per-field map so forms can show errors inline.

_FIELD_LABELS: dict[str, str] = {
    "email": "Email address",
    "password": "Password",
    "new_password": "New password",
    "current_password": "Current password",
    "display_name": "Display name",
    "referral_code": "Referral code",
    "totp_code": "2FA code",
    "code": "Code",
    "title": "Title",
    "description": "Description",
    "price_paise": "Price",
    "price_label": "Price label",
    "sale_type": "Sale type",
    "delivery_url": "Delivery URL",
    "delivery_instructions": "Delivery instructions",
    "sale_license": "Licence terms",
    "repo_full_name": "Repository",
    "github_repo_id": "Repository",
    "message": "Message",
    "skills_offered": "Skills",
    "amount_paise": "Amount",
    "reference": "Reference",
    "upi_id": "UPI ID",
    "ifsc": "IFSC code",
    "pan": "PAN",
    "account_number": "Account number",
    "progress_percent": "Progress",
}

# Fields where the raw value must never be echoed back in an error message.
_SENSITIVE = {"password", "new_password", "current_password", "token", "secret"}


def _field_path(loc: tuple) -> str:
    parts = [str(p) for p in loc if p not in ("body", "query", "path", "header", "cookie")]
    return ".".join(parts) or "request"


def _label_for(field: str) -> str:
    leaf = field.split(".")[-1]
    if leaf in _FIELD_LABELS:
        return _FIELD_LABELS[leaf]
    return leaf.replace("_", " ").capitalize()


def _humanize(field: str, err: dict) -> str:
    """Turn one Pydantic error into a sentence a user can act on."""
    label = _label_for(field)
    err_type = err.get("type", "")
    ctx = err.get("ctx") or {}

    if err_type == "missing":
        return f"{label} is required"
    if err_type in ("string_too_short", "too_short"):
        n = ctx.get("min_length", ctx.get("actual_length"))
        if err_type == "too_short":
            return f"{label} needs at least {ctx.get('min_length', 1)} item(s)"
        return f"{label} must be at least {n} characters"
    if err_type in ("string_too_long", "too_long"):
        n = ctx.get("max_length")
        return f"{label} must be {n} characters or fewer"
    if err_type in ("greater_than_equal", "greater_than"):
        return f"{label} must be at least {ctx.get('ge', ctx.get('gt'))}"
    if err_type in ("less_than_equal", "less_than"):
        return f"{label} must not exceed {ctx.get('le', ctx.get('lt'))}"
    if err_type == "string_pattern_mismatch":
        return f"{label} is not in a valid format"
    if err_type in ("value_error", "assertion_error"):
        raw = str(ctx.get("error") or err.get("msg", "")).replace("Value error, ", "")
        # email-validator raises value_error with library-flavoured wording;
        # replace it with something a user can act on.
        if field.split(".")[-1].endswith("email") or "email address" in raw.lower():
            return "Enter a valid email address"
        # Other custom validators already write user-facing messages.
        return raw or f"{label} is invalid"
    if err_type.endswith("_type") or err_type in ("int_parsing", "float_parsing", "uuid_parsing"):
        return f"{label} is not a valid value"
    if err_type == "enum":
        expected = ctx.get("expected", "")
        return f"{label} must be one of: {expected}" if expected else f"{label} is invalid"
    if "email" in err_type:
        return "Enter a valid email address"

    msg = err.get("msg", "is invalid")
    return f"{label}: {msg}"


async def validation_error_handler(
    request: Request, exc: RequestValidationError
) -> JSONResponse:
    fields: dict[str, str] = {}
    for err in exc.errors():
        field = _field_path(tuple(err.get("loc", ())))
        if field.split(".")[-1] in _SENSITIVE:
            err = {**err, "input": None}  # never echo the value back
        fields.setdefault(field, _humanize(field, err))

    if not fields:
        message = "The submitted data is invalid"
    else:
        first = next(iter(fields.values()))
        extra = len(fields) - 1
        message = first if not extra else f"{first} (and {extra} other issue{'s' if extra > 1 else ''})"

    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={"error": "validation_error", "message": message, "fields": fields},
    )


async def http_error_handler(
    request: Request, exc: StarletteHTTPException
) -> JSONResponse:
    """Normalise framework-raised HTTP errors (404, 405, and anything a
    dependency raises directly) into the same envelope as AppError, so clients
    only ever parse one shape."""
    codes = {
        400: "bad_request",
        401: "unauthorized",
        403: "forbidden",
        404: "not_found",
        405: "method_not_allowed",
        409: "conflict",
        413: "payload_too_large",
        415: "unsupported_media_type",
        429: "rate_limited",
    }
    detail = exc.detail if isinstance(exc.detail, str) else None
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": codes.get(exc.status_code, "http_error"),
            "message": detail or "Request could not be completed",
        },
        headers=getattr(exc, "headers", None),
    )


async def unhandled_error_handler(request: Request, exc: Exception) -> JSONResponse:
    # Log via Sentry / structured logger
    import logging
    logging.getLogger("codebazaar").exception("Unhandled error: %s", exc)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"error": "internal_error", "message": "An unexpected error occurred"},
    )
