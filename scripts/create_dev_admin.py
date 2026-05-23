#!/usr/bin/env python
"""
Dev-only script: create or reset the local admin user for visual review.

Creates admin@local.test (password: Test1234!) in accounting.db.
If the user already exists, resets the password, unlocks the account,
and ensures is_superuser=True.

Never touches accounting_e2e.db and refuses to run against production.

Usage:
    python scripts/create_dev_admin.py
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from app.core.config import settings

if settings.ENVIRONMENT == "production":
    print("ERROR: Refusing to run against production environment.")
    sys.exit(1)

if "accounting_e2e" in settings.DATABASE_URL:
    print("ERROR: DATABASE_URL points to accounting_e2e.db — aborting to protect E2E data.")
    sys.exit(1)

DEV_EMAIL = "admin@local.test"
DEV_PASSWORD = "Test1234!"
DEV_FULL_NAME = "Dev Admin"
DEV_ORG_NAME = "Local Dev"
DEV_ORG_SLUG = "local-dev"


def run() -> None:
    from app.core.security import hash_password
    from app.database import SessionLocal
    from app.models.organization import Organization
    from app.models.user import User
    from app.services.user_service import assign_role

    db = SessionLocal()
    try:
        # Ensure an organization exists (use the first one, or create dev org).
        org = db.query(Organization).filter_by(is_active=True).first()
        if org is None:
            org = Organization(name=DEV_ORG_NAME, slug=DEV_ORG_SLUG, is_active=True)
            db.add(org)
            db.flush()
            print(f"Created organization: {org.name} (id={org.id})")
        else:
            print(f"Using existing organization: {org.name} (id={org.id})")

        hashed = hash_password(DEV_PASSWORD)

        user = db.query(User).filter_by(email=DEV_EMAIL).first()
        if user is None:
            user = User(
                organization_id=org.id,
                email=DEV_EMAIL,
                full_name=DEV_FULL_NAME,
                hashed_password=hashed,
                is_active=True,
                is_superuser=True,
                failed_login_attempts=0,
                locked_at=None,
            )
            db.add(user)
            db.flush()
            print(f"Created user: {user.email} (id={user.id})")
        else:
            user.hashed_password = hashed
            user.is_active = True
            user.is_superuser = True
            user.failed_login_attempts = 0
            user.locked_at = None
            db.flush()
            print(f"Reset user: {user.email} (id={user.id})")

        assign_role(db, user_id=user.id, role_name="admin", organization_id=org.id)

        db.commit()

        print("")
        print("=== Dev admin ready ===")
        print(f"  Database : {settings.DATABASE_URL}")
        print(f"  Email    : {DEV_EMAIL}")
        print(f"  Password : {DEV_PASSWORD}")
        print(f"  URL      : http://localhost:5173")

    except Exception as exc:
        db.rollback()
        print(f"ERROR: {exc}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    run()
