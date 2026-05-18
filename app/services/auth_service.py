"""
Authentication service.

Responsibilities
----------------
- Validate credentials and issue JWT access tokens
- Track failed login attempts and account lockout
- Provide helpers for password change (placeholder) and reset (placeholder)
"""

from __future__ import annotations

import datetime
from typing import TYPE_CHECKING

from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.logging_config import get_logger
from app.core.security import (
    create_access_token,
    hash_password,
    token_payload_for_user,
    verify_password,
)

if TYPE_CHECKING:
    from app.models.user import User

logger = get_logger(__name__)


# ---------------------------------------------------------------------------
# Exceptions
# ---------------------------------------------------------------------------

class AuthenticationError(ValueError):
    """Raised when credentials are invalid or the account cannot authenticate."""


class AccountLockedError(AuthenticationError):
    """Raised when the account is temporarily locked due to failed attempts."""


class InactiveUserError(AuthenticationError):
    """Raised when the user account has been deactivated."""


class InactiveOrganizationError(AuthenticationError):
    """Raised when the user's organization has been disabled."""


# ---------------------------------------------------------------------------
# Login
# ---------------------------------------------------------------------------

def authenticate_user(db: Session, email: str, password: str) -> "User":
    """
    Verify email + password and return the User on success.

    Side effects:
    - Increments failed_login_attempts on bad password.
    - Resets failed_login_attempts on success and records last_login_at.
    - Raises AccountLockedError if the account is locked.
    - Raises AuthenticationError on bad credentials (generic message to callers).
    - Raises InactiveUserError / InactiveOrganizationError as appropriate.
    """
    from app.models.user import User
    from app.models.organization import Organization

    # Always load user by email; avoid timing differences from early return
    user: User | None = (
        db.query(User).filter(User.email == email.lower().strip()).first()
    )

    if user is None:
        logger.warning("login_failed reason=user_not_found email=%s", email)
        raise AuthenticationError("Invalid credentials")

    # Check lockout before verifying password
    _check_lockout(user)

    if not verify_password(password, user.hashed_password or ""):
        _record_failed_attempt(db, user)
        logger.warning(
            "login_failed reason=bad_password email=%s attempts=%d",
            email, user.failed_login_attempts,
        )
        raise AuthenticationError("Invalid credentials")

    if not user.is_active:
        logger.warning("login_failed reason=inactive_user email=%s", email)
        raise InactiveUserError("Account is disabled. Contact your administrator.")

    org: Organization | None = db.get(Organization, user.organization_id)
    if org is not None and not org.is_active:
        logger.warning("login_failed reason=inactive_org email=%s org=%d", email, org.id)
        raise InactiveOrganizationError(
            "Your organization account is disabled. Contact support."
        )

    # Success — reset failure counter
    user.failed_login_attempts = 0
    user.locked_at = None
    user.last_login_at = datetime.datetime.now(datetime.UTC)
    db.flush()

    logger.info("login_success email=%s user_id=%d org_id=%d", email, user.id, user.organization_id)
    return user


def create_token_for_user(user: "User") -> dict:
    """
    Build and sign a JWT for an authenticated user.

    Returns a dict suitable for the /login response body.
    """
    payload = token_payload_for_user(user)
    token = create_access_token(payload)
    return {
        "access_token": token,
        "token_type": "bearer",
        "expires_in": settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    }


# ---------------------------------------------------------------------------
# Password management (placeholders — full implementation in future milestone)
# ---------------------------------------------------------------------------

def set_password(db: Session, user: "User", new_password: str) -> None:
    """Hash and store a new password for the given user."""
    _validate_password_strength(new_password)
    user.hashed_password = hash_password(new_password)
    db.flush()
    logger.info("password_changed user_id=%d", user.id)


def initiate_password_reset(db: Session, email: str) -> None:
    """
    Placeholder: initiates the password-reset flow.

    In production this sends a signed reset link via email.
    Currently a no-op that logs the request.
    """
    logger.info("password_reset_requested email=%s", email)


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _check_lockout(user: "User") -> None:
    if user.locked_at is None:
        return
    lockout_until = user.locked_at + datetime.timedelta(
        minutes=settings.ACCOUNT_LOCKOUT_MINUTES
    )
    # locked_at is stored as naive UTC; compare with naive UTC now
    now_utc = datetime.datetime.now(datetime.UTC).replace(tzinfo=None)
    if now_utc < lockout_until.replace(tzinfo=None) if lockout_until.tzinfo else lockout_until:
        remaining = int((lockout_until.replace(tzinfo=None) - now_utc).total_seconds() / 60) + 1
        raise AccountLockedError(
            f"Account locked due to too many failed attempts. "
            f"Try again in {remaining} minute(s)."
        )
    # Lockout has expired — clear it
    user.locked_at = None
    user.failed_login_attempts = 0


def _record_failed_attempt(db: Session, user: "User") -> None:
    user.failed_login_attempts = (user.failed_login_attempts or 0) + 1
    if user.failed_login_attempts >= settings.MAX_LOGIN_ATTEMPTS:
        user.locked_at = datetime.datetime.now(datetime.UTC).replace(tzinfo=None)
        logger.warning(
            "account_locked user_id=%d email=%s after %d attempts",
            user.id, user.email, user.failed_login_attempts,
        )
    db.flush()


def _validate_password_strength(password: str) -> None:
    if len(password) < 8:
        raise ValueError("Password must be at least 8 characters")
