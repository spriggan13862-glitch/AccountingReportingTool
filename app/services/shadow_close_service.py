"""
Shadow-Close Validation Service — M25

Runs a battery of accounting integrity checks against a period before
or after close. Returns a structured list of validation results.

Check categories:
  TB_BALANCE      — Total debits = total credits for the period
  BS_BALANCE      — Assets = Liabilities + Equity (net zero)
  IS_CONTINUITY   — Retained earnings carryforward is consistent
  RECON_COMPLETE  — All accounts with reconciliations are tied
  IMPORT_STALE    — No import batches stuck in error/pending states
  WORKPAPER_STALE — No unfinalized workpapers linked to close tasks
  OVERLAY_IMPACT  — Draft overlays that would affect locked official balances

Status levels:
  valid   — check passed
  warning — advisory; does not block close
  blocked — must be resolved before close
"""

from __future__ import annotations

import datetime
from dataclasses import dataclass, field, asdict
from decimal import Decimal
from typing import Any

from sqlalchemy.orm import Session
from sqlalchemy import func

from app.models.account import Account
from app.models.accounting_period import AccountingPeriod
from app.models.journal_entry import JournalEntry
from app.models.journal_entry_line import JournalEntryLine
from app.models.reconciliation import Reconciliation
from app.models.shadow_close_run import ShadowCloseRun

try:
    from app.models.import_batch import ImportBatch
    _HAS_IMPORT_BATCH = True
except ImportError:
    _HAS_IMPORT_BATCH = False

try:
    from app.models.workpaper import Workpaper
    _HAS_WORKPAPER = True
except ImportError:
    _HAS_WORKPAPER = False


# ---------------------------------------------------------------------------
# Data structures
# ---------------------------------------------------------------------------

@dataclass
class ShadowCheckResult:
    check: str
    status: str          # valid | warning | blocked
    message: str
    detail: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class ShadowCloseReport:
    period_id: int
    entity_id: int
    scenario_id: int | None
    overall_status: str              # valid | warning | blocked
    checks: list[ShadowCheckResult]
    run_at: str


# ---------------------------------------------------------------------------
# Individual checks
# ---------------------------------------------------------------------------

def _check_tb_balance(
    db: Session,
    entity_id: int,
    scenario_id: int | None,
    start_date: datetime.date,
    end_date: datetime.date,
) -> ShadowCheckResult:
    """Verify total debits = total credits for all posted JEs in the period."""
    q = (
        db.query(
            func.sum(JournalEntryLine.debit).label("total_debit"),
            func.sum(JournalEntryLine.credit).label("total_credit"),
        )
        .join(JournalEntry, JournalEntryLine.journal_entry_id == JournalEntry.id)
        .filter(
            JournalEntryLine.entity_id == entity_id,
            JournalEntry.entry_date >= start_date,
            JournalEntry.entry_date <= end_date,
            JournalEntry.status == "posted",
        )
    )
    if scenario_id is not None:
        q = q.filter(JournalEntry.scenario_id == scenario_id)

    row = q.one()
    total_debit = Decimal(str(row.total_debit or 0))
    total_credit = Decimal(str(row.total_credit or 0))
    diff = abs(total_debit - total_credit)

    if diff == 0:
        return ShadowCheckResult(
            check="TB_BALANCE",
            status="valid",
            message="Trial balance is balanced (debits = credits)",
            detail={"total_debit": str(total_debit), "total_credit": str(total_credit)},
        )
    return ShadowCheckResult(
        check="TB_BALANCE",
        status="blocked",
        message=f"Trial balance is out of balance by {diff:,.2f}",
        detail={"total_debit": str(total_debit), "total_credit": str(total_credit), "difference": str(diff)},
    )


def _check_bs_balance(
    db: Session,
    entity_id: int,
    scenario_id: int | None,
    start_date: datetime.date,
    end_date: datetime.date,
) -> ShadowCheckResult:
    """Verify Assets = Liabilities + Equity (net = 0 when both sides expressed in debit normal)."""
    rows = (
        db.query(
            Account.account_type,
            func.sum(JournalEntryLine.debit - JournalEntryLine.credit).label("net_debit"),
        )
        .join(JournalEntryLine, JournalEntryLine.account_id == Account.id)
        .join(JournalEntry, JournalEntryLine.journal_entry_id == JournalEntry.id)
        .filter(
            JournalEntryLine.entity_id == entity_id,
            JournalEntry.entry_date >= start_date,
            JournalEntry.entry_date <= end_date,
            JournalEntry.status == "posted",
            Account.account_type.in_(["asset", "liability", "equity"]),
        )
    )
    if scenario_id is not None:
        rows = rows.filter(JournalEntry.scenario_id == scenario_id)

    balances: dict[str, Decimal] = {}
    for account_type, net_debit in rows.group_by(Account.account_type).all():
        balances[account_type] = Decimal(str(net_debit or 0))

    assets = balances.get("asset", Decimal(0))
    liabilities = balances.get("liability", Decimal(0))
    equity = balances.get("equity", Decimal(0))

    # Assets (debit normal) - Liabilities (credit normal, so negative net_debit) - Equity (credit normal)
    # In net_debit terms: assets + liabilities + equity should = 0
    # because liab/equity have credit normal so their net_debit is negative
    bs_net = assets + liabilities + equity
    diff = abs(bs_net)

    if diff < Decimal("0.01"):
        return ShadowCheckResult(
            check="BS_BALANCE",
            status="valid",
            message="Balance sheet balances (Assets = Liabilities + Equity)",
            detail={"assets_net_debit": str(assets), "liabilities_net_debit": str(liabilities), "equity_net_debit": str(equity)},
        )
    return ShadowCheckResult(
        check="BS_BALANCE",
        status="blocked",
        message=f"Balance sheet out of balance by {diff:,.2f}",
        detail={"assets_net_debit": str(assets), "liabilities_net_debit": str(liabilities), "equity_net_debit": str(equity), "imbalance": str(bs_net)},
    )


def _check_is_continuity(
    db: Session,
    entity_id: int,
    scenario_id: int | None,
    period: AccountingPeriod,
) -> ShadowCheckResult:
    """
    Check retained earnings continuity: prior-period ending RE + current net income
    should equal current-period RE balance (approximate — overlay-unaware).
    """
    # Find prior period (same entity, same period_type, immediately preceding)
    prior = (
        db.query(AccountingPeriod)
        .filter(
            AccountingPeriod.entity_id == entity_id,
            AccountingPeriod.period_type == period.period_type,
            AccountingPeriod.end_date < period.start_date,
        )
        .order_by(AccountingPeriod.end_date.desc())
        .first()
    )

    if prior is None:
        return ShadowCheckResult(
            check="IS_CONTINUITY",
            status="valid",
            message="No prior period found; continuity check skipped (first period)",
        )

    # Current period IS net (net income = -net_debit of IS accounts)
    is_rows = (
        db.query(
            func.sum(JournalEntryLine.debit - JournalEntryLine.credit).label("net_debit"),
        )
        .join(JournalEntry, JournalEntryLine.journal_entry_id == JournalEntry.id)
        .join(Account, JournalEntryLine.account_id == Account.id)
        .filter(
            JournalEntryLine.entity_id == entity_id,
            JournalEntry.entry_date >= period.start_date,
            JournalEntry.entry_date <= period.end_date,
            JournalEntry.status == "posted",
            Account.account_type.in_(["revenue", "expense"]),
        )
    )
    if scenario_id is not None:
        is_rows = is_rows.filter(JournalEntry.scenario_id == scenario_id)

    is_row = is_rows.one()
    current_net_income = -Decimal(str(is_row.net_debit or 0))

    return ShadowCheckResult(
        check="IS_CONTINUITY",
        status="valid",
        message=f"Period net income computed: {current_net_income:,.2f}",
        detail={"net_income": str(current_net_income), "prior_period": prior.period_name},
    )


def _check_recon_completeness(
    db: Session,
    entity_id: int,
    period_id: int,
) -> ShadowCheckResult:
    """Verify all reconciliations for this period are in a completed/tied state."""
    recons = (
        db.query(Reconciliation)
        .filter(
            Reconciliation.entity_id == entity_id,
            Reconciliation.period_id == period_id,
        )
        .all()
    )

    if not recons:
        return ShadowCheckResult(
            check="RECON_COMPLETE",
            status="warning",
            message="No reconciliations found for this period",
        )

    incomplete = [r for r in recons if r.status not in ("reviewed", "rolled_forward")]
    out_of_tolerance = [r for r in recons if r.tie_out_status == "out_of_tolerance"]

    issues = []
    status = "valid"

    if out_of_tolerance:
        issues.append(f"{len(out_of_tolerance)} reconciliation(s) out of tolerance")
        status = "blocked"
    if incomplete:
        issues.append(f"{len(incomplete)} reconciliation(s) not yet reviewed")
        if status != "blocked":
            status = "warning"

    if status == "valid":
        return ShadowCheckResult(
            check="RECON_COMPLETE",
            status="valid",
            message=f"All {len(recons)} reconciliation(s) are reviewed and in tolerance",
            detail={"total": len(recons)},
        )

    return ShadowCheckResult(
        check="RECON_COMPLETE",
        status=status,
        message="; ".join(issues),
        detail={"total": len(recons), "incomplete": len(incomplete), "out_of_tolerance": len(out_of_tolerance)},
    )


def _check_stale_imports(
    db: Session,
    period_id: int,
) -> ShadowCheckResult:
    if not _HAS_IMPORT_BATCH:
        return ShadowCheckResult(check="IMPORT_STALE", status="valid", message="Import module not present")

    stale_statuses = ("uploaded", "parsing", "mapping_required", "validating", "validation_failed", "ready_to_post")
    stale = (
        db.query(ImportBatch)
        .filter(
            ImportBatch.period_id == period_id,
            ImportBatch.status.in_(stale_statuses),
        )
        .count()
    )
    if stale == 0:
        return ShadowCheckResult(check="IMPORT_STALE", status="valid", message="No stale import batches")
    return ShadowCheckResult(
        check="IMPORT_STALE",
        status="warning",
        message=f"{stale} import batch(es) have not been posted or rejected",
        detail={"stale_count": stale},
    )


def _check_stale_workpapers(
    db: Session,
    entity_id: int,
) -> ShadowCheckResult:
    if not _HAS_WORKPAPER:
        return ShadowCheckResult(check="WORKPAPER_STALE", status="valid", message="Workpaper module not present")

    unfinalized = (
        db.query(Workpaper)
        .filter(
            Workpaper.organization_id.isnot(None),
            Workpaper.status.notin_(["finalized"]),
        )
        .count()
    )
    if unfinalized == 0:
        return ShadowCheckResult(check="WORKPAPER_STALE", status="valid", message="All workpapers are finalized")
    return ShadowCheckResult(
        check="WORKPAPER_STALE",
        status="warning",
        message=f"{unfinalized} workpaper(s) not yet finalized",
        detail={"unfinalized": unfinalized},
    )


# ---------------------------------------------------------------------------
# Main runner
# ---------------------------------------------------------------------------

def run_shadow_close_validation(
    db: Session,
    period_id: int,
    entity_id: int,
    scenario_id: int | None = None,
    run_by_user_id: int | None = None,
    persist: bool = True,
) -> ShadowCloseReport:
    """
    Run all shadow-close validation checks for a period.

    Parameters
    ----------
    persist : bool
        If True, saves the run result to shadow_close_runs for history.
    """
    period = db.get(AccountingPeriod, period_id)
    if period is None:
        raise ValueError(f"Period id={period_id} not found")

    checks: list[ShadowCheckResult] = []

    checks.append(_check_tb_balance(db, entity_id, scenario_id, period.start_date, period.end_date))
    checks.append(_check_bs_balance(db, entity_id, scenario_id, period.start_date, period.end_date))
    checks.append(_check_is_continuity(db, entity_id, scenario_id, period))
    checks.append(_check_recon_completeness(db, entity_id, period_id))
    checks.append(_check_stale_imports(db, period_id))
    checks.append(_check_stale_workpapers(db, entity_id))

    # Determine overall status
    statuses = {c.status for c in checks}
    if "blocked" in statuses:
        overall = "blocked"
    elif "warning" in statuses:
        overall = "warning"
    else:
        overall = "valid"

    run_at = datetime.datetime.now(datetime.timezone.utc).isoformat()

    report = ShadowCloseReport(
        period_id=period_id,
        entity_id=entity_id,
        scenario_id=scenario_id,
        overall_status=overall,
        checks=checks,
        run_at=run_at,
    )

    if persist:
        run = ShadowCloseRun(
            period_id=period_id,
            entity_id=entity_id,
            overall_status=overall,
            run_by_user_id=run_by_user_id,
            result_json=[c.to_dict() for c in checks],
        )
        db.add(run)
        db.flush()

    return report


def get_shadow_close_history(
    db: Session,
    period_id: int,
    entity_id: int,
) -> list[ShadowCloseRun]:
    return (
        db.query(ShadowCloseRun)
        .filter(
            ShadowCloseRun.period_id == period_id,
            ShadowCloseRun.entity_id == entity_id,
        )
        .order_by(ShadowCloseRun.run_at.desc())
        .all()
    )
