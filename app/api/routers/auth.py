"""
Authentication router.

Endpoints
---------
POST /auth/login          — issue a JWT for valid credentials
GET  /auth/me             — return the current authenticated user
POST /auth/logout         — client-side token discard (stateless placeholder)
POST /auth/refresh        — refresh placeholder (future milestone)
POST /auth/password-reset — reset initiation placeholder
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session

from app.api.deps import get_db, get_required_user
from app.api.schemas import UserOut
from app.core.logging_config import get_logger
from app.services.auth_service import (
    AccountLockedError,
    AuthenticationError,
    InactiveOrganizationError,
    InactiveUserError,
    authenticate_user,
    create_token_for_user,
    initiate_password_reset,
)

router = APIRouter(prefix="/auth", tags=["auth"])
logger = get_logger(__name__)


# ---------------------------------------------------------------------------
# Request / response schemas (auth-specific, not shared globally)
# ---------------------------------------------------------------------------

class LoginRequest(BaseModel):
    email: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str
    expires_in: int          # seconds
    refresh_token: str | None = None
    refresh_expires_in: int | None = None


class PasswordResetRequest(BaseModel):
    email: str


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post("/login", response_model=TokenResponse)
def login(body: LoginRequest, db: Session = Depends(get_db)):
    """
    Authenticate with email + password and receive a JWT access token.

    Returns HTTP 401 on bad credentials and HTTP 423 when the account is locked.
    """
    try:
        user = authenticate_user(db, body.email, body.password)
    except AccountLockedError as exc:
        raise HTTPException(status_code=423, detail=str(exc))
    except (InactiveUserError, InactiveOrganizationError) as exc:
        raise HTTPException(status_code=403, detail=str(exc))
    except AuthenticationError as exc:
        # Generic message — do not reveal whether the email exists
        raise HTTPException(status_code=401, detail=str(exc))

    token_data = create_token_for_user(user, db=db)
    return TokenResponse(**token_data)


@router.get("/me", response_model=UserOut)
def get_me(current_user=Depends(get_required_user)):
    """Return the profile of the currently authenticated user."""
    return current_user


@router.post("/logout", status_code=200)
class RefreshRequest(BaseModel):
    refresh_token: str


def logout(current_user=Depends(get_required_user)):
    """
    Stateless logout placeholder.

    JWTs are not server-side revocable in this implementation. The client
    must discard the token. A future milestone will introduce a token
    blocklist (Redis-backed) for hard revocation.
    """
    logger.info("logout user_id=%d email=%s", current_user.id, current_user.email)
    return {"detail": "Logged out. Discard your token on the client side."}


@router.post("/logout-refresh", status_code=200)
def logout_refresh(body: RefreshRequest, db: Session = Depends(get_db)):
    """Revoke a refresh token so it can no longer be used to obtain new access tokens."""
    from app.services.auth_service import revoke_refresh_token_by_jti
    from app.core.security import decode_refresh_token
    try:
        payload = decode_refresh_token(body.refresh_token)
    except Exception:
        raise HTTPException(status_code=400, detail="Refresh token malformed or expired")
    jti = payload.get("jti")
    if not jti:
        raise HTTPException(status_code=400, detail="Refresh token missing jti")
    revoke_refresh_token_by_jti(db, jti)
    return {"detail": "Refresh token revoked"}


@router.post("/refresh", status_code=200)
@router.post("/refresh", response_model=TokenResponse)
def refresh_token(body: RefreshRequest, db: Session = Depends(get_db)):
    """Exchange a refresh token for a new access token (and rotated refresh token)."""
    from app.services.auth_service import refresh_access_token
    try:
        token_data = refresh_access_token(db, body.refresh_token)
    except Exception as exc:
        raise HTTPException(status_code=401, detail=str(exc))
    return TokenResponse(**token_data)


@router.post("/password-reset", status_code=202)
def request_password_reset(body: PasswordResetRequest, db: Session = Depends(get_db)):
    """
    Initiate a password-reset flow.

    Always returns 202 Accepted regardless of whether the email exists to
    prevent user enumeration. Email delivery is a future-milestone concern.
    """
    initiate_password_reset(db, body.email)
    return {"detail": "If that email exists, a reset link has been sent."}
