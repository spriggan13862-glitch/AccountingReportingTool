"""
COA import service — parses QuickBooks-style and generic COA exports.

Supported formats
-----------------
Format A (QB full export):
    Account Name, Type, Detail Type, Description, Balance Total, Account #, Tax Line

Format B (QB simplified):
    Account Name, Type, Detail Type, Total

Format C (Generic with account number):
    Account Number, Account Name, Account Type [, Detail Type]

Format D (Combined account/name):
    Account, Type  (where Account = "1000 - Cash")

Hierarchy
---------
QuickBooks indents sub-accounts with leading spaces (2 or 4 per level).
The parser normalises these into parent_account_id references.
"""
from __future__ import annotations

import csv
import io
import json
import re
from typing import Any

from app.services.reporting_taxonomy_service import (
    CODE_TO_NAME,
    get_suggested_taxonomy_code,
    get_taxonomy_id_for_account,
)

# QB account type → internal account_type mapping
QB_TYPE_MAP: dict[str, str] = {
    "bank":                             "asset",
    "accounts receivable":              "asset",
    "accounts receivable (a/r)":        "asset",
    "other current assets":             "asset",
    "other current asset":              "asset",
    "fixed assets":                     "asset",
    "fixed asset":                      "asset",
    "other assets":                     "asset",
    "other asset":                      "asset",
    "accounts payable":                 "liability",
    "accounts payable (a/p)":           "liability",
    "credit card":                      "liability",
    "other current liabilities":        "liability",
    "other current liability":          "liability",
    "long term liabilities":            "liability",
    "long-term liabilities":            "liability",
    "equity":                           "equity",
    "income":                           "revenue",
    "other income":                     "revenue",
    "revenue":                          "revenue",          # generic type in Format-C COA imports
    "cost of goods sold":               "expense",
    "expenses":                         "expense",
    "expense":                          "expense",
    "other expenses":                   "expense",
    "other expense":                    "expense",
}

NORMAL_BALANCE_MAP: dict[str, str] = {
    "asset":     "debit",
    "liability": "credit",
    "equity":    "credit",
    "revenue":   "credit",
    "expense":   "debit",
}


def _detect_column(headers: list[str], candidates: list[str]) -> str | None:
    """Return the first header that matches any candidate (case-insensitive).

    Checks exact match first, then candidate-as-substring-of-header.
    Deliberately avoids header-in-candidate to prevent "type" matching "detail type".
    """
    hl = [h.lower().strip() for h in headers]
    # Exact match pass
    for cand in candidates:
        cl = cand.lower()
        for i, h in enumerate(hl):
            if cl == h:
                return headers[i]
    # Candidate-in-header substring pass (candidate is the longer, more specific string)
    for cand in candidates:
        cl = cand.lower()
        for i, h in enumerate(hl):
            if cl in h:
                return headers[i]
    return None


def _strip_account_number(raw: str) -> tuple[str, str]:
    """
    Split combined "1000 - Cash" or "Cash (1000)" into (number, name).
    Returns ("", raw) if no number detected.
    """
    m = re.match(r"^(\d[\w\-.]*)\s*[-–—]\s*(.+)$", raw.strip())
    if m:
        return m.group(1).strip(), m.group(2).strip()
    m2 = re.match(r"^(.+?)\s*\((\d[\w\-.]*)\)$", raw.strip())
    if m2:
        return m2.group(2).strip(), m2.group(1).strip()
    return "", raw.strip()


def _find_parent_by_account_number(acct_num: str, num_to_row: dict[str, dict]) -> dict | None:
    """Find parent account by account number pattern matching.

    Priority: dash-separated prefix → dot-separated prefix → numeric truncation.
    """
    if "-" in acct_num:
        prefix = acct_num.rsplit("-", 1)[0]
        if prefix in num_to_row:
            return num_to_row[prefix]
    if "." in acct_num:
        prefix = acct_num.rsplit(".", 1)[0]
        if prefix in num_to_row:
            return num_to_row[prefix]
    if acct_num.isdigit() and len(acct_num) >= 4:
        for cut in range(1, len(acct_num) - 1):
            prefix = acct_num[:-cut] + "0" * cut
            if prefix != acct_num and prefix in num_to_row:
                return num_to_row[prefix]
    return None


def _infer_type(raw_type: str) -> str:
    """Map a raw QB type string to internal account_type."""
    t = raw_type.strip().lower()
    return QB_TYPE_MAP.get(t, "expense")  # default expense if unknown


def _parse_csv_rows(content: bytes) -> list[dict[str, str]]:
    text = content.decode("utf-8-sig", errors="replace")
    reader = csv.DictReader(io.StringIO(text))
    return [row for row in reader]


def _parse_xlsx_rows(content: bytes) -> list[dict[str, str]]:
    try:
        import openpyxl  # type: ignore
        wb = openpyxl.load_workbook(io.BytesIO(content), read_only=True, data_only=True)
        ws = wb.active
        rows = list(ws.iter_rows(values_only=True))
        if not rows:
            return []
        headers = [str(c).strip() if c is not None else "" for c in rows[0]]
        result = []
        for row in rows[1:]:
            if all(c is None for c in row):
                continue
            result.append({
                headers[i]: (str(v).strip() if v is not None else "")
                for i, v in enumerate(row)
                if i < len(headers)
            })
        return result
    except ImportError:
        raise RuntimeError("openpyxl is required for XLSX import. Install it: pip install openpyxl")


def parse_coa_file(
    content: bytes,
    filename: str,
) -> dict[str, Any]:
    """
    Parse a COA file (CSV or XLSX). Returns a preview dict:
    {
        "source_system": "quickbooks" | "generic",
        "detected_columns": {...},
        "rows": [...AccountRowPreview...],
        "warnings": [...],
        "row_count": int,
    }
    """
    filename_lower = filename.lower()
    if filename_lower.endswith(".xlsx") or filename_lower.endswith(".xls"):
        raw_rows = _parse_xlsx_rows(content)
    else:
        raw_rows = _parse_csv_rows(content)

    if not raw_rows:
        return {"error": "File is empty or could not be parsed", "rows": [], "row_count": 0}

    headers = list(raw_rows[0].keys())
    warnings: list[str] = []

    # Detect columns
    col_name = _detect_column(headers, ["account name", "account", "name"])
    col_type = _detect_column(headers, ["type", "account type", "acct type"])
    col_detail = _detect_column(headers, ["detail type", "detail", "subtype"])
    col_number = _detect_column(headers, ["account #", "accnt. #", "acct #", "account number", "number"])
    col_desc = _detect_column(headers, ["description", "desc", "memo"])
    col_tax = _detect_column(headers, ["tax line", "tax"])

    source_system = "generic"
    if col_type and col_detail:
        source_system = "quickbooks"
    elif col_type and not col_number:
        source_system = "quickbooks_simplified"

    detected_cols = {
        "account_name": col_name,
        "account_type": col_type,
        "detail_type": col_detail,
        "account_number": col_number,
        "description": col_desc,
        "tax_line": col_tax,
    }

    # First pass: build indentation hierarchy from leading spaces in name
    account_rows: list[dict[str, Any]] = []
    indent_stack: list[tuple[int, int]] = []  # (indent_level, row_index)

    for idx, row in enumerate(raw_rows):
        raw_name = (row.get(col_name, "") if col_name else "") or ""

        # Measure indentation (leading spaces)
        indent = len(raw_name) - len(raw_name.lstrip(" "))
        clean_name = raw_name.strip()
        if not clean_name:
            continue

        # Extract account number
        raw_number = (row.get(col_number, "") if col_number else "") or ""
        acct_num = raw_number.strip()

        # If no separate number column, try to split from name
        if not acct_num:
            acct_num, clean_name = _strip_account_number(clean_name)

        raw_type = (row.get(col_type, "") if col_type else "") or ""
        detail_type = (row.get(col_detail, "") if col_detail else "") or ""
        description = (row.get(col_desc, "") if col_desc else "") or ""
        tax_line = (row.get(col_tax, "") if col_tax else "") or ""

        account_type = _infer_type(raw_type) if raw_type else None
        normal_balance = NORMAL_BALANCE_MAP.get(account_type or "", "debit")

        # Determine parent from indentation stack
        parent_row_idx: int | None = None
        while indent_stack and indent_stack[-1][0] >= indent:
            indent_stack.pop()
        if indent_stack:
            parent_row_idx = indent_stack[-1][1]
        indent_stack.append((indent, len(account_rows)))

        clean_tax_line = tax_line.strip() or None
        clean_detail_type = detail_type.strip() or None
        suggested_code, source_evidence = get_suggested_taxonomy_code(
            account_type=raw_type.strip() or None,
            tax_line=clean_tax_line,
            detail_type=clean_detail_type,
            account_name=clean_name,
        )
        suggested_reporting_line = CODE_TO_NAME.get(suggested_code) if suggested_code else None

        account_rows.append({
            "row_index": idx,
            "account_number": acct_num,
            "account_name": clean_name,
            "raw_type": raw_type,
            "account_type": account_type,
            "normal_balance": normal_balance,
            "detail_type": clean_detail_type,
            "description": description.strip() or None,
            "tax_line": clean_tax_line,
            "suggested_reporting_line": suggested_reporting_line,
            "source_evidence": source_evidence,
            "indent": indent,
            "parent_row_idx": parent_row_idx,
            # will be filled in second pass
            "parent_account_number": None,
            "parent_account_name": None,
            "hierarchy_depth": 0,
        })

    if not account_rows:
        warnings.append("No account rows detected — verify column headers match expected format.")

    # -----------------------------------------------------------------------
    # Second pass: account-number grouping parent detection + depth calculation
    # -----------------------------------------------------------------------
    num_to_row: dict[str, dict] = {
        r["account_number"]: r for r in account_rows if r["account_number"]
    }
    row_idx_to_row: dict[int, dict] = {r["row_index"]: r for r in account_rows}

    for row in account_rows:
        # Only fill parent_account_number/name from existing parent_row_idx (indentation)
        if row["parent_row_idx"] is not None:
            parent = row_idx_to_row.get(row["parent_row_idx"])
            if parent:
                row["parent_account_number"] = parent["account_number"]
                row["parent_account_name"] = parent["account_name"]
            continue

        # Try account number grouping if no indent-based parent found
        acct_num = row["account_number"]
        if not acct_num:
            continue

        parent_row = _find_parent_by_account_number(acct_num, num_to_row)
        if parent_row and parent_row["row_index"] != row["row_index"]:
            row["parent_row_idx"] = parent_row["row_index"]
            row["parent_account_number"] = parent_row["account_number"]
            row["parent_account_name"] = parent_row["account_name"]

    # Compute hierarchy_depth (BFS from roots)
    for row in account_rows:
        depth = 0
        current = row
        visited: set[int] = set()
        while current["parent_row_idx"] is not None:
            parent_idx = current["parent_row_idx"]
            if parent_idx in visited:
                break  # cycle guard
            visited.add(parent_idx)
            current = row_idx_to_row.get(parent_idx, {})
            if not current:
                break
            depth += 1
        row["hierarchy_depth"] = depth

    return {
        "source_system": source_system,
        "detected_columns": detected_cols,
        "rows": account_rows,
        "row_count": len(account_rows),
        "warnings": warnings,
        "raw_headers": headers,
    }


def apply_coa_import(
    parsed: dict[str, Any],
    entity_id: int,
    db: "Session",
    overrides: dict[int, int] | None = None,
) -> tuple[int, int]:
    """
    Create or update Account records from parsed COA preview.

    overrides: optional mapping of row_index → reporting_taxonomy_line_id that
               the user has manually selected in the preview UI.
    Returns (accounts_created, accounts_updated).
    """
    from sqlalchemy.orm import Session
    from app.models.account import Account
    from app.services.reporting_taxonomy_service import get_taxonomy_id_for_account

    rows = parsed.get("rows", [])
    source_system = parsed.get("source_system", "generic")

    # Build row_index → db_account.id for parent resolution
    row_to_acct_id: dict[int, int] = {}
    created = 0
    updated = 0

    for row in rows:
        acct_num = row["account_number"]
        acct_name = row["account_name"]
        acct_type = row["account_type"] or "expense"
        normal_balance = row["normal_balance"]
        detail_type = row.get("detail_type")
        description = row.get("description")
        tax_line = row.get("tax_line")
        parent_row_idx = row.get("parent_row_idx")

        parent_account_id: int | None = None
        if parent_row_idx is not None:
            parent_account_id = row_to_acct_id.get(parent_row_idx)

        # Taxonomy resolution order: user override > evidence hierarchy
        row_index = row["row_index"]
        if overrides and row_index in overrides:
            taxonomy_id = overrides[row_index]
        else:
            taxonomy_id, _ = get_taxonomy_id_for_account(
                account_type=row.get("raw_type") or acct_type,
                tax_line=tax_line,
                detail_type=detail_type,
                account_name=acct_name,
                db=db,
            )

        # Try to match existing by (entity_id, account_number) if number present
        existing: Account | None = None
        if acct_num:
            existing = (
                db.query(Account)
                .filter(Account.entity_id == entity_id, Account.account_number == acct_num)
                .first()
            )

        if existing:
            existing.account_name = acct_name
            existing.account_type = acct_type
            existing.normal_balance = normal_balance
            if detail_type:
                existing.detail_type = detail_type
            if description:
                existing.description = description
            if tax_line:
                existing.tax_line = tax_line
            if taxonomy_id:
                existing.reporting_taxonomy_line_id = taxonomy_id
            existing.source_system = source_system
            if parent_account_id:
                existing.parent_account_id = parent_account_id
            db.flush()
            row_to_acct_id[row["row_index"]] = existing.id
            updated += 1
        else:
            # Generate account number if missing
            if not acct_num:
                acct_num = f"AUTO-{row['row_index'] + 1:04d}"
            new_acct = Account(
                entity_id=entity_id,
                account_number=acct_num,
                account_name=acct_name,
                account_type=acct_type,
                normal_balance=normal_balance,
                detail_type=detail_type,
                description=description,
                tax_line=tax_line,
                source_system=source_system,
                reporting_taxonomy_line_id=taxonomy_id,
                parent_account_id=parent_account_id,
            )
            db.add(new_acct)
            db.flush()
            row_to_acct_id[row["row_index"]] = new_acct.id
            created += 1

    return created, updated
