"""
Reconciliation API — account reconciliation, rollforward schedules, and tie-out engine.
"""

import io

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.api.schemas import (
    CashRollforwardRequest,
    DebtRollforwardRequest,
    FaRollforwardRequest,
    ReconciliationCreate,
    ReconciliationLineCreate,
    ReconciliationLineOut,
    ReconciliationOut,
    ReconciliationTransition,
    ReconciliationUpdateBalances,
    ReRollforwardRequest,
    RollforwardRequest,
    RollforwardScheduleLineOut,
    SupportReferenceCreate,
    SupportReferenceOut,
)
from app.services.reconciliation_service import (
    ReconciliationNotFoundError,
    ReconciliationStateError,
    ReconciliationValidationError,
    ReviewerSeparationError,
    add_reconciliation_line,
    add_support_reference,
    build_cash_rollforward,
    build_debt_rollforward,
    build_fa_rollforward,
    build_re_rollforward,
    create_reconciliation,
    get_reconciliation,
    get_reconciliation_lines,
    get_support_references,
    list_reconciliations,
    rollforward_reconciliation,
    transition_status,
    update_reconciliation_balances,
)
from app.services.export_service import build_reconciliation_workbook, workbook_to_bytes

router = APIRouter(prefix="/reconciliations", tags=["reconciliations"])


# ---------------------------------------------------------------------------
# CRUD
# ---------------------------------------------------------------------------

@router.post("", response_model=ReconciliationOut, status_code=201)
def create(body: ReconciliationCreate, db: Session = Depends(get_db)):
    recon = create_reconciliation(
        db,
        organization_id=body.organization_id,
        entity_id=body.entity_id,
        account_id=body.account_id,
        period_id=body.period_id,
        reconciliation_type=body.reconciliation_type,
        official_balance=body.official_balance,
        supporting_balance=body.supporting_balance,
        tolerance_amount=body.tolerance_amount,
        notes=body.notes,
    )
    db.commit()
    db.refresh(recon)
    return recon


@router.get("", response_model=list[ReconciliationOut])
def list_all(
    organization_id: int = Query(...),
    entity_id: int | None = Query(None),
    period_id: int | None = Query(None),
    status: str | None = Query(None),
    db: Session = Depends(get_db),
):
    return list_reconciliations(
        db, organization_id=organization_id,
        entity_id=entity_id, period_id=period_id, status=status,
    )


@router.get("/{recon_id}", response_model=ReconciliationOut)
def get_one(recon_id: int, db: Session = Depends(get_db)):
    try:
        return get_reconciliation(db, recon_id)
    except ReconciliationNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.patch("/{recon_id}/balances", response_model=ReconciliationOut)
def update_balances(
    recon_id: int,
    body: ReconciliationUpdateBalances,
    db: Session = Depends(get_db),
):
    try:
        recon = update_reconciliation_balances(
            db, recon_id,
            official_balance=body.official_balance,
            supporting_balance=body.supporting_balance,
            variance_explanation=body.variance_explanation,
            draft_preview_balance=body.draft_preview_balance,
        )
        db.commit()
        db.refresh(recon)
        return recon
    except ReconciliationNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/{recon_id}/transition", response_model=ReconciliationOut)
def transition(
    recon_id: int,
    body: ReconciliationTransition,
    db: Session = Depends(get_db),
):
    try:
        recon = transition_status(
            db, recon_id,
            target_status=body.target_status,
            user_id=body.user_id,
            comment=body.comment,
        )
        db.commit()
        db.refresh(recon)
        return recon
    except ReconciliationNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except ReconciliationStateError as e:
        raise HTTPException(status_code=409, detail=str(e))
    except ReviewerSeparationError as e:
        raise HTTPException(status_code=422, detail=str(e))


# ---------------------------------------------------------------------------
# Lines
# ---------------------------------------------------------------------------

@router.post("/{recon_id}/lines", response_model=ReconciliationLineOut, status_code=201)
def add_line(
    recon_id: int,
    body: ReconciliationLineCreate,
    db: Session = Depends(get_db),
):
    try:
        get_reconciliation(db, recon_id)
    except ReconciliationNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    line = add_reconciliation_line(
        db, recon_id,
        description=body.description,
        source_type=body.source_type,
        source_reference=body.source_reference,
        debit=body.debit,
        credit=body.credit,
        is_reconciling_item=body.is_reconciling_item,
        reconciling_notes=body.reconciling_notes,
    )
    db.commit()
    db.refresh(line)
    return line


@router.get("/{recon_id}/lines", response_model=list[ReconciliationLineOut])
def get_lines(recon_id: int, db: Session = Depends(get_db)):
    try:
        get_reconciliation(db, recon_id)
    except ReconciliationNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return get_reconciliation_lines(db, recon_id)


# ---------------------------------------------------------------------------
# Support references
# ---------------------------------------------------------------------------

@router.post("/{recon_id}/support", response_model=SupportReferenceOut, status_code=201)
def add_support(
    recon_id: int,
    body: SupportReferenceCreate,
    db: Session = Depends(get_db),
):
    try:
        get_reconciliation(db, recon_id)
    except ReconciliationNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    ref = add_support_reference(
        db, recon_id,
        reference_type=body.reference_type,
        document_id=body.document_id,
        journal_entry_id=body.journal_entry_id,
        external_ref=body.external_ref,
        description=body.description,
        added_by_user_id=body.added_by_user_id,
    )
    db.commit()
    db.refresh(ref)
    return ref


@router.get("/{recon_id}/support", response_model=list[SupportReferenceOut])
def get_support(recon_id: int, db: Session = Depends(get_db)):
    try:
        get_reconciliation(db, recon_id)
    except ReconciliationNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return get_support_references(db, recon_id)


# ---------------------------------------------------------------------------
# Rollforward
# ---------------------------------------------------------------------------

@router.post("/{recon_id}/rollforward", response_model=ReconciliationOut, status_code=201)
def rollforward(
    recon_id: int,
    body: RollforwardRequest,
    db: Session = Depends(get_db),
):
    try:
        new_recon = rollforward_reconciliation(
            db, recon_id,
            new_period_id=body.new_period_id,
            new_official_balance=body.new_official_balance,
        )
        db.commit()
        db.refresh(new_recon)
        return new_recon
    except ReconciliationNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except ReconciliationStateError as e:
        raise HTTPException(status_code=409, detail=str(e))


# ---------------------------------------------------------------------------
# Schedule builders
# ---------------------------------------------------------------------------

@router.post("/schedules/cash", response_model=list[RollforwardScheduleLineOut])
def cash_schedule(body: CashRollforwardRequest):
    lines = build_cash_rollforward(body.opening_balance, body.inflows, body.outflows)
    return [RollforwardScheduleLineOut(label=l.label, amount=l.amount, is_subtotal=l.is_subtotal) for l in lines]


@router.post("/schedules/re", response_model=list[RollforwardScheduleLineOut])
def re_schedule(body: ReRollforwardRequest):
    lines = build_re_rollforward(body.beginning_re, body.net_income, body.dividends)
    return [RollforwardScheduleLineOut(label=l.label, amount=l.amount, is_subtotal=l.is_subtotal) for l in lines]


@router.post("/schedules/fa", response_model=list[RollforwardScheduleLineOut])
def fa_schedule(body: FaRollforwardRequest):
    lines = build_fa_rollforward(
        body.beginning_balance, body.additions, body.disposals, body.depreciation
    )
    return [RollforwardScheduleLineOut(label=l.label, amount=l.amount, is_subtotal=l.is_subtotal) for l in lines]


@router.post("/schedules/debt", response_model=list[RollforwardScheduleLineOut])
def debt_schedule(body: DebtRollforwardRequest):
    lines = build_debt_rollforward(body.beginning_balance, body.new_borrowings, body.repayments)
    return [RollforwardScheduleLineOut(label=l.label, amount=l.amount, is_subtotal=l.is_subtotal) for l in lines]


# ---------------------------------------------------------------------------
# Export
# ---------------------------------------------------------------------------

@router.get("/{recon_id}/export")
def export_reconciliation(recon_id: int, db: Session = Depends(get_db)):
    try:
        recon = get_reconciliation(db, recon_id)
    except ReconciliationNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    lines = get_reconciliation_lines(db, recon_id)
    support = get_support_references(db, recon_id)
    wb = build_reconciliation_workbook(recon, lines, support)
    data = workbook_to_bytes(wb)
    filename = f"RECON_{recon_id}_account_{recon.account_id}.xlsx"
    return StreamingResponse(
        io.BytesIO(data),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
