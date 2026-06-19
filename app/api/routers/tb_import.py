"""
TB import router — both legacy single-shot endpoints and M23 batch pipeline.

Legacy endpoints (backward-compatible):
  POST /tb-imports/           — direct CSV→JE import
  POST /tb-imports/validate   — validate without importing
  GET  /tb-imports/{id}       — get legacy import record

M23 batch pipeline endpoints:
  POST /tb-imports/batches/upload                       — upload file, create batch
  GET  /tb-imports/batches/                             — list batches
  GET  /tb-imports/batches/{batch_id}                   — get batch detail
  GET  /tb-imports/batches/{batch_id}/lines             — get import lines
  GET  /tb-imports/batches/{batch_id}/issues            — get validation issues
  GET  /tb-imports/batches/{batch_id}/suggestions       — suggested account mappings
  GET  /tb-imports/batches/{batch_id}/unmapped          — unmapped lines only
  PUT  /tb-imports/batches/{batch_id}/column-mapping    — update column mapping
  POST /tb-imports/batches/{batch_id}/map-line/{line_id}   — map single line
  POST /tb-imports/batches/{batch_id}/skip-line/{line_id}  — skip single line
  POST /tb-imports/batches/{batch_id}/bulk-map             — bulk map lines
  POST /tb-imports/batches/{batch_id}/create-account/{lid} — create new account
  POST /tb-imports/batches/{batch_id}/validate          — run validation
  POST /tb-imports/batches/{batch_id}/post              — post batch as JE
  POST /tb-imports/batches/{batch_id}/rollback          — reverse a posted batch

Templates:
  GET    /tb-imports/templates/         — list templates
  POST   /tb-imports/templates/         — create template
  DELETE /tb-imports/templates/{id}     — delete (soft) template
"""

import datetime

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Response, UploadFile
from sqlalchemy.orm import Session

from app.api.deps import get_db, get_current_user, get_required_user, get_storage
from app.services.storage_service import StorageBackend
from app.services.organization_service import get_organization_or_raise
from app.services.document_service import upload_document, attach_document
from app.api.schemas import (
    BatchPostRequest,
    BulkMapRequest,
    ColumnMappingUpdate,
    CreateAccountFromLineRequest,
    CreateTemplateRequest,
    DetectResult,
    ImportBatchOut,
    ImportIssueOut,
    ImportLineOut,
    ImportReadinessOut,
    ImportSuggestionOut,
    ImportTemplateOut,
    MapLineRequest,
    RawPreviewOut,
    TbImportOut,
    ValidationIssueOut,
    ValidationOut,
)
from app.models.import_batch import ImportBatch
from app.models.tb_import import TbImport
from app.services import import_batch_service as svc
from app.services.import_batch_service import (
    ImportBatchError,
    ImportBatchNotFoundError,
    ImportBatchStateError,
)
from app.services.tb_import_service import TbImportError, import_trial_balance, preview_tb_import

router = APIRouter(prefix="/tb-imports", tags=["tb-imports"])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

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


def _batch_error_to_http(exc: Exception) -> HTTPException:
    if isinstance(exc, ImportBatchNotFoundError):
        return HTTPException(status_code=404, detail=str(exc))
    if isinstance(exc, ImportBatchStateError):
        return HTTPException(status_code=409, detail=str(exc))
    return HTTPException(status_code=400, detail=str(exc))


# ---------------------------------------------------------------------------
# Legacy endpoints (backward-compatible)
# ---------------------------------------------------------------------------

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
    """Import a trial balance CSV directly (legacy). Posts a JE and records the audit row."""
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
    """Preview-validate a TB CSV without importing (legacy)."""
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
    """Return the status of a prior legacy TB import by audit record ID."""
    tb = db.get(TbImport, import_id)
    if tb is None:
        raise HTTPException(status_code=404, detail=f"TB import {import_id} not found")
    return tb


# ---------------------------------------------------------------------------
# M27: File detection (no DB writes)
# ---------------------------------------------------------------------------

@router.post("/detect", response_model=DetectResult)
async def detect_file(
    file: UploadFile = File(...),
):
    """
    Detect worksheet names, column headers, and mapping confidence without storing anything.
    Use this before the full upload to let users pick the right sheet and confirm column mapping.
    """
    content = await file.read()
    try:
        result = svc.detect_file(content, file.filename or "upload")
        return result
    except svc.ImportBatchError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


# ---------------------------------------------------------------------------
# M23 Batch pipeline — upload
# ---------------------------------------------------------------------------

@router.post("/batches/upload", response_model=ImportBatchOut, status_code=201)
async def upload_batch(
    entity_id: int = Form(...),
    organization_id: int = Form(...),
    as_of_date: datetime.date = Form(...),
    scenario_id: int | None = Form(None),
    period_id: int | None = Form(None),
    template_id: int | None = Form(None),
    sheet_name: str | None = Form(None),
    header_row_index: int | None = Form(None),
    force: bool = Query(False),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
    storage: StorageBackend = Depends(get_storage),
):
    """Upload a TB/GL file and start the import pipeline. Pass sheet_name to select a specific XLSX sheet."""
    import hashlib as _hashlib
    content = await file.read()

    if not force:
        content_hash = _hashlib.sha256(content).hexdigest()
        existing = (
            db.query(ImportBatch)
            .filter(
                ImportBatch.content_hash == content_hash,
                ImportBatch.entity_id == entity_id,
                ImportBatch.status.notin_(["rolled_back", "rejected"]),
            )
            .first()
        )
        if existing:
            raise HTTPException(
                status_code=409,
                detail={
                    "code": "DUPLICATE_IMPORT",
                    "existing_batch_id": existing.id,
                    "existing_status": existing.status,
                },
            )

    try:
        try:
            org = get_organization_or_raise(db, organization_id)
        except Exception:
            from app.models.organization import Organization
            org = db.query(Organization).filter(Organization.slug == "default-org").first()
            if not org:
                org = Organization(name="Default Org", slug="default-org", is_active=True)
                db.add(org)
                db.flush()
            organization_id = org.id
        doc = upload_document(
            db=db,
            organization_id=organization_id,
            content=content,
            original_file_name=file.filename or "upload.csv",
            document_type="tb_import",
            storage=storage,
            org_slug=org.slug,
            acting_user=current_user,
        )
        batch = svc.upload_import_batch(
            db=db,
            file_content=content,
            filename=file.filename or "upload",
            entity_id=entity_id,
            organization_id=organization_id,
            as_of_date=as_of_date,
            scenario_id=scenario_id,
            period_id=period_id,
            uploaded_by_user_id=getattr(current_user, "id", None),
            template_id=template_id,
            sheet_name=sheet_name,
            header_row_index=header_row_index,
        )
        attach_document(
            db=db,
            doc_id=doc.id,
            linked_object_type="tb_import",
            linked_object_id=batch.id,
            acting_user=current_user,
        )
        db.commit()
        db.refresh(batch)
        return batch
    except ImportBatchError as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("/batches/", response_model=list[ImportBatchOut])
def list_batches(
    organization_id: int = Query(...),
    entity_id: int | None = Query(None),
    status: str | None = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    return svc.list_batches(db, organization_id, entity_id, status, limit, offset)


@router.get("/batches/{batch_id}", response_model=ImportBatchOut)
def get_batch(batch_id: int, db: Session = Depends(get_db)):
    try:
        return svc.get_batch(db, batch_id)
    except ImportBatchNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.get("/batches/{batch_id}/lines", response_model=list[ImportLineOut])
def get_batch_lines(
    batch_id: int,
    mapping_status: str | None = Query(None),
    db: Session = Depends(get_db),
):
    return svc.get_batch_lines(db, batch_id, mapping_status)


@router.get("/batches/{batch_id}/issues", response_model=list[ImportIssueOut])
def get_batch_issues(
    batch_id: int,
    severity: str | None = Query(None),
    db: Session = Depends(get_db),
):
    return svc.get_batch_issues(db, batch_id, severity)


@router.get("/batches/{batch_id}/unmapped", response_model=list[ImportLineOut])
def get_unmapped_lines(batch_id: int, db: Session = Depends(get_db)):
    return svc.get_unmapped_lines(db, batch_id)


@router.get("/batches/{batch_id}/raw-preview", response_model=RawPreviewOut)
def get_raw_preview(
    batch_id: int,
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
):
    """Return first N rows of raw import data for spreadsheet-like preview."""
    try:
        return svc.get_raw_preview(db, batch_id, limit=limit)
    except svc.ImportBatchNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.get("/batches/{batch_id}/export-mappings")
def export_mappings(batch_id: int, db: Session = Depends(get_db)):
    """Download current line-to-account mappings as a CSV file."""
    try:
        csv_content = svc.export_mappings_csv(db, batch_id)
        return Response(
            content=csv_content,
            media_type="text/csv",
            headers={"Content-Disposition": f'attachment; filename="mappings_batch_{batch_id}.csv"'},
        )
    except svc.ImportBatchNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.get("/batches/{batch_id}/suggestions", response_model=list[ImportSuggestionOut])
def get_suggestions(batch_id: int, db: Session = Depends(get_db)):
    try:
        return svc.suggest_mappings(db, batch_id)
    except ImportBatchNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


# ---------------------------------------------------------------------------
# M23 Batch pipeline — mapping
# ---------------------------------------------------------------------------

@router.put("/batches/{batch_id}/column-mapping", response_model=ImportBatchOut)
def update_column_mapping(
    batch_id: int,
    body: ColumnMappingUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    try:
        batch = svc.update_column_mapping(
            db, batch_id, body.column_mapping,
            acting_user_id=getattr(current_user, "id", None),
        )
        db.commit()
        db.refresh(batch)
        return batch
    except (ImportBatchNotFoundError, ImportBatchStateError, ImportBatchError) as exc:
        db.rollback()
        raise _batch_error_to_http(exc)


@router.post("/batches/{batch_id}/map-line/{line_id}", response_model=ImportLineOut)
def map_line(
    batch_id: int,
    line_id: int,
    body: MapLineRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    try:
        line = svc.map_line_to_account(
            db, batch_id, line_id, body.account_id,
            acting_user_id=getattr(current_user, "id", None),
        )
        db.commit()
        db.refresh(line)
        return line
    except (ImportBatchNotFoundError, ImportBatchStateError, ImportBatchError) as exc:
        db.rollback()
        raise _batch_error_to_http(exc)


@router.post("/batches/{batch_id}/skip-line/{line_id}", response_model=ImportLineOut)
def skip_line(
    batch_id: int,
    line_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    try:
        line = svc.skip_line(
            db, batch_id, line_id,
            acting_user_id=getattr(current_user, "id", None),
        )
        db.commit()
        db.refresh(line)
        return line
    except (ImportBatchNotFoundError, ImportBatchStateError, ImportBatchError) as exc:
        db.rollback()
        raise _batch_error_to_http(exc)


@router.post("/batches/{batch_id}/bulk-map", response_model=list[ImportLineOut])
def bulk_map(
    batch_id: int,
    body: BulkMapRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    try:
        lines = svc.bulk_map_lines(
            db, batch_id, body.mappings,
            acting_user_id=getattr(current_user, "id", None),
        )
        db.commit()
        return lines
    except (ImportBatchNotFoundError, ImportBatchStateError, ImportBatchError) as exc:
        db.rollback()
        raise _batch_error_to_http(exc)


@router.post("/batches/{batch_id}/create-account/{line_id}")
def create_account_from_line(
    batch_id: int,
    line_id: int,
    body: CreateAccountFromLineRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    try:
        account, line = svc.create_account_from_line(
            db, batch_id, line_id,
            account_number=body.account_number,
            account_name=body.account_name,
            account_type=body.account_type,
            normal_balance=body.normal_balance,
            acting_user_id=getattr(current_user, "id", None),
            reporting_taxonomy_line_id=body.reporting_taxonomy_line_id,
        )
        db.commit()
        return {
            "account_id": account.id,
            "account_number": account.account_number,
            "account_name": account.account_name,
            "line_id": line.id,
            "mapping_status": line.mapping_status,
        }
    except (ImportBatchNotFoundError, ImportBatchStateError, ImportBatchError) as exc:
        db.rollback()
        raise _batch_error_to_http(exc)


# ---------------------------------------------------------------------------
# M23 Batch pipeline — validate / post / rollback
# ---------------------------------------------------------------------------

@router.post("/batches/{batch_id}/validate", response_model=ValidationOut)
def validate_batch(batch_id: int, db: Session = Depends(get_db)):
    try:
        result = svc.validate_batch(db, batch_id)
        db.commit()
        return ValidationOut(
            success=not result.has_errors,
            errors=[_issue_out(i) for i in result.errors],
            warnings=[_issue_out(i) for i in result.warnings],
            info=[_issue_out(i) for i in result.infos],
        )
    except (ImportBatchNotFoundError, ImportBatchStateError) as exc:
        db.rollback()
        raise _batch_error_to_http(exc)


@router.post("/batches/{batch_id}/post", response_model=ImportBatchOut)
def post_batch(
    batch_id: int,
    body: BatchPostRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_required_user),
):
    try:
        batch = svc.post_batch(
            db, batch_id,
            je_number=body.je_number,
            acting_user=current_user,
            notes=body.notes,
        )
        db.commit()
        db.refresh(batch)
        return batch
    except (ImportBatchNotFoundError, ImportBatchStateError, ImportBatchError) as exc:
        db.rollback()
        raise _batch_error_to_http(exc)
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/batches/{batch_id}/rollback", response_model=ImportBatchOut)
def rollback_batch(
    batch_id: int,
    body: BatchPostRequest | None = None,
    db: Session = Depends(get_db),
    current_user=Depends(get_required_user),
):
    try:
        reversal_number = body.reversal_je_number if body else None
        batch = svc.rollback_batch(
            db, batch_id,
            acting_user=current_user,
            reversal_je_number=reversal_number,
        )
        db.commit()
        db.refresh(batch)
        return batch
    except (ImportBatchNotFoundError, ImportBatchStateError, ImportBatchError) as exc:
        db.rollback()
        raise _batch_error_to_http(exc)


@router.delete("/batches/{batch_id}", status_code=204)
def delete_batch(
    batch_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_required_user),
):
    try:
        svc.delete_batch(db, batch_id)
        db.commit()
    except ImportBatchNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except ImportBatchStateError as exc:
        raise HTTPException(status_code=409, detail=str(exc))


# ---------------------------------------------------------------------------
# Import Readiness Matrix
# ---------------------------------------------------------------------------

@router.get("/readiness/{entity_id}", response_model=ImportReadinessOut)
def get_import_readiness(entity_id: int, db: Session = Depends(get_db)):
    from app.models.account import Account
    from app.models.import_batch import ImportBatch
    from app.models.journal_entry import JournalEntry
    from app.models.journal_entry_line import JournalEntryLine
    from app.models.view_account_override import ViewAccountOverride

    coa_count = db.query(Account).filter(Account.entity_id == entity_id).count()
    coa_available = coa_count > 0

    # Balances available: any posted TB import batch for this entity
    balances_batch = (
        db.query(ImportBatch)
        .filter(ImportBatch.entity_id == entity_id, ImportBatch.status == "posted")
        .first()
    )
    balances_available = balances_batch is not None

    # GL detail: posted journal entries beyond opening balances
    gl_count = (
        db.query(JournalEntry)
        .filter(
            JournalEntry.entity_id == entity_id,
            JournalEntry.status == "posted",
            JournalEntry.source != "tb_import",
        )
        .count()
    )
    gl_detail_available = gl_count > 0

    # FS available: any JournalEntryLine exists for this entity (proxy for financial data)
    fs_line = (
        db.query(JournalEntryLine)
        .join(JournalEntry, JournalEntry.id == JournalEntryLine.journal_entry_id)
        .filter(JournalEntry.entity_id == entity_id, JournalEntry.status == "posted")
        .first()
    )
    fs_available = fs_line is not None

    # Taxonomy completion: % of COA accounts that have at least one taxonomy mapping
    mapped_count = (
        db.query(ViewAccountOverride.account_id)
        .join(Account, Account.id == ViewAccountOverride.account_id)
        .filter(Account.entity_id == entity_id, ViewAccountOverride.taxonomy_line_id.isnot(None))
        .distinct()
        .count()
    )
    taxonomy_completion_pct = round((mapped_count / coa_count * 100) if coa_count > 0 else 0.0, 1)

    # Readiness gates
    ready_for_statements = coa_available and balances_available and taxonomy_completion_pct >= 80
    ready_for_bridge = coa_available and balances_available
    ready_for_drilldown = coa_available and balances_available and gl_detail_available

    warnings: list[str] = []
    if balances_available and not coa_available:
        warnings.append("Balances imported but no COA accounts found")
    if coa_available and not balances_available:
        warnings.append("COA accounts exist but no trial balance has been posted")
    if gl_detail_available and not balances_available:
        warnings.append("GL activity found but no opening balance has been posted")
    if fs_available and coa_count == 0:
        warnings.append("Financial statements exist but no account detail is mapped")
    if coa_available and taxonomy_completion_pct < 80:
        warnings.append(
            f"Taxonomy mapping {taxonomy_completion_pct:.0f}% complete — "
            "financial statements may be incomplete"
        )

    return ImportReadinessOut(
        entity_id=entity_id,
        coa_available=coa_available,
        coa_account_count=coa_count,
        balances_available=balances_available,
        gl_detail_available=gl_detail_available,
        fs_available=fs_available,
        taxonomy_completion_pct=taxonomy_completion_pct,
        ready_for_statements=ready_for_statements,
        ready_for_bridge=ready_for_bridge,
        ready_for_drilldown=ready_for_drilldown,
        warnings=warnings,
    )


# ---------------------------------------------------------------------------
# Templates
# ---------------------------------------------------------------------------

@router.get("/templates/", response_model=list[ImportTemplateOut])
def list_templates(
    organization_id: int = Query(...),
    db: Session = Depends(get_db),
):
    return svc.list_templates(db, organization_id)


@router.post("/templates/", response_model=ImportTemplateOut, status_code=201)
def create_template(
    body: CreateTemplateRequest,
    organization_id: int = Query(...),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    tmpl = svc.create_template(
        db,
        organization_id=organization_id,
        name=body.name,
        description=body.description,
        source_format=body.source_format,
        column_mapping=body.column_mapping,
        created_by_user_id=getattr(current_user, "id", None),
    )
    db.commit()
    db.refresh(tmpl)
    return tmpl


@router.delete("/templates/{template_id}", status_code=204)
def delete_template(
    template_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_required_user),
):
    svc.delete_template(db, template_id)
    db.commit()
