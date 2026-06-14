#!/usr/bin/env python
"""
E2E test database seeder.

Creates a minimal, isolated dataset in accounting_e2e.db for Playwright
workflow tests. Safe to run repeatedly — deletes and recreates the DB each time.

Usage:
    python scripts/seed_e2e.py
"""
from __future__ import annotations

import datetime
import os
import sys
from pathlib import Path

# ---------------------------------------------------------------------------
# Resolve absolute path for the E2E database BEFORE any app imports.
# Using .resolve() guarantees an absolute path even if __file__ is relative.
# ---------------------------------------------------------------------------
ROOT = Path(__file__).resolve().parent.parent
E2E_DB = ROOT / "accounting_e2e.db"

# Guard: refuse to run if DATABASE_URL already points at the main accounting.db
existing_url = os.environ.get("DATABASE_URL", "")
if existing_url and "accounting_e2e" not in existing_url:
    print(
        f"[seed_e2e] ABORT: DATABASE_URL is set to '{existing_url}' which does not "
        "contain 'accounting_e2e'. Refusing to overwrite a non-E2E database.",
        file=sys.stderr,
    )
    sys.exit(1)

# Override DATABASE_URL to the absolute E2E DB path.
# Must be set before importing any app.* modules so pydantic Settings picks it up.
E2E_DB_URL = f"sqlite:///{E2E_DB.as_posix()}"
os.environ["DATABASE_URL"] = E2E_DB_URL
os.environ["ENVIRONMENT"] = "development"

print(f"[seed_e2e] DATABASE_URL = {E2E_DB_URL}")
print(f"[seed_e2e] DB file      = {E2E_DB}")

sys.path.insert(0, str(ROOT))


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def delete_db() -> None:
    if E2E_DB.exists():
        E2E_DB.unlink()
        print(f"[seed_e2e] Deleted existing {E2E_DB.name}")
    else:
        print(f"[seed_e2e] No existing DB to delete.")


def run_migrations() -> None:
    # Use a dedicated engine so we don't inherit any pooled connections from the
    # app's global engine (which may point at a now-deleted file).
    import sqlalchemy as _sa
    from app.database import Base
    fresh_engine = _sa.create_engine(E2E_DB_URL, connect_args={"check_same_thread": False})
    import app.models  # ensure all ORM classes are registered with Base
    Base.metadata.create_all(fresh_engine)
    fresh_engine.dispose()

    from alembic.config import Config
    from alembic import command
    cfg = Config(str(ROOT / "alembic.ini"))
    cfg.set_main_option("sqlalchemy.url", E2E_DB_URL)
    cfg.set_main_option("script_location", str(ROOT / "alembic"))
    command.stamp(cfg, "head")
    print("[seed_e2e] Schema created and stamped at head.")


def verify_db_url() -> None:
    """Confirm the app engine is actually connected to the E2E DB."""
    from app.database import DATABASE_URL as actual_url
    print(f"[seed_e2e] app.database.DATABASE_URL = {actual_url}")
    if "accounting_e2e" not in actual_url:
        print(
            f"[seed_e2e] ABORT: app.database is using '{actual_url}' instead of "
            "the E2E database. Check app/database.py reads from settings.",
            file=sys.stderr,
        )
        sys.exit(1)


def seed() -> None:
    from app.database import SessionLocal
    from app.models.entity import Entity
    from app.models.scenario import Scenario
    from app.services.organization_service import create_organization, seed_default_roles
    from app.services.user_service import create_user, assign_role
    from app.services.accounting_period_service import create_period
    from app.services.reporting_taxonomy_service import seed_taxonomy, seed_views
    # Use bcrypt directly to avoid importing jose/cryptography (broken native ext in this env)
    import bcrypt as _bcrypt

    db = SessionLocal()
    try:
        # Org
        org = create_organization(db, name="Live Marketing LLC", slug="live-marketing")
        seed_default_roles(db)
        print(f"[seed_e2e] Org: {org.name} (id={org.id})")

        # Admin user
        pw = _bcrypt.hashpw("Test1234!".encode(), _bcrypt.gensalt()).decode()
        admin = create_user(
            db,
            organization_id=org.id,
            email="admin@livemarketing.test",
            full_name="E2E Admin",
            hashed_password=pw,
            is_superuser=True,
        )
        assign_role(db, user_id=admin.id, role_name="admin", organization_id=org.id)
        print(f"[seed_e2e] Admin user: {admin.email}")

        # Entity
        entity = Entity(
            code="LM",
            name="Live Marketing LLC",
            entity_type="operating",
            organization_id=org.id,
            currency="USD",
        )
        db.add(entity)
        db.flush()
        print(f"[seed_e2e] Entity: {entity.name} ({entity.code})")

        # Scenario
        scenario = Scenario(
            organization_id=org.id,
            code="ACTUAL-LM",
            name="Actual",
            scenario_type="actual",
            description="Actual results for Live Marketing LLC",
        )
        db.add(scenario)
        db.flush()
        print(f"[seed_e2e] Scenario: {scenario.name}")

        # Accounting period
        period = create_period(
            db,
            entity_id=entity.id,
            period_name="December 2024",
            start_date=datetime.date(2024, 12, 1),
            end_date=datetime.date(2024, 12, 31),
            fiscal_year=2024,
            fiscal_period=12,
        )
        print(f"[seed_e2e] Period: {period.period_name}")

        # Reporting taxonomy and views
        seed_taxonomy(db)
        seed_views(db)
        print("[seed_e2e] Taxonomy and views seeded.")

        db.commit()
        print("[seed_e2e] Seed complete.")
        print(f"[seed_e2e]   Credentials: admin@livemarketing.test / Test1234!")
        print(f"[seed_e2e]   DB: {E2E_DB}")

    except Exception as exc:
        db.rollback()
        print(f"[seed_e2e] ERROR: {exc}", file=sys.stderr)
        raise
    finally:
        db.close()


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    delete_db()
    run_migrations()
    verify_db_url()
    seed()
