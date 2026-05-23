"""
COA Import API.

Two-step flow:
  POST /coa-imports/upload          → parse file, store batch, return preview
  POST /coa-imports/{id}/apply      → create/update accounts from parsed preview
  GET  /coa-imports/                → list batches for an entity
  GET  /coa-imports/{id}            → get single batch
  GET  /coa-imports/{id}/preview    → re-fetch the stored preview JSON
"""
from __future__ import annotations

import json

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.api.deps import get_db, get_current_user, get_storage
from app.services.storage_service import StorageBackend
from app.services.organization_service import get_organization_or_raise
from app.services.document_service import upload_document, attach_document
from app.api.schemas import COAApplyRequest, COAImportBatchOut, COAImportPreview, COAImportPreviewRow
from app.models.coa_import_batch import COAImportBatch
from app.services.coa_import_service import apply_coa_import, parse_coa_file

router = APIRouter(prefix="/coa-imports", tags=["coa-imports"])


@router.post("/upload", response_model=COAImportPreview, status_code=201)
async def upload_coa(
    entity_id: int = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
    storage: StorageBackend = Depends(get_storage),
):
    content = await file.read()
    filename = file.filename or "upload.csv"

    from app.models.entity import Entity
    entity = db.get(Entity, entity_id)
    if not entity:
        raise HTTPException(status_code=404, detail=f"Entity {entity_id} not found")

    organization_id = entity.organization_id or 1
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
        document_type="coa_import",
        storage=storage,
        org_slug=org.slug,
        acting_user=current_user,
    )

    try:
        parsed = parse_coa_file(content, filename)
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"Parse error: {exc}") from exc

    if "error" in parsed:
        raise HTTPException(status_code=422, detail=parsed["error"])

    batch = COAImportBatch(
        entity_id=entity_id,
        filename=filename,
        source_system=parsed["source_system"],
        row_count=parsed["row_count"],
        status="parsed",
        raw_preview=json.dumps(parsed),
    )
    db.add(batch)
    db.flush()
    db.refresh(batch)

    attach_document(
        db=db,
        doc_id=doc.id,
        linked_object_type="coa_import",
        linked_object_id=batch.id,
        acting_user=current_user,
    )

    rows = [COAImportPreviewRow(**r) for r in parsed["rows"]]

    return COAImportPreview(
        batch_id=batch.id,
        entity_id=entity_id,
        filename=filename,
        source_system=parsed["source_system"],
        detected_columns=parsed["detected_columns"],
        rows=rows,
        row_count=parsed["row_count"],
        warnings=parsed["warnings"],
    )


@router.post("/{batch_id}/apply", response_model=COAImportBatchOut)
def apply_coa(
    batch_id: int,
    body: COAApplyRequest | None = None,
    db: Session = Depends(get_db),
):
    batch = db.get(COAImportBatch, batch_id)
    if batch is None:
        raise HTTPException(status_code=404, detail=f"COA import batch {batch_id} not found")
    if batch.status == "applied":
        raise HTTPException(status_code=409, detail="Batch already applied")

    if not batch.raw_preview:
        raise HTTPException(status_code=422, detail="No preview data — re-upload the file")

    overrides = body.overrides if body else None
    try:
        parsed = json.loads(batch.raw_preview)
        created, updated = apply_coa_import(parsed, batch.entity_id, db, overrides=overrides)
        batch.status = "applied"
        batch.accounts_created = created
        batch.accounts_updated = updated
        db.flush()
        db.refresh(batch)
        return batch
    except Exception as exc:
        batch.status = "failed"
        batch.error_message = str(exc)
        db.flush()
        raise HTTPException(status_code=500, detail=f"Apply error: {exc}") from exc


@router.get("/", response_model=list[COAImportBatchOut])
def list_coa_batches(entity_id: int | None = None, db: Session = Depends(get_db)):
    q = db.query(COAImportBatch)
    if entity_id is not None:
        q = q.filter(COAImportBatch.entity_id == entity_id)
    return q.order_by(COAImportBatch.created_at.desc()).all()


@router.get("/{batch_id}", response_model=COAImportBatchOut)
def get_coa_batch(batch_id: int, db: Session = Depends(get_db)):
    batch = db.get(COAImportBatch, batch_id)
    if batch is None:
        raise HTTPException(status_code=404, detail=f"COA import batch {batch_id} not found")
    return batch


@router.get("/{batch_id}/preview", response_model=COAImportPreview)
def get_coa_preview(batch_id: int, db: Session = Depends(get_db)):
    batch = db.get(COAImportBatch, batch_id)
    if batch is None:
        raise HTTPException(status_code=404, detail=f"COA import batch {batch_id} not found")
    if not batch.raw_preview:
        raise HTTPException(status_code=404, detail="No preview available")

    parsed = json.loads(batch.raw_preview)
    rows = [COAImportPreviewRow(**r) for r in parsed["rows"]]
    return COAImportPreview(
        batch_id=batch.id,
        entity_id=batch.entity_id,
        filename=batch.filename,
        source_system=parsed["source_system"],
        detected_columns=parsed["detected_columns"],
        rows=rows,
        row_count=parsed["row_count"],
        warnings=parsed["warnings"],
    )
