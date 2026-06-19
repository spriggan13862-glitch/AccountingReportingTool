"""
Trial balance CSV import service.

Supported CSV formats
---------------------
Debit/Credit:   account_number, debit, credit
Signed balance: account_number, balance
                  positive = balance on the account's normal side
                  negative = contra (abnormal) balance

Both formats auto-detected from column headers.
All amounts must be non-negative in the debit/credit format.
A signed balance is converted to debit/credit using account.normal_balance.

The resulting opening-balance journal entry is posted via post_journal_entry,
keeping the ledger as the single source of truth.
"""

import csv
import datetime
import io
from dataclasses import dataclass, field
from decimal import Decimal, InvalidOperation
from typing import Any

from sqlalchemy.orm import Session
from app.models.import_batch import ImportBatch

from app.models.account import Account
from app.models.tb_import import TbImport
from app.schemas.journal_entry import JournalEntryCreate, JournalEntryLineCreate
from app.services.journal_entry_service import post_journal_entry
from app.services.validation import ValidationResult


class TbImportError(ValueError):
    pass


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def _precheck_and_upload(
    db: Session,
    entity_id: int,
    csv_content: str,
    filename: str,
    scenario_id: int,
    as_of_date: datetime.date,
) -> Any:
    from app.models.entity import Entity
    from app.services.import_batch_service import upload_import_batch

    entity = db.get(Entity, entity_id)
    if not entity:
        raise TbImportError(f"Entity {entity_id} not found")

    # Pre-check CSV headers and validity to replicate legacy exception expectations
    import csv
    import io

    reader = csv.DictReader(io.StringIO(csv_content.strip()))
    if not reader.fieldnames:
        raise TbImportError(f"{filename}: CSV is empty or missing a header row")

    headers = {h.strip().lower() for h in reader.fieldnames}
    if "account_number" not in headers:
        raise TbImportError(f"{filename}: missing required column 'account_number'")

    if not ("debit" in headers and "credit" in headers) and "balance" not in headers:
        raise TbImportError(
            f"{filename}: unrecognized format. "
            "Expected columns (account_number, debit, credit) "
            "or (account_number, balance)"
        )

    rows = list(reader)
    if not rows:
        raise TbImportError(f"{filename}: CSV has a header row but no data rows")

    for line_num, row in enumerate(rows, start=2):
        acct = (row.get("account_number") or "").strip()
        if not acct:
            raise TbImportError(f"{filename}: row {line_num} has an empty account_number")

        # Validate amounts
        if "debit" in headers and "credit" in headers:
            deb_str = (row.get("debit") or "").strip()
            cred_str = (row.get("credit") or "").strip()
            try:
                d = Decimal(deb_str) if deb_str else Decimal("0")
                c = Decimal(cred_str) if cred_str else Decimal("0")
            except InvalidOperation:
                raise TbImportError(f"{filename}: row {line_num} contains a non-numeric amount")
            if d < 0 or c < 0:
                raise TbImportError(
                    f"{filename}: row {line_num}: debit/credit amounts must be "
                    f"non-negative (got debit={d}, credit={c})"
                )
        elif "balance" in headers:
            bal_str = (row.get("balance") or "").strip()
            try:
                Decimal(bal_str) if bal_str else Decimal("0")
            except InvalidOperation:
                raise TbImportError(f"{filename}: row {line_num} contains a non-numeric amount")

    org_id = entity.organization_id
    if org_id is None:
        from app.models.organization import Organization
        org = db.query(Organization).first()
        if not org:
            org = Organization(name="Default Org", slug="default")
            db.add(org)
            db.flush()
        org_id = org.id
        entity.organization_id = org_id
        db.flush()

    try:
        batch = upload_import_batch(
            db=db,
            file_content=csv_content.encode("utf-8"),
            filename=filename,
            entity_id=entity_id,
            organization_id=org_id,
            as_of_date=as_of_date,
            scenario_id=scenario_id,
            auto_create_accounts=True,
        )
    except Exception as exc:
        raise TbImportError(f"{filename}: {exc}")

    return batch


def preview_tb_import(
    db: Session,
    entity_id: int,
    scenario_id: int,
    as_of_date: datetime.date,
    csv_content: str,
    filename: str,
) -> ValidationResult:
    """
    Parse and validate a trial balance CSV without importing it.
    """
    result = ValidationResult()
    nested = db.begin_nested()
    try:
        batch = _precheck_and_upload(db, entity_id, csv_content, filename, scenario_id, as_of_date)

        # Check for unmapped accounts (meaning not found in COA)
        from app.models.import_line import ImportLine
        unmapped_lines = db.query(ImportLine).filter(
            ImportLine.batch_id == batch.id,
            ImportLine.mapping_status == "unmapped"
        ).all()
        for line in unmapped_lines:
            result.error(
                code="UNMAPPED_ACCOUNT",
                message=f"account_number '{line.raw_account_number}' not found",
                source_type="tb_import",
                source_id=filename,
            )

        # Run validation
        from app.services.import_batch_service import validate_batch
        val_res = validate_batch(db, batch.id)
        for issue in val_res.issues:
            result.add_issue(issue)

    except TbImportError as exc:
        result.error(
            code="TB_VALIDATION_ERROR",
            message=str(exc),
            source_type="tb_import",
            source_id=filename,
        )
    except Exception as exc:
        result.error(
            code="TB_VALIDATION_ERROR",
            message=str(exc),
            source_type="tb_import",
            source_id=filename,
        )
    finally:
        nested.rollback()

    return result


def import_trial_balance(
    db: Session,
    entity_id: int,
    scenario_id: int,
    as_of_date: datetime.date,
    csv_content: str,
    filename: str,
    je_number: str,
    imported_by: str | None = None,
) -> TbImport:
    """
    Parse a trial balance CSV, validate it, and post it as an opening-balance JE.
    """
    tb_import = TbImport(
        entity_id=entity_id,
        as_of_date=as_of_date,
        filename=filename,
        status="pending",
        uploaded_by=imported_by,
    )
    db.add(tb_import)
    db.flush()

    try:
        # 1. Precheck and upload
        batch = _precheck_and_upload(db, entity_id, csv_content, filename, scenario_id, as_of_date)

        # 2. Raise error if there are unmapped accounts
        from app.models.import_line import ImportLine
        unmapped = db.query(ImportLine).filter(
            ImportLine.batch_id == batch.id,
            ImportLine.mapping_status == "unmapped"
        ).first()
        if unmapped:
            raise TbImportError(
                f"{filename}: account_number '{unmapped.raw_account_number}' not found "
                f"(searched entity_id={entity_id} and global accounts)"
            )

        # 3. Validate
        from app.services.import_batch_service import validate_batch
        val_result = validate_batch(db, batch.id)
        if val_result.has_errors:
            err = next((issue for issue in val_result.issues if issue.severity.value == "ERROR"), None)
            msg = err.message if err else "Validation failed"
            if "does not balance" in msg.lower():
                mapped_lines = db.query(ImportLine).filter(
                    ImportLine.batch_id == batch.id,
                    ImportLine.mapping_status == "mapped"
                ).all()
                total_dr = sum(l.debit for l in mapped_lines)
                total_cr = sum(l.credit for l in mapped_lines)
                raise TbImportError(
                    f"{filename}: trial balance does not balance — "
                    f"total debits={total_dr}, total credits={total_cr}"
                )
            elif "all mapped lines have zero amounts" in msg.lower() or "zero" in msg.lower():
                raise TbImportError(f"{filename}: trial balance has no non-zero amounts")
            raise TbImportError(f"{filename}: {msg}")

        # 4. Post
        from app.models.user import User
        user_obj = None
        if imported_by:
            user_obj = db.query(User).filter(User.email == imported_by).first()

        from app.services.import_batch_service import post_batch
        post_batch(db, batch.id, je_number=je_number, acting_user=user_obj)
        db.flush()

        tb_import.je_id = batch.posted_je_id
        tb_import.row_count = batch.row_count
        tb_import.total_debits = batch.total_debits
        tb_import.total_credits = batch.total_credits
        tb_import.status = "processed"
        db.flush()

    except (TbImportError, Exception) as exc:
        tb_import.status = "failed"
        tb_import.error_message = str(exc)
        db.flush()
        raise

    return tb_import

