"""
Import batch pipeline service — M23.

Staged import workflow:
  upload → parse → map columns → resolve accounts → validate → review → post

Core principles:
  - Never auto-create accounts (no silent mutations)
  - Preserve original source values (raw_* fields never mutate)
  - Posting is blocked until all lines are mapped and validation passes
  - Rollback creates a reversing JE; remapping and reposting are supported
  - Duplicate uploads detected by content hash before any writes
  - All corrections are audited with user + timestamp

Format support:
  - CSV (any delimiter)
  - XLSX (first sheet)
  - QuickBooks Desktop / QBO style
  - NetSuite GL export style
  - Sage style
  - Generic fallback with alias normalization

Account parsing:
  - Separate account_number + account_name columns (preferred)
  - Combined "6125 Merchant Fees" single-column fallback
  - Account-number-first resolution, then name fuzzy fallback
"""

from __future__ import annotations

import csv
import datetime
import hashlib
import io
import re
from decimal import Decimal, InvalidOperation
from typing import Any

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.account import Account
from app.models.accounting_period import AccountingPeriod
from app.models.account_mapping import AccountMapping
from app.models.import_batch import ImportBatch
from app.models.import_line import ImportLine
from app.models.import_template import ImportTemplate
from app.models.import_validation_issue import ImportValidationIssue
from app.models.journal_entry import JournalEntry
from app.schemas.journal_entry import JournalEntryCreate, JournalEntryLineCreate
from app.services.journal_entry_service import post_journal_entry, reverse_journal_entry
from app.services.validation import ValidationResult, Severity


# ---------------------------------------------------------------------------
# Public exceptions
# ---------------------------------------------------------------------------

class ImportBatchError(ValueError):
    """Raised when an import pipeline operation is invalid."""


class ImportBatchNotFoundError(LookupError):
    pass


class ImportBatchStateError(ImportBatchError):
    """Raised when a status transition is invalid."""


# ---------------------------------------------------------------------------
# Column alias normalization
# ---------------------------------------------------------------------------
# Maps every known source-column variant to a canonical standard field name.
# Matching is case-insensitive with whitespace normalization.

STANDARD_FIELDS = ("account_number", "account_name", "debit", "credit", "balance", "description", "entity")

COLUMN_ALIASES: dict[str, list[str]] = {
    "account_number": [
        "account_number", "account #", "account no", "account no.", "account number",
        "acct #", "acct no", "acct", "num", "gl account", "gl #", "code",
        "account code", "account id", "ledger account", "chart of accounts",
    ],
    "account_name": [
        "account_name", "account name", "account description", "gl account name",
        "name", "title", "account title", "ledger name",
    ],
    "debit": [
        "debit", "debit amount", "dr", "dr amount", "debit balance",
        "debit (dr)", "ending debit", "total debit",
    ],
    "credit": [
        "credit", "credit amount", "cr", "cr amount", "credit balance",
        "credit (cr)", "ending credit", "total credit",
    ],
    "balance": [
        "balance", "net balance", "net amount", "net change",
        "ending balance", "amount", "total", "period net",
        "net activity", "net", "balance amount",
    ],
    "description": [
        "description", "memo", "notes", "narration", "detail",
        "transaction description", "account description",
    ],
    "entity": [
        "entity", "class", "location", "department", "subsidiary",
        "cost center", "business unit",
    ],
}

# Known source format header signatures (lowercase)
FORMAT_SIGNATURES: dict[str, set[str]] = {
    "qbo":      {"account", "debit", "credit"},
    "netsuite": {"account number", "account name"},
    "sage":     {"account no", "period"},
}

# Combined format: "6125 Merchant Fees" or "4000 - Revenue"
# Requires at least one space between number and name to avoid splitting pure numbers like "1000".
_COMBINED_PATTERN = re.compile(r"^(\d{3,8})\s+(?:[-–—]\s*)?(.+)$")


# ---------------------------------------------------------------------------
# File parsing helpers
# ---------------------------------------------------------------------------

def _sha256(content: bytes) -> str:
    return hashlib.sha256(content).hexdigest()


def _normalize_header(h: str) -> str:
    return h.strip().lower().replace("-", " ").replace("_", " ")


def _match_column(header: str) -> str | None:
    """Return the standard field name for a source column header, or None."""
    normalized = _normalize_header(header)
    for field, aliases in COLUMN_ALIASES.items():
        if normalized in [_normalize_header(a) for a in aliases]:
            return field
    return None


def detect_source_format(filename: str, headers: list[str]) -> str:
    """Identify the source system from filename extension and column headers."""
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else "csv"
    if ext in ("xlsx", "xls"):
        return "xlsx"
    normalized = {_normalize_header(h) for h in headers}
    for fmt, signature in FORMAT_SIGNATURES.items():
        if signature.issubset(normalized):
            return fmt
    return "csv"


def auto_detect_column_mapping(headers: list[str]) -> dict[str, str]:
    """
    Auto-map source column headers to standard field names.
    Returns {standard_field: source_column_header}.
    """
    mapping: dict[str, str] = {}
    for header in headers:
        field = _match_column(header)
        if field and field not in mapping:
            mapping[field] = header
    return mapping


def parse_combined_account_field(raw: str) -> tuple[str, str]:
    """
    Try to split a combined "6125 Merchant Fees" field into (number, name).
    Returns (raw, "") if no numeric prefix found.
    """
    raw = raw.strip()
    m = _COMBINED_PATTERN.match(raw)
    if m:
        return m.group(1).strip(), m.group(2).strip()
    return raw, ""


def _parse_amount(raw: str | None) -> Decimal:
    if not raw:
        return Decimal("0")
    cleaned = raw.strip().replace(",", "").replace("$", "").replace("(", "-").replace(")", "")
    try:
        return Decimal(cleaned)
    except InvalidOperation:
        raise ImportBatchError(f"Non-numeric amount: '{raw}'")


def _parse_csv_file(content: bytes) -> tuple[list[str], list[dict[str, str]]]:
    """Parse CSV bytes, returning (headers, rows)."""
    text = content.decode("utf-8-sig", errors="replace")  # strip BOM
    # Sniff delimiter
    try:
        dialect = csv.Sniffer().sniff(text[:4096], delimiters=",\t|;")
    except csv.Error:
        dialect = csv.excel
    # Use regular csv.reader to preserve all column headers and indices
    reader = csv.reader(io.StringIO(text.strip()), dialect=dialect)
    all_rows = list(reader)
    if not all_rows:
        raise ImportBatchError("CSV file is empty or has no header row")
        
    hdr_idx = 0
    for i, cells in enumerate(all_rows):
        if any(cells):
            hdr_idx = i
            break
            
    headers = [h.strip() for h in all_rows[hdr_idx]]
    if not any(headers):
        raise ImportBatchError("CSV file is empty or has no header row")
        
    from openpyxl.utils import get_column_letter
    data_rows: list[dict[str, str]] = []
    for row in all_rows[hdr_idx + 1:]:
        if not any(row):
            continue  # skip blank rows
        row_dict = {}
        for col_idx, val in enumerate(row):
            letter = get_column_letter(col_idx + 1)
            row_dict[letter] = val
            if col_idx < len(headers):
                hdr = headers[col_idx]
                if hdr:
                    row_dict[hdr] = val
        data_rows.append(row_dict)
        
    return headers, data_rows


def _parse_xlsx_file(content: bytes, sheet_name: str | None = None, header_row_index: int | None = None) -> tuple[list[str], list[dict[str, str]]]:
    """Parse XLSX bytes using openpyxl, returning (headers, rows)."""
    try:
        import openpyxl
    except ImportError:
        raise ImportBatchError("openpyxl is required for XLSX imports. Run: pip install openpyxl")

    wb = openpyxl.load_workbook(io.BytesIO(content), read_only=True, data_only=True)
    if sheet_name and sheet_name in wb.sheetnames:
        ws = wb[sheet_name]
    else:
        ws = wb.active

    all_rows: list[list[str]] = []
    for row in ws.iter_rows(min_col=1, values_only=True):
        cells = [str(c).strip() if c is not None else "" for c in row]
        all_rows.append(cells)

    if header_row_index is not None:
        hdr_idx = header_row_index
    else:
        hdr_idx = 0
        for i, cells in enumerate(all_rows):
            if any(cells):
                hdr_idx = i
                break

    if not all_rows or hdr_idx >= len(all_rows):
        raise ImportBatchError("XLSX file is empty or has no header row")

    headers = all_rows[hdr_idx]
    if not any(headers):
        raise ImportBatchError("XLSX file is empty or has no header row")

    from openpyxl.utils import get_column_letter
    data_rows: list[dict[str, str]] = []
    for row in all_rows[hdr_idx + 1:]:
        if not any(row):
            continue  # skip blank rows
        row_dict = {}
        for col_idx, val in enumerate(row):
            letter = get_column_letter(col_idx + 1)
            row_dict[letter] = val
            if col_idx < len(headers):
                hdr = headers[col_idx]
                if hdr:
                    row_dict[hdr] = val
        data_rows.append(row_dict)

    wb.close()
    return headers, data_rows


def _parse_file(content: bytes, filename: str, sheet_name: str | None = None, header_row_index: int | None = None) -> tuple[list[str], list[dict[str, str]]]:
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else "csv"
    if ext in ("xlsx", "xls"):
        return _parse_xlsx_file(content, sheet_name=sheet_name, header_row_index=header_row_index)
    return _parse_csv_file(content)


# ---------------------------------------------------------------------------
# Row interpretation
# ---------------------------------------------------------------------------

_ParsedRow = tuple[str, str, Decimal | None, Decimal | None, Decimal | None, str]
# (account_number, account_name, raw_debit, raw_credit, raw_balance, description)


def _interpret_row(
    row: dict[str, str],
    col_map: dict[str, str],
    line_num: int,
) -> _ParsedRow:
    """
    Apply column mapping to a source row, returning normalised values.
    Handles combined account fields ("6125 Merchant Fees") automatically.
    """
    def get(field: str) -> str:
        col = col_map.get(field)
        return row.get(col, "").strip() if col else ""

    raw_acct_num = get("account_number")
    raw_acct_name = get("account_name")
    raw_desc = get("description")

    # If account_number is the only field and looks combined, split it
    if raw_acct_num and not raw_acct_name:
        parsed_num, parsed_name = parse_combined_account_field(raw_acct_num)
        raw_acct_num = parsed_num
        if parsed_name and not raw_acct_name:
            raw_acct_name = parsed_name

    # If we still have no account_number but have account_name that matches combined format
    if not raw_acct_num and raw_acct_name:
        parsed_num, parsed_name = parse_combined_account_field(raw_acct_name)
        if parsed_num != raw_acct_name:  # was successfully split
            raw_acct_num = parsed_num
            raw_acct_name = parsed_name

    raw_debit_str = get("debit")
    raw_credit_str = get("credit")
    raw_balance_str = get("balance")

    try:
        raw_debit = _parse_amount(raw_debit_str) if raw_debit_str else None
        raw_credit = _parse_amount(raw_credit_str) if raw_credit_str else None
        raw_balance = _parse_amount(raw_balance_str) if raw_balance_str else None
    except ImportBatchError as exc:
        raise ImportBatchError(f"Row {line_num}: {exc}")

    return raw_acct_num, raw_acct_name, raw_debit, raw_credit, raw_balance, raw_desc


# ---------------------------------------------------------------------------
# Account resolution
# ---------------------------------------------------------------------------

def get_parent_account_number(account_number: str) -> str | None:
    if not account_number:
        return None
    # If it has a separator, e.g. "1000-01" or "1000.02" or "1000:05"
    for sep in ('-', '.', ':'):
        if sep in account_number:
            parts = account_number.split(sep)
            if parts[0].isdigit():
                return parts[0]
    # If it's a pure number and longer than 4 digits, check if the prefix (length 4) matches
    if account_number.isdigit() and len(account_number) > 4:
        return account_number[:4]
    return None


def guess_account_type_and_normal(account_number: str | None, account_name: str | None) -> tuple[str, str]:
    num = (account_number or "").strip()
    name = (account_name or "").lower()
    
    if num.startswith("1"):
        return "asset", "debit"
    if num.startswith("2"):
        return "liability", "credit"
    if num.startswith("3"):
        return "equity", "credit"
    if num.startswith("4"):
        return "revenue", "credit"
    if any(num.startswith(p) for p in ("5", "6", "7", "8")):
        return "expense", "debit"
        
    if "asset" in name:
        return "asset", "debit"
    if "liab" in name:
        return "liability", "credit"
    if "equi" in name:
        return "equity", "credit"
    if "rev" in name or "inc" in name:
        return "revenue", "credit"
    if "exp" in name or "cost" in name or "fee" in name:
        return "expense", "debit"
        
    return "asset", "debit"


def _find_account(
    db: Session,
    entity_id: int,
    account_number: str,
    account_name: str | None = None,
) -> Account | None:
    """
    Lookup account. Steps:
      1. Exact account number on entity
      2. Parent account number suffix strip fallback on entity (e.g. 1000-01 -> 1000)
      3. Exact case-insensitive name match on entity
      4. Fallback to global exact account number
    """
    if not account_number and not account_name:
        return None

    # 1. Exact account number match on entity
    if account_number:
        acct = (
            db.query(Account)
            .filter(Account.account_number == account_number, Account.entity_id == entity_id)
            .first()
        )
        if acct:
            return acct

    # 2. Parent prefix match on entity
    if account_number:
        parent_num = get_parent_account_number(account_number)
        if parent_num:
            acct = (
                db.query(Account)
                .filter(Account.account_number == parent_num, Account.entity_id == entity_id)
                .first()
            )
            if acct:
                return acct

    # 3. Exact case-insensitive name match on entity
    if account_name:
        normalized_name = account_name.strip().lower()
        acct = (
            db.query(Account)
            .filter(
                func.lower(func.trim(Account.account_name)) == normalized_name,
                Account.entity_id == entity_id,
            )
            .first()
        )
        if acct:
            return acct

    # 4. Fallback to global exact account number
    if account_number:
        acct = (
            db.query(Account)
            .filter(Account.account_number == account_number, Account.entity_id.is_(None))
            .first()
        )
        if acct:
            return acct

    return None


def _suggest_account(db: Session, entity_id: int, raw_number: str, raw_name: str) -> Account | None:
    """
    Fuzzy suggestion: try prefix match on account_number, then name substring.
    Returns the best candidate without committing a mapping.
    """
    if raw_number:
        # Try prefix match (e.g. "1000" matches "10001")
        acct = (
            db.query(Account)
            .filter(
                Account.account_number.like(f"{raw_number}%"),
                Account.entity_id == entity_id,
            )
            .first()
        )
        if acct:
            return acct

    if raw_name:
        # Name substring match
        acct = (
            db.query(Account)
            .filter(
                Account.account_name.ilike(f"%{raw_name}%"),
                Account.entity_id == entity_id,
            )
            .first()
        )
        if acct:
            return acct

    return None


def _signed_to_debit_credit(
    balance: Decimal, normal_balance: str
) -> tuple[Decimal, Decimal]:
    zero = Decimal("0")
    if balance > zero:
        return (balance, zero) if normal_balance == "debit" else (zero, balance)
    elif balance < zero:
        abs_val = -balance
        return (zero, abs_val) if normal_balance == "debit" else (abs_val, zero)
    return zero, zero


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def upload_import_batch(
    db: Session,
    file_content: bytes,
    filename: str,
    entity_id: int,
    organization_id: int,
    as_of_date: datetime.date,
    scenario_id: int | None = None,
    period_id: int | None = None,
    uploaded_by_user_id: int | None = None,
    template_id: int | None = None,
    sheet_name: str | None = None,
    header_row_index: int | None = None,
) -> ImportBatch:
    """
    Upload a TB/GL file and create an ImportBatch with parsed ImportLines.

    Steps:
      1. Hash the content (dedup check)
      2. Parse file (CSV or XLSX, optional sheet_name for multi-sheet workbooks)
      3. Detect format and auto-map columns (or load from template)
      4. Create ImportBatch record (with raw_headers stored)
      5. Parse each row into ImportLine (raw values only)
      6. Try to auto-resolve accounts
      7. Set batch status: mapping_required (if any unmapped) else validating
    """
    if len(file_content) == 0:
        raise ImportBatchError("Uploaded file is empty")
    if len(file_content) > 20 * 1024 * 1024:  # 20 MB hard limit
        raise ImportBatchError("File exceeds 20 MB limit")

    content_hash = _sha256(file_content)
    headers, raw_rows = _parse_file(file_content, filename, sheet_name=sheet_name, header_row_index=header_row_index)

    if len(raw_rows) == 0:
        raise ImportBatchError(f"{filename}: no data rows found")
    if len(raw_rows) > 10_000:
        raise ImportBatchError(f"{filename}: {len(raw_rows)} rows exceed the 10,000-row limit")

    source_format = detect_source_format(filename, headers)

    # Load column mapping from template or auto-detect
    if template_id is not None:
        tmpl = db.get(ImportTemplate, template_id)
        col_map = tmpl.column_mapping if tmpl else {}
    else:
        col_map = auto_detect_column_mapping(headers)

    # Validate mapping has at least account_number
    if "account_number" not in col_map:
        # Try to find any header that looks like an account identifier
        for h in headers:
            if _match_column(h) == "account_number":
                col_map["account_number"] = h
                break

    batch = ImportBatch(
        organization_id=organization_id,
        entity_id=entity_id,
        period_id=period_id,
        scenario_id=scenario_id,
        filename=filename,
        source_format=source_format,
        content_hash=content_hash,
        column_mapping=col_map,
        raw_headers=headers,
        as_of_date=as_of_date,
        status="parsing",
        uploaded_by_user_id=uploaded_by_user_id,
    )
    db.add(batch)
    db.flush()  # get batch.id

    # Parse rows into ImportLines
    has_debit_credit = "debit" in col_map and "credit" in col_map
    has_balance = "balance" in col_map

    if not has_debit_credit and not has_balance and "account_number" in col_map:
        # Try to infer format from data
        for row in raw_rows[:5]:
            debit_col = next((h for h in headers if _normalize_header(h) in [_normalize_header(a) for a in COLUMN_ALIASES["debit"]]), None)
            credit_col = next((h for h in headers if _normalize_header(h) in [_normalize_header(a) for a in COLUMN_ALIASES["credit"]]), None)
            if debit_col and credit_col:
                col_map["debit"] = debit_col
                col_map["credit"] = credit_col
                has_debit_credit = True
                break

    import_lines: list[ImportLine] = []
    unmapped_count = 0

    for i, row in enumerate(raw_rows, start=2):  # row 1 is header
        try:
            acct_num, acct_name, raw_debit, raw_credit, raw_balance, raw_desc = _interpret_row(
                row, col_map, i
            )
        except ImportBatchError as exc:
            batch.status = "validation_failed"
            batch.error_message = str(exc)
            db.flush()
            raise

        # Calculate debit/credit from whichever format was used
        account = _find_account(db, entity_id, acct_num, acct_name) if (acct_num or acct_name) else None
        
        # If not found, automatically create the account in the COA!
        if account is None and (acct_num or acct_name):
            account_type, normal_balance = guess_account_type_and_normal(acct_num, acct_name)
            account = Account(
                account_number=acct_num or f"ACCT-{i-1}",
                account_name=acct_name or f"Imported Account {i-1}",
                account_type=account_type,
                normal_balance=normal_balance,
                entity_id=entity_id,
            )
            db.add(account)
            db.flush()

        suggested = None

        if account is not None:
            if raw_balance is not None:
                debit, credit = _signed_to_debit_credit(raw_balance, account.normal_balance)
            else:
                debit = raw_debit or Decimal("0")
                credit = raw_credit or Decimal("0")
            mapping_status = "mapped"
        else:
            # Unmapped — preserve raw amounts, try suggestion (only for completely blank line)
            debit = raw_debit or Decimal("0")
            credit = raw_credit or Decimal("0")
            if raw_balance is not None:
                # can't convert without knowing normal_balance; store raw as balance
                debit = Decimal("0")
                credit = Decimal("0")
            suggested = _suggest_account(db, entity_id, acct_num, acct_name)
            mapping_status = "unmapped"
            unmapped_count += 1

        il = ImportLine(
            batch_id=batch.id,
            line_number=i - 1,
            raw_account_number=acct_num or None,
            raw_account_name=acct_name or None,
            raw_debit=raw_debit,
            raw_credit=raw_credit,
            raw_balance=raw_balance,
            raw_description=raw_desc or None,
            debit=debit,
            credit=credit,
            description=raw_desc or None,
            resolved_account_id=account.id if account else None,
            mapping_status=mapping_status,
            suggested_account_id=suggested.id if suggested else None,
        )
        db.add(il)
        import_lines.append(il)

    db.flush()

    mapped_count = len(import_lines) - unmapped_count
    batch.row_count = len(import_lines)
    batch.mapped_row_count = mapped_count
    batch.unmapped_row_count = unmapped_count
    batch.status = "mapping_required" if unmapped_count > 0 else "validating"
    db.flush()

    return batch


def update_column_mapping(
    db: Session,
    batch_id: int,
    column_mapping: dict[str, str],
    acting_user_id: int | None = None,
) -> ImportBatch:
    """
    Update the column mapping for a batch and re-parse all lines.
    Can be called when batch is in mapping_required, validation_failed, or validating.
    """
    batch = _get_or_raise(db, batch_id)
    if batch.status not in ("mapping_required", "validation_failed", "validating", "uploaded"):
        raise ImportBatchStateError(
            f"Cannot update column mapping when status is '{batch.status}'"
        )

    batch.column_mapping = column_mapping
    # Re-parse is not re-done here (lines were already stored raw);
    # re-resolve accounts using new mapping knowledge
    lines = db.query(ImportLine).filter(ImportLine.batch_id == batch_id).all()
    unmapped = 0

    for line in lines:
        if line.is_manually_mapped:
            continue  # respect manual overrides
        account = _find_account(db, batch.entity_id, line.raw_account_number or "", line.raw_account_name)
        if account is None and (line.raw_account_number or line.raw_account_name):
            account_type, normal_balance = guess_account_type_and_normal(line.raw_account_number, line.raw_account_name)
            account = Account(
                account_number=line.raw_account_number or f"ACCT-{line.line_number}",
                account_name=line.raw_account_name or f"Imported Account {line.line_number}",
                account_type=account_type,
                normal_balance=normal_balance,
                entity_id=batch.entity_id,
            )
            db.add(account)
            db.flush()
        if account:
            line.resolved_account_id = account.id
            # Recalculate debit/credit if we have raw_balance
            if line.raw_balance is not None:
                line.debit, line.credit = _signed_to_debit_credit(
                    line.raw_balance, account.normal_balance
                )
            line.mapping_status = "mapped"
        else:
            if not line.is_manually_mapped:
                line.resolved_account_id = None
                line.mapping_status = "unmapped"
                unmapped += 1

    batch.unmapped_row_count = unmapped
    batch.mapped_row_count = (batch.row_count or 0) - unmapped
    batch.status = "mapping_required" if unmapped > 0 else "validating"
    db.flush()
    return batch


def map_line_to_account(
    db: Session,
    batch_id: int,
    line_id: int,
    account_id: int,
    acting_user_id: int | None = None,
) -> ImportLine:
    """
    Manually map a single ImportLine to an Account.
    Updates debit/credit if the line used signed balance format.
    Raises ImportBatchStateError if batch is posted.
    """
    batch = _get_or_raise(db, batch_id)
    if batch.status in ("posted",):
        raise ImportBatchStateError("Cannot remap lines on a posted batch. Rollback first.")

    line = db.get(ImportLine, line_id)
    if line is None or line.batch_id != batch_id:
        raise ImportBatchNotFoundError(f"ImportLine {line_id} not found in batch {batch_id}")

    account = db.get(Account, account_id)
    if account is None:
        raise ImportBatchError(f"Account {account_id} not found")

    # Guard: account must belong to the batch entity or be global (entity_id=None)
    if account.entity_id is not None and account.entity_id != batch.entity_id:
        raise ImportBatchError(
            f"Account '{account.account_number}' (id={account_id}) belongs to entity "
            f"{account.entity_id}, not the import entity {batch.entity_id}. "
            "Select an account that belongs to this entity or use a global account."
        )

    was_unmapped = line.mapping_status == "unmapped"

    # If line had raw_balance, convert using the resolved account's normal_balance
    if line.raw_balance is not None:
        line.debit, line.credit = _signed_to_debit_credit(line.raw_balance, account.normal_balance)
    elif line.raw_debit is not None or line.raw_credit is not None:
        line.debit = line.raw_debit or Decimal("0")
        line.credit = line.raw_credit or Decimal("0")

    line.resolved_account_id = account_id
    line.mapping_status = "mapped"
    line.is_manually_mapped = True
    line.mapped_by_user_id = acting_user_id
    line.mapped_at = datetime.datetime.now(datetime.UTC)
    db.flush()

    # Update batch unmapped count
    if was_unmapped:
        batch.unmapped_row_count = max(0, (batch.unmapped_row_count or 1) - 1)
        batch.mapped_row_count = (batch.mapped_row_count or 0) + 1
        if batch.unmapped_row_count == 0 and batch.status == "mapping_required":
            batch.status = "validating"
        db.flush()

    return line


def skip_line(
    db: Session,
    batch_id: int,
    line_id: int,
    acting_user_id: int | None = None,
) -> ImportLine:
    """Mark a line as skipped — it will not be included in the posted JE."""
    batch = _get_or_raise(db, batch_id)
    if batch.status in ("posted",):
        raise ImportBatchStateError("Cannot modify lines on a posted batch. Rollback first.")

    line = db.get(ImportLine, line_id)
    if line is None or line.batch_id != batch_id:
        raise ImportBatchNotFoundError(f"ImportLine {line_id} not found in batch {batch_id}")

    was_unmapped = line.mapping_status == "unmapped"
    line.mapping_status = "skipped"
    line.is_manually_mapped = True
    line.mapped_by_user_id = acting_user_id
    line.mapped_at = datetime.datetime.now(datetime.UTC)
    db.flush()

    if was_unmapped:
        batch.unmapped_row_count = max(0, (batch.unmapped_row_count or 1) - 1)
        batch.mapped_row_count = (batch.mapped_row_count or 0) + 1
        if batch.unmapped_row_count == 0 and batch.status == "mapping_required":
            batch.status = "validating"
        db.flush()

    return line


def bulk_map_lines(
    db: Session,
    batch_id: int,
    mappings: list[dict[str, int]],
    acting_user_id: int | None = None,
) -> list[ImportLine]:
    """
    Bulk-map multiple lines at once.
    mappings: [{"line_id": N, "account_id": M}, ...]
    """
    result = []
    for m in mappings:
        line = map_line_to_account(
            db, batch_id, m["line_id"], m["account_id"], acting_user_id
        )
        result.append(line)
    return result


def create_account_from_line(
    db: Session,
    batch_id: int,
    line_id: int,
    account_number: str,
    account_name: str,
    account_type: str,
    normal_balance: str,
    acting_user_id: int | None = None,
    reporting_taxonomy_line_id: int | None = None,
) -> tuple[Account, ImportLine]:
    """
    Create a new Account from an unmapped ImportLine and immediately map it.
    Never silently creates accounts — caller must explicitly invoke this.
    """
    batch = _get_or_raise(db, batch_id)
    if account_type not in ("asset", "liability", "equity", "revenue", "expense"):
        raise ImportBatchError(f"Invalid account_type: '{account_type}'")
    if normal_balance not in ("debit", "credit"):
        raise ImportBatchError(f"Invalid normal_balance: '{normal_balance}'")

    # Check for duplicate account number
    existing = _find_account(db, batch.entity_id, account_number)
    if existing:
        raise ImportBatchError(
            f"Account '{account_number}' already exists (id={existing.id}). "
            "Use map_line_to_account to assign it."
        )

    account = Account(
        account_number=account_number,
        account_name=account_name,
        account_type=account_type,
        normal_balance=normal_balance,
        entity_id=batch.entity_id,
        reporting_taxonomy_line_id=reporting_taxonomy_line_id,
    )
    db.add(account)
    db.flush()

    line = map_line_to_account(db, batch_id, line_id, account.id, acting_user_id)
    return account, line


def get_unmapped_lines(db: Session, batch_id: int) -> list[ImportLine]:
    """Return all unmapped lines for a batch, with suggested accounts attached."""
    return (
        db.query(ImportLine)
        .filter(
            ImportLine.batch_id == batch_id,
            ImportLine.mapping_status == "unmapped",
        )
        .order_by(ImportLine.line_number)
        .all()
    )


def suggest_mappings(
    db: Session,
    batch_id: int,
) -> list[dict[str, Any]]:
    """
    Return suggested account mappings for all unmapped lines.
    Suggestions are computed on-the-fly (not stored here).
    """
    batch = _get_or_raise(db, batch_id)
    lines = get_unmapped_lines(db, batch_id)
    suggestions = []
    for line in lines:
        suggested = _suggest_account(
            db, batch.entity_id,
            line.raw_account_number or "",
            line.raw_account_name or "",
        )
        suggestions.append({
            "line_id": line.id,
            "raw_account_number": line.raw_account_number,
            "raw_account_name": line.raw_account_name,
            "suggested_account_id": suggested.id if suggested else None,
            "suggested_account_number": suggested.account_number if suggested else None,
            "suggested_account_name": suggested.account_name if suggested else None,
        })
    return suggestions


# ---------------------------------------------------------------------------
# Validation engine
# ---------------------------------------------------------------------------

def validate_batch(db: Session, batch_id: int) -> ValidationResult:
    """
    Run all validations on a batch. Persists issues to ImportValidationIssue.
    Updates batch.status to 'ready_to_post' or 'validation_failed'.
    """
    batch = _get_or_raise(db, batch_id)
    if batch.status not in ("validating", "validation_failed", "ready_to_post", "mapping_required"):
        raise ImportBatchStateError(
            f"Cannot validate a batch with status '{batch.status}'"
        )

    # Clear stale issues from previous pass
    db.query(ImportValidationIssue).filter(
        ImportValidationIssue.batch_id == batch_id
    ).delete(synchronize_session=False)
    db.flush()

    result = ValidationResult()
    lines = db.query(ImportLine).filter(ImportLine.batch_id == batch_id).all()

    _validate_mapping_complete(result, lines)
    _validate_balance(result, lines)
    _validate_zero_amounts(result, lines)
    _validate_duplicate_upload(db, result, batch)
    _validate_closed_period(db, result, batch)
    _validate_duplicate_accounts(result, lines)
    _validate_sign_anomalies(db, result, lines, batch.entity_id)
    _validate_orphan_accounts(db, result, lines)
    _validate_retained_earnings_net_income(db, result, lines)

    # Persist issues
    for issue in result.issues:
        db.add(ImportValidationIssue(
            batch_id=batch_id,
            severity=issue.severity.value,
            code=issue.code,
            message=issue.message,
            field_name=issue.field_name,
            suggested_resolution=issue.suggested_resolution,
        ))

    # Update totals and status
    mapped_lines = [l for l in lines if l.mapping_status == "mapped"]
    batch.total_debits = sum(l.debit for l in mapped_lines)
    batch.total_credits = sum(l.credit for l in mapped_lines)
    batch.status = "validation_failed" if result.has_errors else "ready_to_post"
    db.flush()

    return result


def _validate_mapping_complete(result: ValidationResult, lines: list[ImportLine]) -> None:
    unmapped = [l for l in lines if l.mapping_status == "unmapped"]
    for line in unmapped:
        result.error(
            code="IMPORT_MISSING_MAPPING",
            message=f"Line {line.line_number}: account '{line.raw_account_number}' "
                    f"('{line.raw_account_name}') has no mapping. "
                    "Map or skip before posting.",
            source_type="import_line",
            source_id=line.id,
            field_name="account_number",
            suggested_resolution="Use the mapping workbench to assign this account.",
        )


def _validate_balance(result: ValidationResult, lines: list[ImportLine]) -> None:
    mapped = [l for l in lines if l.mapping_status == "mapped"]
    total_dr = sum(l.debit for l in mapped)
    total_cr = sum(l.credit for l in mapped)
    if mapped and total_dr != total_cr:
        diff = abs(total_dr - total_cr)
        result.error(
            code="IMPORT_UNBALANCED",
            message=f"Import does not balance: total debits={total_dr:,.2f}, "
                    f"total credits={total_cr:,.2f}, difference={diff:,.2f}.",
            source_type="import_batch",
            suggested_resolution="Check for missing or mis-mapped accounts.",
        )


def _validate_zero_amounts(result: ValidationResult, lines: list[ImportLine]) -> None:
    mapped = [l for l in lines if l.mapping_status == "mapped"]
    if not mapped:
        return
    total = sum(l.debit + l.credit for l in mapped)
    if total == Decimal("0"):
        result.error(
            code="IMPORT_ZERO_BALANCE",
            message="All mapped lines have zero amounts. "
                    "Verify that the file contains non-zero balances.",
            source_type="import_batch",
        )


def _validate_duplicate_upload(
    db: Session, result: ValidationResult, batch: ImportBatch
) -> None:
    existing = (
        db.query(ImportBatch)
        .filter(
            ImportBatch.content_hash == batch.content_hash,
            ImportBatch.entity_id == batch.entity_id,
            ImportBatch.id != batch.id,
            ImportBatch.status.in_(("ready_to_post", "posted")),
        )
        .first()
    )
    if existing:
        result.warning(
            code="IMPORT_DUPLICATE_UPLOAD",
            message=f"This file appears to have been imported before "
                    f"(batch id={existing.id}, status={existing.status}). "
                    "Verify this is not a duplicate submission.",
            source_type="import_batch",
            suggested_resolution="Review the prior import before proceeding.",
        )


def _validate_closed_period(
    db: Session, result: ValidationResult, batch: ImportBatch
) -> None:
    period = (
        db.query(AccountingPeriod)
        .filter(
            AccountingPeriod.entity_id == batch.entity_id,
            AccountingPeriod.start_date <= batch.as_of_date,
            AccountingPeriod.end_date >= batch.as_of_date,
            AccountingPeriod.is_closed == True,
        )
        .first()
    )
    if period:
        result.error(
            code="IMPORT_CLOSED_PERIOD",
            message=f"The as-of date {batch.as_of_date} falls within closed period "
                    f"'{period.period_name}'. Reopen the period or change the import date.",
            source_type="import_batch",
            field_name="as_of_date",
            suggested_resolution="Reopen the period or choose a different as-of date.",
        )


def _validate_duplicate_accounts(
    result: ValidationResult, lines: list[ImportLine]
) -> None:
    seen: dict[str, int] = {}
    for line in lines:
        if line.mapping_status != "mapped" or not line.raw_account_number:
            continue
        acct_num = line.raw_account_number
        if acct_num in seen:
            result.warning(
                code="IMPORT_DUPLICATE_ACCOUNT",
                message=f"Account '{acct_num}' appears on multiple rows "
                        f"(lines {seen[acct_num]} and {line.line_number}). "
                        "Amounts will be aggregated when posted.",
                source_type="import_line",
                source_id=line.id,
                field_name="account_number",
            )
        else:
            seen[acct_num] = line.line_number


def _validate_sign_anomalies(
    db: Session, result: ValidationResult, lines: list[ImportLine], entity_id: int
) -> None:
    for line in lines:
        if line.mapping_status != "mapped" or line.resolved_account_id is None:
            continue
        account = db.get(Account, line.resolved_account_id)
        if account is None:
            continue
        if account.normal_balance == "debit" and line.credit > Decimal("0") and line.debit == Decimal("0"):
            result.warning(
                code="IMPORT_SIGN_ANOMALY",
                message=f"Line {line.line_number}: account '{account.account_number}' "
                        f"({account.account_name}) is a debit-normal account but has a "
                        f"credit balance of {line.credit:,.2f}. Verify this is a contra balance.",
                source_type="import_line",
                source_id=line.id,
                suggested_resolution="Verify whether this account should have a normal or contra balance.",
            )
        elif account.normal_balance == "credit" and line.debit > Decimal("0") and line.credit == Decimal("0"):
            result.warning(
                code="IMPORT_SIGN_ANOMALY",
                message=f"Line {line.line_number}: account '{account.account_number}' "
                        f"({account.account_name}) is a credit-normal account but has a "
                        f"debit balance of {line.debit:,.2f}. Verify this is a contra balance.",
                source_type="import_line",
                source_id=line.id,
                suggested_resolution="Verify whether this account should have a normal or contra balance.",
            )


def _validate_orphan_accounts(
    db: Session, result: ValidationResult, lines: list[ImportLine]
) -> None:
    for line in lines:
        if line.mapping_status != "mapped" or line.resolved_account_id is None:
            continue
        mapping = (
            db.query(AccountMapping)
            .filter(AccountMapping.account_id == line.resolved_account_id)
            .first()
        )
        if mapping is None:
            account = db.get(Account, line.resolved_account_id)
            acct_label = account.account_number if account else str(line.resolved_account_id)
            result.info(
                code="IMPORT_ORPHAN_ACCOUNT",
                message=f"Line {line.line_number}: account '{acct_label}' has no "
                        "financial-statement mapping. It will be imported but won't appear "
                        "on financial statements until mapped.",
                source_type="import_line",
                source_id=line.id,
                suggested_resolution="Add an FS line mapping for this account.",
            )


def _validate_retained_earnings_net_income(
    db: Session, result: ValidationResult, lines: list[ImportLine]
) -> None:
    mapped_lines = [l for l in lines if l.mapping_status == "mapped" and l.resolved_account_id is not None]
    if not mapped_lines:
        return

    accounts_map = {
        acct.id: acct
        for acct in db.query(Account).filter(Account.id.in_([l.resolved_account_id for l in mapped_lines])).all()
    }

    total_rev_credit = Decimal("0")
    total_rev_debit = Decimal("0")
    total_exp_credit = Decimal("0")
    total_exp_debit = Decimal("0")
    equity_ni_lines = []

    for l in mapped_lines:
        acct = accounts_map.get(l.resolved_account_id)
        if not acct:
            continue
        if acct.account_type == "revenue":
            total_rev_credit += l.credit
            total_rev_debit += l.debit
        elif acct.account_type == "expense":
            total_exp_credit += l.credit
            total_exp_debit += l.debit
        elif acct.account_type == "equity":
            name = acct.account_name.lower()
            if any(kw in name for kw in ["net income", "current year earnings", "current year net income", "retained earnings"]):
                equity_ni_lines.append(l)

    pnl_net_income = (total_rev_credit - total_rev_debit) - (total_exp_debit - total_exp_credit)

    if equity_ni_lines:
        reported_equity_ni = sum(el.credit - el.debit for el in equity_ni_lines)
        if abs(pnl_net_income - reported_equity_ni) > Decimal("0.01"):
            result.warning(
                code="TB_NET_INCOME_MISMATCH",
                message=f"Calculated period Net Income from P&L ({pnl_net_income:,.2f}) does not match the reported equity Net Income/Retained Earnings lines ({reported_equity_ni:,.2f}).",
                source_type="import_batch",
                suggested_resolution="Check the mapping and amounts of your revenue, expense, and equity net income accounts.",
            )


# ---------------------------------------------------------------------------
# Posting
# ---------------------------------------------------------------------------

def post_batch(
    db: Session,
    batch_id: int,
    je_number: str,
    acting_user: Any = None,
    notes: str | None = None,
) -> ImportBatch:
    """
    Post a validated ImportBatch as a journal entry.

    Requires batch.status == 'ready_to_post'.
    Only mapped (non-skipped) lines are included.
    Aggregates duplicate accounts before posting.
    """
    batch = _get_or_raise(db, batch_id)
    if batch.status != "ready_to_post":
        raise ImportBatchStateError(
            f"Cannot post a batch with status '{batch.status}'. "
            "Run validation first and resolve all errors."
        )

    if (batch.unmapped_row_count or 0) > 0:
        raise ImportBatchStateError(
            f"Cannot post: {batch.unmapped_row_count} line(s) are still unmapped. "
            "Map or skip all lines before posting."
        )

    lines = (
        db.query(ImportLine)
        .filter(
            ImportLine.batch_id == batch_id,
            ImportLine.mapping_status == "mapped",
        )
        .all()
    )

    # Aggregate by account_id
    totals: dict[int, tuple[Account, Decimal, Decimal]] = {}
    for line in lines:
        if line.resolved_account_id is None:
            continue
        account = db.get(Account, line.resolved_account_id)
        if account is None:
            continue
        if line.resolved_account_id in totals:
            _, d, c = totals[line.resolved_account_id]
            totals[line.resolved_account_id] = (account, d + line.debit, c + line.credit)
        else:
            totals[line.resolved_account_id] = (account, line.debit, line.credit)

    if not totals:
        raise ImportBatchError("No mapped lines to post")

    je_lines = [
        JournalEntryLineCreate(
            line_number=i + 1,
            account_id=acct_id,
            entity_id=batch.entity_id,
            debit=d,
            credit=c,
        )
        for i, (acct_id, (_, d, c)) in enumerate(totals.items())
    ]

    je_data = JournalEntryCreate(
        je_number=je_number,
        entry_date=batch.as_of_date,
        entity_id=batch.entity_id,
        scenario_id=batch.scenario_id or 1,
        description=f"TB import: {batch.filename}",
        source="tb_import",
        source_ref=f"batch:{batch.id}",
        lines=je_lines,
    )

    je = post_journal_entry(db, je_data, acting_user=acting_user)

    batch.posted_je_id = je.id
    batch.status = "posted"
    if notes:
        batch.notes = notes
    batch.reviewed_by_user_id = getattr(acting_user, "id", None)
    batch.reviewed_at = datetime.datetime.now(datetime.UTC)
    db.flush()

    return batch


def rollback_batch(
    db: Session,
    batch_id: int,
    acting_user: Any = None,
    reversal_je_number: str | None = None,
) -> ImportBatch:
    """
    Reverse a posted ImportBatch by creating a reversing JE.
    After rollback the batch returns to 'rolled_back' status and can be
    remapped and reposted.
    """
    batch = _get_or_raise(db, batch_id)
    if batch.status != "posted":
        raise ImportBatchStateError(
            f"Cannot rollback a batch with status '{batch.status}'. Only 'posted' batches can be rolled back."
        )
    if batch.posted_je_id is None:
        raise ImportBatchError("Batch has no posted JE to reverse")

    # Determine reversal JE number
    if not reversal_je_number:
        orig_je = db.get(JournalEntry, batch.posted_je_id)
        reversal_je_number = f"REV-{orig_je.je_number}" if orig_je else f"REV-BATCH-{batch_id}"

    reversal_je = reverse_journal_entry(
        db,
        je_id=batch.posted_je_id,
        reversal_date=batch.as_of_date,
        je_number=reversal_je_number,
        description=f"Reversal of TB import batch {batch_id}: {batch.filename}",
        created_by=getattr(acting_user, "email", None),
        acting_user=acting_user,
    )

    batch.reversal_je_id = reversal_je.id
    batch.status = "rolled_back"
    db.flush()

    return batch


# ---------------------------------------------------------------------------
# Queries
# ---------------------------------------------------------------------------

def get_batch(db: Session, batch_id: int) -> ImportBatch:
    return _get_or_raise(db, batch_id)


def list_batches(
    db: Session,
    organization_id: int,
    entity_id: int | None = None,
    status: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> list[ImportBatch]:
    q = db.query(ImportBatch).filter(ImportBatch.organization_id == organization_id)
    if entity_id is not None:
        q = q.filter(ImportBatch.entity_id == entity_id)
    if status:
        q = q.filter(ImportBatch.status == status)
    return q.order_by(ImportBatch.uploaded_at.desc()).offset(offset).limit(limit).all()


def get_batch_lines(
    db: Session,
    batch_id: int,
    mapping_status: str | None = None,
) -> list[ImportLine]:
    q = db.query(ImportLine).filter(ImportLine.batch_id == batch_id)
    if mapping_status:
        q = q.filter(ImportLine.mapping_status == mapping_status)
    return q.order_by(ImportLine.line_number).all()


def get_batch_issues(
    db: Session,
    batch_id: int,
    severity: str | None = None,
) -> list[ImportValidationIssue]:
    q = db.query(ImportValidationIssue).filter(ImportValidationIssue.batch_id == batch_id)
    if severity:
        q = q.filter(ImportValidationIssue.severity == severity.upper())
    return q.order_by(ImportValidationIssue.severity, ImportValidationIssue.id).all()


def list_templates(db: Session, organization_id: int) -> list[ImportTemplate]:
    return (
        db.query(ImportTemplate)
        .filter(
            ImportTemplate.organization_id == organization_id,
            ImportTemplate.is_active == True,
        )
        .order_by(ImportTemplate.name)
        .all()
    )


def create_template(
    db: Session,
    organization_id: int,
    name: str,
    source_format: str,
    column_mapping: dict[str, str],
    description: str | None = None,
    created_by_user_id: int | None = None,
) -> ImportTemplate:
    tmpl = ImportTemplate(
        organization_id=organization_id,
        name=name,
        description=description,
        source_format=source_format,
        column_mapping=column_mapping,
        created_by_user_id=created_by_user_id,
    )
    db.add(tmpl)
    db.flush()
    return tmpl


def delete_batch(db: Session, batch_id: int) -> None:
    """Hard-delete a non-posted import batch and all its lines/issues."""
    batch = db.get(ImportBatch, batch_id)
    if not batch:
        raise ImportBatchNotFoundError(f"Batch {batch_id} not found")
    if batch.status == "posted":
        raise ImportBatchStateError("Cannot delete a posted batch — rollback first")
    db.delete(batch)
    db.flush()


def delete_template(db: Session, template_id: int) -> None:
    tmpl = db.get(ImportTemplate, template_id)
    if tmpl:
        tmpl.is_active = False
        db.flush()


# ---------------------------------------------------------------------------
# M27 — sheet detection, raw preview, mapping export
# ---------------------------------------------------------------------------

# Scoring keywords for TB-likely sheet names
_TB_SHEET_KEYWORDS = {
    "tb": 10, "trial balance": 10, "trial_balance": 10,
    "gl": 8, "general ledger": 8,
    "balance sheet": 6, "bs": 5,
    "p&l": 5, "pl": 4, "income": 4, "profit": 4,
    "coa": 3, "chart": 3, "accounts": 3,
    "data": 1, "export": 1,
}


def _score_sheet_name(name: str) -> int:
    lower = name.lower().strip()
    for kw, score in _TB_SHEET_KEYWORDS.items():
        if kw in lower:
            return score
    return 0


def detect_file(file_content: bytes, filename: str) -> dict[str, Any]:
    """
    Parse a file without creating any DB records.

    Returns a detection result dict with:
      - source_format: detected format string
      - sheets: list of {name, row_count, likely_tb_score} (XLSX only)
      - selected_sheet: name of highest-scoring sheet (XLSX) or None
      - headers: list of detected column headers
      - detected_mapping: {standard_field → source_column_header}
      - unmapped_headers: headers not matched to any standard field
      - preview_rows: first 5 rows as list[dict]
      - confidence: 0-100 mapping confidence score
    """
    if len(file_content) == 0:
        raise ImportBatchError("File is empty")

    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else "csv"

    sheets: list[dict[str, Any]] = []
    selected_sheet: str | None = None
    headers: list[str] = []
    raw_rows: list[dict[str, str]] = []

    if ext in ("xlsx", "xls"):
        try:
            import openpyxl
        except ImportError:
            raise ImportBatchError("openpyxl required for XLSX detection")

        wb = openpyxl.load_workbook(io.BytesIO(file_content), read_only=True, data_only=True)
        best_score = -1

        for sheet_name in wb.sheetnames:
            ws = wb[sheet_name]
            score = _score_sheet_name(sheet_name)
            sh_raw_rows: list[list[str]] = []
            sh_row_count = 0
            for row in ws.iter_rows(min_col=1, values_only=True):
                cells = [str(c).strip() if c is not None else "" for c in row]
                sh_row_count += 1
                if len(sh_raw_rows) < 50:
                    sh_raw_rows.append(cells)
            # Normalize all rows to same width, preserve blank cols
            max_cols = max((len(r) for r in sh_raw_rows), default=0)
            sh_raw_rows = [r + [""] * max(0, max_cols - len(r)) for r in sh_raw_rows]
            # Auto-detect header row (first non-empty)
            auto_header_row_idx = 0
            sh_headers: list[str] = []
            for i, cells in enumerate(sh_raw_rows):
                if any(cells):
                    auto_header_row_idx = i
                    sh_headers = list(cells)
                    break
            # Build preview rows (dict) from rows after header
            sh_rows: list[dict[str, str]] = []
            from openpyxl.utils import get_column_letter
            for cells in sh_raw_rows[auto_header_row_idx + 1:]:
                if any(cells):
                    row_dict = {}
                    for col_idx, val in enumerate(cells):
                        letter = get_column_letter(col_idx + 1)
                        row_dict[letter] = val
                        if col_idx < len(sh_headers):
                            hdr = sh_headers[col_idx]
                            if hdr:
                                row_dict[hdr] = val
                    sh_rows.append(row_dict)
                    if len(sh_rows) >= 5:
                        break
            sheets.append({
                "name": sheet_name,
                "row_count": sh_row_count,
                "likely_tb_score": score,
                "headers": sh_headers,
                "preview_rows": sh_rows,
                "detected_mapping": auto_detect_column_mapping(sh_headers),
                "raw_rows": sh_raw_rows,
                "auto_header_row_idx": auto_header_row_idx,
            })
            if score > best_score:
                best_score = score
                selected_sheet = sheet_name

        if selected_sheet:
            sheet_data = next((s for s in sheets if s["name"] == selected_sheet), None)
            if sheet_data:
                headers = sheet_data["headers"]
                raw_rows = sheet_data["preview_rows"]
        wb.close()
    else:
        headers, all_rows = _parse_csv_file(file_content)
        raw_rows = all_rows[:5]
        sheets = []

    source_format = detect_source_format(filename, headers)
    detected_mapping = auto_detect_column_mapping(headers)
    unmapped_headers = [h for h in headers if h not in detected_mapping.values()]

    # Confidence: each mapped standard field adds to score
    essential = {"account_number", "debit", "credit"} | {"account_number", "balance"}
    mapped_fields = set(detected_mapping.keys())
    has_amounts = ("debit" in mapped_fields and "credit" in mapped_fields) or "balance" in mapped_fields
    has_account = "account_number" in mapped_fields or "account_name" in mapped_fields
    confidence = 0
    if has_account:
        confidence += 40
    if has_amounts:
        confidence += 40
    if "account_name" in mapped_fields:
        confidence += 10
    if "description" in mapped_fields:
        confidence += 10

    return {
        "source_format": source_format,
        "sheets": sheets,
        "selected_sheet": selected_sheet,
        "headers": headers,
        "detected_mapping": detected_mapping,
        "unmapped_headers": unmapped_headers,
        "preview_rows": raw_rows,
        "confidence": confidence,
    }


def get_raw_preview(db: Session, batch_id: int, limit: int = 50) -> dict[str, Any]:
    """
    Return a preview of the first N import lines for spreadsheet display.

    Returns:
      - headers: standard fields that appear in this batch
      - source_headers: original column headers (from batch.raw_headers or column_mapping values)
      - column_mapping: {standard_field → source_column}
      - rows: list of dicts with raw_* fields and resolved account info
      - total_rows: total row count
    """
    batch = _get_or_raise(db, batch_id)
    lines = (
        db.query(ImportLine)
        .filter(ImportLine.batch_id == batch_id)
        .order_by(ImportLine.line_number)
        .limit(limit)
        .all()
    )

    col_map: dict[str, str] = batch.column_mapping or {}
    source_headers: list[str] = batch.raw_headers or list(col_map.values())

    rows = []
    for line in lines:
        row: dict[str, Any] = {
            "line_number": line.line_number,
            "raw_account_number": line.raw_account_number,
            "raw_account_name": line.raw_account_name,
            "raw_debit": str(line.raw_debit) if line.raw_debit is not None else None,
            "raw_credit": str(line.raw_credit) if line.raw_credit is not None else None,
            "raw_balance": str(line.raw_balance) if line.raw_balance is not None else None,
            "raw_description": line.raw_description,
            "debit": str(line.debit),
            "credit": str(line.credit),
            "mapping_status": line.mapping_status,
            "resolved_account_id": line.resolved_account_id,
            "suggested_account_id": line.suggested_account_id,
        }
        rows.append(row)

    return {
        "batch_id": batch_id,
        "source_format": batch.source_format,
        "column_mapping": col_map,
        "source_headers": source_headers,
        "rows": rows,
        "total_rows": batch.row_count or 0,
        "showing": len(rows),
    }


def export_mappings_csv(db: Session, batch_id: int) -> str:
    """
    Export the current line-to-account mappings as a CSV string.

    Columns: line_number, raw_account_number, raw_account_name,
             debit, credit, mapping_status, resolved_account_id,
             resolved_account_number, resolved_account_name
    """
    batch = _get_or_raise(db, batch_id)
    lines = (
        db.query(ImportLine)
        .filter(ImportLine.batch_id == batch_id)
        .order_by(ImportLine.line_number)
        .all()
    )

    # Build account lookup for resolved lines
    acct_ids = [l.resolved_account_id for l in lines if l.resolved_account_id]
    accounts: dict[int, Account] = {}
    if acct_ids:
        for acct in db.query(Account).filter(Account.id.in_(acct_ids)).all():
            accounts[acct.id] = acct

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "line_number", "raw_account_number", "raw_account_name",
        "debit", "credit", "mapping_status",
        "resolved_account_id", "resolved_account_number", "resolved_account_name",
    ])
    for line in lines:
        acct = accounts.get(line.resolved_account_id) if line.resolved_account_id else None
        writer.writerow([
            line.line_number,
            line.raw_account_number or "",
            line.raw_account_name or "",
            str(line.debit),
            str(line.credit),
            line.mapping_status,
            line.resolved_account_id or "",
            acct.account_number if acct else "",
            acct.account_name if acct else "",
        ])

    return output.getvalue()


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _get_or_raise(db: Session, batch_id: int) -> ImportBatch:
    batch = db.get(ImportBatch, batch_id)
    if batch is None:
        raise ImportBatchNotFoundError(f"ImportBatch {batch_id} not found")
    return batch
