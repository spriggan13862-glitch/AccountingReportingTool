"""
Seed the Common Reporting Line catalog + reporting templates.

Usage:
  python scripts/seed_common_reporting_lines.py

Idempotent: existing system rows (organization_id IS NULL) are matched
by `code` and updated. Missing rows are created. Template ↔ CRL
junctions are recreated to reflect the latest catalog without leaving
stale entries.

Honors the same ENVIRONMENT guard as seed_taxonomies.py — refuses to
run against staging/production without --confirm-environment.
"""
import argparse
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.database import SessionLocal, DATABASE_URL
from app.services.crl_service import seed_crl_catalog


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--confirm-environment", default=None,
        help="Required when ENVIRONMENT is staging or production.",
    )
    args = parser.parse_args()

    env = os.environ.get("ENVIRONMENT", "development").lower()
    if env in {"staging", "production"} and args.confirm_environment != env:
        print(
            f"ERROR: ENVIRONMENT={env}. Refusing to seed without "
            f"--confirm-environment {env}.",
            file=sys.stderr,
        )
        return 1

    print(f"Environment: {env}")
    print(f"Database:    {_redact(DATABASE_URL)}")
    print()

    db = SessionLocal()
    try:
        stats = seed_crl_catalog(db)
        for k, v in stats.items():
            print(f"  {k:20s} {v:5d}")
    finally:
        db.close()
    return 0


def _redact(url: str) -> str:
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
