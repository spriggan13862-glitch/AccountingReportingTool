"""QuickBooks Online integration service.

OAuth 2.0 flow + QBO REST API v3. Token storage uses Fernet symmetric encryption
keyed from the QB_ENCRYPTION_KEY env var. If the key is absent, tokens are stored
in plain-text (development only).
"""
from __future__ import annotations

import json
import os
import urllib.parse
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Any

import httpx
from sqlalchemy.orm import Session

from app.models.account import Account
from app.models.import_batch import ImportBatch
from app.models.import_line import ImportLine
from app.models.quickbooks_connection import QuickBooksConnection

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

QB_CLIENT_ID = os.getenv("QB_CLIENT_ID", "")
QB_CLIENT_SECRET = os.getenv("QB_CLIENT_SECRET", "")
QB_REDIRECT_URI = os.getenv("QB_REDIRECT_URI", "http://localhost:8000/api/v1/quickbooks/callback")
QB_ENVIRONMENT = os.getenv("QB_ENVIRONMENT", "sandbox")
QB_ENCRYPTION_KEY = os.getenv("QB_ENCRYPTION_KEY", "")

_SANDBOX_BASE = "https://sandbox-quickbooks.api.intuit.com"
_PRODUCTION_BASE = "https://quickbooks.api.intuit.com"
_AUTH_BASE = "https://appcenter.intuit.com/connect/oauth2"
_TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer"
_REVOKE_URL = "https://developer.api.intuit.com/v2/oauth2/tokens/revoke"

_SCOPES = "com.intuit.quickbooks.accounting"


def _api_base() -> str:
    return _SANDBOX_BASE if QB_ENVIRONMENT == "sandbox" else _PRODUCTION_BASE


# ---------------------------------------------------------------------------
# Token encryption (optional — falls back to plain text if no key)
# ---------------------------------------------------------------------------

def _encrypt(value: str) -> str:
    if not QB_ENCRYPTION_KEY or not value:
        return value
    try:
        from cryptography.fernet import Fernet
        return Fernet(QB_ENCRYPTION_KEY.encode()).encrypt(value.encode()).decode()
    except Exception:
        return value


def _decrypt(value: str) -> str:
    if not QB_ENCRYPTION_KEY or not value:
        return value
    try:
        from cryptography.fernet import Fernet
        return Fernet(QB_ENCRYPTION_KEY.encode()).decrypt(value.encode()).decode()
    except Exception:
        return value


# ---------------------------------------------------------------------------
# QB AccountType → our taxonomy (auto-applied during COA pull)
# ---------------------------------------------------------------------------

QB_ACCOUNT_TYPE_MAP: dict[str, dict[str, str]] = {
    "Bank":                    {"account_type": "asset",        "fs_statement": "BalanceSheet",      "fs_section": "Current Assets"},
    "Accounts Receivable":     {"account_type": "asset",        "fs_statement": "BalanceSheet",      "fs_section": "Current Assets"},
    "Other Current Asset":     {"account_type": "asset",        "fs_statement": "BalanceSheet",      "fs_section": "Current Assets"},
    "Fixed Asset":             {"account_type": "asset",        "fs_statement": "BalanceSheet",      "fs_section": "Fixed Assets"},
    "Other Asset":             {"account_type": "asset",        "fs_statement": "BalanceSheet",      "fs_section": "Other Assets"},
    "Accounts Payable":        {"account_type": "liability",    "fs_statement": "BalanceSheet",      "fs_section": "Current Liabilities"},
    "Credit Card":             {"account_type": "liability",    "fs_statement": "BalanceSheet",      "fs_section": "Current Liabilities"},
    "Other Current Liability": {"account_type": "liability",    "fs_statement": "BalanceSheet",      "fs_section": "Current Liabilities"},
    "Long Term Liability":     {"account_type": "liability",    "fs_statement": "BalanceSheet",      "fs_section": "Long-Term Liabilities"},
    "Equity":                  {"account_type": "equity",       "fs_statement": "BalanceSheet",      "fs_section": "Equity"},
    "Income":                  {"account_type": "revenue",      "fs_statement": "IncomeStatement",   "fs_section": "Revenue"},
    "Cost of Goods Sold":      {"account_type": "cogs",         "fs_statement": "IncomeStatement",   "fs_section": "Cost of Revenue"},
    "Expense":                 {"account_type": "expense",      "fs_statement": "IncomeStatement",   "fs_section": "Operating Expenses"},
    "Other Income":            {"account_type": "other_income", "fs_statement": "IncomeStatement",   "fs_section": "Other Income"},
    "Other Expense":           {"account_type": "other_expense","fs_statement": "IncomeStatement",   "fs_section": "Other Expenses"},
}

_DEBIT_NORMAL = {"asset", "cogs", "expense", "other_expense"}


# ---------------------------------------------------------------------------
# OAuth helpers
# ---------------------------------------------------------------------------

def get_oauth_url(entity_id: int, org_id: int, redirect_uri: str | None = None) -> str:
    """Return the Intuit OAuth 2.0 authorization URL."""
    params = {
        "client_id": QB_CLIENT_ID,
        "scope": _SCOPES,
        "redirect_uri": redirect_uri or QB_REDIRECT_URI,
        "response_type": "code",
        "state": f"{entity_id}:{org_id}",
    }
    return f"{_AUTH_BASE}?" + urllib.parse.urlencode(params)


def exchange_code_for_tokens(
    code: str,
    realm_id: str,
    state: str,
    db: Session,
    redirect_uri: str | None = None,
) -> QuickBooksConnection:
    """Exchange an authorization code for access + refresh tokens, persist connection."""
    parts = state.split(":", 1)
    entity_id = int(parts[0])
    org_id = int(parts[1]) if len(parts) > 1 else 0

    response = httpx.post(
        _TOKEN_URL,
        data={
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": redirect_uri or QB_REDIRECT_URI,
        },
        auth=(QB_CLIENT_ID, QB_CLIENT_SECRET),
        headers={"Accept": "application/json"},
        timeout=15,
    )
    response.raise_for_status()
    token_data = response.json()

    company_name = _fetch_company_name(token_data["access_token"], realm_id)

    expires_at = datetime.utcnow() + timedelta(seconds=int(token_data.get("expires_in", 3600)))

    conn = db.query(QuickBooksConnection).filter_by(entity_id=entity_id, realm_id=realm_id).first()
    if not conn:
        conn = QuickBooksConnection(entity_id=entity_id, organization_id=org_id, realm_id=realm_id)
        db.add(conn)

    conn.access_token = _encrypt(token_data["access_token"])
    conn.refresh_token = _encrypt(token_data.get("refresh_token", ""))
    conn.token_expires_at = expires_at
    conn.company_name = company_name
    conn.status = "active"
    conn.connection_type = "online"
    db.commit()
    db.refresh(conn)
    return conn


def refresh_if_needed(conn: QuickBooksConnection, db: Session) -> QuickBooksConnection:
    """Refresh the access token if it expires within 5 minutes."""
    if conn.token_expires_at and conn.token_expires_at > datetime.utcnow() + timedelta(minutes=5):
        return conn

    response = httpx.post(
        _TOKEN_URL,
        data={
            "grant_type": "refresh_token",
            "refresh_token": _decrypt(conn.refresh_token or ""),
        },
        auth=(QB_CLIENT_ID, QB_CLIENT_SECRET),
        headers={"Accept": "application/json"},
        timeout=15,
    )
    response.raise_for_status()
    token_data = response.json()

    conn.access_token = _encrypt(token_data["access_token"])
    if "refresh_token" in token_data:
        conn.refresh_token = _encrypt(token_data["refresh_token"])
    conn.token_expires_at = datetime.utcnow() + timedelta(seconds=int(token_data.get("expires_in", 3600)))
    conn.status = "active"
    db.commit()
    db.refresh(conn)
    return conn


def _fetch_company_name(access_token: str, realm_id: str) -> str:
    try:
        url = f"{_api_base()}/v3/company/{realm_id}/companyinfo/{realm_id}?minorversion=65"
        resp = httpx.get(url, headers=_auth_headers(access_token), timeout=10)
        resp.raise_for_status()
        return resp.json().get("CompanyInfo", {}).get("CompanyName", "")
    except Exception:
        return ""


def _auth_headers(access_token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {access_token}", "Accept": "application/json"}


# ---------------------------------------------------------------------------
# COA pull
# ---------------------------------------------------------------------------

def pull_chart_of_accounts(conn: QuickBooksConnection, db: Session) -> dict:
    """Pull all QBO accounts and upsert into the Account table with auto-taxonomy."""
    conn = refresh_if_needed(conn, db)
    token = _decrypt(conn.access_token or "")

    url = f"{_api_base()}/v3/company/{conn.realm_id}/query"
    query = "SELECT * FROM Account MAXRESULTS 1000"
    resp = httpx.get(url, params={"query": query, "minorversion": "65"}, headers=_auth_headers(token), timeout=30)
    resp.raise_for_status()
    data = resp.json()

    accounts_raw = data.get("QueryResponse", {}).get("Account", [])
    created = 0
    updated = 0

    for qa in accounts_raw:
        tax_info = QB_ACCOUNT_TYPE_MAP.get(qa.get("AccountType", ""), {})
        acct_type = tax_info.get("account_type", "expense")
        normal_balance = "debit" if acct_type in _DEBIT_NORMAL else "credit"

        existing = db.query(Account).filter_by(
            entity_id=conn.entity_id,
            source_account_id=qa["Id"],
        ).first()

        if existing:
            existing.account_name = qa.get("Name", existing.account_name)
            existing.account_number = qa.get("AcctNum") or existing.account_number
            existing.account_type = acct_type
            existing.fs_statement = tax_info.get("fs_statement")
            existing.fs_section = tax_info.get("fs_section")
            existing.detail_type = qa.get("AccountSubType")
            existing.active = qa.get("Active", True)
            updated += 1
        else:
            acct = Account(
                entity_id=conn.entity_id,
                account_number=qa.get("AcctNum") or qa["Id"],
                account_name=qa.get("Name", ""),
                account_type=acct_type,
                normal_balance=normal_balance,
                fs_statement=tax_info.get("fs_statement"),
                fs_section=tax_info.get("fs_section"),
                detail_type=qa.get("AccountSubType"),
                source_system="quickbooks_online",
                source_account_id=qa["Id"],
                active=qa.get("Active", True),
                is_header=False,
                is_postable=True,
            )
            db.add(acct)
            created += 1

    conn.last_sync_at = datetime.utcnow()
    db.commit()
    return {"accounts_created": created, "accounts_updated": updated, "total": len(accounts_raw)}


# ---------------------------------------------------------------------------
# Trial Balance pull
# ---------------------------------------------------------------------------

def pull_trial_balance(conn: QuickBooksConnection, db: Session, end_date: date) -> ImportBatch:
    """Pull QB TrialBalance report and create a ready-to-post ImportBatch."""
    conn = refresh_if_needed(conn, db)
    token = _decrypt(conn.access_token or "")

    url = f"{_api_base()}/v3/company/{conn.realm_id}/reports/TrialBalance"
    resp = httpx.get(
        url,
        params={"end_date": end_date.isoformat(), "minorversion": "65"},
        headers=_auth_headers(token),
        timeout=30,
    )
    resp.raise_for_status()
    report = resp.json()

    rows = _parse_report_rows(report)

    batch = ImportBatch(
        organization_id=conn.organization_id,
        entity_id=conn.entity_id,
        filename=f"QuickBooks TB {end_date.isoformat()}",
        source_format="qbo",
        as_of_date=end_date,
        status="ready_to_post",
        row_count=len(rows),
        column_mapping={"account_number": "account_id", "account_name": "account_name", "debit": "debit", "credit": "credit"},
        raw_headers=["account_id", "account_name", "debit", "credit"],
        notes=f"Pulled from QuickBooks Online — {conn.company_name}",
    )
    db.add(batch)
    db.flush()

    total_debits = Decimal("0")
    total_credits = Decimal("0")
    mapped = 0

    for row in rows:
        debit = Decimal(str(row.get("debit", 0) or 0))
        credit = Decimal(str(row.get("credit", 0) or 0))
        total_debits += debit
        total_credits += credit

        acct = db.query(Account).filter_by(
            entity_id=conn.entity_id,
            source_account_id=row.get("account_id"),
        ).first()
        if acct:
            mapped += 1

        line = ImportLine(
            batch_id=batch.id,
            line_number=row.get("row_number", 0),
            raw_account_number=row.get("account_id", ""),
            raw_account_name=row.get("account_name", ""),
            raw_debit=debit or None,
            raw_credit=credit or None,
            debit=debit,
            credit=credit,
            resolved_account_id=acct.id if acct else None,
            mapping_status="mapped" if acct else "unmapped",
        )
        db.add(line)

    batch.total_debits = str(total_debits)
    batch.total_credits = str(total_credits)
    batch.mapped_row_count = mapped
    batch.unmapped_row_count = len(rows) - mapped
    if batch.unmapped_row_count > 0:
        batch.status = "mapping_required"

    db.commit()
    db.refresh(batch)
    return batch


def _parse_report_rows(report: dict) -> list[dict]:
    """Flatten QBO report nested Row structure into a list of account/debit/credit dicts."""
    rows: list[dict] = []
    row_num = 0

    def _walk(sections: list) -> None:
        nonlocal row_num
        for section in sections:
            if isinstance(section, dict):
                if section.get("type") == "Data":
                    cols = section.get("ColData", [])
                    if len(cols) >= 3:
                        account_val = cols[0].get("value", "")
                        account_id = cols[0].get("id", account_val)
                        debit_str = cols[1].get("value", "") or "0"
                        credit_str = cols[2].get("value", "") or "0"
                        try:
                            debit = float(debit_str.replace(",", ""))
                        except ValueError:
                            debit = 0.0
                        try:
                            credit = float(credit_str.replace(",", ""))
                        except ValueError:
                            credit = 0.0
                        if account_val and account_val not in ("Total", ""):
                            row_num += 1
                            rows.append({
                                "row_number": row_num,
                                "account_id": account_id,
                                "account_name": account_val,
                                "debit": debit,
                                "credit": credit,
                            })
                sub_rows = section.get("Rows", {})
                if sub_rows:
                    _walk(sub_rows.get("Row", []))

    top_rows = report.get("Rows", {}).get("Row", [])
    _walk(top_rows)
    return rows


# ---------------------------------------------------------------------------
# P&L and Balance Sheet pulls (returns structured data, not persisted)
# ---------------------------------------------------------------------------

def pull_pl_report(conn: QuickBooksConnection, db: Session, start_date: date, end_date: date) -> dict:
    """Pull QBO ProfitAndLoss report and return structured rows."""
    conn = refresh_if_needed(conn, db)
    token = _decrypt(conn.access_token or "")

    url = f"{_api_base()}/v3/company/{conn.realm_id}/reports/ProfitAndLoss"
    resp = httpx.get(
        url,
        params={"start_date": start_date.isoformat(), "end_date": end_date.isoformat(), "minorversion": "65"},
        headers=_auth_headers(token),
        timeout=30,
    )
    resp.raise_for_status()
    report = resp.json()
    return _parse_financial_report(report, "ProfitAndLoss", start_date, end_date)


def pull_balance_sheet(conn: QuickBooksConnection, db: Session, as_of_date: date) -> dict:
    """Pull QBO BalanceSheet report and return structured rows."""
    conn = refresh_if_needed(conn, db)
    token = _decrypt(conn.access_token or "")

    url = f"{_api_base()}/v3/company/{conn.realm_id}/reports/BalanceSheet"
    resp = httpx.get(
        url,
        params={"end_date": as_of_date.isoformat(), "minorversion": "65"},
        headers=_auth_headers(token),
        timeout=30,
    )
    resp.raise_for_status()
    report = resp.json()
    return _parse_financial_report(report, "BalanceSheet", as_of_date, as_of_date)


def _parse_financial_report(report: dict, report_type: str, start_date: date, end_date: date) -> dict:
    """Extract section rows from a QBO financial report into a flat list."""
    sections: list[dict] = []

    def _walk(rows: list, section_name: str = "", depth: int = 0) -> None:
        for row in rows:
            if not isinstance(row, dict):
                continue
            row_type = row.get("type", "")
            if row_type == "Section":
                header = row.get("Header", {})
                name = ""
                if header:
                    col_data = header.get("ColData", [])
                    name = col_data[0].get("value", "") if col_data else ""
                sub = row.get("Rows", {}).get("Row", [])
                _walk(sub, name or section_name, depth + 1)
                summary = row.get("Summary", {})
                if summary:
                    cols = summary.get("ColData", [])
                    if cols:
                        label = cols[0].get("value", f"Total {name}")
                        amount = cols[1].get("value", "0") if len(cols) > 1 else "0"
                        sections.append({"label": label, "amount": _to_float(amount), "is_total": True, "section": section_name, "depth": depth})
            elif row_type == "Data":
                cols = row.get("ColData", [])
                if cols:
                    label = cols[0].get("value", "")
                    amount = cols[1].get("value", "0") if len(cols) > 1 else "0"
                    if label:
                        sections.append({"label": label, "amount": _to_float(amount), "is_total": False, "section": section_name, "depth": depth})

    top_rows = report.get("Rows", {}).get("Row", [])
    _walk(top_rows)

    return {
        "report_type": report_type,
        "start_date": start_date.isoformat(),
        "end_date": end_date.isoformat(),
        "company_name": report.get("Header", {}).get("ReportName", ""),
        "rows": sections,
    }


def _to_float(val: str) -> float:
    try:
        return float(str(val).replace(",", ""))
    except (ValueError, TypeError):
        return 0.0


# ---------------------------------------------------------------------------
# Month-end pull (all-in-one)
# ---------------------------------------------------------------------------

def pull_month_end(conn: QuickBooksConnection, db: Session, year: int, month: int) -> dict:
    """Pull COA + TB + P&L + BS for a given month-end."""
    import calendar
    last_day = calendar.monthrange(year, month)[1]
    end_dt = date(year, month, last_day)
    start_dt = date(year, month, 1)

    coa_result = pull_chart_of_accounts(conn, db)
    batch = pull_trial_balance(conn, db, end_dt)
    pl = pull_pl_report(conn, db, start_dt, end_dt)
    bs = pull_balance_sheet(conn, db, end_dt)

    return {
        "period": f"{year}-{month:02d}",
        "end_date": end_dt.isoformat(),
        "accounts_synced": coa_result["total"],
        "accounts_created": coa_result["accounts_created"],
        "accounts_updated": coa_result["accounts_updated"],
        "trial_balance_batch_id": batch.id,
        "trial_balance_status": batch.status,
        "trial_balance_rows": batch.row_count,
        "unmapped_accounts": batch.unmapped_row_count,
        "pl_rows": len(pl["rows"]),
        "bs_rows": len(bs["rows"]),
        "pl_report": pl,
        "bs_report": bs,
    }
