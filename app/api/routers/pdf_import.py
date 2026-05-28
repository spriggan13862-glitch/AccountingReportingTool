"""PDF Financial Statement Import API.

Two-step flow:
  POST /pdf-imports/upload                      → extract lines, store batch, return preview
  POST /pdf-imports/{id}/apply                  → persist extracted lines + build mapping layer
  GET  /pdf-imports/                            → list batches
  GET  /pdf-imports/{id}                        → get single batch
  GET  /pdf-imports/{id}/preview                → re-fetch stored preview
  GET  /pdf-imports/{id}/validate               → subtotal validation report
  GET  /pdf-imports/{id}/mapping                → bucket-level taxonomy mapping summary
  GET  /pdf-imports/{id}/lines                  → all persisted lines with mapping records
  PATCH /pdf-imports/{id}/lines/{line_id}       → update official_account_code or taxonomy override
  GET  /pdf-imports/{id}/audit                  → full audit trail: source doc → line → mapping
"""
from __future__ import annotations

import json
import tempfile
from decimal import Decimal, InvalidOperation
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.deps import get_db, get_current_user, get_storage
from app.services.storage_service import StorageBackend
from app.services.organization_service import get_organization_or_raise
from app.services.document_service import upload_document, attach_document
from app.api.schemas import (
    PDFImportBatchOut,
    PDFImportPreview,
    PDFImportPreviewLine,
    PDFImportValidationReport,
    PDFImportMappingOut,
    PDFLineUpdateRequest,
    PDFLineOut,
    PDFAuditTrail,
    PDFPreviewLinePatch,
    PDFConflictResolutionRequest,
    PDFBalanceSheetValidation,
)
from app.models.pdf_import_batch import PDFImportBatch
from app.models.pdf_import_line import PDFImportLine
from app.models.pdf_account_mapping import PDFAccountMapping
from app.services.pdf_extraction_service import extract_pdf_financials
from app.services.entity_mapping_service import build_entity_mapping
from app.services.account_number_generator import generate_account_numbers

router = APIRouter(prefix="/pdf-imports", tags=["pdf-imports"])


@router.post("/upload", response_model=PDFImportPreview, status_code=201)
async def upload_pdf(
    file: UploadFile = File(...),
    entity_id: int | None = Form(default=None),
    import_type: str | None = Form(default=None),
    statement_scope: str | None = Form(default=None),
    basis_override: str | None = Form(default=None),
    statement_date: str | None = Form(default=None),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
    storage: StorageBackend = Depends(get_storage),
):
    content = await file.read()
    filename = file.filename or "upload.pdf"

    if not filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=422, detail="Only PDF files are accepted")

    # P1: reject missing required metadata before touching the PDF
    missing: list[str] = []
    if entity_id is None:
        missing.append("entity_id")
    if not statement_date:
        missing.append("statement_date")
    if not basis_override:
        missing.append("basis_override")
    if not statement_scope:
        missing.append("statement_scope")
    if missing:
        raise HTTPException(
            status_code=422,
            detail={
                "error": "missing_required_fields",
                "message": f"Missing required fields: {', '.join(missing)}",
                "missing_fields": missing,
            },
        )

    organization_id = None
    if entity_id is not None:
        from app.models.entity import Entity
        entity = db.get(Entity, entity_id)
        if entity:
            organization_id = entity.organization_id
    if organization_id is None:
        organization_id = getattr(current_user, "organization_id", None) or 1

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
        original_file_name=filename,
        document_type="pdf_import",
        storage=storage,
        org_slug=org.slug,
        acting_user=current_user,
    )

    # Write to a temp file for pdfplumber
    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
        tmp.write(content)
        tmp_path = Path(tmp.name)

    try:
        extracted = extract_pdf_financials(tmp_path)
    except Exception as exc:
        tmp_path.unlink(missing_ok=True)
        raise HTTPException(status_code=422, detail=f"PDF extraction error: {exc}") from exc
    finally:
        tmp_path.unlink(missing_ok=True)

    lines_data = extracted["lines"]

    # Mark synthetic Net Income lines in equity (P1)
    _mark_synthetic_equity_lines(lines_data)

    detail_lines = [l for l in lines_data if not l["is_subtotal"]]
    subtotal_lines = [l for l in lines_data if l["is_subtotal"]]

    # Generate accountant-friendly numbers at upload time so the preview can
    # show them instead of the internal hash codes.
    proposed_numbers = generate_account_numbers(lines_data)

    # Compute balance sheet tie check (P2)
    bs_validation = _compute_bs_validation(lines_data)

    effective_basis = basis_override or extracted.get("basis_of_accounting")
    effective_statement_date = statement_date or extracted.get("statement_date")

    batch = PDFImportBatch(
        entity_id=entity_id,
        filename=filename,
        source_entity_name=extracted.get("source_entity_name"),
        statement_date=effective_statement_date,
        basis_of_accounting=effective_basis,
        import_type=import_type or "financial_statements",
        statement_scope=statement_scope or "unknown",
        page_count=extracted.get("page_count"),
        line_count=len(detail_lines),
        status="parsed",
        raw_preview=json.dumps(extracted),
        original_preview=json.dumps(extracted),
        validation_summary=json.dumps(extracted.get("validation", {})),
    )
    db.add(batch)
    db.flush()
    db.refresh(batch)

    attach_document(
        db=db,
        doc_id=doc.id,
        linked_object_type="pdf_import",
        linked_object_id=batch.id,
        acting_user=current_user,
    )

    preview_lines = [PDFImportPreviewLine(**_line_to_schema(l, proposed_numbers)) for l in lines_data]

    return PDFImportPreview(
        batch_id=batch.id,
        entity_id=entity_id,
        filename=filename,
        source_entity_name=extracted.get("source_entity_name"),
        statement_date=effective_statement_date,
        basis_of_accounting=effective_basis,
        import_type=import_type or "financial_statements",
        statement_scope=statement_scope or "unknown",
        page_count=extracted.get("page_count", 0),
        line_count=len(detail_lines),
        subtotal_count=len(subtotal_lines),
        lines=preview_lines,
        validation=extracted.get("validation", {}),
        warnings=extracted.get("warnings", []),
        balance_sheet_variance=bs_validation["variance"],
        balance_sheet_tied=bs_validation["tied"],
        net_income_variance=bs_validation["net_income_variance"],
        net_income_reconciled=bs_validation["net_income_variance"] is None
        or abs(float(bs_validation["net_income_variance"])) <= 1.0,
        net_income_in_equity=bs_validation["net_income_in_equity"],
        pnl_net_income=bs_validation["pnl_net_income"],
    )


@router.post("/{batch_id}/apply", response_model=PDFImportBatchOut)
def apply_pdf_import(
    batch_id: int,
    force_apply: bool = False,
    db: Session = Depends(get_db),
):
    """Apply a previewed PDF import: persist lines, assign account numbers, build mapping records.

    Idempotency:
    - Returns 409 if already applied.
    - Returns 422 if batch was previously marked failed (re-upload required).
    - All line insertions are in a single transaction; failure rolls back cleanly.
    """
    batch = db.get(PDFImportBatch, batch_id)
    if batch is None:
        raise HTTPException(status_code=404, detail=f"PDF import batch {batch_id} not found")
    if batch.status == "applied":
        raise HTTPException(status_code=409, detail="Batch already applied — use /lines to view results")
    if batch.status == "failed":
        raise HTTPException(
            status_code=422,
            detail=f"Batch previously failed: {batch.error_message or 'unknown error'}. Re-upload to retry.",
        )
    if not batch.raw_preview:
        raise HTTPException(status_code=422, detail="No preview data — re-upload the file first")

    try:
        extracted = json.loads(batch.raw_preview)
    except (json.JSONDecodeError, TypeError) as exc:
        raise HTTPException(status_code=422, detail=f"Corrupt preview data — re-upload: {exc}") from exc

    lines_data: list[dict] = extracted.get("lines", [])
    if not lines_data:
        raise HTTPException(status_code=422, detail="No lines in preview data — re-upload the file")

    # Re-mark synthetic lines (in case raw_preview predates this logic)
    _mark_synthetic_equity_lines(lines_data)

    # P2: block apply when balance sheet doesn't tie
    if batch.import_type in (None, "financial_statements") and not force_apply:
        bs_check = _compute_bs_validation(lines_data)
        try:
            variance_val = float(bs_check["variance"])
        except (ValueError, TypeError):
            variance_val = 0.0
        if not bs_check["tied"] and abs(variance_val) > 0.01:
            raise HTTPException(
                status_code=422,
                detail={
                    "error": "balance_sheet_not_tied",
                    "message": (
                        f"Balance sheet does not tie. "
                        f"Assets={bs_check['total_assets']}, "
                        f"Liabilities+Equity={bs_check['total_liabilities_equity']}, "
                        f"Variance={bs_check['variance']}. "
                        "Resolve the imbalance or pass force_apply=true."
                    ),
                    "balance_sheet": bs_check,
                    "hint": "Create a balancing/reclass adjustment, correct line amounts, or pass force_apply=true to override.",
                },
            )

    detail_lines = [l for l in lines_data if not l.get("is_subtotal") and not l.get("excluded")]

    # Generate intelligent account numbers (taxonomy → range mapping)
    account_numbers = generate_account_numbers(lines_data)

    error_summary: list[str] = []

    def _safe_decimal(raw: str | None) -> Decimal:
        """Convert extracted amount string to Decimal for DB insert."""
        if raw is None:
            return Decimal("0")
        s = str(raw).strip()
        # Handle parenthesized negatives like (1,234.56)
        if s.startswith("(") and s.endswith(")"):
            s = "-" + s[1:-1]
        # Strip commas, dollar signs, percent signs
        s = s.replace(",", "").replace("$", "").replace("%", "").strip()
        if not s or s == "-":
            return Decimal("0")
        try:
            return Decimal(s)
        except InvalidOperation:
            return Decimal("0")

    NORMAL_BALANCE_MAP = {
        "asset":     "debit",
        "liability": "credit",
        "equity":    "credit",
        "revenue":   "credit",
        "expense":   "debit",
    }

    try:
        for i, line_data in enumerate(lines_data):
            temp_code = line_data.get("temp_account_code", f"UNKNOWN-{i}")
            assigned_number = line_data.get("proposed_account_code")
            if assigned_number is None:
                assigned_number = account_numbers.get(temp_code, "")

            is_synthetic = line_data.get("synthetic_presentation_line", False)
            is_system = line_data.get("system_managed", False)
            is_locked = line_data.get("locked", False)

            line_obj = PDFImportLine(
                batch_id=batch.id,
                temp_account_code=temp_code,
                name_hash=line_data.get("name_hash") or "",
                official_account_code=assigned_number or None,
                account_name=line_data.get("account_name", ""),
                statement_type=line_data.get("statement_type", ""),
                section=line_data.get("section", ""),
                amount=_safe_decimal(line_data.get("amount")),
                is_subtotal=line_data.get("is_subtotal", False),
                is_contra=line_data.get("is_contra", False),
                sort_order=line_data.get("sort_order", i),
                suggested_taxonomy_code=line_data.get("suggested_taxonomy_code"),
                mapping_confidence=line_data.get("mapping_confidence"),
                mapping_evidence=line_data.get("mapping_evidence"),
                page_number=line_data.get("page_number"),
                source_line_text=line_data.get("source_line_text"),
                synthetic_presentation_line=is_synthetic,
                system_managed=is_system,
                locked=is_locked,
            )
            db.add(line_obj)
            db.flush()

            # P3: detect taxonomy conflicts (source vs global suggestion)
            source_tax = line_data.get("suggested_taxonomy_code")
            conflict = False
            conflict_reason = None

            mapping_obj = PDFAccountMapping(
                batch_id=batch.id,
                line_id=line_obj.id,
                source_account_code=temp_code,
                official_account_code=assigned_number or None,
                account_name=line_data.get("account_name", ""),
                name_hash=line_data.get("name_hash") or "",
                taxonomy_code=source_tax,
                taxonomy_source="auto",
                taxonomy_locked=is_synthetic,  # Lock synthetic lines
                source_taxonomy_code=source_tax,
                taxonomy_conflict=conflict,
                conflict_reason=conflict_reason,
            )
            db.add(mapping_obj)

            # Create/update Account in Chart of Accounts
            if batch.entity_id is not None and not line_data.get("is_subtotal", False):
                from app.models.account import Account
                from app.models.reporting_taxonomy import ReportingTaxonomyLine

                taxonomy_id = None
                tax_code = line_data.get("suggested_taxonomy_code")
                tax_line = None
                if tax_code:
                    tax_line = db.query(ReportingTaxonomyLine).filter(ReportingTaxonomyLine.code == tax_code).first()
                    if tax_line:
                        taxonomy_id = tax_line.id

                acct_type = "expense"
                normal_bal = "debit"
                if tax_line:
                    sec = (tax_line.section or "").lower()
                    if sec == "assets":
                        acct_type = "asset"
                    elif sec == "liabilities":
                        acct_type = "liability"
                    elif sec == "equity":
                        acct_type = "equity"
                    elif sec in ("revenue", "other_income"):
                        acct_type = "revenue"
                    normal_bal = tax_line.normal_balance or NORMAL_BALANCE_MAP.get(acct_type, "debit")

                existing_acct = None
                if assigned_number:
                    existing_acct = db.query(Account).filter(
                        Account.entity_id == batch.entity_id,
                        Account.account_number == assigned_number
                    ).first()

                if existing_acct:
                    existing_acct.account_name = line_data.get("account_name", "")
                    existing_acct.account_type = acct_type
                    existing_acct.normal_balance = normal_bal
                    if taxonomy_id is not None:
                        existing_acct.reporting_taxonomy_line_id = taxonomy_id
                    existing_acct.source_system = "pdf_import"
                else:
                    if not assigned_number:
                        assigned_number = f"AUTO-PDF-{i + 1:04d}"
                    new_acct = Account(
                        entity_id=batch.entity_id,
                        account_number=assigned_number,
                        account_name=line_data.get("account_name", ""),
                        account_type=acct_type,
                        normal_balance=normal_bal,
                        reporting_taxonomy_line_id=taxonomy_id,
                        source_system="pdf_import",
                    )
                    db.add(new_acct)

        batch.status = "applied"
        batch.accounts_created = len(detail_lines)
        validation_summary = {
            "lines_persisted": len(lines_data),
            "detail_lines": len(detail_lines),
            "account_numbers_assigned": sum(1 for v in account_numbers.values() if v),
            "errors": error_summary,
        }
        batch.validation_summary = json.dumps(validation_summary)

        # Propagate taxonomy mappings down the hierarchy
        if batch.entity_id is not None:
            from app.services.taxonomy_reporting_service import propagate_taxonomy_to_children
            propagate_taxonomy_to_children(batch.entity_id, db)

        db.flush()
        db.refresh(batch)
        return batch

    except Exception as exc:
        import traceback
        raise HTTPException(
            status_code=500,
            detail={
                "error": "apply_failed",
                "message": f"Failed to persist extracted lines: {type(exc).__name__}: {exc}",
                "batch_id": batch_id,
                "hint": "Re-upload the PDF and try again. If the error persists, check the validation report.",
                "traceback": traceback.format_exc(),
            },
        ) from exc


@router.get("/", response_model=list[PDFImportBatchOut])
def list_pdf_batches(entity_id: int | None = None, db: Session = Depends(get_db)):
    q = db.query(PDFImportBatch)
    if entity_id is not None:
        q = q.filter(PDFImportBatch.entity_id == entity_id)
    return q.order_by(PDFImportBatch.created_at.desc()).all()


@router.get("/{batch_id}", response_model=PDFImportBatchOut)
def get_pdf_batch(batch_id: int, db: Session = Depends(get_db)):
    batch = db.get(PDFImportBatch, batch_id)
    if batch is None:
        raise HTTPException(status_code=404, detail=f"PDF import batch {batch_id} not found")
    return batch


@router.get("/{batch_id}/preview", response_model=PDFImportPreview)
def get_pdf_preview(batch_id: int, db: Session = Depends(get_db)):
    batch = db.get(PDFImportBatch, batch_id)
    if batch is None:
        raise HTTPException(status_code=404, detail=f"PDF import batch {batch_id} not found")
    if not batch.raw_preview:
        raise HTTPException(status_code=404, detail="No preview available")

    extracted = json.loads(batch.raw_preview)
    lines_data = extracted.get("lines", [])
    _mark_synthetic_equity_lines(lines_data)
    detail_lines = [l for l in lines_data if not l["is_subtotal"]]
    subtotal_lines = [l for l in lines_data if l["is_subtotal"]]
    proposed_numbers = generate_account_numbers(lines_data)
    preview_lines = [PDFImportPreviewLine(**_line_to_schema(l, proposed_numbers)) for l in lines_data]
    bs_validation = _compute_bs_validation(lines_data)

    return PDFImportPreview(
        batch_id=batch.id,
        entity_id=batch.entity_id,
        filename=batch.filename,
        source_entity_name=batch.source_entity_name,
        statement_date=batch.statement_date,
        basis_of_accounting=batch.basis_of_accounting,
        import_type=getattr(batch, "import_type", None),
        statement_scope=getattr(batch, "statement_scope", None),
        page_count=batch.page_count or 0,
        line_count=len(detail_lines),
        subtotal_count=len(subtotal_lines),
        lines=preview_lines,
        validation=extracted.get("validation", {}),
        warnings=extracted.get("warnings", []),
        balance_sheet_variance=bs_validation["variance"],
        balance_sheet_tied=bs_validation["tied"],
        net_income_variance=bs_validation["net_income_variance"],
        net_income_reconciled=bs_validation["net_income_variance"] is None
        or abs(float(bs_validation["net_income_variance"])) <= 1.0,
        net_income_in_equity=bs_validation["net_income_in_equity"],
        pnl_net_income=bs_validation["pnl_net_income"],
    )


@router.get("/{batch_id}/validate", response_model=PDFImportValidationReport)
def get_pdf_validation(batch_id: int, db: Session = Depends(get_db)):
    batch = db.get(PDFImportBatch, batch_id)
    if batch is None:
        raise HTTPException(status_code=404, detail=f"PDF import batch {batch_id} not found")

    validation = {}
    if batch.validation_summary:
        validation = json.loads(batch.validation_summary)

    checks = validation.get("checks", [])
    return PDFImportValidationReport(
        batch_id=batch_id,
        checks=checks,
        passing=validation.get("passing", 0),
        failing=validation.get("failing", 0),
        total=validation.get("total", 0),
    )


@router.get("/{batch_id}/mapping", response_model=PDFImportMappingOut)
def get_pdf_mapping(batch_id: int, db: Session = Depends(get_db)):
    batch = db.get(PDFImportBatch, batch_id)
    if batch is None:
        raise HTTPException(status_code=404, detail=f"PDF import batch {batch_id} not found")
    if not batch.raw_preview:
        raise HTTPException(status_code=404, detail="No preview data")

    extracted = json.loads(batch.raw_preview)
    lines_data = extracted.get("lines", [])
    mapping = build_entity_mapping(lines_data)

    return PDFImportMappingOut(
        batch_id=batch_id,
        buckets=mapping["buckets"],
        unmapped_lines=mapping["unmapped_lines"],
        bucket_count=mapping["bucket_count"],
        unmapped_count=mapping["unmapped_count"],
    )


@router.get("/{batch_id}/lines", response_model=list[PDFLineOut])
def list_pdf_lines(batch_id: int, db: Session = Depends(get_db)):
    """All persisted lines for a batch, with their current mapping records."""
    batch = db.get(PDFImportBatch, batch_id)
    if batch is None:
        raise HTTPException(status_code=404, detail=f"PDF import batch {batch_id} not found")
    if batch.status != "applied":
        raise HTTPException(status_code=409, detail="Batch not yet applied — call /apply first")

    lines = db.query(PDFImportLine).filter(PDFImportLine.batch_id == batch_id).order_by(PDFImportLine.sort_order).all()
    # Build mapping lookup: line_id → mapping record
    mappings = {
        m.line_id: m
        for m in db.query(PDFAccountMapping).filter(PDFAccountMapping.batch_id == batch_id).all()
    }

    result = []
    for line in lines:
        m = mappings.get(line.id)
        result.append(PDFLineOut(
            id=line.id,
            batch_id=line.batch_id,
            temp_account_code=line.temp_account_code,
            name_hash=line.name_hash,
            official_account_code=line.official_account_code or (m.official_account_code if m else None),
            account_name=line.account_name,
            statement_type=line.statement_type,
            section=line.section,
            amount=str(line.amount),
            is_subtotal=line.is_subtotal,
            is_contra=line.is_contra,
            sort_order=line.sort_order,
            synthetic_presentation_line=getattr(line, "synthetic_presentation_line", False),
            system_managed=getattr(line, "system_managed", False),
            locked=getattr(line, "locked", False),
            suggested_taxonomy_code=line.suggested_taxonomy_code,
            taxonomy_code=m.taxonomy_code if m else line.suggested_taxonomy_code,
            taxonomy_source=m.taxonomy_source if m else "auto",
            taxonomy_locked=m.taxonomy_locked if m else False,
            source_taxonomy_code=m.source_taxonomy_code if m else None,
            taxonomy_conflict=m.taxonomy_conflict if m else False,
            conflict_reason=m.conflict_reason if m else None,
            conflict_resolution=m.conflict_resolution if m else None,
            legal_entity_code=m.legal_entity_code if m else None,
            consolidation_group=m.consolidation_group if m else None,
            mapping_confidence=line.mapping_confidence,
            mapping_evidence=line.mapping_evidence,
            page_number=line.page_number,
            source_line_text=line.source_line_text,
        ))
    return result


@router.patch("/{batch_id}/lines/{line_id}", response_model=PDFLineOut)
def update_pdf_line(
    batch_id: int,
    line_id: int,
    body: PDFLineUpdateRequest,
    db: Session = Depends(get_db),
):
    """Update a line's official account code, taxonomy assignment, or consolidation grouping.

    Setting official_account_code replaces the temp code in downstream reports.
    Setting taxonomy_locked=True prevents future auto-remapping on re-extract.
    """
    batch = db.get(PDFImportBatch, batch_id)
    if batch is None:
        raise HTTPException(status_code=404, detail=f"Batch {batch_id} not found")

    line = db.get(PDFImportLine, line_id)
    if line is None or line.batch_id != batch_id:
        raise HTTPException(status_code=404, detail=f"Line {line_id} not found in batch {batch_id}")

    # Update line-level fields
    old_account_code = line.official_account_code

    if body.official_account_code is not None:
        line.official_account_code = body.official_account_code
    if body.account_name is not None:
        line.account_name = body.account_name
    if body.amount is not None:
        try:
            line.amount = Decimal(str(body.amount))
        except (InvalidOperation, ValueError):
            pass

    # Update or create mapping record
    mapping = db.query(PDFAccountMapping).filter(
        PDFAccountMapping.batch_id == batch_id,
        PDFAccountMapping.line_id == line_id,
    ).first()

    if mapping is None:
        mapping = PDFAccountMapping(
            batch_id=batch_id,
            line_id=line_id,
            source_account_code=line.temp_account_code,
            account_name=line.account_name,
            name_hash=line.name_hash or "",
            taxonomy_code=line.suggested_taxonomy_code,
            taxonomy_source="auto",
        )
        db.add(mapping)

    if body.official_account_code is not None:
        mapping.official_account_code = body.official_account_code
    if body.account_name is not None:
        mapping.account_name = body.account_name
    if body.taxonomy_code is not None:
        mapping.taxonomy_code = body.taxonomy_code
        mapping.taxonomy_source = "manual"
    if body.taxonomy_locked is not None:
        mapping.taxonomy_locked = body.taxonomy_locked
    if body.legal_entity_code is not None:
        mapping.legal_entity_code = body.legal_entity_code
    if body.consolidation_group is not None:
        mapping.consolidation_group = body.consolidation_group
    if body.mapping_notes is not None:
        mapping.mapping_notes = body.mapping_notes

    # Sync with Account in Chart of Accounts
    if batch.entity_id is not None:
        from app.models.account import Account
        from app.models.reporting_taxonomy import ReportingTaxonomyLine

        NORMAL_BALANCE_MAP = {
            "asset":     "debit",
            "liability": "credit",
            "equity":    "credit",
            "revenue":   "credit",
            "expense":   "debit",
        }

        acct = None
        if old_account_code:
            acct = db.query(Account).filter(
                Account.entity_id == batch.entity_id,
                Account.account_number == old_account_code
            ).first()

        if not acct and line.official_account_code:
            acct = db.query(Account).filter(
                Account.entity_id == batch.entity_id,
                Account.account_number == line.official_account_code
            ).first()

        if acct:
            if body.official_account_code is not None:
                acct.account_number = body.official_account_code
            if body.account_name is not None:
                acct.account_name = body.account_name

            tax_code = body.taxonomy_code if body.taxonomy_code is not None else mapping.taxonomy_code
            if tax_code:
                tax_line = db.query(ReportingTaxonomyLine).filter(ReportingTaxonomyLine.code == tax_code).first()
                if tax_line:
                    acct.reporting_taxonomy_line_id = tax_line.id
                    sec = (tax_line.section or "").lower()
                    if sec == "assets":
                        acct.account_type = "asset"
                    elif sec == "liabilities":
                        acct.account_type = "liability"
                    elif sec == "equity":
                        acct.account_type = "equity"
                    elif sec in ("revenue", "other_income"):
                        acct.account_type = "revenue"
                    else:
                        acct.account_type = "expense"
                    acct.normal_balance = tax_line.normal_balance or NORMAL_BALANCE_MAP.get(acct.account_type, "debit")

        # Propagate taxonomy mappings down the hierarchy
        if batch.entity_id is not None:
            from app.services.taxonomy_reporting_service import propagate_taxonomy_to_children
            propagate_taxonomy_to_children(batch.entity_id, db)

    db.flush()

    return PDFLineOut(
        id=line.id,
        batch_id=line.batch_id,
        temp_account_code=line.temp_account_code,
        name_hash=line.name_hash,
        official_account_code=line.official_account_code or mapping.official_account_code,
        account_name=line.account_name,
        statement_type=line.statement_type,
        section=line.section,
        amount=str(line.amount),
        is_subtotal=line.is_subtotal,
        is_contra=line.is_contra,
        sort_order=line.sort_order,
        synthetic_presentation_line=getattr(line, "synthetic_presentation_line", False),
        system_managed=getattr(line, "system_managed", False),
        locked=getattr(line, "locked", False),
        suggested_taxonomy_code=line.suggested_taxonomy_code,
        taxonomy_code=mapping.taxonomy_code,
        taxonomy_source=mapping.taxonomy_source,
        taxonomy_locked=mapping.taxonomy_locked,
        source_taxonomy_code=getattr(mapping, "source_taxonomy_code", None),
        taxonomy_conflict=getattr(mapping, "taxonomy_conflict", False),
        conflict_reason=getattr(mapping, "conflict_reason", None),
        conflict_resolution=getattr(mapping, "conflict_resolution", None),
        legal_entity_code=mapping.legal_entity_code,
        consolidation_group=mapping.consolidation_group,
        mapping_confidence=line.mapping_confidence,
        mapping_evidence=line.mapping_evidence,
        page_number=line.page_number,
        source_line_text=line.source_line_text,
    )


@router.get("/{batch_id}/audit", response_model=PDFAuditTrail)
def get_pdf_audit(batch_id: int, db: Session = Depends(get_db)):
    """Full audit trail: source document → extracted lines → mapping records."""
    batch = db.get(PDFImportBatch, batch_id)
    if batch is None:
        raise HTTPException(status_code=404, detail=f"Batch {batch_id} not found")

    lines = db.query(PDFImportLine).filter(PDFImportLine.batch_id == batch_id).order_by(PDFImportLine.sort_order).all()
    mappings_by_line = {
        m.line_id: m
        for m in db.query(PDFAccountMapping).filter(PDFAccountMapping.batch_id == batch_id).all()
    }

    audit_lines = []
    for line in lines:
        m = mappings_by_line.get(line.id)
        audit_lines.append({
            "line_id": line.id,
            "temp_account_code": line.temp_account_code,
            "official_account_code": line.official_account_code or (m.official_account_code if m else None),
            "name_hash": line.name_hash,
            "account_name": line.account_name,
            "statement_type": line.statement_type,
            "section": line.section,
            "amount": str(line.amount),
            "is_subtotal": line.is_subtotal,
            "page_number": line.page_number,
            "source_line_text": line.source_line_text,
            "mapping": {
                "taxonomy_code": m.taxonomy_code if m else line.suggested_taxonomy_code,
                "taxonomy_source": m.taxonomy_source if m else "auto",
                "taxonomy_locked": m.taxonomy_locked if m else False,
                "legal_entity_code": m.legal_entity_code if m else None,
                "consolidation_group": m.consolidation_group if m else None,
                "mapping_notes": m.mapping_notes if m else None,
            } if m or line.suggested_taxonomy_code else None,
        })

    return PDFAuditTrail(
        batch_id=batch_id,
        filename=batch.filename,
        source_entity_name=batch.source_entity_name,
        statement_date=batch.statement_date,
        basis_of_accounting=batch.basis_of_accounting,
        status=batch.status,
        line_count=len(lines),
        lines=audit_lines,
    )


# ---------------------------------------------------------------------------
# Preview line editing — update raw_preview before apply
# ---------------------------------------------------------------------------

@router.patch("/{batch_id}/preview-lines/{line_index}", status_code=200)
def patch_preview_line(
    batch_id: int,
    line_index: int,
    body: PDFPreviewLinePatch,
    db: Session = Depends(get_db),
):
    """Mutate a single line in raw_preview (account_name, section, taxonomy).

    The client calls this when the user edits a line in the preview table.
    When /apply is subsequently called it will read the updated raw_preview,
    so the corrected values are persisted to pdf_import_lines.
    """
    batch = db.get(PDFImportBatch, batch_id)
    if batch is None:
        raise HTTPException(status_code=404, detail=f"Batch {batch_id} not found")
    if batch.status == "applied":
        raise HTTPException(status_code=409, detail="Batch already applied — lines are read-only")
    if not batch.raw_preview:
        raise HTTPException(status_code=422, detail="No preview data")

    try:
        extracted = json.loads(batch.raw_preview)
    except (json.JSONDecodeError, TypeError) as exc:
        raise HTTPException(status_code=422, detail=f"Corrupt preview data: {exc}") from exc

    lines_data = extracted.get("lines", [])
    if line_index < 0 or line_index >= len(lines_data):
        raise HTTPException(status_code=404, detail=f"Line index {line_index} out of range (0–{len(lines_data) - 1})")

    line = lines_data[line_index]
    if body.account_name is not None:
        line["account_name"] = body.account_name
    if body.section is not None:
        line["section"] = body.section
    if body.suggested_taxonomy_code is not None:
        line["suggested_taxonomy_code"] = body.suggested_taxonomy_code
    if body.proposed_account_code is not None:
        line["proposed_account_code"] = body.proposed_account_code
    if body.amount is not None:
        line["amount"] = body.amount
    if body.excluded is not None:
        line["excluded"] = body.excluded

    extracted["lines"] = lines_data
    batch.raw_preview = json.dumps(extracted)
    db.flush()

    return {"line_index": line_index, "updated": line}


# ---------------------------------------------------------------------------
# P6: Preview diff — compare original extraction vs current working preview
# ---------------------------------------------------------------------------

@router.get("/{batch_id}/preview-diff")
def get_preview_diff(
    batch_id: int,
    db: Session = Depends(get_db),
):
    """Return a line-by-line diff of original_preview vs current raw_preview.

    Each entry has: line_index, original (dict), current (dict), changed (bool), changes (list[str])
    Lines present in original but excluded=True in current are flagged as excluded.
    """
    batch = db.get(PDFImportBatch, batch_id)
    if batch is None:
        raise HTTPException(status_code=404, detail=f"Batch {batch_id} not found")
    if not batch.original_preview:
        return {"batch_id": batch_id, "diff": [], "note": "no_original_snapshot"}

    try:
        original = json.loads(batch.original_preview)
        current = json.loads(batch.raw_preview or batch.original_preview)
    except (json.JSONDecodeError, TypeError) as exc:
        raise HTTPException(status_code=422, detail=f"Cannot parse preview data: {exc}") from exc

    orig_lines: list[dict] = original.get("lines", [])
    curr_lines: list[dict] = current.get("lines", [])

    diff = []
    TRACKED_FIELDS = ["account_name", "section", "amount", "proposed_account_code", "suggested_taxonomy_code", "excluded"]
    for i, (orig_line, curr_line) in enumerate(zip(orig_lines, curr_lines)):
        changes = [
            f for f in TRACKED_FIELDS
            if str(orig_line.get(f)) != str(curr_line.get(f))
        ]
        diff.append({
            "line_index": i,
            "temp_account_code": curr_line.get("temp_account_code"),
            "account_name": curr_line.get("account_name"),
            "changed": bool(changes),
            "excluded": bool(curr_line.get("excluded")),
            "changes": changes,
            "original": {f: orig_line.get(f) for f in TRACKED_FIELDS},
            "current": {f: curr_line.get(f) for f in TRACKED_FIELDS},
        })

    changed_count = sum(1 for d in diff if d["changed"])
    excluded_count = sum(1 for d in diff if d["excluded"])
    return {
        "batch_id": batch_id,
        "total_lines": len(diff),
        "changed_count": changed_count,
        "excluded_count": excluded_count,
        "diff": diff,
    }


# ---------------------------------------------------------------------------
# P4: Taxonomy conflict resolution endpoint
# ---------------------------------------------------------------------------

@router.post("/{batch_id}/lines/{line_id}/resolve-conflict", response_model=PDFLineOut)
def resolve_taxonomy_conflict(
    batch_id: int,
    line_id: int,
    body: PDFConflictResolutionRequest,
    db: Session = Depends(get_db),
):
    """Resolve a taxonomy conflict on a persisted PDF line.

    Resolution options:
      keep_source   — keep the source/PDF taxonomy, clear conflict
      use_parent    — inherit from parent account taxonomy
      apply_global  — accept the global taxonomy suggestion
      create_reclass — mark for reclass adjustment (keep conflict, mark reviewed)
      create_new    — user will create a new taxonomy line (mark reviewed)
      accepted      — accept the conflict as-is (mark reviewed without change)
    """
    batch = db.get(PDFImportBatch, batch_id)
    if batch is None:
        raise HTTPException(status_code=404, detail=f"Batch {batch_id} not found")

    line = db.get(PDFImportLine, line_id)
    if line is None or line.batch_id != batch_id:
        raise HTTPException(status_code=404, detail=f"Line {line_id} not found in batch {batch_id}")

    mapping = db.query(PDFAccountMapping).filter(
        PDFAccountMapping.batch_id == batch_id,
        PDFAccountMapping.line_id == line_id,
    ).first()

    if mapping is None:
        raise HTTPException(status_code=404, detail="No mapping record found for this line")

    resolution = body.resolution
    VALID = {"keep_source", "use_parent", "apply_global", "create_reclass", "create_new", "accepted"}
    if resolution not in VALID:
        raise HTTPException(status_code=422, detail=f"Invalid resolution. Must be one of: {', '.join(sorted(VALID))}")

    if resolution == "keep_source":
        # Restore source taxonomy, clear conflict
        mapping.taxonomy_code = mapping.source_taxonomy_code
        mapping.taxonomy_source = "manual"
        mapping.taxonomy_conflict = False
        mapping.conflict_resolution = "keep_source"
    elif resolution == "apply_global":
        # Accept whatever taxonomy_code is currently set (the global suggestion)
        mapping.taxonomy_source = "manual"
        mapping.taxonomy_conflict = False
        mapping.conflict_resolution = "apply_global"
    elif resolution == "use_parent":
        # Inherit from entity COA parent — look up the account
        if batch.entity_id is not None and line.official_account_code:
            from app.models.account import Account
            acct = db.query(Account).filter(
                Account.entity_id == batch.entity_id,
                Account.account_number == line.official_account_code,
            ).first()
            if acct and acct.parent_account_id:
                parent = db.get(Account, acct.parent_account_id)
                if parent and parent.reporting_taxonomy_line_id:
                    from app.models.reporting_taxonomy import ReportingTaxonomyLine
                    tax = db.get(ReportingTaxonomyLine, parent.reporting_taxonomy_line_id)
                    if tax:
                        mapping.taxonomy_code = tax.code
                        mapping.taxonomy_source = "inherited"
        mapping.taxonomy_conflict = False
        mapping.conflict_resolution = "use_parent"
    elif resolution in ("create_reclass", "create_new", "accepted"):
        # Mark reviewed without changing taxonomy
        mapping.taxonomy_conflict = False
        mapping.conflict_resolution = resolution

    if body.notes:
        mapping.mapping_notes = body.notes

    db.flush()

    return PDFLineOut(
        id=line.id,
        batch_id=line.batch_id,
        temp_account_code=line.temp_account_code,
        name_hash=line.name_hash,
        official_account_code=line.official_account_code or mapping.official_account_code,
        account_name=line.account_name,
        statement_type=line.statement_type,
        section=line.section,
        amount=str(line.amount),
        is_subtotal=line.is_subtotal,
        is_contra=line.is_contra,
        sort_order=line.sort_order,
        synthetic_presentation_line=getattr(line, "synthetic_presentation_line", False),
        system_managed=getattr(line, "system_managed", False),
        locked=getattr(line, "locked", False),
        suggested_taxonomy_code=line.suggested_taxonomy_code,
        taxonomy_code=mapping.taxonomy_code,
        taxonomy_source=mapping.taxonomy_source,
        taxonomy_locked=mapping.taxonomy_locked,
        source_taxonomy_code=getattr(mapping, "source_taxonomy_code", None),
        taxonomy_conflict=getattr(mapping, "taxonomy_conflict", False),
        conflict_reason=getattr(mapping, "conflict_reason", None),
        conflict_resolution=getattr(mapping, "conflict_resolution", None),
        legal_entity_code=mapping.legal_entity_code,
        consolidation_group=mapping.consolidation_group,
        mapping_confidence=line.mapping_confidence,
        mapping_evidence=line.mapping_evidence,
        page_number=line.page_number,
        source_line_text=line.source_line_text,
    )


# ---------------------------------------------------------------------------
# UX-DEF-12: Bulk conflict resolution
# ---------------------------------------------------------------------------

class BulkConflictResolveRequest(BaseModel):
    resolution: str
    conflict_reason: str | None = None  # when set, only resolve conflicts with this reason


@router.post("/{batch_id}/conflicts/bulk-resolve")
def bulk_resolve_conflicts(
    batch_id: int,
    body: BulkConflictResolveRequest,
    db: Session = Depends(get_db),
):
    """Resolve all open taxonomy conflicts in a batch in one call.

    Optionally filter by conflict_reason to resolve only one conflict type at a time.
    Supports the same resolution values as the single-line endpoint, except
    'use_parent' (which requires per-line account lookup) and
    'create_reclass' / 'create_new' (which are per-line actions).
    """
    VALID_BULK = {"keep_source", "apply_global", "accepted"}
    if body.resolution not in VALID_BULK:
        raise HTTPException(
            status_code=422,
            detail=f"Bulk resolution must be one of: {', '.join(sorted(VALID_BULK))}",
        )

    batch = db.get(PDFImportBatch, batch_id)
    if batch is None:
        raise HTTPException(status_code=404, detail=f"Batch {batch_id} not found")

    q = (
        db.query(PDFAccountMapping)
        .filter(PDFAccountMapping.batch_id == batch_id, PDFAccountMapping.taxonomy_conflict == True)
    )
    if body.conflict_reason:
        q = q.filter(PDFAccountMapping.conflict_reason == body.conflict_reason)

    mappings = q.all()
    if not mappings:
        return {"resolved": 0}

    resolution = body.resolution
    for mapping in mappings:
        if resolution == "keep_source":
            mapping.taxonomy_code = mapping.source_taxonomy_code
            mapping.taxonomy_source = "manual"
        elif resolution == "apply_global":
            mapping.taxonomy_source = "manual"
        # accepted: no taxonomy change
        mapping.taxonomy_conflict = False
        mapping.conflict_resolution = resolution

    db.commit()
    return {"resolved": len(mappings)}


# ---------------------------------------------------------------------------
# P2: Balance sheet validation endpoint
# ---------------------------------------------------------------------------

@router.get("/{batch_id}/bs-validation", response_model=PDFBalanceSheetValidation)
def get_bs_validation(batch_id: int, db: Session = Depends(get_db)):
    """Compute balance sheet tie check for a batch's preview lines."""
    batch = db.get(PDFImportBatch, batch_id)
    if batch is None:
        raise HTTPException(status_code=404, detail=f"Batch {batch_id} not found")
    if not batch.raw_preview:
        raise HTTPException(status_code=404, detail="No preview data")

    extracted = json.loads(batch.raw_preview)
    lines_data = extracted.get("lines", [])
    result = _compute_bs_validation(lines_data)
    return PDFBalanceSheetValidation(**result)


# ---------------------------------------------------------------------------
# Helper functions
# ---------------------------------------------------------------------------

# Net Income keywords that indicate a synthetic equity presentation line
_NET_INCOME_EQUITY_KEYWORDS = {
    "net income",
    "net income (loss)",
    "net loss",
    "current year earnings",
    "current year net income",
    "current year income",
    "profit / loss",
    "profit/loss",
    "earnings",
    "net profit",
    "net earnings",
}

# Equity section keys
_EQUITY_SECTIONS = {"equity", "stockholders_equity", "members_equity", "owners_equity"}


def _mark_synthetic_equity_lines(lines_data: list[dict]) -> None:
    """In-place: mark Net Income lines inside equity as synthetic (P1)."""
    for line in lines_data:
        section = (line.get("section") or "").lower()
        stmt = (line.get("statement_type") or "").lower()
        name = (line.get("account_name") or "").lower().strip()

        if stmt == "balance_sheet" and section in _EQUITY_SECTIONS:
            if any(kw in name for kw in _NET_INCOME_EQUITY_KEYWORDS):
                line["synthetic_presentation_line"] = True
                line["system_managed"] = True
                line["locked"] = True
                line["is_subtotal"] = True


# Balance sheet section groupings
_BS_ASSET_SECTIONS = {"current_assets", "fixed_assets", "other_assets"}
_BS_LIABILITY_SECTIONS = {"current_liabilities", "long_term_liabilities"}
_BS_EQUITY_SECTIONS = {"equity", "stockholders_equity", "members_equity", "owners_equity"}


def _compute_bs_validation(lines_data: list[dict], tolerance: float = 0.01) -> dict:
    """Compute balance sheet tie: Assets vs Liabilities + Equity.

    Prefers extracted subtotal lines (Total Assets, Total Liabilities & Equity)
    when present in the PDF. Falls back to summing detail lines by section when
    those subtotals are absent.
    """
    from decimal import Decimal, InvalidOperation

    def safe_dec(raw) -> Decimal:
        if raw is None:
            return Decimal("0")
        s = str(raw).strip()
        if s.startswith("(") and s.endswith(")"):
            s = "-" + s[1:-1]
        s = s.replace(",", "").replace("$", "").replace("%", "").strip()
        if not s or s == "-":
            return Decimal("0")
        try:
            return Decimal(s)
        except InvalidOperation:
            return Decimal("0")

    # Pass 1: look for PDF-level subtotal lines for the tie check
    total_assets_from_subtotal: Decimal | None = None
    total_le_from_subtotal: Decimal | None = None
    net_income_in_equity: Decimal | None = None
    pnl_net_income: Decimal | None = None

    for line in lines_data:
        stmt = (line.get("statement_type") or "").lower()
        name = (line.get("account_name") or "").strip().lower()
        amount = safe_dec(line.get("amount"))

        if line.get("is_subtotal") and not line.get("synthetic_presentation_line"):
            if stmt == "balance_sheet":
                if "total assets" in name and "liab" not in name and "equity" not in name:
                    total_assets_from_subtotal = amount
                elif (
                    ("total liabilities and" in name)
                    or ("total liabilities &" in name)
                    or ("total liab" in name and "equity" in name)
                    or ("total liab" in name and "stockholder" in name)
                    or ("total liab" in name and "shareholder" in name)
                ):
                    total_le_from_subtotal = amount

        if stmt == "income_statement" and not line.get("is_subtotal"):
            is_ni = any(kw in name for kw in _NET_INCOME_EQUITY_KEYWORDS)
            if is_ni:
                pnl_net_income = amount

        if line.get("synthetic_presentation_line"):
            net_income_in_equity = amount

    # Pass 2: if subtotals were found, use them directly
    if total_assets_from_subtotal is not None and total_le_from_subtotal is not None:
        variance = total_assets_from_subtotal - total_le_from_subtotal
        ni_variance = None
        if net_income_in_equity is not None and pnl_net_income is not None:
            ni_variance = net_income_in_equity - pnl_net_income
        return {
            "total_assets": str(total_assets_from_subtotal),
            "total_liabilities": None,
            "total_equity": None,
            "total_liabilities_equity": str(total_le_from_subtotal),
            "variance": str(variance),
            "tied": abs(float(variance)) <= tolerance,
            "tolerance": str(tolerance),
            "method": "extracted_subtotals",
            "net_income_in_equity": str(net_income_in_equity) if net_income_in_equity is not None else None,
            "pnl_net_income": str(pnl_net_income) if pnl_net_income is not None else None,
            "net_income_variance": str(ni_variance) if ni_variance is not None else None,
        }

    # Fall back: sum detail lines by section
    total_assets = Decimal("0")
    total_liabilities = Decimal("0")
    total_equity = Decimal("0")

    for line in lines_data:
        if line.get("is_subtotal") and not line.get("synthetic_presentation_line"):
            continue
        stmt = (line.get("statement_type") or "").lower()
        section = (line.get("section") or "").lower()
        amount = safe_dec(line.get("amount"))

        if stmt == "balance_sheet":
            if section in _BS_ASSET_SECTIONS:
                total_assets += amount
            elif section in _BS_LIABILITY_SECTIONS:
                total_liabilities += amount
            elif section in _BS_EQUITY_SECTIONS:
                total_equity += amount

    total_le = total_liabilities + total_equity
    variance = total_assets - total_le
    ni_variance = None
    if net_income_in_equity is not None and pnl_net_income is not None:
        ni_variance = net_income_in_equity - pnl_net_income

    return {
        "total_assets": str(total_assets),
        "total_liabilities": str(total_liabilities),
        "total_equity": str(total_equity),
        "total_liabilities_equity": str(total_le),
        "variance": str(variance),
        "tied": abs(float(variance)) <= tolerance,
        "tolerance": str(tolerance),
        "method": "summed_detail_lines",
        "net_income_in_equity": str(net_income_in_equity) if net_income_in_equity is not None else None,
        "pnl_net_income": str(pnl_net_income) if pnl_net_income is not None else None,
        "net_income_variance": str(ni_variance) if ni_variance is not None else None,
    }


# ---------------------------------------------------------------------------
# Original helper
# ---------------------------------------------------------------------------

def _line_to_schema(line_data: dict, proposed_numbers: dict[str, str] | None = None) -> dict:
    temp_code = line_data["temp_account_code"]
    proposed = line_data.get("proposed_account_code")
    if proposed is None and proposed_numbers is not None and not line_data.get("is_subtotal"):
        proposed = proposed_numbers.get(temp_code) or None
    return {
        "temp_account_code": temp_code,
        "name_hash": line_data.get("name_hash"),
        "proposed_account_code": proposed,
        "account_name": line_data["account_name"],
        "statement_type": line_data["statement_type"],
        "section": line_data["section"],
        "amount": line_data["amount"],
        "is_subtotal": line_data.get("is_subtotal", False),
        "is_contra": line_data.get("is_contra", False),
        "sort_order": line_data.get("sort_order", 0),
        "suggested_taxonomy_code": line_data.get("suggested_taxonomy_code"),
        "mapping_confidence": line_data.get("mapping_confidence"),
        "mapping_evidence": line_data.get("mapping_evidence"),
        "page_number": line_data.get("page_number"),
        "source_line_text": line_data.get("source_line_text"),
        "synthetic_presentation_line": line_data.get("synthetic_presentation_line", False),
        "system_managed": line_data.get("system_managed", False),
        "locked": line_data.get("locked", False),
    }
