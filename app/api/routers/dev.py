import calendar
import datetime
import io
import json
import os

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response, StreamingResponse
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.api.deps import get_db, get_current_user
from app.models.entity import Entity
from app.models.accounting_period import AccountingPeriod
from app.models.account import Account
from app.models.import_batch import ImportBatch
from app.services import import_batch_service as svc

router = APIRouter(prefix="/dev", tags=["dev"])


def _guard_non_production() -> None:
    if os.environ.get("APP_ENV", "development").lower() == "production":
        raise HTTPException(status_code=403, detail="Not available in production")


# ---------------------------------------------------------------------------
# 1. Reset — wipe all org data
# ---------------------------------------------------------------------------

@router.delete("/reset", summary="Wipe all org data")
def dev_reset(
    org_id: int,
    db: Session = Depends(get_db),
    _user=Depends(get_current_user),
):
    _guard_non_production()

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
        je_rows = db.execute(
            text(f"SELECT id FROM journal_entries WHERE entity_id IN ({','.join(str(i) for i in entity_ids)})")
        ).fetchall()
        je_ids = [r[0] for r in je_rows]
        deleted["journal_entry_lines"] = _del("journal_entry_lines", "journal_entry_id", je_ids)
        deleted["journal_entry_events"] = _del("journal_entry_events", "je_id", je_ids)
        deleted["journal_entries"] = _del("journal_entries", "entity_id", entity_ids)

        tb_rows = db.execute(
            text(f"SELECT id FROM import_batches WHERE entity_id IN ({','.join(str(i) for i in entity_ids)})")
        ).fetchall()
        tb_ids = [r[0] for r in tb_rows]
        deleted["import_lines"] = _del("import_lines", "batch_id", tb_ids)
        deleted["import_validation_issues"] = _del("import_validation_issues", "batch_id", tb_ids)
        deleted["import_batches"] = _del("import_batches", "entity_id", entity_ids)

        pdf_rows = db.execute(
            text(f"SELECT id FROM pdf_import_batches WHERE entity_id IN ({','.join(str(i) for i in entity_ids)})")
        ).fetchall()
        pdf_ids = [r[0] for r in pdf_rows]
        deleted["pdf_import_lines"] = _del("pdf_import_lines", "batch_id", pdf_ids)
        deleted["pdf_account_mappings"] = _del("pdf_account_mappings", "batch_id", pdf_ids)
        deleted["pdf_import_batches"] = _del("pdf_import_batches", "entity_id", entity_ids)

        deleted["coa_import_batches"] = _del("coa_import_batches", "entity_id", entity_ids)

        acct_rows = db.execute(
            text(f"SELECT id FROM accounts WHERE entity_id IN ({','.join(str(i) for i in entity_ids)})")
        ).fetchall()
        acct_ids = [r[0] for r in acct_rows]
        deleted["account_mappings"] = _del("account_mappings", "account_id", acct_ids)
        deleted["accounts"] = _del("accounts", "entity_id", entity_ids)
        deleted["accounting_periods"] = _del("accounting_periods", "entity_id", entity_ids)
        deleted["entities"] = _del("entities", "organization_id", [org_id])

    deleted["import_batches_org"] = _del_org("import_batches")
    db.commit()
    return {"status": "reset", "org_id": org_id, "deleted": deleted}


# ---------------------------------------------------------------------------
# 2. Seed demo data — entity + periods + chart of accounts
# ---------------------------------------------------------------------------

_DEMO_ACCOUNTS = [
    # (number, name, type, normal_balance, fs_statement, fs_section)
    ("1000", "Cash and Cash Equivalents", "asset", "debit", "BalanceSheet", "Current Assets"),
    ("1100", "Accounts Receivable", "asset", "debit", "BalanceSheet", "Current Assets"),
    ("1200", "Inventory", "asset", "debit", "BalanceSheet", "Current Assets"),
    ("1300", "Prepaid Expenses", "asset", "debit", "BalanceSheet", "Current Assets"),
    ("1500", "Property Plant & Equipment", "asset", "debit", "BalanceSheet", "Fixed Assets"),
    ("1600", "Accumulated Depreciation", "asset", "credit", "BalanceSheet", "Fixed Assets"),
    ("2000", "Accounts Payable", "liability", "credit", "BalanceSheet", "Current Liabilities"),
    ("2100", "Accrued Liabilities", "liability", "credit", "BalanceSheet", "Current Liabilities"),
    ("2200", "Short-Term Debt", "liability", "credit", "BalanceSheet", "Current Liabilities"),
    ("2500", "Long-Term Debt", "liability", "credit", "BalanceSheet", "Long-Term Liabilities"),
    ("3000", "Common Stock", "equity", "credit", "BalanceSheet", "Equity"),
    ("3100", "Retained Earnings", "equity", "credit", "BalanceSheet", "Equity"),
    ("4000", "Revenue", "revenue", "credit", "IncomeStatement", "Revenue"),
    ("4100", "Service Revenue", "revenue", "credit", "IncomeStatement", "Revenue"),
    ("5000", "Cost of Goods Sold", "cogs", "debit", "IncomeStatement", "Cost of Revenue"),
    ("6000", "Salaries and Wages", "expense", "debit", "IncomeStatement", "Operating Expenses"),
    ("6100", "Rent Expense", "expense", "debit", "IncomeStatement", "Operating Expenses"),
    ("6200", "Utilities Expense", "expense", "debit", "IncomeStatement", "Operating Expenses"),
    ("6300", "Depreciation Expense", "expense", "debit", "IncomeStatement", "Operating Expenses"),
    ("6400", "Interest Expense", "expense", "debit", "IncomeStatement", "Operating Expenses"),
    ("6900", "Other Operating Expenses", "expense", "debit", "IncomeStatement", "Operating Expenses"),
]


@router.post("/seed", summary="Seed demo entity, periods, and chart of accounts")
def dev_seed(
    org_id: int,
    db: Session = Depends(get_db),
    _user=Depends(get_current_user),
):
    _guard_non_production()

    year = datetime.date.today().year

    # Create entity
    entity = Entity(
        organization_id=org_id,
        code="DEMO",
        name="Demo Corp",
        entity_type="operating",
        currency="USD",
        active=True,
    )
    db.add(entity)
    db.flush()

    # Create 12 monthly periods for current year
    periods_created = 0
    for month in range(1, 13):
        last_day = calendar.monthrange(year, month)[1]
        start = datetime.date(year, month, 1)
        end = datetime.date(year, month, last_day)
        month_name = start.strftime("%B %Y")
        period = AccountingPeriod(
            entity_id=entity.id,
            period_name=month_name,
            start_date=start,
            end_date=end,
            fiscal_year=year,
            fiscal_period=month,
            period_type="monthly",
            is_closed=False,
            period_status="open",
        )
        db.add(period)
        periods_created += 1

    # Create chart of accounts
    accounts_created = 0
    for num, name, acct_type, normal_bal, fs_stmt, fs_sec in _DEMO_ACCOUNTS:
        acct = Account(
            entity_id=entity.id,
            account_number=num,
            account_name=name,
            account_type=acct_type,
            normal_balance=normal_bal,
            fs_statement=fs_stmt,
            fs_section=fs_sec,
            active=True,
            is_postable=True,
        )
        db.add(acct)
        accounts_created += 1

    db.commit()
    return {
        "status": "seeded",
        "entity_id": entity.id,
        "entity_code": entity.code,
        "periods_created": periods_created,
        "accounts_created": accounts_created,
    }


# ---------------------------------------------------------------------------
# 3. Sample TB CSV download
# ---------------------------------------------------------------------------

_SAMPLE_TB_ROWS = [
    ("1000", "Cash and Cash Equivalents", 125000.00, 0),
    ("1100", "Accounts Receivable", 87500.00, 0),
    ("1200", "Inventory", 43200.00, 0),
    ("1300", "Prepaid Expenses", 6800.00, 0),
    ("1500", "Property Plant & Equipment", 350000.00, 0),
    ("1600", "Accumulated Depreciation", 0, 42000.00),
    ("2000", "Accounts Payable", 0, 52000.00),
    ("2100", "Accrued Liabilities", 0, 18500.00),
    ("2200", "Short-Term Debt", 0, 30000.00),
    ("2500", "Long-Term Debt", 0, 200000.00),
    ("3000", "Common Stock", 0, 100000.00),
    ("3100", "Retained Earnings", 0, 120000.00),
    ("4000", "Revenue", 0, 280000.00),
    ("4100", "Service Revenue", 0, 45000.00),
    ("5000", "Cost of Goods Sold", 98000.00, 0),
    ("6000", "Salaries and Wages", 72000.00, 0),
    ("6100", "Rent Expense", 24000.00, 0),
    ("6200", "Utilities Expense", 8400.00, 0),
    ("6300", "Depreciation Expense", 14000.00, 0),
    ("6400", "Interest Expense", 9600.00, 0),
    ("6900", "Other Operating Expenses", 49000.00, 0),
]


@router.get("/sample-tb", summary="Download a sample trial balance CSV")
def dev_sample_tb(as_of_date: str = ""):
    _guard_non_production()
    date_str = as_of_date or datetime.date.today().replace(day=1).strftime("%Y-%m-%d")
    buf = io.StringIO()
    buf.write("account_number,account_name,debit,credit\n")
    for num, name, debit, credit in _SAMPLE_TB_ROWS:
        d = f"{debit:.2f}" if debit else ""
        c = f"{credit:.2f}" if credit else ""
        buf.write(f"{num},{name},{d},{c}\n")
    content = buf.getvalue()
    filename = f"sample_trial_balance_{date_str}.csv"
    return Response(
        content=content,
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ---------------------------------------------------------------------------
# 4. Data snapshot — export org data as JSON
# ---------------------------------------------------------------------------

@router.get("/snapshot", summary="Export org data as JSON snapshot")
def dev_snapshot(
    org_id: int,
    db: Session = Depends(get_db),
    _user=Depends(get_current_user),
):
    _guard_non_production()

    def _rows(query: str, params: dict) -> list[dict]:
        result = db.execute(text(query), params)
        cols = list(result.keys())
        return [dict(zip(cols, row)) for row in result.fetchall()]

    entity_rows = _rows(
        "SELECT * FROM entities WHERE organization_id = :org_id", {"org_id": org_id}
    )
    entity_ids = [r["id"] for r in entity_rows]

    snapshot: dict = {
        "exported_at": datetime.datetime.utcnow().isoformat(),
        "org_id": org_id,
        "entities": entity_rows,
        "accounts": [],
        "accounting_periods": [],
        "import_batches": [],
        "journal_entries": [],
        "journal_entry_lines": [],
    }

    if entity_ids:
        id_list = ",".join(str(i) for i in entity_ids)
        snapshot["accounts"] = _rows(
            f"SELECT * FROM accounts WHERE entity_id IN ({id_list})", {}
        )
        snapshot["accounting_periods"] = _rows(
            f"SELECT * FROM accounting_periods WHERE entity_id IN ({id_list})", {}
        )
        snapshot["import_batches"] = _rows(
            f"SELECT * FROM import_batches WHERE entity_id IN ({id_list})", {}
        )
        je_rows = _rows(
            f"SELECT * FROM journal_entries WHERE entity_id IN ({id_list})", {}
        )
        snapshot["journal_entries"] = je_rows
        je_ids = [r["id"] for r in je_rows]
        if je_ids:
            snapshot["journal_entry_lines"] = _rows(
                f"SELECT * FROM journal_entry_lines WHERE journal_entry_id IN ({','.join(str(i) for i in je_ids)})",
                {},
            )

    def _serial(obj):
        if isinstance(obj, (datetime.date, datetime.datetime)):
            return obj.isoformat()
        raise TypeError(f"Not serializable: {type(obj)}")

    content = json.dumps(snapshot, default=_serial, indent=2)
    filename = f"snapshot_org{org_id}_{datetime.date.today()}.json"
    return Response(
        content=content,
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ---------------------------------------------------------------------------
# 5. Quick-post all ready_to_post batches
# ---------------------------------------------------------------------------

@router.post("/post-all-ready", summary="Post all ready_to_post TB batches for an entity")
def dev_post_all_ready(
    entity_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    _guard_non_production()

    batches = (
        db.query(ImportBatch)
        .filter(
            ImportBatch.entity_id == entity_id,
            ImportBatch.status == "ready_to_post",
        )
        .all()
    )

    posted = []
    errors = []
    for batch in batches:
        try:
            svc.post_batch(db, batch.id, acting_user=current_user)
            db.commit()
            posted.append(batch.id)
        except Exception as exc:
            db.rollback()
            errors.append({"batch_id": batch.id, "error": str(exc)})

    return {"posted": posted, "errors": errors, "total": len(batches)}


# ---------------------------------------------------------------------------
# 6. Advance import status through pipeline
# ---------------------------------------------------------------------------

_STATUS_PIPELINE = ["uploaded", "parsed", "mapping_required", "ready_to_post"]


@router.patch("/advance-import/{batch_id}", summary="Advance import batch to next pipeline status")
def dev_advance_import(
    batch_id: int,
    db: Session = Depends(get_db),
    _user=Depends(get_current_user),
):
    _guard_non_production()

    batch = db.get(ImportBatch, batch_id)
    if not batch:
        raise HTTPException(status_code=404, detail=f"Batch {batch_id} not found")

    current = batch.status
    if current not in _STATUS_PIPELINE:
        raise HTTPException(
            status_code=409,
            detail=f"Batch status '{current}' is not in the advanceable pipeline",
        )

    idx = _STATUS_PIPELINE.index(current)
    if idx >= len(_STATUS_PIPELINE) - 1:
        raise HTTPException(
            status_code=409,
            detail=f"Batch is already at the final pre-post status '{current}'",
        )

    next_status = _STATUS_PIPELINE[idx + 1]
    batch.status = next_status
    db.commit()
    return {"batch_id": batch_id, "previous_status": current, "new_status": next_status}
