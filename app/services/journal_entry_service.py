from decimal import Decimal

from sqlalchemy.orm import Session

from app.models.journal_entry import JournalEntry
from app.models.journal_entry_line import JournalEntryLine
from app.schemas.journal_entry import JournalEntryCreate


class JournalEntryValidationError(ValueError):
    pass


class JournalEntryNotFoundError(LookupError):
    pass


def post_journal_entry(db: Session, data: JournalEntryCreate) -> JournalEntry:
    """Validate and post a new journal entry. Flushes to DB; caller commits."""
    _validate_lines(data)

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
    )
    db.add(je)
    db.flush()  # obtain je.id before inserting lines

    for line_data in data.lines:
        db.add(JournalEntryLine(
            journal_entry_id=je.id,
            line_number=line_data.line_number,
            account_id=line_data.account_id,
            entity_id=line_data.entity_id,
            debit=line_data.debit,
            credit=line_data.credit,
            description=line_data.description,
        ))

    db.flush()
    db.refresh(je)
    return je


def get_journal_entry_or_raise(db: Session, je_id: int) -> JournalEntry:
    """Return a JournalEntry by id, raising JournalEntryNotFoundError if absent."""
    je = db.get(JournalEntry, je_id)
    if je is None:
        raise JournalEntryNotFoundError(f"Journal entry id={je_id} not found")
    return je


# ---------------------------------------------------------------------------
# Internal validation
# ---------------------------------------------------------------------------

def _validate_lines(data: JournalEntryCreate) -> None:
    if len(data.lines) == 0:
        raise JournalEntryValidationError(
            "Journal entry must have at least 2 lines (got 0)"
        )
    if len(data.lines) == 1:
        raise JournalEntryValidationError(
            "Journal entry must have at least 2 lines (got 1)"
        )

    for line in data.lines:
        if line.debit > Decimal("0") and line.credit > Decimal("0"):
            raise JournalEntryValidationError(
                f"Line {line.line_number}: a single line cannot carry both a debit "
                f"and a credit amount (debit={line.debit}, credit={line.credit})"
            )

    total_debit = sum(l.debit for l in data.lines)
    total_credit = sum(l.credit for l in data.lines)

    if total_debit != total_credit:
        raise JournalEntryValidationError(
            f"Journal entry does not balance: "
            f"total debits={total_debit}, total credits={total_credit}"
        )

    if total_debit == Decimal("0"):
        raise JournalEntryValidationError(
            "Journal entry has no amounts — all lines are zero"
        )
