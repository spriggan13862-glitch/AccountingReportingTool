"""FastAPI dependencies shared across all routers."""

from __future__ import annotations

from typing import Generator

from fastapi import Depends, Header, HTTPException, Security
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError
from sqlalchemy.orm import Session

from app.core.security import decode_access_token
from app.database import SessionLocal

_bearer = HTTPBearer(auto_error=False)


def get_db() -> Generator[Session, None, None]:
    """
    Yield a SQLAlchemy session, commit on clean exit, rollback on exception.
    Used as a FastAPI dependency via Depends(get_db).
    """
    db = SessionLocal()
    try:
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def get_storage():
    """Return the default storage backend. Override in tests via app.dependency_overrides."""
    from app.services.storage_service import default_storage
    return default_storage


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Security(_bearer),
    db: Session = Depends(get_db),
):
    """
    Resolve the acting user from the JWT Bearer token in the Authorization header.

    Returns None when no Authorization header is present (unauthenticated).
    Raises HTTP 401 when a token is present but invalid or the user no longer exists.

    The X-User-Id trust model has been removed. Identity is derived exclusively
    from the signed JWT — the client cannot supply or spoof a user identity.
    """
    if credentials is None:
        return None

    try:
        payload = decode_access_token(credentials.credentials)
    except JWTError:
        raise HTTPException(status_code=401, detail="Token is invalid or expired")

    user_id: int | None = payload.get("user_id")
    if user_id is None:
        raise HTTPException(status_code=401, detail="Malformed token: missing user_id")

    from app.models.user import User
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=401, detail="User not found")
    if not user.is_active:
        raise HTTPException(status_code=401, detail="Account is disabled")

    # Verify the token's org claim still matches the user's organization.
    # This catches tokens issued before an org transfer (rare but important).
    token_org: int | None = payload.get("org_id")
    if token_org is not None and token_org != user.organization_id:
        raise HTTPException(status_code=401, detail="Token organization mismatch")

    return user


def get_required_user(
    user=Depends(get_current_user),
):
    """
    Like get_current_user but raises HTTP 401 when no valid token is present.

    Apply to any endpoint that must not be called anonymously.
    """
    if user is None:
        raise HTTPException(
            status_code=401,
            detail="Authentication required. Provide a valid Bearer token.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user
