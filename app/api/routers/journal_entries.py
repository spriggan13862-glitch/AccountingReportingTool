import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.api.schemas import JELineOut, JEOut, Page, ReverseJERequest, ValidationIssueOut
from app.models.journal_entry import JournalEntry
from app.models.journal_entry_line import JournalEntryLine
from app.schemas.journal_entry import JournalEntryCreate
from app.services.journal_entry_service import (
    JournalEntryNotFoundError,
    create_draft_journal_entry,
    delete_draft_journal_entry,
    get_journal_entry_or_raise,
    post_draft_journal_entry,
    post_journal_entry,
    reverse_journal_entry,
    update_draft_journal_entry,
    validate_journal_entry,
)

router = APIRouter(prefix="/journal-entries", tags=["journal-entries"])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _lines(db: Session, je_id: int) -> list[JournalEntryLine]:
    return (
        db.query(JournalEntryLine)
        .filter(JournalEntryLine.journal_entry_id == je_id)
        .order_by(JournalEntryLine.line_number)
        .all()
    )


def _issue_out(issue) -> ValidationIssueOut:
    return ValidationIssueOut(
        code=issue.code,
        severity=issue.severity.value,
        message=issue.message,
        source_type=issue.source_type,
        source_id=issue.source_id,
        field_name=issue.field_name,
        suggested_resolution=issue.suggested_resolution,
    )


def _je_out(db: Session, je: JournalEntry, warnings=None) -> JEOut:
    return JEOut(
        id=je.id,
        je_number=je.je_number,
        entry_date=je.entry_date,
        entity_id=je.entity_id,
        scenario_id=je.scenario_id,
        description=je.description,
        source=je.source,
        source_ref=je.source_ref,
        status=je.status,
        reversal_of_id=je.reversal_of_id,
        reversal_je_id=je.reversal_je_id,
        created_by=je.created_by,
        posted_by=je.posted_by,
        created_at=je.created_at,
        posted_at=je.posted_at,
        reversed_at=je.reversed_at,
        lines=[JELineOut.model_validate(l) for l in _lines(db, je.id)],
        warnings=[_issue_out(w) for w in (warnings or [])],
    )


# ---------------------------------------------------------------------------
# Create and immediately post
# ---------------------------------------------------------------------------

@router.post("/", response_model=JEOut, status_code=201)
def create_and_post_je(body: JournalEntryCreate, db: Session = Depends(get_db)):
    """Create and immediately post a journal entry. Warnings are included in the response."""
    result = validate_journal_entry(body)
    je = post_journal_entry(db, body)
    return _je_out(db, je, warnings=result.warnings)


# ---------------------------------------------------------------------------
# Draft lifecycle
# ---------------------------------------------------------------------------

@router.post("/draft", response_model=JEOut, status_code=201)
def create_draft(body: JournalEntryCreate, db: Session = Depends(get_db)):
    """Create a journal entry in draft status. Balance validation is deferred until posting."""
    je = create_draft_journal_entry(db, body)
    return _je_out(db, je)


@router.put("/{je_id}", response_model=JEOut)
def update_draft(je_id: int, body: JournalEntryCreate, db: Session = Depends(get_db)):
    """Replace a draft journal entry's header and lines. Raises 409 if not draft."""
    je = update_draft_journal_entry(db, je_id, body)
    return _je_out(db, je)


@router.post("/{je_id}/post", response_model=JEOut)
def post_draft(je_id: int, db: Session = Depends(get_db)):
    """Validate and post an existing draft journal entry. Warnings are included in response."""
    je, result = post_draft_journal_entry(db, je_id)
    return _je_out(db, je, warnings=result.warnings)


@router.delete("/{je_id}/draft", status_code=204)
def delete_draft(je_id: int, db: Session = Depends(get_db)):
    """Delete a draft journal entry. Raises 409 if not draft."""
    delete_draft_journal_entry(db, je_id)


# ---------------------------------------------------------------------------
# Reversal
# ---------------------------------------------------------------------------

@router.post("/{je_id}/reverse", response_model=JEOut, status_code=201)
def reverse_je(je_id: int, body: ReverseJERequest, db: Session = Depends(get_db)):
    """Reverse a posted journal entry. Raises 409 if not posted or already reversed."""
    rev = reverse_journal_entry(
        db,
        je_id=je_id,
        reversal_date=body.reversal_date,
        je_number=body.je_number,
        description=body.description,
        created_by=body.created_by,
    )
    return _je_out(db, rev)


# ---------------------------------------------------------------------------
# Read
# ---------------------------------------------------------------------------

@router.get("/", response_model=Page[JEOut])
def list_jes(
    entity_id: int | None = None,
    scenario_id: int | None = None,
    status: str | None = None,
    start_date: datetime.date | None = None,
    end_date: datetime.date | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=500),
    db: Session = Depends(get_db),
):
    q = db.query(JournalEntry)
    if entity_id is not None:
        q = q.filter(JournalEntry.entity_id == entity_id)
    if scenario_id is not None:
        q = q.filter(JournalEntry.scenario_id == scenario_id)
    if status is not None:
        q = q.filter(JournalEntry.status == status)
    if start_date is not None:
        q = q.filter(JournalEntry.entry_date >= start_date)
    if end_date is not None:
        q = q.filter(JournalEntry.entry_date <= end_date)
    q = q.order_by(JournalEntry.entry_date.desc(), JournalEntry.id.desc())
    total = q.count()
    items = q.offset((page - 1) * page_size).limit(page_size).all()
    return Page(
        items=[_je_out(db, je) for je in items],
        total=total,
        page=page,
        page_size=page_size,
        pages=max(1, -(-total // page_size)),
    )


@router.get("/{je_id}", response_model=JEOut)
def get_je(je_id: int, db: Session = Depends(get_db)):
    try:
        je = get_journal_entry_or_raise(db, je_id)
    except JournalEntryNotFoundError:
        raise HTTPException(status_code=404, detail=f"Journal entry {je_id} not found")
    return _je_out(db, je)
