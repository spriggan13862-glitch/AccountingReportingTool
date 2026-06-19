"""
JWT creation/validation and password hashing utilities.

All cryptographic operations are centralized here so routers and services
never touch raw secrets directly.
"""

from __future__ import annotations

import datetime
from typing import Any

import bcrypt
from jose import JWTError, jwt

from app.core.config import settings


# ---------------------------------------------------------------------------
# Password hashing (bcrypt directly — passlib incompatible with bcrypt 4+)
# ---------------------------------------------------------------------------

def hash_password(plain: str) -> str:
    """Return the bcrypt hash of a plain-text password."""
    return bcrypt.hashpw(plain.encode(), bcrypt.gensalt()).decode()


def verify_password(plain: str, hashed: str) -> bool:
    """Return True if plain matches the stored hash."""
    try:
        return bcrypt.checkpw(plain.encode(), hashed.encode())
    except Exception:
        return False


# ---------------------------------------------------------------------------
# JWT
# ---------------------------------------------------------------------------

def create_access_token(
    payload: dict[str, Any],
    expires_delta: datetime.timedelta | None = None,
) -> str:
    """
    Encode a JWT access token.

    The caller supplies an arbitrary payload; this function merges in `exp`
    (and ensures `iat` is set) before signing.
    """
    expire = datetime.datetime.now(datetime.UTC) + (
        expires_delta
        or datetime.timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    data = {**payload, "exp": expire, "iat": datetime.datetime.now(datetime.UTC)}
    return jwt.encode(data, settings.SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def create_refresh_token(
    payload: dict[str, Any],
    expires_delta: datetime.timedelta | None = None,
) -> str:
    """
    Create a refresh token JWT. By convention refresh tokens live longer and
    include a stable 'jti' claim for rotation and revocation tracking.
    """
    expire = datetime.datetime.now(datetime.UTC) + (
        expires_delta
        or datetime.timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    )
    data = {**payload, "exp": expire, "iat": datetime.datetime.now(datetime.UTC)}
    return jwt.encode(data, settings.SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def decode_refresh_token(token: str) -> dict[str, Any]:
    """Decode and validate a refresh token JWT."""
    return jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])


def decode_access_token(token: str) -> dict[str, Any]:
    """
    Decode and validate a JWT.

    Raises jose.JWTError on invalid signature, expiration, or malformed token.
    The caller is responsible for catching JWTError and converting to HTTP 401.
    """
    return jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])


def token_payload_for_user(user: Any) -> dict[str, Any]:
    """
    Build the standard JWT payload for a User ORM instance.

    Fields:
      sub       — email address (standard JWT subject claim)
      user_id   — integer primary key
      org_id    — organization the token is scoped to
      is_su     — superuser flag (shortcuts permission checks)
    """
    return {
        "sub": user.email,
        "user_id": user.id,
        "org_id": user.organization_id,
        "is_su": user.is_superuser,
    }
