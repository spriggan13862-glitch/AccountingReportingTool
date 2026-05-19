"""
Period Governance Service — M25

Status machine:
  open ──soft_close()──► soft_closed ──hard_close()──► hard_closed
  open ──hard_close()──► hard_closed
  soft_closed ──hard_close()──► hard_closed
  soft_closed ──reopen()──► reopened
  hard_closed ──reopen()──► reopened  (requires elevated reason)
  reopened ──soft_close()──► soft_closed
  reopened ──hard_close()──► hard_closed

Lock rules:
  open        → all posting allowed
  soft_closed → blocks new JEs, imports, reconciliation finalization
  hard_closed → blocks ALL mutations to accounting data
  reopened    → same as open, but all mutations are audit-logged as post-reopen
"""

from __future__ import annotations

import datetime
from dataclasses import dataclass
from typing import TYPE_CHECKING

from sqlalchemy.orm import Session

from app.models.accounting_period import AccountingPeriod
from app.models.period_governance_event import PeriodGovernanceEvent

if TYPE_CHECKING:
    pass

# ---------------------------------------------------------------------------
# Exceptions
# ---------------------------------------------------------------------------

class PeriodLockedError(ValueError):
    """Raised when an operation is blocked by period lock state."""


class PeriodGovernanceError(ValueError):
    """Raised when a period governance transition is invalid."""


class PeriodNotFoundError(LookupError):
    pass


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

VALID_TRANSITIONS: dict[str, list[str]] = {
    "open":        ["soft_closed", "hard_closed"],
    "soft_closed": ["hard_closed", "reopened"],
    "hard_closed": ["reopened"],
    "reopened":    ["soft_closed", "hard_closed"],
}

# Operations and which statuses block them
_BLOCKED_OPERATIONS: dict[str, set[str]] = {
    "post_journal_entry":       {"soft_closed", "hard_closed"},
    "post_import":              {"soft_closed", "hard_closed"},
    "post_overlay":             {"soft_closed", "hard_closed"},
    "finalize_reconciliation":  {"hard_closed"},
    "create_journal_entry":     {"hard_closed"},
    "update_reconciliation":    {"hard_closed"},
    "post_reversal":            {"soft_closed", "hard_closed"},
}


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _get_period(db: Session, period_id: int) -> AccountingPeriod:
    p = db.get(AccountingPeriod, period_id)
    if p is None:
        raise PeriodNotFoundError(f"Period id={period_id} not found")
    return p


def _record_event(
    db: Session,
    period: AccountingPeriod,
    event_type: str,
    from_status: str,
    to_status: str,
    actor_user_id: int | None,
    reason: str | None,
) -> PeriodGovernanceEvent:
    evt = PeriodGovernanceEvent(
        period_id=period.id,
        event_type=event_type,
        from_status=from_status,
        to_status=to_status,
        actor_user_id=actor_user_id,
        reason=reason,
    )
    db.add(evt)
    db.flush()
    return evt


def _apply_transition(
    db: Session,
    period: AccountingPeriod,
    new_status: str,
    event_type: str,
    actor_user_id: int | None,
    reason: str | None,
) -> tuple[AccountingPeriod, PeriodGovernanceEvent]:
    from_status = period.period_status
    allowed = VALID_TRANSITIONS.get(from_status, [])
    if new_status not in allowed:
        raise PeriodGovernanceError(
            f"Cannot transition period '{period.period_name}' from '{from_status}' to '{new_status}'. "
            f"Allowed: {allowed}"
        )

    period.period_status = new_status

    # Keep is_closed in sync for backwards compatibility with existing lock check
    if new_status in ("soft_closed", "hard_closed"):
        period.is_closed = True
        if not period.closed_at:
            period.closed_at = datetime.datetime.now()
    elif new_status in ("open", "reopened"):
        period.is_closed = False

    evt = _record_event(db, period, event_type, from_status, new_status, actor_user_id, reason)
    db.flush()
    db.refresh(period)
    return period, evt


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def soft_close_period(
    db: Session,
    period_id: int,
    actor_user_id: int | None = None,
    reason: str | None = None,
) -> AccountingPeriod:
    """Soft-close: blocks new posting but allows reconciliation & workpaper work."""
    period = _get_period(db, period_id)
    period, _ = _apply_transition(db, period, "soft_closed", "soft_close", actor_user_id, reason)
    return period


def hard_close_period(
    db: Session,
    period_id: int,
    actor_user_id: int | None = None,
    reason: str | None = None,
) -> AccountingPeriod:
    """Hard-close: fully locks the period. No posting, no import, no overlay."""
    period = _get_period(db, period_id)
    period, _ = _apply_transition(db, period, "hard_closed", "hard_close", actor_user_id, reason)
    return period


def reopen_period(
    db: Session,
    period_id: int,
    actor_user_id: int | None = None,
    reason: str | None = None,
) -> AccountingPeriod:
    """
    Reopen a closed period. Sets status to 'reopened' (not 'open') to preserve
    audit distinction. Posting resumes; all activity is tagged post-reopen.
    """
    period = _get_period(db, period_id)
    period, _ = _apply_transition(db, period, "reopened", "reopen", actor_user_id, reason)
    return period


def check_operation_allowed(
    db: Session,
    period_id: int,
    operation: str,
) -> None:
    """
    Raise PeriodLockedError if the given operation is blocked by the period's lock state.
    Call this before any mutation that could affect locked-period data.
    """
    period = _get_period(db, period_id)
    blocked_by = _BLOCKED_OPERATIONS.get(operation, set())
    if period.period_status in blocked_by:
        raise PeriodLockedError(
            f"Operation '{operation}' is blocked: period '{period.period_name}' "
            f"is {period.period_status.replace('_', '-')}."
        )


def check_date_operation_allowed(
    db: Session,
    entity_id: int,
    entry_date: datetime.date,
    operation: str,
) -> None:
    """
    Check lock state for the period covering entry_date for entity_id.
    Raises PeriodLockedError if blocked.
    """
    period = (
        db.query(AccountingPeriod)
        .filter(
            AccountingPeriod.entity_id == entity_id,
            AccountingPeriod.start_date <= entry_date,
            AccountingPeriod.end_date >= entry_date,
        )
        .first()
    )
    if period is None:
        return  # no period registered — no lock
    blocked_by = _BLOCKED_OPERATIONS.get(operation, set())
    if period.period_status in blocked_by:
        raise PeriodLockedError(
            f"Operation '{operation}' is blocked: period '{period.period_name}' "
            f"({period.start_date} – {period.end_date}) is {period.period_status.replace('_', '-')}."
        )


def get_governance_history(
    db: Session,
    period_id: int,
) -> list[PeriodGovernanceEvent]:
    """Return all governance events for a period, oldest first."""
    return (
        db.query(PeriodGovernanceEvent)
        .filter(PeriodGovernanceEvent.period_id == period_id)
        .order_by(PeriodGovernanceEvent.created_at)
        .all()
    )


@dataclass
class PeriodLockSummary:
    period_id: int
    period_name: str
    period_status: str
    is_hard_locked: bool
    is_soft_locked: bool
    posting_allowed: bool


def get_lock_summary(db: Session, period_id: int) -> PeriodLockSummary:
    period = _get_period(db, period_id)
    return PeriodLockSummary(
        period_id=period.id,
        period_name=period.period_name,
        period_status=period.period_status,
        is_hard_locked=period.period_status == "hard_closed",
        is_soft_locked=period.period_status in ("soft_closed", "hard_closed"),
        posting_allowed=period.period_status in ("open", "reopened"),
    )
