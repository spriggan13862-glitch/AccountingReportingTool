#!/usr/bin/env python
"""
Local database reset script.

Drops and recreates all tables, then runs the demo seeder.
NEVER run against production — this is destructive.

Usage:
    python scripts/reset_local.py          # interactive confirmation
    python scripts/reset_local.py --yes    # skip confirmation (for scripting)
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from app.core.config import settings
from app.core.logging_config import configure_logging, get_logger

configure_logging(level="INFO")
logger = get_logger("reset_local")


def main(skip_confirm: bool = False) -> None:
    if settings.ENVIRONMENT == "production":
        logger.error("reset_local.py must NEVER run against production. Aborting.")
        sys.exit(1)

    if not skip_confirm:
        print()
        print("WARNING: This will DELETE ALL DATA in the local database and re-seed demo data.")
        print(f"  Database: {settings.DATABASE_URL}")
        confirm = input("Type 'reset' to confirm: ").strip()
        if confirm != "reset":
            print("Aborted.")
            sys.exit(0)

    from app.database import Base, engine

    logger.info("Dropping all tables…")
    Base.metadata.drop_all(bind=engine)
    logger.info("Recreating all tables…")
    Base.metadata.create_all(bind=engine)

    logger.info("Running demo seeder…")
    from app.database import SessionLocal
    from scripts.seed_demo import seed_demo_data

    db = SessionLocal()
    try:
        seed_demo_data(db, verbose=True)
    except Exception as exc:
        db.rollback()
        logger.error("Seeder failed: %s", exc)
        sys.exit(1)
    finally:
        db.close()

    logger.info("Local database reset and seeded successfully.")


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Reset local database and seed demo data")
    parser.add_argument("--yes", action="store_true", help="Skip confirmation prompt")
    args = parser.parse_args()

    main(skip_confirm=args.yes)
