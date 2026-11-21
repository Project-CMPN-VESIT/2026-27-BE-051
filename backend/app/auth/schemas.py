from pydantic import BaseModel, EmailStr, Field, field_validator

from app.core.validators import validate_non_blank, validate_password_strength
from app.users.models import UserRole


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=8, max_length=128)
    display_name: str = Field(..., min_length=1, max_length=120)
    referral_code: str | None = Field(default=None, max_length=16)
    role: UserRole | None = None  # onboarding intent; defaults to builder

    @field_validator("password")
    @classmethod
    def _strong_password(cls, v: str) -> str:
        return validate_password_strength(v)

    @field_validator("display_name")
    @classmethod
    def _clean_display_name(cls, v: str) -> str:
        return validate_non_blank(v, "Display name")

    @field_validator("referral_code")
    @classmethod
    def _clean_referral_code(cls, v: str | None) -> str | None:
        if v is None:
            return None
        cleaned = v.strip()
        return cleaned or None

    @field_validator("role")
    @classmethod
    def _no_self_admin(cls, v: "UserRole | None") -> "UserRole | None":
        if v == UserRole.ADMIN:
            raise ValueError("The admin role cannot be self-assigned")
        return v


class LoginRequest(BaseModel):
    email: EmailStr
    password: str
    totp_code: str | None = None  # Required if 2FA enabled


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int  # seconds


class RefreshRequest(BaseModel):
    # Optional: browsers send the refresh token as an httpOnly cookie instead.
    # Retained for non-browser clients.
    refresh_token: str | None = None


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str = Field(..., min_length=8, max_length=128)

    @field_validator("new_password")
    @classmethod
    def _strong_password(cls, v: str) -> str:
        return validate_password_strength(v)


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str = Field(..., min_length=8, max_length=128)

    @field_validator("new_password")
    @classmethod
    def _strong_password(cls, v: str) -> str:
        return validate_password_strength(v)


class TOTPSetupResponse(BaseModel):
    secret: str
    qr_code_url: str  # data URI of QR code image


class TOTPVerifyRequest(BaseModel):
    code: str = Field(..., min_length=6, max_length=6)


class OAuthCallbackResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    is_new_user: bool
