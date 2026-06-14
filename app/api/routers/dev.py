import os

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.api.deps import get_db, get_current_user

router = APIRouter(prefix="/dev", tags=["dev"])


def _guard_non_production() -> None:
    if os.environ.get("APP_ENV", "development").lower() == "production":
        raise HTTPException(status_code=403, detail="Not available in production")


@router.delete("/reset", summary="Wipe all org data — dev/staging only")
def dev_reset(
    org_id: int,
    db: Session = Depends(get_db),
    _user=Depends(get_current_user),
):
    _guard_non_production()

    # Resolve entity IDs for this org
    entity_rows = db.execute(
        text("SELECT id FROM entities WHERE organization_id = :org_id"),
        {"org_id": org_id},
    ).fetchall()
    entity_ids = [r[0] for r in entity_rows]

    deleted: dict[str, int] = {}

    def _del(table: str, col: str, ids: list[int]) -> int:
        if not ids:
            return 0
        placeholders = ",".join(str(i) for i in ids)
        result = db.execute(text(f"DELETE FROM {table} WHERE {col} IN ({placeholders})"))
        return result.rowcount

    def _del_org(table: str) -> int:
        result = db.execute(
            text(f"DELETE FROM {table} WHERE organization_id = :org_id"),
            {"org_id": org_id},
        )
        return result.rowcount

    if entity_ids:
        # --- journal entries ---
        je_rows = db.execute(
            text(f"SELECT id FROM journal_entries WHERE entity_id IN ({','.join(str(i) for i in entity_ids)})")
        ).fetchall()
        je_ids = [r[0] for r in je_rows]
        deleted["journal_entry_lines"] = _del("journal_entry_lines", "journal_entry_id", je_ids)
        deleted["journal_entry_events"] = _del("journal_entry_events", "je_id", je_ids)
        deleted["journal_entries"] = _del("journal_entries", "entity_id", entity_ids)

        # --- TB import batches ---
        tb_rows = db.execute(
            text(f"SELECT id FROM import_batches WHERE entity_id IN ({','.join(str(i) for i in entity_ids)})")
        ).fetchall()
        tb_ids = [r[0] for r in tb_rows]
        deleted["import_lines"] = _del("import_lines", "batch_id", tb_ids)
        deleted["import_validation_issues"] = _del("import_validation_issues", "batch_id", tb_ids)
        deleted["import_batches"] = _del("import_batches", "entity_id", entity_ids)

        # --- PDF import batches ---
        pdf_rows = db.execute(
            text(f"SELECT id FROM pdf_import_batches WHERE entity_id IN ({','.join(str(i) for i in entity_ids)})")
        ).fetchall()
        pdf_ids = [r[0] for r in pdf_rows]
        deleted["pdf_import_lines"] = _del("pdf_import_lines", "batch_id", pdf_ids)
        deleted["pdf_account_mappings"] = _del("pdf_account_mappings", "batch_id", pdf_ids)
        deleted["pdf_import_batches"] = _del("pdf_import_batches", "entity_id", entity_ids)

        # --- COA import batches ---
        deleted["coa_import_batches"] = _del("coa_import_batches", "entity_id", entity_ids)

        # --- accounts & mappings ---
        acct_rows = db.execute(
            text(f"SELECT id FROM accounts WHERE entity_id IN ({','.join(str(i) for i in entity_ids)})")
        ).fetchall()
        acct_ids = [r[0] for r in acct_rows]
        deleted["account_mappings"] = _del("account_mappings", "account_id", acct_ids)
        deleted["accounts"] = _del("accounts", "entity_id", entity_ids)

        # --- periods ---
        deleted["accounting_periods"] = _del("accounting_periods", "entity_id", entity_ids)

        # --- entities ---
        deleted["entities"] = _del("entities", "organization_id", [org_id])

    # --- org-level TB batches (may reference deleted entities) ---
    deleted["import_batches_org"] = _del_org("import_batches")

    db.commit()

    return {"status": "reset", "org_id": org_id, "deleted": deleted}
