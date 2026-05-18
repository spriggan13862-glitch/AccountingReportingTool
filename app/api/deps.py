"""FastAPI dependencies shared across all routers."""

from __future__ import annotations

from typing import Generator

from fastapi import Depends, Header, HTTPException
from sqlalchemy.orm import Session

from app.database import SessionLocal


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
    x_user_id: int | None = Header(default=None, alias="X-User-Id"),
    db: Session = Depends(get_db),
):
    """
    Resolve the acting user from the X-User-Id request header.

    Returns None when the header is absent (unauthenticated / service-to-service).
    Raises 401 when the header is present but the user does not exist.
    """
    if x_user_id is None:
        return None
    from app.models.user import User
    user = db.get(User, x_user_id)
    if user is None:
        raise HTTPException(status_code=401, detail=f"User id={x_user_id} not found")
    return user
