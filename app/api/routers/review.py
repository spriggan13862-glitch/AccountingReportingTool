import datetime
from decimal import Decimal
from typing import Any

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.api.schemas import FsLineOut
from app.models.accounting_period import AccountingPeriod
from app.services import accounting_intelligence_service as intel_svc
from app.services.financial_analysis_service import compute_ratio_analysis
from app.services.fs_reporting_service import (
    AdjustmentBridgeRow,
    FsLineBalance,
    find_unmapped_accounts,
    get_adjustment_bridge,
    get_fs_statement,
)

router = APIRouter(prefix="/review", tags=["review"])

AS_REPORTED_SOURCES = ["tb_import", "pdf_import", "opening_balance"]


def _source_filter_for(data_view: str) -> list[str] | None:
    if data_view == "as_reported":
        return AS_REPORTED_SOURCES
    return None


def _fs_out(row: FsLineBalance) -> FsLineOut:
    return FsLineOut(
        line_id=row.line_id,
        code=row.code,
        name=row.name,
        statement=row.statement,
        section=row.section,
        sort_order=row.sort_order,
        parent_line_id=row.parent_line_id,
        is_subtotal=row.is_subtotal,
        sign_flip=row.sign_flip,
        own_balance=row.own_balance,
        total_balance=row.total_balance,
        display_balance=row.display_balance,
    )


class VarianceRow(BaseModel):
    code: str
    name: str
    statement: str
    current_balance: float
    prior_balance: float
    amount_delta: float
    pct_delta: float | None
    flag: bool  # True when |pct_delta| > 5%


class CheckResult(BaseModel):
    name: str
    passed: bool
    detail: str


class ReviewStatementsResponse(BaseModel):
    current: list[FsLineOut]
    prior: list[FsLineOut]
    variance: list[VarianceRow]
    checks: list[CheckResult]


def _bs_balance_check(rows: list[FsLineBalance]) -> CheckResult:
    """A = L + E: total assets net_debit equals total liabilities+equity net_debit."""
    assets = Decimal("0")
    liabilities_equity = Decimal("0")
    for row in rows:
        if row.statement != "BS" or row.parent_line_id is not None:
            continue
        # Top-level BS lines: assets vs liabilities/equity distinguished by sign_flip
        # Assets have sign_flip=False (debit-normal); L+E have sign_flip=True
        if not row.sign_flip:
            assets += row.total_balance
        else:
            liabilities_equity += row.total_balance
    diff = abs(assets + liabilities_equity)
    passed = diff < Decimal("0.01")
    return CheckResult(
        name="Balance Sheet balances (A = L + E)",
        passed=passed,
        detail=f"Assets: {float(assets):.2f}, L+E: {float(-liabilities_equity):.2f}, diff: {float(diff):.2f}",
    )


def _tb_balance_check(rows: list[FsLineBalance]) -> CheckResult:
    """Sum of all net_debits across all accounts should be near zero (Dr = Cr)."""
    total = sum(r.own_balance for r in rows)
    passed = abs(total) < Decimal("0.01")
    return CheckResult(
        name="Trial balance debits = credits",
        passed=passed,
        detail=f"Net imbalance: {float(total):.2f}",
    )


@router.get("/statements", response_model=ReviewStatementsResponse)
def review_statements(
    entity_id: int,
    as_of_date: datetime.date,
    prior_as_of_date: datetime.date | None = None,
    scenario_ids: list[int] = Query(default=[]),
    data_view: str = Query(default="adjusted"),
    statement: str | None = None,
    include_checks: bool = True,
    db: Session = Depends(get_db),
):
    """
    Returns current and prior period FS rows, variance analysis, and automated checks.

    prior_as_of_date defaults to the same calendar date one year prior.
    """
    sf = _source_filter_for(data_view)

    if prior_as_of_date is None:
        prior_as_of_date = as_of_date.replace(year=as_of_date.year - 1)

    current_rows = get_fs_statement(db, entity_id, as_of_date, scenario_ids, statement=statement, source_filter=sf)
    prior_rows = get_fs_statement(db, entity_id, prior_as_of_date, scenario_ids, statement=statement, source_filter=sf)

    prior_by_code: dict[str, FsLineBalance] = {r.code: r for r in prior_rows}

    variance: list[VarianceRow] = []
    for row in current_rows:
        prior = prior_by_code.get(row.code)
        prior_bal = float(prior.display_balance) if prior else 0.0
        curr_bal = float(row.display_balance)
        delta = curr_bal - prior_bal
        if prior_bal != 0.0:
            pct = delta / abs(prior_bal) * 100.0
        else:
            pct = None
        flag = pct is not None and abs(pct) > 5.0
        variance.append(VarianceRow(
            code=row.code,
            name=row.name,
            statement=row.statement,
            current_balance=curr_bal,
            prior_balance=prior_bal,
            amount_delta=delta,
            pct_delta=pct,
            flag=flag,
        ))

    checks: list[CheckResult] = []
    if include_checks:
        checks.append(_bs_balance_check(current_rows))
        checks.append(_tb_balance_check(current_rows))

        unmapped = find_unmapped_accounts(db, entity_id, as_of_date, scenario_ids, source_filter=sf)
        unmapped_with_balance = [r for r in unmapped if r.net_debit != Decimal("0")]
        checks.append(CheckResult(
            name="All accounts mapped",
            passed=len(unmapped_with_balance) == 0,
            detail=f"{len(unmapped_with_balance)} account(s) with balances have no FS mapping",
        ))

    return ReviewStatementsResponse(
        current=[_fs_out(r) for r in current_rows],
        prior=[_fs_out(r) for r in prior_rows],
        variance=variance,
        checks=checks,
    )


class BridgeRowOut(BaseModel):
    code: str
    name: str
    statement: str
    section: str | None
    sort_order: int
    as_reported: float
    posted_ajes: float
    net_adjusted: float
    pro_forma_ajes: float
    pro_forma: float


@router.get("/bridge", response_model=list[BridgeRowOut])
def adjustment_bridge(
    entity_id: int,
    as_of_date: datetime.date,
    scenario_ids: list[int] = Query(default=[]),
    statement: str | None = None,
    db: Session = Depends(get_db),
):
    """
    Live adjustment bridge: As Reported → Posted AJEs → Adjusted → Draft AJEs → Pro Forma.
    Derived from two get_trial_balance() calls — not the materialized AdjustmentBridgeRow table.
    """
    rows = get_adjustment_bridge(db, entity_id, as_of_date, scenario_ids, statement=statement)
    return [BridgeRowOut(
        code=r.code,
        name=r.name,
        statement=r.statement,
        section=r.section,
        sort_order=r.sort_order,
        as_reported=float(r.as_reported),
        posted_ajes=float(r.posted_ajes),
        net_adjusted=float(r.net_adjusted),
        pro_forma_ajes=float(r.pro_forma_ajes),
        pro_forma=float(r.pro_forma),
    ) for r in rows]


# ---------------------------------------------------------------------------
# Financial ratio analysis + accounting intelligence engine
# ---------------------------------------------------------------------------

def _find_period_for_date(db: Session, entity_id: int, as_of_date: datetime.date) -> AccountingPeriod | None:
    return (
        db.query(AccountingPeriod)
        .filter(
            AccountingPeriod.entity_id == entity_id,
            AccountingPeriod.start_date <= as_of_date,
            AccountingPeriod.end_date >= as_of_date,
        )
        .order_by(AccountingPeriod.end_date.desc())
        .first()
    )


def _find_prior_period(db: Session, entity_id: int, current_period: AccountingPeriod) -> AccountingPeriod | None:
    return (
        db.query(AccountingPeriod)
        .filter(
            AccountingPeriod.entity_id == entity_id,
            AccountingPeriod.period_type == current_period.period_type,
            AccountingPeriod.end_date < current_period.start_date,
        )
        .order_by(AccountingPeriod.end_date.desc())
        .first()
    )


class RatioMetricOut(BaseModel):
    name: str
    value: float | None
    unit: str
    status: str
    description: str
    interpretation: str
    benchmark_low: float | None
    benchmark_ok: float | None


class AnalysisFlagOut(BaseModel):
    code: str
    severity: str
    title: str
    detail: str
    suggested_procedures: str


class IntelligenceFindingOut(BaseModel):
    issue_code: str
    category: str
    severity: str
    title: str
    description: str
    detection_trigger: str
    suggested_procedures: str
    suggested_ajes: str
    supporting_metrics: dict


class RatioAnalysisOut(BaseModel):
    as_of_date: str
    entity_id: int
    liquidity: list[RatioMetricOut]
    leverage: list[RatioMetricOut]
    profitability: list[RatioMetricOut]
    flags: list[AnalysisFlagOut]
    intelligence_findings: list[IntelligenceFindingOut]
    summary: str
    has_data: bool


@router.get("/analysis", response_model=RatioAnalysisOut)
def review_analysis(
    entity_id: int,
    as_of_date: datetime.date,
    scenario_ids: list[int] = Query(default=[]),
    data_view: str = Query(default="adjusted"),
    db: Session = Depends(get_db),
):
    """
    Financial ratio analysis + accounting intelligence engine (10 detection rules).
    Ratios computed from trial balance; intelligence findings compared against prior period.
    """
    sf = _source_filter_for(data_view)
    result = compute_ratio_analysis(db, entity_id, as_of_date, list(scenario_ids), source_filter=sf)

    intelligence_findings: list[IntelligenceFindingOut] = []
    current_period = _find_period_for_date(db, entity_id, as_of_date)
    if current_period:
        prior_period = _find_prior_period(db, entity_id, current_period)
        if prior_period:
            scenario_id = scenario_ids[0] if scenario_ids else None
            try:
                raw = intel_svc.run_detection(
                    db,
                    entity_id,
                    current_period.id,
                    prior_period.id,
                    scenario_id=scenario_id,
                    persist=False,
                )
                for f in raw:
                    intelligence_findings.append(IntelligenceFindingOut(
                        issue_code=f["issue_code"],
                        category=f["category"],
                        severity=f["severity"],
                        title=f["title"],
                        description=f["description"],
                        detection_trigger=f["detection_trigger"],
                        suggested_procedures=f.get("suggested_procedures", ""),
                        suggested_ajes=f.get("suggested_ajes", ""),
                        supporting_metrics=f.get("supporting_metrics", {}),
                    ))
            except Exception:
                pass

    return RatioAnalysisOut(
        as_of_date=result.as_of_date,
        entity_id=result.entity_id,
        liquidity=[RatioMetricOut(**vars(m)) for m in result.liquidity],
        leverage=[RatioMetricOut(**vars(m)) for m in result.leverage],
        profitability=[RatioMetricOut(**vars(m)) for m in result.profitability],
        flags=[AnalysisFlagOut(**vars(f)) for f in result.flags],
        intelligence_findings=intelligence_findings,
        summary=result.summary,
        has_data=result.has_data,
    )
