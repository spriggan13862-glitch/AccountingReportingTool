#!/usr/bin/env python
"""
First-admin setup CLI.

Creates the initial organization and admin user when the database is empty.
Run this once after `alembic upgrade head` on a fresh installation.

Usage:
    python scripts/setup_admin.py
    python scripts/setup_admin.py --org "My Company" --email admin@myco.com
"""

from __future__ import annotations

import getpass
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from app.core.config import settings
from app.core.logging_config import configure_logging, get_logger
from app.core.security import hash_password

configure_logging(level="INFO")
logger = get_logger("setup_admin")


def run_setup(org_name: str, admin_email: str, admin_password: str,
              admin_full_name: str = "Administrator") -> None:
    from app.database import SessionLocal
    from app.models.user import User
    from app.services.organization_service import create_organization, seed_default_roles
    from app.services.user_service import create_user, assign_role

    db = SessionLocal()
    try:
        # Prevent duplicate first-admin setup
        existing_users = db.query(User).count()
        if existing_users > 0:
            logger.error(
                "Setup already completed — %d user(s) exist. "
                "Use the admin panel to create additional users.",
                existing_users,
            )
            sys.exit(1)

        logger.info("Creating organization: %s", org_name)
        slug = org_name.lower().replace(" ", "-").replace(".", "")[:30]
        org = create_organization(db, name=org_name, slug=slug)

        logger.info("Seeding default roles…")
        seed_default_roles(db)

        logger.info("Creating admin user: %s", admin_email)
        admin = create_user(
            db,
            organization_id=org.id,
            email=admin_email.lower().strip(),
            full_name=admin_full_name,
            hashed_password=hash_password(admin_password),
            is_superuser=True,
        )
        assign_role(db, user_id=admin.id, role_name="admin", organization_id=org.id)

        db.commit()

        logger.info("=== First-admin setup complete ===")
        logger.info("  Organization : %s (id=%d)", org.name, org.id)
        logger.info("  Admin email  : %s", admin.email)
        logger.info("  Admin id     : %d", admin.id)
        logger.info("")
        logger.info("You can now log in at http://localhost:5173")

    except Exception as exc:
        db.rollback()
        logger.error("Setup failed: %s", exc)
        sys.exit(1)
    finally:
        db.close()


if __name__ == "__main__":
    import argparse

    if settings.ENVIRONMENT == "production":
        print("WARNING: Running setup against production environment.")
        confirm = input("Continue? (yes/no): ")
        if confirm.strip().lower() != "yes":
            sys.exit(0)

    parser = argparse.ArgumentParser(description="Create the first admin user")
    parser.add_argument("--org",       default=None, help="Organization name")
    parser.add_argument("--email",     default=None, help="Admin email address")
    parser.add_argument("--name",      default="Administrator", help="Admin full name")
    parser.add_argument("--password",  default=None, help="Admin password (prompt if omitted)")
    args = parser.parse_args()

    org_name = args.org or input("Organization name: ").strip()
    if not org_name:
        print("ERROR: Organization name is required.")
        sys.exit(1)

    admin_email = args.email or input("Admin email: ").strip()
    if not admin_email:
        print("ERROR: Admin email is required.")
        sys.exit(1)

    if args.password:
        password = args.password
    else:
        password = getpass.getpass("Admin password: ")
        confirm  = getpass.getpass("Confirm password: ")
        if password != confirm:
            print("ERROR: Passwords do not match.")
            sys.exit(1)
        if len(password) < 8:
            print("ERROR: Password must be at least 8 characters.")
            sys.exit(1)

    run_setup(org_name=org_name, admin_email=admin_email,
              admin_password=password, admin_full_name=args.name)
