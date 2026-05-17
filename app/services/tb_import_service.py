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

from sqlalchemy.orm import Session

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

    Returns a ValidationResult; errors are populated if validation fails.
    Never raises — all failures are captured as ERROR issues in the result.
    """
    result = ValidationResult()
    try:
        parsed = _parse_csv(csv_content, filename)
        resolved = _resolve_accounts(db, entity_id, parsed, filename)
        aggregated = _aggregate(resolved)
        _validate_balance(aggregated, filename)
    except TbImportError as exc:
        result.error(
            code="TB_VALIDATION_ERROR",
            message=str(exc),
            source_type="tb_import",
            source_id=filename,
        )
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

    Creates a TbImport audit record regardless of outcome:
      - status='processed' on success, with je_id and totals populated
      - status='failed'    on error,   with error_message populated

    Raises TbImportError or JournalEntryValidationError; the TbImport row is
    flushed in both cases so the caller can commit the audit trail.
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
        parsed = _parse_csv(csv_content, filename)
        resolved = _resolve_accounts(db, entity_id, parsed, filename)
        aggregated = _aggregate(resolved)
        _validate_balance(aggregated, filename)
        je_lines, total_debits, total_credits = _build_je_lines(aggregated, entity_id)

        je = post_journal_entry(db, JournalEntryCreate(
            je_number=je_number,
            entry_date=as_of_date,
            entity_id=entity_id,
            scenario_id=scenario_id,
            description=f"Trial balance import: {filename}",
            source="tb_import",
            source_ref=filename,
            created_by=imported_by,
            lines=je_lines,
        ))

        tb_import.je_id = je.id
        tb_import.row_count = len(parsed)
        tb_import.total_debits = total_debits
        tb_import.total_credits = total_credits
        tb_import.status = "processed"
        db.flush()

    except (TbImportError, Exception) as exc:
        tb_import.status = "failed"
        tb_import.error_message = str(exc)
        db.flush()
        raise

    return tb_import


# ---------------------------------------------------------------------------
# Internal data structures
# ---------------------------------------------------------------------------

@dataclass
class _ParsedRow:
    account_number: str
    debit: Decimal | None = field(default=None)    # set for debit/credit format
    credit: Decimal | None = field(default=None)   # set for debit/credit format
    signed_balance: Decimal | None = field(default=None)  # set for signed format


# ---------------------------------------------------------------------------
# Step 1 — Parse CSV
# ---------------------------------------------------------------------------

def _parse_csv(content: str, filename: str) -> list[_ParsedRow]:
    reader = csv.DictReader(io.StringIO(content.strip()))

    if not reader.fieldnames:
        raise TbImportError(f"{filename}: CSV is empty or missing a header row")

    headers = {h.strip().lower() for h in reader.fieldnames}

    if "account_number" not in headers:
        raise TbImportError(f"{filename}: missing required column 'account_number'")

    if "debit" in headers and "credit" in headers:
        fmt = "debit_credit"
    elif "balance" in headers:
        fmt = "signed"
    else:
        raise TbImportError(
            f"{filename}: unrecognized format. "
            "Expected columns (account_number, debit, credit) "
            "or (account_number, balance)"
        )

    rows: list[_ParsedRow] = []
    for line_num, row in enumerate(reader, start=2):
        acct = (row.get("account_number") or "").strip()
        if not acct:
            raise TbImportError(f"{filename}: row {line_num} has an empty account_number")

        try:
            if fmt == "debit_credit":
                debit  = Decimal((row.get("debit")  or "0").strip())
                credit = Decimal((row.get("credit") or "0").strip())
                if debit < 0 or credit < 0:
                    raise TbImportError(
                        f"{filename}: row {line_num}: debit/credit amounts must be "
                        f"non-negative (got debit={debit}, credit={credit})"
                    )
                rows.append(_ParsedRow(account_number=acct, debit=debit, credit=credit))
            else:
                balance = Decimal((row.get("balance") or "0").strip())
                rows.append(_ParsedRow(account_number=acct, signed_balance=balance))
        except InvalidOperation:
            raise TbImportError(
                f"{filename}: row {line_num} contains a non-numeric amount"
            )

    if not rows:
        raise TbImportError(f"{filename}: CSV has a header row but no data rows")

    return rows


# ---------------------------------------------------------------------------
# Step 2 — Resolve account_number → Account (entity-specific, then global)
# ---------------------------------------------------------------------------

def _resolve_accounts(
    db: Session,
    entity_id: int,
    rows: list[_ParsedRow],
    filename: str,
) -> list[tuple[Account, Decimal, Decimal]]:
    """
    Returns (account, debit, credit) for every row.
    Converts signed balances to debit/credit using account.normal_balance.
    Raises TbImportError for any unrecognised account_number.
    """
    resolved: list[tuple[Account, Decimal, Decimal]] = []

    for row in rows:
        account = _find_account(db, entity_id, row.account_number)
        if account is None:
            raise TbImportError(
                f"{filename}: account_number '{row.account_number}' not found "
                f"(searched entity_id={entity_id} and global accounts)"
            )

        if row.signed_balance is not None:
            debit, credit = _signed_to_debit_credit(row.signed_balance, account.normal_balance)
        else:
            debit  = row.debit  or Decimal("0")
            credit = row.credit or Decimal("0")

        resolved.append((account, debit, credit))

    return resolved


def _find_account(db: Session, entity_id: int, account_number: str) -> Account | None:
    """Entity-specific lookup first, then fall back to global (entity_id IS NULL)."""
    acct = (
        db.query(Account)
        .filter(
            Account.account_number == account_number,
            Account.entity_id == entity_id,
        )
        .first()
    )
    if acct is None:
        acct = (
            db.query(Account)
            .filter(
                Account.account_number == account_number,
                Account.entity_id.is_(None),
            )
            .first()
        )
    return acct


def _signed_to_debit_credit(balance: Decimal, normal_balance: str) -> tuple[Decimal, Decimal]:
    """
    Converts a signed balance to (debit, credit).

    Positive  → balance on the account's normal side
                  debit-normal  → (balance, 0)
                  credit-normal → (0, balance)
    Negative  → contra (abnormal) balance; absolute value goes to the opposite side
                  debit-normal  → (0, -balance)
                  credit-normal → (-balance, 0)
    Zero      → (0, 0)
    """
    zero = Decimal("0")
    if balance > zero:
        return (balance, zero) if normal_balance == "debit" else (zero, balance)
    elif balance < zero:
        abs_val = -balance
        return (zero, abs_val) if normal_balance == "debit" else (abs_val, zero)
    return zero, zero


# ---------------------------------------------------------------------------
# Step 3 — Aggregate duplicate rows for the same account
# ---------------------------------------------------------------------------

def _aggregate(
    resolved: list[tuple[Account, Decimal, Decimal]],
) -> list[tuple[Account, Decimal, Decimal]]:
    totals: dict[int, tuple[Account, Decimal, Decimal]] = {}
    for account, debit, credit in resolved:
        if account.id in totals:
            _, acc_d, acc_c = totals[account.id]
            totals[account.id] = (account, acc_d + debit, acc_c + credit)
        else:
            totals[account.id] = (account, debit, credit)
    return list(totals.values())


# ---------------------------------------------------------------------------
# Step 4 — Validate balance
# ---------------------------------------------------------------------------

def _validate_balance(
    aggregated: list[tuple[Account, Decimal, Decimal]],
    filename: str,
) -> None:
    total_debit  = sum(d for _, d, _ in aggregated)
    total_credit = sum(c for _, _, c in aggregated)

    if total_debit != total_credit:
        raise TbImportError(
            f"{filename}: trial balance does not balance — "
            f"total debits={total_debit}, total credits={total_credit}"
        )
    if total_debit == Decimal("0"):
        raise TbImportError(f"{filename}: trial balance has no non-zero amounts")


# ---------------------------------------------------------------------------
# Step 5 — Build JournalEntryLineCreate objects
# ---------------------------------------------------------------------------

def _build_je_lines(
    aggregated: list[tuple[Account, Decimal, Decimal]],
    entity_id: int,
) -> tuple[list[JournalEntryLineCreate], Decimal, Decimal]:
    lines: list[JournalEntryLineCreate] = []
    total_debits = Decimal("0")
    total_credits = Decimal("0")

    for i, (account, debit, credit) in enumerate(aggregated):
        lines.append(JournalEntryLineCreate(
            line_number=i + 1,
            account_id=account.id,
            entity_id=entity_id,
            debit=debit,
            credit=credit,
        ))
        total_debits  += debit
        total_credits += credit

    return lines, total_debits, total_credits
