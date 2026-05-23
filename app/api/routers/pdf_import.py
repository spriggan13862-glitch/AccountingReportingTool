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
from sqlalchemy.orm import Session

from app.api.deps import get_db
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
    db: Session = Depends(get_db),
):
    content = await file.read()
    filename = file.filename or "upload.pdf"

    if not filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=422, detail="Only PDF files are accepted")

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
    detail_lines = [l for l in lines_data if not l["is_subtotal"]]
    subtotal_lines = [l for l in lines_data if l["is_subtotal"]]

    # Generate accountant-friendly numbers at upload time so the preview can
    # show them instead of the internal hash codes.
    proposed_numbers = generate_account_numbers(lines_data)

    batch = PDFImportBatch(
        entity_id=entity_id,
        filename=filename,
        source_entity_name=extracted.get("source_entity_name"),
        statement_date=extracted.get("statement_date"),
        basis_of_accounting=extracted.get("basis_of_accounting"),
        page_count=extracted.get("page_count"),
        line_count=len(detail_lines),
        status="parsed",
        raw_preview=json.dumps(extracted),
        validation_summary=json.dumps(extracted.get("validation", {})),
    )
    db.add(batch)
    db.flush()
    db.refresh(batch)

    preview_lines = [PDFImportPreviewLine(**_line_to_schema(l, proposed_numbers)) for l in lines_data]

    return PDFImportPreview(
        batch_id=batch.id,
        entity_id=entity_id,
        filename=filename,
        source_entity_name=extracted.get("source_entity_name"),
        statement_date=extracted.get("statement_date"),
        basis_of_accounting=extracted.get("basis_of_accounting"),
        page_count=extracted.get("page_count", 0),
        line_count=len(detail_lines),
        subtotal_count=len(subtotal_lines),
        lines=preview_lines,
        validation=extracted.get("validation", {}),
        warnings=extracted.get("warnings", []),
    )


@router.post("/{batch_id}/apply", response_model=PDFImportBatchOut)
def apply_pdf_import(batch_id: int, db: Session = Depends(get_db)):
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

    detail_lines = [l for l in lines_data if not l.get("is_subtotal")]

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

    try:
        for i, line_data in enumerate(lines_data):
            temp_code = line_data.get("temp_account_code", f"UNKNOWN-{i}")
            assigned_number = account_numbers.get(temp_code, "")

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
            )
            db.add(line_obj)
            db.flush()

            mapping_obj = PDFAccountMapping(
                batch_id=batch.id,
                line_id=line_obj.id,
                source_account_code=temp_code,
                official_account_code=assigned_number or None,
                account_name=line_data.get("account_name", ""),
                name_hash=line_data.get("name_hash") or "",
                taxonomy_code=line_data.get("suggested_taxonomy_code"),
                taxonomy_source="auto",
                taxonomy_locked=False,
            )
            db.add(mapping_obj)

        batch.status = "applied"
        batch.accounts_created = len(detail_lines)
        validation_summary = {
            "lines_persisted": len(lines_data),
            "detail_lines": len(detail_lines),
            "account_numbers_assigned": sum(1 for v in account_numbers.values() if v),
            "errors": error_summary,
        }
        batch.validation_summary = json.dumps(validation_summary)
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
    detail_lines = [l for l in lines_data if not l["is_subtotal"]]
    subtotal_lines = [l for l in lines_data if l["is_subtotal"]]
    proposed_numbers = generate_account_numbers(lines_data)
    preview_lines = [PDFImportPreviewLine(**_line_to_schema(l, proposed_numbers)) for l in lines_data]

    return PDFImportPreview(
        batch_id=batch.id,
        entity_id=batch.entity_id,
        filename=batch.filename,
        source_entity_name=batch.source_entity_name,
        statement_date=batch.statement_date,
        basis_of_accounting=batch.basis_of_accounting,
        page_count=batch.page_count or 0,
        line_count=len(detail_lines),
        subtotal_count=len(subtotal_lines),
        lines=preview_lines,
        validation=extracted.get("validation", {}),
        warnings=extracted.get("warnings", []),
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
            suggested_taxonomy_code=line.suggested_taxonomy_code,
            taxonomy_code=m.taxonomy_code if m else line.suggested_taxonomy_code,
            taxonomy_source=m.taxonomy_source if m else "auto",
            taxonomy_locked=m.taxonomy_locked if m else False,
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
    if body.official_account_code is not None:
        line.official_account_code = body.official_account_code

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
        suggested_taxonomy_code=line.suggested_taxonomy_code,
        taxonomy_code=mapping.taxonomy_code,
        taxonomy_source=mapping.taxonomy_source,
        taxonomy_locked=mapping.taxonomy_locked,
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

    extracted["lines"] = lines_data
    batch.raw_preview = json.dumps(extracted)
    db.flush()

    return {"line_index": line_index, "updated": line}


# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------

def _line_to_schema(line_data: dict, proposed_numbers: dict[str, str] | None = None) -> dict:
    temp_code = line_data["temp_account_code"]
    proposed = None
    if proposed_numbers is not None and not line_data.get("is_subtotal"):
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
    }
