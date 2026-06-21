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
import json

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Response, UploadFile
from sqlalchemy.orm import Session

from app.api.deps import get_db, get_current_user, get_required_user, get_storage
from app.services.storage_service import StorageBackend
from app.services.organization_service import get_organization_or_raise
from app.services.document_service import upload_document, attach_document
from app.api.schemas import (
    AccountMatchResult,
    AssignParentRequest,
    BatchPostRequest,
    BulkAssignFsliRequest,
    BulkMapRequest,
    ColumnMappingUpdate,
    CreateAccountFromLineRequest,
    CreateTemplateRequest,
    DetectedTotalRow,
    DetectResult,
    ExcludeLinesRequest,
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
    column_mapping: str | None = Form(None),
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

    col_map_parsed: dict[str, str] | None = None
    if column_mapping:
        try:
            col_map_parsed = json.loads(column_mapping)
        except (json.JSONDecodeError, ValueError):
            raise HTTPException(status_code=400, detail="column_mapping must be valid JSON")

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
            column_mapping=col_map_parsed,
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


@router.post("/batches/{batch_id}/parse-and-match", response_model=list[AccountMatchResult])
def parse_and_match(batch_id: int, db: Session = Depends(get_db)):
    """
    Parse raw account labels for all unmapped lines and run the matching engine.
    Returns match status, conflict reasons, and confidence for each line.
    """
    from app.services.account_parser import parse_account_label
    from app.services.account_matching import find_best_match
    from app.models.import_line import ImportLine

    try:
        batch = svc.get_batch(db, batch_id)
    except ImportBatchNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))

    lines = (
        db.query(ImportLine)
        .filter(ImportLine.batch_id == batch_id, ImportLine.mapping_status == "unmapped")
        .order_by(ImportLine.line_number)
        .all()
    )

    results: list[AccountMatchResult] = []
    for line in lines:
        raw = f"{line.raw_account_number or ''} {line.raw_account_name or ''}".strip()
        parsed = parse_account_label(raw)
        match = find_best_match(parsed, batch.entity_id, db)
        results.append(AccountMatchResult(
            line_id=line.id,
            raw=raw,
            parsed_number=parsed.account_number,
            parsed_name=parsed.account_name,
            match_status=match.status.value,
            matched_account_id=match.matched_account.id if match.matched_account else None,
            matched_account_number=match.matched_account.account_number if match.matched_account else None,
            matched_account_name=match.matched_account.account_name if match.matched_account else None,
            conflict_reason=match.conflict_reason,
            confidence=match.confidence,
        ))
    return results


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


@router.post("/batches/{batch_id}/exclude-lines", response_model=list[ImportLineOut])
def exclude_lines(
    batch_id: int,
    body: ExcludeLinesRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Mark a set of import lines as skipped (excluded from posting)."""
    try:
        svc.get_batch(db, batch_id)
    except ImportBatchNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))

    from app.models.import_line import ImportLine
    lines = (
        db.query(ImportLine)
        .filter(ImportLine.batch_id == batch_id, ImportLine.id.in_(body.line_ids))
        .all()
    )
    for line in lines:
        line.mapping_status = "skipped"
        line.notes = f"Excluded: {body.reason}"
    db.commit()
    for line in lines:
        db.refresh(line)
    return lines


@router.get("/batches/{batch_id}/detect-total-rows", response_model=list[DetectedTotalRow])
def detect_total_rows(batch_id: int, db: Session = Depends(get_db)):
    """
    Heuristically detect total/header/blank rows in the import batch.
    Returns rows likely to be totals, subtotals, headers, or blanks that should be excluded.
    """
    try:
        svc.get_batch(db, batch_id)
    except ImportBatchNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))

    from app.models.import_line import ImportLine
    from app.services.account_parser import parse_account_label
    import statistics

    lines = (
        db.query(ImportLine)
        .filter(ImportLine.batch_id == batch_id)
        .order_by(ImportLine.line_number)
        .all()
    )

    # Compute median absolute amount across lines that have amounts
    amounts = []
    for line in lines:
        amt = float(line.debit or 0) + float(line.credit or 0)
        if amt > 0:
            amounts.append(amt)
    median_amt = statistics.median(amounts) if amounts else 0

    _TOTAL_PREFIXES = ("total", "subtotal", "grand total", "check", "sum", "net total", "less")

    results: list[DetectedTotalRow] = []
    for line in lines:
        if line.mapping_status == "skipped":
            continue

        name = (line.raw_account_name or "").strip()
        number = (line.raw_account_number or "").strip()
        amt = float(line.debit or 0) + float(line.credit or 0)

        reason: str | None = None
        confidence: float = 0.0

        name_lower = name.lower()

        if any(name_lower.startswith(p) for p in _TOTAL_PREFIXES):
            reason = "total_row"
            confidence = 0.95
        elif not number and not name and amt > 0:
            reason = "blank_account_with_amount"
            confidence = 0.85
        elif not number and name and name == name.upper() and not any(c.isdigit() for c in name):
            reason = "header_row"
            confidence = 0.75
        elif not number and name_lower.startswith("total"):
            reason = "total_row"
            confidence = 0.90
        elif median_amt > 0 and amt > median_amt * 5:
            parsed = parse_account_label(f"{number} {name}".strip())
            if not parsed.account_number:
                reason = "possible_total_large_amount"
                confidence = 0.60

        if reason:
            results.append(DetectedTotalRow(line_id=line.id, reason=reason, confidence=confidence))

    return results


@router.post("/batches/{batch_id}/assign-parent", response_model=dict)
def assign_parent(
    batch_id: int,
    body: AssignParentRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Set parent_account_id on the resolved accounts for the given import lines."""
    try:
        svc.get_batch(db, batch_id)
    except ImportBatchNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))

    from app.models.import_line import ImportLine
    from app.models.account import Account

    lines = (
        db.query(ImportLine)
        .filter(ImportLine.batch_id == batch_id, ImportLine.id.in_(body.line_ids))
        .all()
    )
    updated = 0
    for line in lines:
        if line.resolved_account_id:
            account = db.get(Account, line.resolved_account_id)
            if account:
                account.parent_account_id = body.parent_account_id
                updated += 1
    db.commit()
    return {"updated": updated}


@router.post("/batches/{batch_id}/bulk-assign-fsli", response_model=dict)
def bulk_assign_fsli(
    batch_id: int,
    body: BulkAssignFsliRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Create or update ViewAccountOverride records for the resolved accounts in the given import lines."""
    try:
        svc.get_batch(db, batch_id)
    except ImportBatchNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))

    from app.models.import_line import ImportLine
    from app.models.view_account_override import ViewAccountOverride
    import datetime as _dt

    lines = (
        db.query(ImportLine)
        .filter(ImportLine.batch_id == batch_id, ImportLine.id.in_(body.line_ids))
        .all()
    )
    updated = 0
    for line in lines:
        if not line.resolved_account_id:
            continue
        existing = (
            db.query(ViewAccountOverride)
            .filter(
                ViewAccountOverride.entity_id == body.entity_id,
                ViewAccountOverride.view_id == body.view_id,
                ViewAccountOverride.account_id == line.resolved_account_id,
            )
            .first()
        )
        if existing:
            existing.taxonomy_line_id = body.taxonomy_line_id
            existing.updated_at = _dt.datetime.utcnow()
        else:
            db.add(ViewAccountOverride(
                entity_id=body.entity_id,
                view_id=body.view_id,
                account_id=line.resolved_account_id,
                taxonomy_line_id=body.taxonomy_line_id,
            ))
        updated += 1
    db.commit()
    return {"updated": updated}


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
# Agent — Simplified TB wizard: in-wizard FSLI suggestion + apply
# ---------------------------------------------------------------------------

@router.post("/batches/{batch_id}/suggest-fsli", response_model=dict)
def suggest_fsli_for_batch(
    batch_id: int,
    body: dict,
    db: Session = Depends(get_db),
    current_user=Depends(get_required_user),
) -> dict:
    """
    Run the rule engine over every ImportLine in this batch using its raw
    account_number + account_name. Returns one suggestion per line (or null
    if no match). Does NOT require any Account records to exist — works on
    the imported strings directly so the wizard can suggest FSLI before the
    user has touched the Mapping Workbench.

    Body: {"taxonomy_id": int}
    Returns: {"suggestions": [{line_id, suggested_fsli_taxonomy_node_id,
              confidence, reason, node_code, node_name}], "matched": N,
              "unmatched": M}
    """
    from app.models.taxonomy import Taxonomy
    from app.models.import_line import ImportLine
    from app.services.taxonomy_mapping_rules import suggest_mapping_from_strings
    from app.services.import_batch_service import guess_account_type_and_normal

    taxonomy_id = body.get("taxonomy_id")
    if not taxonomy_id:
        raise HTTPException(status_code=400, detail="taxonomy_id is required")
    taxonomy = db.query(Taxonomy).filter_by(id=taxonomy_id).first()
    if not taxonomy:
        raise HTTPException(status_code=404, detail=f"Taxonomy {taxonomy_id} not found")

    batch = db.query(ImportBatch).filter_by(id=batch_id).first()
    if not batch:
        raise HTTPException(status_code=404, detail=f"Batch {batch_id} not found")
    if batch.status == "posted":
        raise HTTPException(status_code=409, detail="Batch is posted — cannot re-suggest")

    lines = db.query(ImportLine).filter_by(batch_id=batch_id).all()
    matched = 0
    out_suggestions: list[dict] = []
    for line in lines:
        acct_type, _ = guess_account_type_and_normal(line.raw_account_number, line.raw_account_name)
        suggestion = suggest_mapping_from_strings(
            line.raw_account_number, line.raw_account_name, acct_type, taxonomy, db,
        )
        if suggestion is None:
            out_suggestions.append({
                "line_id": line.id,
                "suggested_fsli_taxonomy_node_id": None,
                "confidence": None,
                "reason": None,
                "node_code": None,
                "node_name": None,
            })
            continue
        matched += 1
        out_suggestions.append({
            "line_id": line.id,
            "suggested_fsli_taxonomy_node_id": suggestion.taxonomy_node_id,
            "confidence": suggestion.confidence_score,
            "reason": suggestion.reason,
            "node_code": suggestion.node_code,
            "node_name": suggestion.node_name,
        })
        # Stage on the ImportLine so the next page load shows what was suggested
        line.suggested_fsli_taxonomy_node_id = suggestion.taxonomy_node_id
        line.suggested_fsli_confidence = suggestion.confidence_score
        line.suggested_fsli_reason = suggestion.reason
    db.commit()
    return {
        "suggestions": out_suggestions,
        "matched": matched,
        "unmatched": len(lines) - matched,
        "taxonomy_id": taxonomy_id,
        "taxonomy_name": taxonomy.name,
    }


@router.post("/batches/{batch_id}/save-fsli-selections", response_model=dict)
def save_fsli_selections(
    batch_id: int,
    body: dict,
    db: Session = Depends(get_db),
    current_user=Depends(get_required_user),
) -> dict:
    """
    Phase B: write explicit per-line FSLI selections. Used when the user
    overrides a system suggestion in the wizard step 4 inline dropdown.

    Body: {"selections": [{"line_id": int, "taxonomy_node_id": int | null}]}
    Returns: {"saved": N}
    """
    from app.models.import_line import ImportLine

    batch = db.query(ImportBatch).filter_by(id=batch_id).first()
    if not batch:
        raise HTTPException(status_code=404, detail=f"Batch {batch_id} not found")
    if batch.status == "posted":
        raise HTTPException(status_code=409, detail="Batch is posted")

    selections = body.get("selections", [])
    if not isinstance(selections, list):
        raise HTTPException(status_code=400, detail="selections must be a list")

    saved = 0
    for sel in selections:
        line_id = sel.get("line_id")
        node_id = sel.get("taxonomy_node_id")  # may be null to clear
        if line_id is None:
            continue
        line = db.query(ImportLine).filter_by(id=line_id, batch_id=batch_id).first()
        if not line:
            continue
        line.selected_fsli_taxonomy_node_id = node_id
        saved += 1
    db.commit()
    return {"saved": saved}


@router.post("/batches/{batch_id}/apply-fsli-suggestions", response_model=dict)
def apply_fsli_suggestions(
    batch_id: int,
    body: dict,
    db: Session = Depends(get_db),
    current_user=Depends(get_required_user),
) -> dict:
    """
    Promote staged FSLI suggestions to selected_fsli_taxonomy_node_id on each
    line. Mode controls what happens when a line already has a selected FSLI:

      blank_only (default) — only set on lines whose selected_* is NULL
      replace              — overwrite any existing selected_* with the suggestion
      preserve             — never overwrite (synonym of blank_only, included for clarity)

    Body: {"line_ids": [int, ...] | "all", "mode": "blank_only"|"replace"|"preserve"}
    Returns: {"applied": N, "skipped": M, "skipped_reason": str | None,
              "next_action": "Continue to Review Exceptions"}
    """
    from app.models.import_line import ImportLine

    mode = (body.get("mode") or "blank_only").lower()
    if mode not in {"blank_only", "replace", "preserve"}:
        raise HTTPException(status_code=400, detail=f"Unknown mode {mode!r}")

    batch = db.query(ImportBatch).filter_by(id=batch_id).first()
    if not batch:
        raise HTTPException(status_code=404, detail=f"Batch {batch_id} not found")
    if batch.status == "posted":
        raise HTTPException(status_code=409, detail="Batch is posted")

    line_ids = body.get("line_ids")
    q = db.query(ImportLine).filter_by(batch_id=batch_id)
    if line_ids and line_ids != "all":
        q = q.filter(ImportLine.id.in_(line_ids))
    lines = q.all()

    applied = 0
    skipped_existing = 0
    skipped_no_suggestion = 0
    for line in lines:
        if line.suggested_fsli_taxonomy_node_id is None:
            skipped_no_suggestion += 1
            continue
        if line.selected_fsli_taxonomy_node_id is not None and mode != "replace":
            skipped_existing += 1
            continue
        line.selected_fsli_taxonomy_node_id = line.suggested_fsli_taxonomy_node_id
        applied += 1
    db.commit()

    skipped = skipped_existing + skipped_no_suggestion
    reason = None
    if applied == 0 and skipped_existing > 0:
        reason = (
            f"All {skipped_existing} selected accounts already have an FSLI "
            f"assignment. Choose 'Replace existing' to overwrite them."
        )
    elif applied == 0 and skipped_no_suggestion > 0:
        reason = (
            f"None of the {skipped_no_suggestion} selected lines had a "
            f"system-suggested FSLI. Run 'Suggest Financial Statement Lines' "
            f"again with a different taxonomy basis."
        )
    return {
        "applied": applied,
        "skipped": skipped,
        "skipped_existing": skipped_existing,
        "skipped_no_suggestion": skipped_no_suggestion,
        "skipped_reason": reason,
        "next_action": "Continue to Review Exceptions" if applied > 0 else None,
    }


# ---------------------------------------------------------------------------
# CRL-C — Common Reporting Line suggest / apply / save endpoints
# ---------------------------------------------------------------------------

@router.post("/batches/{batch_id}/suggest-crl", response_model=dict)
def suggest_crl_for_batch_endpoint(
    batch_id: int,
    body: dict,
    db: Session = Depends(get_db),
    current_user=Depends(get_required_user),
) -> dict:
    """
    Run the rule engine over every ImportLine in the batch, reverse-lookup
    each result to its CRL via the one-to-many junction, optionally filter
    by reporting template.

    Body: {"taxonomy_id": int, "template_id": int | null}
    Returns: {"suggestions": [...], "matched": N, "unmatched": M,
              "taxonomy_id": int, "template_id": int | null}
    """
    from app.services.crl_suggestion_service import suggest_crls_for_batch
    from app.models.import_line import ImportLine

    taxonomy_id = body.get("taxonomy_id")
    if not taxonomy_id:
        raise HTTPException(status_code=400, detail="taxonomy_id is required")
    template_id = body.get("template_id")

    batch = db.query(ImportBatch).filter_by(id=batch_id).first()
    if not batch:
        raise HTTPException(status_code=404, detail=f"Batch {batch_id} not found")
    if batch.status == "posted":
        raise HTTPException(status_code=409, detail="Batch is posted")

    org_id = getattr(batch, "organization_id", None)
    suggestions = suggest_crls_for_batch(
        db, batch,
        taxonomy_id=taxonomy_id,
        template_id=template_id,
        organization_id=org_id,
    )

    # Persist the suggested CRL on each ImportLine so the wizard can show
    # it on subsequent visits without re-running the engine.
    by_id = {s.line_id: s for s in suggestions}
    lines = db.query(ImportLine).filter_by(batch_id=batch_id).all()
    for line in lines:
        s = by_id.get(line.id)
        if s and s.crl_id is not None:
            line.suggested_fsli_taxonomy_node_id = None  # diagnostic; CRL is canonical now
    db.commit()

    matched = sum(1 for s in suggestions if s.crl_id is not None)
    return {
        "suggestions": [
            {
                "line_id": s.line_id,
                "crl_id": s.crl_id,
                "crl_code": s.crl_code,
                "crl_name": s.crl_name,
                "crl_section": s.crl_section,
                "confidence": s.confidence,
                "reason": s.reason,
                "via_taxonomy_node_code": s.via_taxonomy_node_code,
            }
            for s in suggestions
        ],
        "matched": matched,
        "unmatched": len(suggestions) - matched,
        "taxonomy_id": taxonomy_id,
        "template_id": template_id,
    }


@router.post("/batches/{batch_id}/apply-crl-suggestions", response_model=dict)
def apply_crl_suggestions_endpoint(
    batch_id: int,
    body: dict,
    db: Session = Depends(get_db),
    current_user=Depends(get_required_user),
) -> dict:
    """
    Promote staged CRL suggestions onto selected_common_reporting_line_id.

    Body: {"taxonomy_id": int, "template_id": int | null,
           "line_ids": [int] | "all", "mode": "blank_only"|"replace"|"preserve"}
    Returns: {applied, skipped, skipped_existing, skipped_no_suggestion,
              skipped_reason, next_action}
    """
    from app.services.crl_suggestion_service import (
        suggest_crls_for_batch, apply_crl_suggestions_to_lines,
    )

    taxonomy_id = body.get("taxonomy_id")
    if not taxonomy_id:
        raise HTTPException(status_code=400, detail="taxonomy_id is required")
    template_id = body.get("template_id")
    mode = (body.get("mode") or "blank_only").lower()
    if mode not in {"blank_only", "replace", "preserve"}:
        raise HTTPException(status_code=400, detail=f"Unknown mode {mode!r}")

    batch = db.query(ImportBatch).filter_by(id=batch_id).first()
    if not batch:
        raise HTTPException(status_code=404, detail=f"Batch {batch_id} not found")
    if batch.status == "posted":
        raise HTTPException(status_code=409, detail="Batch is posted")

    line_ids = body.get("line_ids")
    target_ids = None if line_ids == "all" else line_ids

    org_id = getattr(batch, "organization_id", None)
    suggestions = suggest_crls_for_batch(
        db, batch,
        taxonomy_id=taxonomy_id,
        template_id=template_id,
        organization_id=org_id,
    )
    result = apply_crl_suggestions_to_lines(
        db, batch, suggestions, mode=mode, line_ids=target_ids,
    )
    result["next_action"] = "Continue to Review Exceptions" if result["applied"] > 0 else None
    return result


@router.post("/batches/{batch_id}/save-crl-selections", response_model=dict)
def save_crl_selections_endpoint(
    batch_id: int,
    body: dict,
    db: Session = Depends(get_db),
    current_user=Depends(get_required_user),
) -> dict:
    """
    Write explicit per-line CRL selections (the inline override dropdown
    in wizard step 4). Body: {"selections": [{"line_id": int, "crl_id": int|null}]}
    Returns: {"saved": N}
    """
    from app.services.crl_suggestion_service import save_explicit_crl_selections

    batch = db.query(ImportBatch).filter_by(id=batch_id).first()
    if not batch:
        raise HTTPException(status_code=404, detail=f"Batch {batch_id} not found")
    if batch.status == "posted":
        raise HTTPException(status_code=409, detail="Batch is posted")

    selections = body.get("selections", [])
    if not isinstance(selections, list):
        raise HTTPException(status_code=400, detail="selections must be a list")

    saved = save_explicit_crl_selections(db, batch, selections)
    return {"saved": saved}


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


@router.delete("/batches/{batch_id}/lines/{line_id}", status_code=204)
def delete_line(
    batch_id: int,
    line_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_required_user),
):
    """
    Remove a single import line from a batch. Refuses if the batch is
    already posted (use rollback instead).
    """
    from app.models.import_batch import ImportBatch
    from app.models.import_line import ImportLine

    batch = db.query(ImportBatch).filter_by(id=batch_id).first()
    if not batch:
        raise HTTPException(status_code=404, detail=f"Batch {batch_id} not found")
    if batch.status == "posted":
        raise HTTPException(
            status_code=409,
            detail="Batch is posted — rollback the batch instead of deleting individual lines",
        )
    line = db.query(ImportLine).filter_by(id=line_id, batch_id=batch_id).first()
    if not line:
        raise HTTPException(status_code=404, detail=f"Line {line_id} not found in batch {batch_id}")
    db.delete(line)
    db.commit()


@router.post("/batches/{batch_id}/bulk-delete-lines", status_code=200)
def bulk_delete_lines(
    batch_id: int,
    body: dict,
    db: Session = Depends(get_db),
    current_user=Depends(get_required_user),
) -> dict:
    """
    Bulk delete import lines. Body: {"line_ids": [int, ...]}. Refuses if
    the batch is posted.
    """
    from app.models.import_batch import ImportBatch
    from app.models.import_line import ImportLine

    batch = db.query(ImportBatch).filter_by(id=batch_id).first()
    if not batch:
        raise HTTPException(status_code=404, detail=f"Batch {batch_id} not found")
    if batch.status == "posted":
        raise HTTPException(status_code=409, detail="Batch is posted — rollback instead")
    line_ids = body.get("line_ids", [])
    if not isinstance(line_ids, list):
        raise HTTPException(status_code=400, detail="line_ids must be a list")
    deleted = (
        db.query(ImportLine)
        .filter(ImportLine.batch_id == batch_id, ImportLine.id.in_(line_ids))
        .delete(synchronize_session=False)
    )
    db.commit()
    return {"deleted": deleted, "requested": len(line_ids)}


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
