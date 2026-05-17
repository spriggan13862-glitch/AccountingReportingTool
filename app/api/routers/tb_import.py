import datetime

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.api.schemas import TbImportOut, ValidationIssueOut, ValidationOut
from app.models.tb_import import TbImport
from app.services.tb_import_service import TbImportError, import_trial_balance, preview_tb_import

router = APIRouter(prefix="/tb-imports", tags=["tb-imports"])


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


@router.post("/", response_model=TbImportOut, status_code=201)
async def import_tb(
    entity_id: int = Form(...),
    scenario_id: int = Form(...),
    as_of_date: datetime.date = Form(...),
    je_number: str = Form(...),
    imported_by: str | None = Form(None),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    """Import a trial balance CSV. Posts a journal entry and records the import audit row."""
    csv_content = (await file.read()).decode("utf-8")
    tb_import = import_trial_balance(
        db=db,
        entity_id=entity_id,
        scenario_id=scenario_id,
        as_of_date=as_of_date,
        csv_content=csv_content,
        filename=file.filename or "upload.csv",
        je_number=je_number,
        imported_by=imported_by,
    )
    return tb_import


@router.post("/validate", response_model=ValidationOut)
async def validate_tb(
    entity_id: int = Form(...),
    scenario_id: int = Form(...),
    as_of_date: datetime.date = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    """
    Preview-validate a TB CSV without importing.
    Returns a ValidationOut listing any issues found.
    """
    csv_content = (await file.read()).decode("utf-8")
    result = preview_tb_import(
        db=db,
        entity_id=entity_id,
        scenario_id=scenario_id,
        as_of_date=as_of_date,
        csv_content=csv_content,
        filename=file.filename or "preview.csv",
    )
    return ValidationOut(
        success=not result.has_errors,
        errors=[_issue_out(i) for i in result.errors],
        warnings=[_issue_out(i) for i in result.warnings],
        info=[_issue_out(i) for i in result.infos],
    )


@router.get("/{import_id}", response_model=TbImportOut)
def get_import_status(import_id: int, db: Session = Depends(get_db)):
    """Return the status of a prior TB import by its audit record ID."""
    tb = db.get(TbImport, import_id)
    if tb is None:
        raise HTTPException(status_code=404, detail=f"TB import {import_id} not found")
    return tb
