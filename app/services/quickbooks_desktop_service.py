"""QuickBooks Desktop import parsers — IIF and Excel export formats."""
from __future__ import annotations

import io
import csv
from decimal import Decimal, InvalidOperation
from typing import Any

from app.services.quickbooks_service import QB_ACCOUNT_TYPE_MAP


def _apply_taxonomy(account_type: str) -> dict[str, str | None]:
    mapping = QB_ACCOUNT_TYPE_MAP.get(account_type, {})
    return {
        "account_type": mapping.get("account_type"),
        "fs_statement": mapping.get("fs_statement"),
        "fs_section": mapping.get("fs_section"),
    }


def parse_iif_file(content: bytes) -> list[dict[str, Any]]:
    """
    Parse a QuickBooks IIF (Intuit Interchange Format) file.

    IIF files are tab-delimited. Each record type is introduced by a header
    row starting with '!' (e.g. !ACCNT, !TRNS, !SPL).  The parser collects
    !ACCNT rows for Chart-of-Accounts data and !TRNS/!SPL for transactions.

    Returns a list of dicts with normalised fields ready for upsert.
    """
    text = content.decode("utf-8", errors="replace")
    lines = text.splitlines()

    result: list[dict[str, Any]] = []
    current_headers: list[str] = []
    current_type: str = ""

    for line in lines:
        if not line.strip():
            continue
        parts = line.split("\t")
        tag = parts[0].strip().upper()

        if tag.startswith("!"):
            current_type = tag[1:]
            current_headers = [p.strip().upper() for p in parts[1:]]
            continue

        if tag == current_type and current_type in ("ACCNT", "TRNS", "SPL"):
            row = dict(zip(current_headers, [p.strip() for p in parts[1:]]))
            if current_type == "ACCNT":
                result.append(_parse_iif_account(row))
            elif current_type == "TRNS":
                result.append(_parse_iif_transaction(row))

    return [r for r in result if r]


def _parse_iif_account(row: dict[str, str]) -> dict[str, Any]:
    acct_type = row.get("ACCNTTYPE", "")
    taxonomy = _apply_taxonomy(acct_type)
    return {
        "record_type": "account",
        "account_number": row.get("REFNUM") or row.get("ACCNUM") or None,
        "account_name": row.get("NAME") or "",
        "account_type_raw": acct_type,
        **taxonomy,
        "description": row.get("DESC") or None,
        "is_active": row.get("HIDDEN", "N").upper() != "Y",
    }


def _parse_iif_transaction(row: dict[str, str]) -> dict[str, Any]:
    try:
        amount = Decimal(row.get("AMOUNT", "0").replace(",", ""))
    except InvalidOperation:
        amount = Decimal("0")

    return {
        "record_type": "transaction",
        "date": row.get("DATE") or None,
        "account_name": row.get("ACCNT") or "",
        "memo": row.get("MEMO") or None,
        "amount": float(amount),
        "docnum": row.get("DOCNUM") or None,
        "trns_type": row.get("TRNSTYPE") or None,
    }


# ---------------------------------------------------------------------------
# Excel parser (QBD exported .xlsx / .xls)
# ---------------------------------------------------------------------------

# Column name variants used by QBD Excel exports
_ACCOUNT_COL_VARIANTS = {"account", "account name", "account number", "name"}
_DEBIT_COL_VARIANTS = {"debit", "dr", "debits"}
_CREDIT_COL_VARIANTS = {"credit", "cr", "credits"}
_AMOUNT_COL_VARIANTS = {"amount", "balance", "ending balance"}
_TYPE_COL_VARIANTS = {"type", "account type", "acct type"}


def parse_qbd_excel(content: bytes) -> list[dict[str, Any]]:
    """
    Parse a QuickBooks Desktop Excel export (.xlsx or .xls).

    Detects headers by scanning rows for known column names, then extracts
    account/transaction rows.  Applies QB_ACCOUNT_TYPE_MAP to any recognised
    account-type column values.

    Returns the same shape as parse_iif_file().
    """
    try:
        import openpyxl  # type: ignore[import-untyped]
    except ImportError:
        raise RuntimeError(
            "openpyxl is required for Excel parsing. Install it with: pip install openpyxl"
        )

    wb = openpyxl.load_workbook(io.BytesIO(content), data_only=True)
    ws = wb.active

    rows = list(ws.iter_rows(values_only=True))
    if not rows:
        return []

    # Find header row (first row that contains recognisable column names)
    header_row_idx = 0
    headers: list[str] = []
    for i, row in enumerate(rows):
        normalised = [str(c).strip().lower() if c is not None else "" for c in row]
        if any(n in _ACCOUNT_COL_VARIANTS or n in _DEBIT_COL_VARIANTS for n in normalised):
            headers = normalised
            header_row_idx = i
            break

    if not headers:
        # Fallback: use first row
        headers = [str(c).strip().lower() if c is not None else f"col{j}" for j, c in enumerate(rows[0])]
        header_row_idx = 0

    def _find_col(*variants: set[str]) -> int | None:
        for v_set in variants:
            for j, h in enumerate(headers):
                if h in v_set:
                    return j
        return None

    acct_col = _find_col(_ACCOUNT_COL_VARIANTS)
    debit_col = _find_col(_DEBIT_COL_VARIANTS)
    credit_col = _find_col(_CREDIT_COL_VARIANTS)
    amount_col = _find_col(_AMOUNT_COL_VARIANTS)
    type_col = _find_col(_TYPE_COL_VARIANTS)

    result: list[dict[str, Any]] = []

    for row in rows[header_row_idx + 1 :]:
        if all(c is None for c in row):
            continue

        def _cell(idx: int | None) -> str:
            if idx is None or idx >= len(row):
                return ""
            v = row[idx]
            return str(v).strip() if v is not None else ""

        account_name = _cell(acct_col)
        if not account_name:
            continue

        acct_type_raw = _cell(type_col)
        taxonomy = _apply_taxonomy(acct_type_raw)

        def _decimal(idx: int | None) -> float:
            raw = _cell(idx).replace(",", "").replace("$", "")
            try:
                return float(Decimal(raw)) if raw else 0.0
            except InvalidOperation:
                return 0.0

        debit = _decimal(debit_col)
        credit = _decimal(credit_col)
        amount = _decimal(amount_col) if amount_col is not None else (debit - credit)

        result.append({
            "record_type": "account",
            "account_name": account_name,
            "account_number": None,
            "account_type_raw": acct_type_raw,
            **taxonomy,
            "debit": debit,
            "credit": credit,
            "amount": amount,
        })

    return result
