"""
Reconciliation service — account reconciliation, rollforward, and tie-out engine.

Core rules
----------
- variance_amount = official_balance - supporting_balance
- tie_out: |variance| <= tolerance → in_tolerance; variance == 0 → tied
- Preparer and reviewer must be different users (separation of duties)
- Rollforward: prior period closing balance becomes new opening balance
- Status flow: not_started → in_progress → prepared → reviewed (or rejected)
"""

from __future__ import annotations

import datetime
from dataclasses import dataclass, field
from decimal import Decimal
from typing import Optional

from sqlalchemy.orm import Session

from app.models.reconciliation import Reconciliation
from app.models.reconciliation_line import ReconciliationLine
from app.models.support_reference import SupportReference


# ---------------------------------------------------------------------------
# Errors
# ---------------------------------------------------------------------------

class ReconciliationNotFoundError(Exception):
    pass


class ReconciliationStateError(Exception):
    pass


class ReconciliationValidationError(Exception):
    pass


class ReviewerSeparationError(Exception):
    """Preparer and reviewer must be different users."""


# ---------------------------------------------------------------------------
# Status transitions
# ---------------------------------------------------------------------------

_VALID_TRANSITIONS: dict[str, set[str]] = {
    "not_started": {"in_progress"},
    "in_progress": {"prepared"},
    "prepared": {"reviewed", "rejected"},
    "reviewed": {"rolled_forward"},
    "rejected": {"in_progress"},
    "rolled_forward": set(),
}


def _check_transition(current: str, target: str) -> None:
    allowed = _VALID_TRANSITIONS.get(current, set())
    if target not in allowed:
        raise ReconciliationStateError(
            f"Cannot transition from '{current}' to '{target}'"
        )


# ---------------------------------------------------------------------------
# Variance and tie-out helpers
# ---------------------------------------------------------------------------

def _compute_variance(official: Decimal | None, supporting: Decimal | None) -> Decimal | None:
    if official is None or supporting is None:
        return None
    return official - supporting


def _compute_tie_out_status(variance: Decimal | None, tolerance: Decimal) -> str:
    if variance is None:
        return "untested"
    abs_var = abs(variance)
    if abs_var == Decimal(0):
        return "tied"
    if abs_var <= tolerance:
        return "in_tolerance"
    return "out_of_tolerance"


# ---------------------------------------------------------------------------
# CRUD
# ---------------------------------------------------------------------------

def create_reconciliation(
    db: Session,
    *,
    organization_id: int,
    entity_id: int,
    account_id: int,
    period_id: int | None = None,
    reconciliation_type: str = "manual",
    official_balance: Decimal | None = None,
    supporting_balance: Decimal | None = None,
    tolerance_amount: Decimal = Decimal("0"),
    notes: str | None = None,
) -> Reconciliation:
    variance = _compute_variance(official_balance, supporting_balance)
    tie_out = _compute_tie_out_status(variance, tolerance_amount)

    recon = Reconciliation(
        organization_id=organization_id,
        entity_id=entity_id,
        account_id=account_id,
        period_id=period_id,
        reconciliation_type=reconciliation_type,
        status="not_started",
        official_balance=official_balance,
        supporting_balance=supporting_balance,
        variance_amount=variance,
        tolerance_amount=tolerance_amount,
        tie_out_status=tie_out,
        notes=notes,
    )
    db.add(recon)
    db.flush()
    return recon


def get_reconciliation(db: Session, recon_id: int) -> Reconciliation:
    recon = db.query(Reconciliation).filter(Reconciliation.id == recon_id).first()
    if not recon:
        raise ReconciliationNotFoundError(f"Reconciliation {recon_id} not found")
    return recon


def list_reconciliations(
    db: Session,
    organization_id: int,
    entity_id: int | None = None,
    period_id: int | None = None,
    status: str | None = None,
) -> list[Reconciliation]:
    q = db.query(Reconciliation).filter(Reconciliation.organization_id == organization_id)
    if entity_id is not None:
        q = q.filter(Reconciliation.entity_id == entity_id)
    if period_id is not None:
        q = q.filter(Reconciliation.period_id == period_id)
    if status:
        q = q.filter(Reconciliation.status == status)
    return q.order_by(Reconciliation.id).all()


def update_reconciliation_balances(
    db: Session,
    recon_id: int,
    *,
    official_balance: Decimal | None = None,
    supporting_balance: Decimal | None = None,
    variance_explanation: str | None = None,
    draft_preview_balance: Decimal | None = None,
) -> Reconciliation:
    recon = get_reconciliation(db, recon_id)
    if official_balance is not None:
        recon.official_balance = official_balance
    if supporting_balance is not None:
        recon.supporting_balance = supporting_balance
    if variance_explanation is not None:
        recon.variance_explanation = variance_explanation
    if draft_preview_balance is not None:
        recon.draft_preview_balance = draft_preview_balance

    recon.variance_amount = _compute_variance(recon.official_balance, recon.supporting_balance)
    recon.tie_out_status = _compute_tie_out_status(
        recon.variance_amount, recon.tolerance_amount or Decimal("0")
    )
    db.flush()
    return recon


def transition_status(
    db: Session,
    recon_id: int,
    target_status: str,
    *,
    user_id: int | None = None,
    comment: str | None = None,
) -> Reconciliation:
    recon = get_reconciliation(db, recon_id)
    _check_transition(recon.status, target_status)

    if target_status == "prepared":
        if user_id is not None:
            if recon.reviewer_user_id is not None and recon.reviewer_user_id == user_id:
                raise ReviewerSeparationError(
                    "Preparer and reviewer must be different users"
                )
            recon.preparer_user_id = user_id
        recon.prepared_at = datetime.datetime.utcnow()

    elif target_status == "reviewed":
        if user_id is not None:
            if recon.preparer_user_id is not None and recon.preparer_user_id == user_id:
                raise ReviewerSeparationError(
                    "Preparer and reviewer must be different users"
                )
            recon.reviewer_user_id = user_id
        recon.reviewed_at = datetime.datetime.utcnow()
        if comment:
            recon.reviewer_comment = comment

    elif target_status == "rejected":
        if comment:
            recon.reviewer_comment = comment

    recon.status = target_status
    db.flush()
    return recon


# ---------------------------------------------------------------------------
# Reconciliation lines
# ---------------------------------------------------------------------------

def add_reconciliation_line(
    db: Session,
    recon_id: int,
    *,
    description: str | None = None,
    source_type: str = "manual",
    source_reference: str | None = None,
    debit: Decimal = Decimal("0"),
    credit: Decimal = Decimal("0"),
    is_reconciling_item: bool = False,
    reconciling_notes: str | None = None,
) -> ReconciliationLine:
    existing_lines = (
        db.query(ReconciliationLine)
        .filter(ReconciliationLine.reconciliation_id == recon_id)
        .count()
    )
    line = ReconciliationLine(
        reconciliation_id=recon_id,
        line_number=existing_lines + 1,
        description=description,
        source_type=source_type,
        source_reference=source_reference,
        debit=debit,
        credit=credit,
        balance=debit - credit,
        is_reconciling_item=is_reconciling_item,
        reconciling_notes=reconciling_notes,
    )
    db.add(line)
    db.flush()
    return line


def get_reconciliation_lines(db: Session, recon_id: int) -> list[ReconciliationLine]:
    return (
        db.query(ReconciliationLine)
        .filter(ReconciliationLine.reconciliation_id == recon_id)
        .order_by(ReconciliationLine.line_number)
        .all()
    )


# ---------------------------------------------------------------------------
# Support references
# ---------------------------------------------------------------------------

def add_support_reference(
    db: Session,
    recon_id: int,
    *,
    reference_type: str,
    document_id: int | None = None,
    journal_entry_id: int | None = None,
    external_ref: str | None = None,
    description: str | None = None,
    added_by_user_id: int | None = None,
) -> SupportReference:
    ref = SupportReference(
        reconciliation_id=recon_id,
        reference_type=reference_type,
        document_id=document_id,
        journal_entry_id=journal_entry_id,
        external_ref=external_ref,
        description=description,
        added_by_user_id=added_by_user_id,
        added_at=datetime.datetime.utcnow(),
    )
    db.add(ref)
    db.flush()
    return ref


def get_support_references(db: Session, recon_id: int) -> list[SupportReference]:
    return (
        db.query(SupportReference)
        .filter(SupportReference.reconciliation_id == recon_id)
        .order_by(SupportReference.id)
        .all()
    )


# ---------------------------------------------------------------------------
# Rollforward engine
# ---------------------------------------------------------------------------

def rollforward_reconciliation(
    db: Session,
    prior_recon_id: int,
    *,
    new_period_id: int,
    new_official_balance: Decimal | None = None,
) -> Reconciliation:
    """
    Create a new reconciliation for the next period by rolling forward the prior
    period's closing balance as the opening balance.
    """
    prior = get_reconciliation(db, prior_recon_id)
    if prior.status not in ("reviewed", "rolled_forward"):
        raise ReconciliationStateError(
            "Can only roll forward reviewed reconciliations"
        )

    opening = prior.official_balance or Decimal("0")
    adjustments = Decimal("0")

    new_recon = Reconciliation(
        organization_id=prior.organization_id,
        entity_id=prior.entity_id,
        account_id=prior.account_id,
        period_id=new_period_id,
        reconciliation_type=prior.reconciliation_type,
        status="in_progress",
        official_balance=new_official_balance,
        supporting_balance=None,
        tolerance_amount=prior.tolerance_amount or Decimal("0"),
        rollforward_opening_balance=opening,
        rollforward_adjustments=adjustments,
        rollforward_closing_balance=opening + adjustments,
        notes=f"Rolled forward from reconciliation #{prior_recon_id}",
    )
    if new_official_balance is not None:
        new_recon.variance_amount = _compute_variance(new_official_balance, None)

    db.add(new_recon)

    prior.status = "rolled_forward"
    db.flush()
    return new_recon


# ---------------------------------------------------------------------------
# Rollforward schedule builders
# ---------------------------------------------------------------------------

@dataclass
class RollforwardScheduleLine:
    label: str
    amount: Decimal
    is_subtotal: bool = False


def build_cash_rollforward(
    opening_balance: Decimal,
    inflows: Decimal,
    outflows: Decimal,
) -> list[RollforwardScheduleLine]:
    closing = opening_balance + inflows - outflows
    return [
        RollforwardScheduleLine("Opening Cash Balance", opening_balance),
        RollforwardScheduleLine("Cash Inflows", inflows),
        RollforwardScheduleLine("Cash Outflows (negative)", -outflows),
        RollforwardScheduleLine("Closing Cash Balance", closing, is_subtotal=True),
    ]


def build_re_rollforward(
    beginning_re: Decimal,
    net_income: Decimal,
    dividends: Decimal,
) -> list[RollforwardScheduleLine]:
    closing = beginning_re + net_income - dividends
    return [
        RollforwardScheduleLine("Beginning Retained Earnings", beginning_re),
        RollforwardScheduleLine("Net Income", net_income),
        RollforwardScheduleLine("Dividends / Distributions", -dividends),
        RollforwardScheduleLine("Ending Retained Earnings", closing, is_subtotal=True),
    ]


def build_fa_rollforward(
    beginning_balance: Decimal,
    additions: Decimal,
    disposals: Decimal,
    depreciation: Decimal,
) -> list[RollforwardScheduleLine]:
    closing = beginning_balance + additions - disposals - depreciation
    return [
        RollforwardScheduleLine("Beginning Balance", beginning_balance),
        RollforwardScheduleLine("Additions", additions),
        RollforwardScheduleLine("Disposals", -disposals),
        RollforwardScheduleLine("Depreciation / Amortization", -depreciation),
        RollforwardScheduleLine("Ending Balance", closing, is_subtotal=True),
    ]


def build_debt_rollforward(
    beginning_balance: Decimal,
    new_borrowings: Decimal,
    repayments: Decimal,
) -> list[RollforwardScheduleLine]:
    closing = beginning_balance + new_borrowings - repayments
    return [
        RollforwardScheduleLine("Beginning Debt Balance", beginning_balance),
        RollforwardScheduleLine("New Borrowings", new_borrowings),
        RollforwardScheduleLine("Repayments", -repayments),
        RollforwardScheduleLine("Ending Debt Balance", closing, is_subtotal=True),
    ]
