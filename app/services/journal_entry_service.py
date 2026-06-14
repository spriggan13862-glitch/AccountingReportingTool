"""
Journal entry service.

Lifecycle
---------
  draft  ──post()──► posted ──reverse()──► reversed
                 └──void()──► voided

Rules
-----
- Draft entries may be freely edited or deleted.
- Posted entries are immutable; corrections require a reversal entry.
- Posted entries cannot be deleted.
- Reversal entries negate the original by swapping debit ↔ credit on every line.
"""

from __future__ import annotations

import datetime
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.models.account import Account
from app.models.accounting_period import AccountingPeriod
from app.models.journal_entry import JournalEntry
from app.models.journal_entry_line import JournalEntryLine
from app.schemas.journal_entry import JournalEntryCreate
from app.services.permission_service import check_entity_org_access, require_permission
from app.services.validation import ValidationResult

if TYPE_CHECKING:
    from app.models.user import User


# ---------------------------------------------------------------------------
# Exceptions
# ---------------------------------------------------------------------------

class JournalEntryValidationError(ValueError):
    """Raised when journal entry validation finds ERROR-severity issues."""

    def __init__(self, message: str, result: ValidationResult | None = None) -> None:
        super().__init__(message)
        self.result = result if result is not None else ValidationResult()


class JournalEntryNotFoundError(LookupError):
    """Raised when a requested journal entry does not exist."""


class ImmutableEntryError(ValueError):
    """Raised when attempting to mutate a posted, reversed, or voided entry."""


class ClosedPeriodError(ValueError):
    """Raised when attempting to post into a closed accounting period."""


# ---------------------------------------------------------------------------
# Period guard
# ---------------------------------------------------------------------------

def _check_period_not_closed(
    db: Session,
    entity_id: int,
    entry_date: datetime.date,
) -> None:
    """Raise ClosedPeriodError if entry_date falls within any locked period for the entity."""
    closed = (
        db.query(AccountingPeriod)
        .filter(
            AccountingPeriod.entity_id == entity_id,
            AccountingPeriod.start_date <= entry_date,
            AccountingPeriod.end_date >= entry_date,
            or_(
                AccountingPeriod.is_closed == True,  # noqa: E712
                AccountingPeriod.period_status.in_(["soft_closed", "hard_closed"]),
            ),
        )
        .first()
    )
    if closed:
        status_label = closed.period_status.replace("_", "-") if closed.period_status in ("soft_closed", "hard_closed") else "closed"
        raise ClosedPeriodError(
            f"Cannot post into closed period '{closed.period_name}' "
            f"({closed.start_date} – {closed.end_date}) [{status_label}]"
        )


# ---------------------------------------------------------------------------
# Account postability guard
# ---------------------------------------------------------------------------

def _check_accounts_postable(db: Session, data: JournalEntryCreate) -> None:
    """Raise JournalEntryValidationError if any line targets a non-postable account."""
    account_ids = [l.account_id for l in data.lines]
    non_postable = (
        db.query(Account.id, Account.account_number, Account.account_name)
        .filter(Account.id.in_(account_ids), Account.is_postable == False)
        .all()
    )
    if non_postable:
        details = ", ".join(
            f"{r.account_number} ({r.account_name})" for r in non_postable
        )
        result = ValidationResult()
        result.error(
            code="JE_NONPOSTABLE_ACCOUNT",
            message=f"Cannot post to header/non-postable account(s): {details}",
            source_type="journal_entry",
            source_id=data.je_number,
            suggested_resolution="Post to a postable detail account, not a header account.",
        )
        msg = "; ".join(f"[{e.code}] {e.message}" for e in result.errors)
        raise JournalEntryValidationError(msg, result=result)

    # Warn if any account belongs to a different entity than the JE header
    cross_entity = (
        db.query(Account.id, Account.account_number, Account.entity_id)
        .filter(
            Account.id.in_(account_ids),
            Account.entity_id.isnot(None),
            Account.entity_id != data.entity_id,
        )
        .all()
    )
    if cross_entity:
        details = ", ".join(f"{r.account_number} (entity {r.entity_id})" for r in cross_entity)
        result = ValidationResult()
        result.error(
            code="JE_CROSS_ENTITY_ACCOUNT",
            message=(
                f"Account(s) {details} belong to a different entity than this journal entry "
                f"(entity {data.entity_id}). Use accounts belonging to entity {data.entity_id} "
                "or global accounts (no entity)."
            ),
            source_type="journal_entry",
            source_id=data.je_number,
            suggested_resolution="Select accounts that belong to this entity or use global chart of accounts.",
        )
        raise JournalEntryValidationError(
            "; ".join(f"[{e.code}] {e.message}" for e in result.errors),
            result=result,
        )


# ---------------------------------------------------------------------------
# Pure validation (no DB)
# ---------------------------------------------------------------------------

def validate_journal_entry(data: JournalEntryCreate) -> ValidationResult:
    """
    Validate a JournalEntryCreate payload without touching the database.

    Returns a ValidationResult that may contain ERRORs, WARNINGs, and INFOs.
    Never raises — callers decide what to do with the result.

    Severity mapping
    ----------------
    ERROR   — entry cannot be posted as-is.
    WARNING — entry is technically valid but worth reviewing.
    INFO    — informational note.
    """
    result = ValidationResult()
    src = "journal_entry"
    ref = data.je_number

    # --- Minimum line count ---
    if len(data.lines) < 2:
        result.error(
            code="JE_MIN_LINES",
            message=f"Journal entry must have at least 2 lines (got {len(data.lines)})",
            source_type=src,
            source_id=ref,
        )
        return result  # further checks would be misleading without lines

    # --- Per-line: no line may carry both a debit and a credit ---
    for line in data.lines:
        if line.debit > Decimal("0") and line.credit > Decimal("0"):
            result.error(
                code="JE_LINE_BOTH_SIDES",
                message=(
                    f"Line {line.line_number}: a single line cannot carry both "
                    f"a debit and a credit (debit={line.debit}, credit={line.credit})"
                ),
                source_type=src,
                source_id=ref,
                field_name=f"lines[{line.line_number}]",
                suggested_resolution="Move one amount to a separate line.",
            )

    total_debit  = sum(l.debit  for l in data.lines)
    total_credit = sum(l.credit for l in data.lines)

    # --- Entry must balance ---
    if total_debit != total_credit:
        result.error(
            code="JE_OUT_OF_BALANCE",
            message=(
                f"Journal entry does not balance: "
                f"total debits={total_debit}, total credits={total_credit}"
            ),
            source_type=src,
            source_id=ref,
            suggested_resolution="Ensure total debits equal total credits.",
        )

    # --- Entry must have non-zero amounts (guard only when no balance errors) ---
    if total_debit == Decimal("0") and not result.has_errors:
        result.error(
            code="JE_ZERO_AMOUNT",
            message="Journal entry has no amounts — all lines are zero",
            source_type=src,
            source_id=ref,
        )

    # --- Warning: entry date more than one year in the past ---
    cutoff = datetime.date.today() - datetime.timedelta(days=365)
    if data.entry_date < cutoff:
        result.warning(
            code="JE_PRIOR_PERIOD",
            message=(
                f"Entry date {data.entry_date} is more than one year in the past; "
                f"confirm this is an intentional prior-period adjustment"
            ),
            source_type=src,
            source_id=ref,
            field_name="entry_date",
            suggested_resolution=(
                "Review with your controller before posting. "
                "If intentional, proceed; the entry will still be posted."
            ),
        )

    return result


# ---------------------------------------------------------------------------
# Create / post
# ---------------------------------------------------------------------------

def post_journal_entry(
    db: Session,
    data: JournalEntryCreate,
    acting_user: User | None = None,
) -> JournalEntry:
    """
    Validate and immediately post a journal entry.

    Raises JournalEntryValidationError (carrying a ValidationResult) if any
    ERROR-severity issues are found. Warnings do not block posting.
    Flushes to the DB; the caller is responsible for committing.
    """
    if acting_user is not None:
        require_permission(db, acting_user, "create_journal_entries")
        check_entity_org_access(db, acting_user, data.entity_id)

    result = validate_journal_entry(data)
    if result.has_errors:
        msg = "; ".join(f"[{e.code}] {e.message}" for e in result.errors)
        raise JournalEntryValidationError(msg, result=result)

    _check_period_not_closed(db, data.entity_id, data.entry_date)
    _check_accounts_postable(db, data)

    now = datetime.datetime.now()
    user_id = acting_user.id if acting_user is not None else None
    je = JournalEntry(
        je_number=data.je_number,
        entry_date=data.entry_date,
        entity_id=data.entity_id,
        scenario_id=data.scenario_id,
        description=data.description,
        source=data.source,
        source_ref=data.source_ref,
        created_by=data.created_by,
        status="posted",
        posted_at=now,
        created_by_user_id=user_id,
        posted_by_user_id=user_id,
    )
    db.add(je)
    db.flush()

    for line in data.lines:
        db.add(JournalEntryLine(
            journal_entry_id=je.id,
            line_number=line.line_number,
            account_id=line.account_id,
            entity_id=line.entity_id,
            debit=line.debit,
            credit=line.credit,
            description=line.description,
        ))

    db.flush()
    db.refresh(je)
    return je


def create_draft_journal_entry(
    db: Session,
    data: JournalEntryCreate,
    acting_user: User | None = None,
) -> JournalEntry:
    """
    Create a journal entry in 'draft' status.

    Draft entries skip balance validation and may be freely edited or deleted
    later. They are excluded from all trial balance and FS queries until posted.
    """
    if acting_user is not None:
        require_permission(db, acting_user, "create_journal_entries")
        check_entity_org_access(db, acting_user, data.entity_id)

    _check_accounts_postable(db, data)

    user_id = acting_user.id if acting_user is not None else None
    je = JournalEntry(
        je_number=data.je_number,
        entry_date=data.entry_date,
        entity_id=data.entity_id,
        scenario_id=data.scenario_id,
        description=data.description,
        source=data.source,
        source_ref=data.source_ref,
        created_by=data.created_by,
        status="draft",
        created_by_user_id=user_id,
    )
    db.add(je)
    db.flush()

    for line in data.lines:
        db.add(JournalEntryLine(
            journal_entry_id=je.id,
            line_number=line.line_number,
            account_id=line.account_id,
            entity_id=line.entity_id,
            debit=line.debit,
            credit=line.credit,
            description=line.description,
        ))

    db.flush()
    db.refresh(je)
    return je


# ---------------------------------------------------------------------------
# Mutation (draft only)
# ---------------------------------------------------------------------------

def update_draft_journal_entry(
    db: Session,
    je_id: int,
    data: JournalEntryCreate,
) -> JournalEntry:
    """
    Replace the header fields and lines of a draft journal entry.

    Raises ImmutableEntryError if the entry status is not 'draft'.
    """
    je = get_journal_entry_or_raise(db, je_id)
    if je.status != "draft":
        raise ImmutableEntryError(
            f"Journal entry {je_id} has status='{je.status}' and cannot be edited; "
            f"only 'draft' entries may be modified"
        )

    je.je_number   = data.je_number
    je.entry_date  = data.entry_date
    je.entity_id   = data.entity_id
    je.scenario_id = data.scenario_id
    je.description = data.description
    je.source      = data.source
    je.source_ref  = data.source_ref
    je.updated_at  = datetime.datetime.now()

    # Replace all existing lines
    db.query(JournalEntryLine).filter(
        JournalEntryLine.journal_entry_id == je_id
    ).delete(synchronize_session="fetch")

    for line in data.lines:
        db.add(JournalEntryLine(
            journal_entry_id=je.id,
            line_number=line.line_number,
            account_id=line.account_id,
            entity_id=line.entity_id,
            debit=line.debit,
            credit=line.credit,
            description=line.description,
        ))

    db.flush()
    db.refresh(je)
    return je


def delete_draft_journal_entry(
    db: Session,
    je_id: int,
    acting_user: User | None = None,
) -> None:
    """
    Permanently delete a draft journal entry and its lines.

    Raises ImmutableEntryError if the entry status is not 'draft'.
    Posted entries must be corrected through reversal, not deletion.
    """
    je = get_journal_entry_or_raise(db, je_id)
    if je.status != "draft":
        raise ImmutableEntryError(
            f"Journal entry {je_id} has status='{je.status}' and cannot be deleted; "
            f"posted entries must be reversed"
        )
    if acting_user is not None:
        require_permission(db, acting_user, "create_journal_entries")
        check_entity_org_access(db, acting_user, je.entity_id)
    db.delete(je)
    db.flush()


# ---------------------------------------------------------------------------
# Post existing draft
# ---------------------------------------------------------------------------

def post_draft_journal_entry(
    db: Session,
    je_id: int,
    acting_user: User | None = None,
) -> tuple[JournalEntry, ValidationResult]:
    """
    Validate and transition an existing draft journal entry to 'posted' status.

    Returns (JournalEntry, ValidationResult) so callers can surface warnings.
    Raises ImmutableEntryError if the entry is not draft.
    Raises JournalEntryValidationError (with result) if validation fails.
    """
    je = get_journal_entry_or_raise(db, je_id)
    if je.status != "draft":
        raise ImmutableEntryError(
            f"Journal entry {je_id} is '{je.status}', not 'draft'; "
            f"only draft entries can be posted via this endpoint"
        )

    if acting_user is not None:
        require_permission(db, acting_user, "post_journal_entries")
        check_entity_org_access(db, acting_user, je.entity_id)

    # Load current lines for validation
    lines = db.query(JournalEntryLine).filter(
        JournalEntryLine.journal_entry_id == je_id
    ).all()

    from app.schemas.journal_entry import JournalEntryLineCreate  # local to avoid circular
    data = JournalEntryCreate(
        je_number=je.je_number,
        entry_date=je.entry_date,
        entity_id=je.entity_id,
        scenario_id=je.scenario_id,
        description=je.description,
        lines=[
            JournalEntryLineCreate(
                line_number=l.line_number,
                account_id=l.account_id,
                entity_id=l.entity_id,
                debit=l.debit,
                credit=l.credit,
            )
            for l in lines
        ],
    )

    result = validate_journal_entry(data)
    if result.has_errors:
        msg = "; ".join(f"[{e.code}] {e.message}" for e in result.errors)
        raise JournalEntryValidationError(msg, result=result)

    _check_period_not_closed(db, je.entity_id, je.entry_date)

    now = datetime.datetime.now()
    je.status     = "posted"
    je.posted_at  = now
    je.updated_at = now
    if acting_user is not None:
        je.posted_by_user_id = acting_user.id

    db.flush()
    db.refresh(je)
    return je, result


# ---------------------------------------------------------------------------
# Reversal
# ---------------------------------------------------------------------------

def reverse_journal_entry(
    db: Session,
    je_id: int,
    reversal_date: datetime.date,
    je_number: str,
    description: str,
    created_by: str | None = None,
    acting_user: User | None = None,
) -> JournalEntry:
    """
    Create a reversal entry that negates an existing posted journal entry.

    Every line from the original is mirrored with debit ↔ credit swapped,
    producing zero net impact when both entries are included in a trial balance.

    The original entry's status becomes 'reversed' and reversal_je_id is set.
    The new reversal entry's reversal_of_id points back to the original.

    Raises
    ------
    ImmutableEntryError
        If the original entry is not 'posted', or has already been reversed.
    """
    original = get_journal_entry_or_raise(db, je_id)

    if acting_user is not None:
        require_permission(db, acting_user, "reverse_entries")
        check_entity_org_access(db, acting_user, original.entity_id)

    if original.reversal_je_id is not None:
        raise ImmutableEntryError(
            f"Journal entry {je_id} has already been reversed "
            f"(reversal_je_id={original.reversal_je_id})"
        )
    if original.status != "posted":
        raise ImmutableEntryError(
            f"Only 'posted' entries can be reversed; "
            f"entry {je_id} has status='{original.status}'"
        )

    _check_period_not_closed(db, original.entity_id, reversal_date)

    original_lines = (
        db.query(JournalEntryLine)
        .filter(JournalEntryLine.journal_entry_id == je_id)
        .all()
    )

    now = datetime.datetime.now()
    user_id = acting_user.id if acting_user is not None else None
    reversal = JournalEntry(
        je_number=je_number,
        entry_date=reversal_date,
        entity_id=original.entity_id,
        scenario_id=original.scenario_id,
        description=description,
        source=original.source,
        reversal_of_id=je_id,
        created_by=created_by,
        status="posted",
        posted_at=now,
        created_by_user_id=user_id,
        posted_by_user_id=user_id,
        reversed_by_user_id=user_id,
        overlay_group=original.overlay_group,
    )
    db.add(reversal)
    db.flush()

    for line in original_lines:
        db.add(JournalEntryLine(
            journal_entry_id=reversal.id,
            line_number=line.line_number,
            account_id=line.account_id,
            entity_id=line.entity_id,
            debit=line.credit,   # original credit → reversal debit
            credit=line.debit,   # original debit  → reversal credit
            description=line.description,
        ))

    original.status        = "reversed"
    original.reversal_je_id = reversal.id
    original.reversed_at   = now
    original.updated_at    = now

    db.flush()
    db.refresh(reversal)
    db.refresh(original)
    return reversal


# ---------------------------------------------------------------------------
# Approval workflow (draft → pending_approval → posted)
# ---------------------------------------------------------------------------

class ApprovalError(ValueError):
    """Raised when an approval workflow rule is violated."""


def _write_event(
    db: Session,
    je_id: int,
    event_type: str,
    actor_name: str | None = None,
    actor_user_id: int | None = None,
    note: str | None = None,
) -> None:
    from app.models.journal_entry_event import JournalEntryEvent
    db.add(JournalEntryEvent(
        je_id=je_id,
        event_type=event_type,
        actor_name=actor_name,
        actor_user_id=actor_user_id,
        note=note,
    ))
    db.flush()


def submit_for_approval(
    db: Session,
    je_id: int,
    submitted_by: str | None = None,
    actor_user_id: int | None = None,
) -> JournalEntry:
    """Transition a draft journal entry to pending_approval status."""
    je = get_journal_entry_or_raise(db, je_id)
    if je.status != "draft":
        raise ImmutableEntryError(
            f"Only draft entries can be submitted; entry {je_id} has status='{je.status}'"
        )
    je.status = "pending_approval"
    je.updated_at = datetime.datetime.now()
    _write_event(db, je_id, "submitted", actor_name=submitted_by, actor_user_id=actor_user_id)
    db.flush()
    db.refresh(je)
    return je


def approve_journal_entry(
    db: Session,
    je_id: int,
    approver_name: str | None = None,
    actor_user_id: int | None = None,
) -> tuple[JournalEntry, ValidationResult]:
    """
    Approve a pending_approval entry and immediately post it.
    Approver must differ from the creator (actor_user_id != created_by_user_id).
    """
    je = get_journal_entry_or_raise(db, je_id)
    if je.status != "pending_approval":
        raise ImmutableEntryError(
            f"Entry {je_id} is '{je.status}', not 'pending_approval'"
        )
    if actor_user_id is not None and actor_user_id == je.created_by_user_id:
        raise ApprovalError("Approver cannot be the same user who created the entry")

    from app.schemas.journal_entry import JournalEntryCreate, JournalEntryLineCreate
    lines = db.query(JournalEntryLine).filter(JournalEntryLine.journal_entry_id == je_id).all()
    data = JournalEntryCreate(
        je_number=je.je_number,
        entry_date=je.entry_date,
        entity_id=je.entity_id,
        scenario_id=je.scenario_id,
        description=je.description,
        lines=[
            JournalEntryLineCreate(
                line_number=l.line_number,
                account_id=l.account_id,
                entity_id=l.entity_id,
                debit=l.debit,
                credit=l.credit,
            )
            for l in lines
        ],
    )
    result = validate_journal_entry(data)
    if result.has_errors:
        msg = "; ".join(f"[{e.code}] {e.message}" for e in result.errors)
        raise JournalEntryValidationError(msg, result=result)

    _check_period_not_closed(db, je.entity_id, je.entry_date)

    now = datetime.datetime.now()
    je.status = "posted"
    je.posted_at = now
    je.updated_at = now
    if actor_user_id is not None:
        je.posted_by_user_id = actor_user_id
    _write_event(db, je_id, "approved", actor_name=approver_name, actor_user_id=actor_user_id)
    _write_event(db, je_id, "posted", actor_name=approver_name, actor_user_id=actor_user_id)
    db.flush()
    db.refresh(je)
    return je, result


def reject_journal_entry(
    db: Session,
    je_id: int,
    rejector_name: str | None = None,
    actor_user_id: int | None = None,
    note: str | None = None,
) -> JournalEntry:
    """Reject a pending_approval entry, returning it to draft status."""
    je = get_journal_entry_or_raise(db, je_id)
    if je.status != "pending_approval":
        raise ImmutableEntryError(
            f"Entry {je_id} is '{je.status}', not 'pending_approval'"
        )
    je.status = "draft"
    je.updated_at = datetime.datetime.now()
    _write_event(db, je_id, "rejected", actor_name=rejector_name, actor_user_id=actor_user_id, note=note)
    db.flush()
    db.refresh(je)
    return je


def list_journal_entry_events(db: Session, je_id: int) -> list:
    from app.models.journal_entry_event import JournalEntryEvent
    return (
        db.query(JournalEntryEvent)
        .filter(JournalEntryEvent.je_id == je_id)
        .order_by(JournalEntryEvent.occurred_at)
        .all()
    )


# ---------------------------------------------------------------------------
# Lookup
# ---------------------------------------------------------------------------

def get_journal_entry_or_raise(db: Session, je_id: int) -> JournalEntry:
    """Return a JournalEntry by id, raising JournalEntryNotFoundError if absent."""
    je = db.get(JournalEntry, je_id)
    if je is None:
        raise JournalEntryNotFoundError(f"Journal entry id={je_id} not found")
    return je
