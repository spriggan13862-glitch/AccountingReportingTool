"""QuickBooks integration router.

Endpoints:
  GET  /quickbooks/connect                    → {oauth_url}
  GET  /quickbooks/callback                   → redirect to frontend
  GET  /quickbooks/connections                → list[ConnectionOut]
  DELETE /quickbooks/connections/{id}
  POST /quickbooks/connections/{id}/pull      → pull QB data
  POST /quickbooks/desktop/upload             → upload IIF/Excel for QBD
"""
from __future__ import annotations

import datetime
import os
from typing import Any, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import RedirectResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.deps import get_db, get_current_user
from app.models.quickbooks_connection import QuickBooksConnection
from app.services import quickbooks_service as qb_svc
from app.services import quickbooks_desktop_service as qbd_svc
from app.services import import_batch_service as import_svc

router = APIRouter(prefix="/quickbooks", tags=["quickbooks"])

FRONTEND_BASE = os.getenv("FRONTEND_BASE_URL", "http://localhost:5173")


# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------

class ConnectionOut(BaseModel):
    id: int
    entity_id: int
    organization_id: int
    connection_type: str
    realm_id: Optional[str]
    company_name: Optional[str]
    status: str
    last_sync_at: Optional[datetime.datetime]
    created_at: datetime.datetime

    model_config = {"from_attributes": True}


class PullRequest(BaseModel):
    pull_type: str  # 'coa' | 'trial_balance' | 'pl' | 'bs' | 'all'
    year: int
    month: int


class PullResult(BaseModel):
    pull_type: str
    summary: dict[str, Any]


# ---------------------------------------------------------------------------
# OAuth flow
# ---------------------------------------------------------------------------

@router.get("/connect")
def get_connect_url(
    entity_id: int = Query(...),
    org_id: int = Query(...),
    redirect_uri: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Return the Intuit OAuth URL for this entity."""
    uri = redirect_uri or f"{FRONTEND_BASE}/quickbooks/callback"
    oauth_url = qb_svc.get_oauth_url(entity_id, org_id, uri)
    return {"oauth_url": oauth_url}


@router.get("/callback")
def oauth_callback(
    code: Optional[str] = Query(None),
    realmId: Optional[str] = Query(None),
    state: Optional[str] = Query(None),
    error: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    """Exchange OAuth code for tokens, then redirect the browser to the frontend."""
    if error:
        return RedirectResponse(f"{FRONTEND_BASE}/quickbooks/callback?error={error}")

    if not code or not realmId:
        return RedirectResponse(f"{FRONTEND_BASE}/quickbooks/callback?error=missing_params")

    try:
        redirect_uri = f"{FRONTEND_BASE}/quickbooks/callback"
        # state encodes entity_id and org_id as "entity_id:org_id"
        qb_svc.exchange_code_for_tokens(code, realmId, state or "", db, redirect_uri)
        return RedirectResponse(f"{FRONTEND_BASE}/quickbooks/callback?success=1")
    except Exception as exc:
        return RedirectResponse(f"{FRONTEND_BASE}/quickbooks/callback?error={str(exc)[:200]}")


# ---------------------------------------------------------------------------
# Connection management
# ---------------------------------------------------------------------------

@router.get("/connections", response_model=list[ConnectionOut])
def list_connections(
    entity_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    q = db.query(QuickBooksConnection)
    if entity_id is not None:
        q = q.filter(QuickBooksConnection.entity_id == entity_id)
    return q.order_by(QuickBooksConnection.id.desc()).all()


@router.delete("/connections/{conn_id}", status_code=204)
def disconnect(
    conn_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    conn = db.get(QuickBooksConnection, conn_id)
    if not conn:
        raise HTTPException(status_code=404, detail="Connection not found")
    conn.status = "disconnected"
    db.flush()


# ---------------------------------------------------------------------------
# Pull data from QBO
# ---------------------------------------------------------------------------

@router.post("/connections/{conn_id}/pull", response_model=PullResult)
def pull_data(
    conn_id: int,
    body: PullRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    conn = db.get(QuickBooksConnection, conn_id)
    if not conn:
        raise HTTPException(status_code=404, detail="Connection not found")
    if conn.status != "active":
        raise HTTPException(status_code=409, detail=f"Connection status is '{conn.status}', cannot pull")
    if conn.connection_type != "online":
        raise HTTPException(status_code=400, detail="Use /quickbooks/desktop/upload for QuickBooks Desktop connections")

    try:
        conn = qb_svc.refresh_if_needed(conn, db)

        pull_type = body.pull_type
        year, month = body.year, body.month

        if pull_type == "coa":
            summary = qb_svc.pull_chart_of_accounts(conn, db)
        elif pull_type == "trial_balance":
            end_date = datetime.date(year, month, _last_day(year, month))
            batch = qb_svc.pull_trial_balance(conn, db, end_date)
            summary = {"batch_id": batch.id, "status": batch.status, "row_count": batch.row_count}
        elif pull_type == "pl":
            start_date = datetime.date(year, month, 1)
            end_date = datetime.date(year, month, _last_day(year, month))
            summary = qb_svc.pull_pl_report(conn, db, start_date, end_date)
        elif pull_type == "bs":
            as_of_date = datetime.date(year, month, _last_day(year, month))
            summary = qb_svc.pull_balance_sheet(conn, db, as_of_date)
        elif pull_type == "all":
            summary = qb_svc.pull_month_end(conn, db, year, month)
        else:
            raise HTTPException(status_code=400, detail=f"Unknown pull_type '{pull_type}'")

        return PullResult(pull_type=pull_type, summary=summary)

    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"QuickBooks pull failed: {exc}") from exc


# ---------------------------------------------------------------------------
# QuickBooks Desktop — file upload
# ---------------------------------------------------------------------------

@router.post("/desktop/upload")
async def desktop_upload(
    entity_id: int = Form(...),
    organization_id: int = Form(...),
    year: int = Form(...),
    month: int = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """
    Accept an IIF file (.iif) or QuickBooks Desktop Excel export (.xlsx/.xls)
    and create an ImportBatch for the given month-end.
    """
    content = await file.read()
    filename = file.filename or "upload"
    ext = filename.rsplit(".", 1)[-1].lower()

    try:
        if ext == "iif":
            rows = qbd_svc.parse_iif_file(content)
        elif ext in ("xlsx", "xls"):
            rows = qbd_svc.parse_qbd_excel(content)
        else:
            raise HTTPException(status_code=400, detail="Unsupported file type. Upload .iif or .xlsx/.xls")
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Failed to parse file: {exc}") from exc

    # Separate account rows and transaction rows
    acct_rows = [r for r in rows if r.get("record_type") == "account"]
    txn_rows = [r for r in rows if r.get("record_type") == "transaction"]

    end_date = datetime.date(year, month, _last_day(year, month))

    # Build an ImportBatch from the parsed rows
    import hashlib, json
    content_hash = hashlib.sha256(content).hexdigest()

    from app.models.import_batch import ImportBatch
    from app.models.import_line import ImportLine

    batch = ImportBatch(
        organization_id=organization_id,
        entity_id=entity_id,
        filename=filename,
        source_format="qbd",
        content_hash=content_hash,
        as_of_date=end_date,
        status="mapping_required",
        row_count=len(acct_rows) or len(txn_rows),
        column_mapping={},
    )
    db.add(batch)
    db.flush()

    # Use account rows if present (COA+TB export), else transaction rows
    data_rows = acct_rows if acct_rows else txn_rows

    unmapped = 0
    for idx, r in enumerate(data_rows):
        account_name = r.get("account_name", "")
        amount = float(r.get("amount", 0))
        raw_debit = float(r.get("debit", 0)) or (amount if amount > 0 else 0)
        raw_credit = float(r.get("credit", 0)) or (-amount if amount < 0 else 0)

        line = ImportLine(
            batch_id=batch.id,
            line_number=idx + 1,
            raw_account_name=account_name,
            raw_account_number=r.get("account_number"),
            raw_debit=raw_debit,
            raw_credit=raw_credit,
            debit=raw_debit,
            credit=raw_credit,
            mapping_status="unmapped",
        )
        db.add(line)
        unmapped += 1

    batch.unmapped_row_count = unmapped
    batch.mapped_row_count = 0
    if unmapped == 0:
        batch.status = "ready_to_post"

    db.flush()

    # Upsert accounts with auto-taxonomy from QB type mapping
    from app.models.account import Account

    _NORMAL_BALANCE = {
        "asset": "debit", "cogs": "debit", "expense": "debit", "other_expense": "debit",
        "liability": "credit", "equity": "credit", "revenue": "credit", "other_income": "credit",
    }

    for r in acct_rows:
        if not r.get("account_name"):
            continue
        acct_type = r.get("account_type")
        existing = (
            db.query(Account)
            .filter(Account.entity_id == entity_id, Account.account_name == r["account_name"])
            .first()
        )
        if existing:
            if acct_type and not existing.account_type:
                existing.account_type = acct_type
            if r.get("fs_statement") and not existing.fs_statement:
                existing.fs_statement = r["fs_statement"]
            if r.get("fs_section") and not existing.fs_section:
                existing.fs_section = r["fs_section"]
        elif acct_type:
            acct = Account(
                entity_id=entity_id,
                account_name=r["account_name"],
                account_number=r.get("account_number") or r["account_name"][:50],
                account_type=acct_type,
                normal_balance=_NORMAL_BALANCE.get(acct_type, "debit"),
                fs_statement=r.get("fs_statement"),
                fs_section=r.get("fs_section"),
                source_system="quickbooks_desktop",
                active=r.get("is_active", True),
            )
            db.add(acct)

    db.flush()

    return {
        "batch_id": batch.id,
        "status": batch.status,
        "row_count": batch.row_count,
        "unmapped_row_count": unmapped,
        "accounts_upserted": len(acct_rows),
    }


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _last_day(year: int, month: int) -> int:
    import calendar
    return calendar.monthrange(year, month)[1]
