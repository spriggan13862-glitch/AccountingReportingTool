"""
Seed system taxonomies from data/taxonomies/*.json into the configured database.

Usage
-----
  # Seed the database pointed to by .env DATABASE_URL (local dev SQLite by default):
  python scripts/seed_taxonomies.py

  # Seed a specific database (staging / production):
  DATABASE_URL=postgresql+psycopg://user:pass@host:5432/dbname \
    ENVIRONMENT=production \
    python scripts/seed_taxonomies.py --confirm-environment production

The --confirm-environment guard prevents accidental writes against staging or
production databases. The seeder is idempotent — existing system taxonomies
(matched by code with is_system=True) are not duplicated, but new nodes added
to an existing taxonomy require force-reseed (see force_reseed_system_taxonomy
in app.services.taxonomy_library_service).
"""
import argparse
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.database import SessionLocal, DATABASE_URL
from app.services.taxonomy_library_service import seed_system_taxonomies


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--confirm-environment",
        default=None,
        help="Required when ENVIRONMENT is staging or production. Pass the env name to confirm.",
    )
    args = parser.parse_args()

    env = os.environ.get("ENVIRONMENT", "development").lower()
    if env in {"staging", "production"} and args.confirm_environment != env:
        print(
            f"ERROR: ENVIRONMENT={env}. Refusing to seed without --confirm-environment {env}.",
            file=sys.stderr,
        )
        print(f"DATABASE_URL={DATABASE_URL}", file=sys.stderr)
        return 1

    print(f"Environment: {env}")
    print(f"Database:    {_redact(DATABASE_URL)}")
    print()

    db = SessionLocal()
    try:
        results = seed_system_taxonomies(db)
        for code, node_count in sorted(results.items()):
            print(f"  {code:25s} {node_count:5d} nodes")
        total = sum(results.values())
        print(f"\nSeeded/verified {len(results)} system taxonomies ({total} nodes total).")
    finally:
        db.close()
    return 0


def _redact(url: str) -> str:
    """Hide password in connection URLs when printing."""
    if "@" in url and "://" in url:
        scheme, rest = url.split("://", 1)
        if "@" in rest:
            creds, host = rest.split("@", 1)
            if ":" in creds:
                user = creds.split(":", 1)[0]
                return f"{scheme}://{user}:***@{host}"
    return url


if __name__ == "__main__":
    sys.exit(main())
