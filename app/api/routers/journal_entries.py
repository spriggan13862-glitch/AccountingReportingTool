import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, File, Form, UploadFile
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.api.schemas import JELineOut, JEOut, Page, ReverseJERequest, ValidationIssueOut
from app.models.journal_entry import JournalEntry
from app.models.journal_entry_line import JournalEntryLine
from app.schemas.journal_entry import JournalEntryCreate
from app.services.journal_entry_service import (
    ApprovalError,
    JournalEntryNotFoundError,
    approve_journal_entry,
    create_draft_journal_entry,
    delete_draft_journal_entry,
    get_journal_entry_or_raise,
    list_journal_entry_events,
    post_draft_journal_entry,
    post_journal_entry,
    reject_journal_entry,
    reverse_journal_entry,
    submit_for_approval,
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
# Approval workflow
# ---------------------------------------------------------------------------

from pydantic import BaseModel as _BaseModel

class _ApprovalBody(_BaseModel):
    actor_name: str | None = None
    actor_user_id: int | None = None
    note: str | None = None


@router.post("/{je_id}/submit", response_model=JEOut)
def submit_je(je_id: int, body: _ApprovalBody = _ApprovalBody(), db: Session = Depends(get_db)):
    """Submit a draft entry for approval (draft → pending_approval)."""
    from app.services.journal_entry_service import ImmutableEntryError
    try:
        je = submit_for_approval(db, je_id, submitted_by=body.actor_name, actor_user_id=body.actor_user_id)
        db.commit()
        return _je_out(db, je)
    except JournalEntryNotFoundError:
        raise HTTPException(status_code=404, detail=f"Journal entry {je_id} not found")
    except ImmutableEntryError as e:
        raise HTTPException(status_code=409, detail=str(e))


@router.post("/{je_id}/approve", response_model=JEOut)
def approve_je(je_id: int, body: _ApprovalBody = _ApprovalBody(), db: Session = Depends(get_db)):
    """Approve and post a pending_approval entry. Approver must differ from creator."""
    from app.services.journal_entry_service import ImmutableEntryError
    try:
        je, result = approve_journal_entry(db, je_id, approver_name=body.actor_name, actor_user_id=body.actor_user_id)
        db.commit()
        return _je_out(db, je, warnings=result.warnings)
    except JournalEntryNotFoundError:
        raise HTTPException(status_code=404, detail=f"Journal entry {je_id} not found")
    except ApprovalError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except ImmutableEntryError as e:
        raise HTTPException(status_code=409, detail=str(e))


@router.post("/{je_id}/reject", response_model=JEOut)
def reject_je(je_id: int, body: _ApprovalBody = _ApprovalBody(), db: Session = Depends(get_db)):
    """Reject a pending_approval entry, returning it to draft."""
    from app.services.journal_entry_service import ImmutableEntryError
    try:
        je = reject_journal_entry(db, je_id, rejector_name=body.actor_name, actor_user_id=body.actor_user_id, note=body.note)
        db.commit()
        return _je_out(db, je)
    except JournalEntryNotFoundError:
        raise HTTPException(status_code=404, detail=f"Journal entry {je_id} not found")
    except ImmutableEntryError as e:
        raise HTTPException(status_code=409, detail=str(e))


class _JEEventOut(_BaseModel):
    id: int
    je_id: int
    event_type: str
    actor_name: str | None
    actor_user_id: int | None
    occurred_at: str
    note: str | None

    model_config = {"from_attributes": True}


@router.get("/{je_id}/events", response_model=list[_JEEventOut])
def get_je_events(je_id: int, db: Session = Depends(get_db)):
    """Return audit trail events for a journal entry in chronological order."""
    try:
        get_journal_entry_or_raise(db, je_id)
    except JournalEntryNotFoundError:
        raise HTTPException(status_code=404, detail=f"Journal entry {je_id} not found")
    events = list_journal_entry_events(db, je_id)
    return [_JEEventOut(
        id=e.id,
        je_id=e.je_id,
        event_type=e.event_type,
        actor_name=e.actor_name,
        actor_user_id=e.actor_user_id,
        occurred_at=str(e.occurred_at),
        note=e.note,
    ) for e in events]


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
    account_id: int | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=2000),
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
    if account_id is not None:
        q = q.filter(JournalEntry.id.in_(
            db.query(JournalEntryLine.journal_entry_id)
            .filter(JournalEntryLine.account_id == account_id)
        ))
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


@router.post("/import", status_code=201)
async def import_journal_entries(
    entity_id: int = Form(...),
    scenario_id: int | None = Form(default=None),
    overlay_group: str | None = Form(default=None),
    is_reversing: bool = Form(default=False),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    import csv
    import io
    from decimal import Decimal
    from app.models.entity import Entity
    from app.models.account import Account
    from app.models.journal_entry import JournalEntry
    from app.models.journal_entry_line import JournalEntryLine

    entity = db.get(Entity, entity_id)
    if not entity:
        raise HTTPException(status_code=400, detail=f"Entity {entity_id} not found")

    if scenario_id is None:
        from app.models.scenario import Scenario
        scenario = db.query(Scenario).filter(
            Scenario.organization_id == entity.organization_id,
            Scenario.active == True
        ).order_by(Scenario.id).first()
        if not scenario:
            scenario = db.query(Scenario).filter(Scenario.active == True).order_by(Scenario.id).first()
        if not scenario:
            raise HTTPException(status_code=400, detail="No active scenarios found. Create a scenario first.")
        scenario_id = scenario.id

    content = await file.read()
    decoded = content.decode("utf-8-sig")
    reader = csv.DictReader(io.StringIO(decoded))

    # Validate headers
    headers = [h.strip().lower() for h in (reader.fieldnames or [])]
    required = {"je_number", "entry_date", "description", "account_number", "debit", "credit"}
    missing = required - set(headers)
    if missing:
        raise HTTPException(
            status_code=400,
            detail=f"CSV is missing required columns: {', '.join(missing)}"
        )

    field_map = {h: next(original for original in reader.fieldnames if original.strip().lower() == h) for h in required}

    groups: dict[str, list[dict]] = {}
    for idx, row in enumerate(reader, start=2):
        je_num = row[field_map["je_number"]].strip()
        date_str = row[field_map["entry_date"]].strip()
        desc = row[field_map["description"]].strip()
        acct_num = row[field_map["account_number"]].strip()
        debit_str = row[field_map["debit"]].strip() or "0"
        credit_str = row[field_map["credit"]].strip() or "0"

        group_key = je_num if je_num else f"{date_str}::{desc}"
        if not group_key or group_key == "::":
            raise HTTPException(
                status_code=400,
                detail=f"Row {idx} is missing grouping identifiers (je_number or entry_date + description)"
            )

        try:
            debit = Decimal(debit_str)
            credit = Decimal(credit_str)
        except Exception:
            raise HTTPException(
                status_code=400,
                detail=f"Row {idx} contains invalid debit/credit amount: '{debit_str}' / '{credit_str}'"
            )

        if group_key not in groups:
            groups[group_key] = []
        
        groups[group_key].append({
            "row_idx": idx,
            "je_number": je_num,
            "entry_date": date_str,
            "description": desc,
            "account_number": acct_num,
            "debit": debit,
            "credit": credit
        })

    if not groups:
        raise HTTPException(status_code=400, detail="The uploaded CSV file contains no data rows")

    created_jes = []
    for key, lines_data in groups.items():
        total_debits = sum(line["debit"] for line in lines_data)
        total_credits = sum(line["credit"] for line in lines_data)
        
        if total_debits != total_credits:
            je_identifier = lines_data[0]["je_number"] or f"Date: {lines_data[0]['entry_date']}, Desc: {lines_data[0]['description']}"
            raise HTTPException(
                status_code=400,
                detail=f"Journal entry '{je_identifier}' is unbalanced: Total Debits ({total_debits}) must equal Total Credits ({total_credits})"
            )

        line_objects = []
        for line_num, line in enumerate(lines_data, start=1):
            acct_num = line["account_number"]
            acct = db.query(Account).filter(
                Account.entity_id == entity_id,
                Account.account_number == acct_num,
                Account.account_status == "active"
            ).first()
            if not acct:
                raise HTTPException(
                    status_code=400,
                    detail=f"Account number '{acct_num}' on row {line['row_idx']} does not exist or is inactive for this entity."
                )
            
            line_objects.append(
                JournalEntryLine(
                    line_number=line_num,
                    account_id=acct.id,
                    debit=line["debit"],
                    credit=line["credit"],
                    description=line["description"] or None
                )
            )

        first_line = lines_data[0]
        try:
            entry_date = datetime.date.fromisoformat(first_line["entry_date"])
        except ValueError:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid date format '{first_line['entry_date']}' on row {first_line['row_idx']}. Use YYYY-MM-DD."
            )

        je = JournalEntry(
            entity_id=entity_id,
            scenario_id=scenario_id,
            entry_date=entry_date,
            je_number=first_line["je_number"] or f"JE-IMP-{datetime.datetime.now().strftime('%m%d%H%M%S')}-{key[:4]}",
            description=first_line["description"] or "Imported via CSV",
            source="csv_import",
            status="posted",
            overlay_group=overlay_group,
        )
        db.add(je)
        db.flush()

        for l_obj in line_objects:
            l_obj.journal_entry_id = je.id
            db.add(l_obj)
        db.flush()

        if is_reversing:
            if entry_date.month == 12:
                reversal_date = datetime.date(entry_date.year + 1, 1, 1)
            else:
                reversal_date = datetime.date(entry_date.year, entry_date.month + 1, 1)
            
            reverse_journal_entry(
                db,
                je_id=je.id,
                reversal_date=reversal_date,
                je_number=f"REV-{je.je_number}",
                description=f"Reversal of {je.description}",
            )

        created_jes.append(je)

    db.flush()
    db.commit()

    return {
        "success": True,
        "message": f"Successfully imported {len(created_jes)} journal entries",
        "imported_count": len(created_jes)
    }
