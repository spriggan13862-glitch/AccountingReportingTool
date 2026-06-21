"""
CRL-D: per-organization migration validation report + safe backfill CLI.

Three modes:

  --dry-run             generate the validation report; print to stdout as JSON.
                        Default mode if no --execute flag.
  --ack-hash HASH       record an acknowledgment for the given hash.
                        Required step between dry-run and execute.
  --execute             run the safe backfill executor. Refuses to run
                        without a matching acknowledgment (see --ack-hash).

Usage:

  # Step 1 — produce the report and acknowledge
  python scripts/crl_migration_report.py --org-id 1 --dry-run > report.json
  python scripts/crl_migration_report.py --org-id 1 --ack-hash <hash>

  # Step 2 — run the backfill
  python scripts/crl_migration_report.py --org-id 1 --execute

Honors ENVIRONMENT — refuses staging/production without --confirm-environment.
"""
import argparse
import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.database import SessionLocal, DATABASE_URL
from app.services.crl_migration_service import (
    generate_validation_report,
    acknowledge_report,
    execute_backfill,
    CrlMigrationError,
)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--org-id", type=int, required=True,
                        help="organization_id to scope the migration")
    parser.add_argument("--dry-run", action="store_true",
                        help="generate report only (default if no other action)")
    parser.add_argument("--ack-hash", default=None,
                        help="acknowledge a report by its hash")
    parser.add_argument("--ack-user-id", type=int, default=None,
                        help="user id recorded on the acknowledgment")
    parser.add_argument("--ack-notes", default=None,
                        help="freeform notes recorded on the acknowledgment")
    parser.add_argument("--execute", action="store_true",
                        help="run the safe backfill executor")
    parser.add_argument("--confirm-environment", default=None,
                        help="required when ENVIRONMENT is staging or production")
    args = parser.parse_args()

    env = os.environ.get("ENVIRONMENT", "development").lower()
    if env in {"staging", "production"} and args.confirm_environment != env:
        print(
            f"ERROR: ENVIRONMENT={env}. Refusing to operate without "
            f"--confirm-environment {env}.",
            file=sys.stderr,
        )
        return 1

    db = SessionLocal()
    try:
        # Mutually exclusive actions, in priority order.
        if args.ack_hash:
            ack = acknowledge_report(
                db, args.org_id, args.ack_hash,
                acked_by_user_id=args.ack_user_id,
                notes=args.ack_notes,
            )
            print(json.dumps({
                "acknowledged": True,
                "ack_id": ack.id,
                "report_hash": ack.report_hash,
                "acked_at": ack.acked_at.isoformat() if ack.acked_at else None,
            }, indent=2))
            return 0

        if args.execute:
            try:
                stats = execute_backfill(db, args.org_id)
            except CrlMigrationError as exc:
                print(f"ERROR: {exc}", file=sys.stderr)
                return 2
            print(json.dumps({"executed": True, **stats}, indent=2))
            return 0

        # Default: dry-run report
        report = generate_validation_report(db, args.org_id)
        print(json.dumps(report, indent=2, default=str))
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    sys.exit(main())
