"""Documents, attachments, workpaper support, and import registry endpoints."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db, get_storage
from app.api.schemas import (
    AttachDocumentRequest,
    DocumentLinkOut,
    DocumentOut,
    JESupportPackageOut,
    PeriodSupportPackageOut,
    TbImportSupportPackageOut,
)
from app.services.document_service import (
    DocumentDeletedError,
    DocumentNotFoundError,
    DocumentValidationError,
    attach_document,
    get_document_or_raise,
    get_je_support_package,
    get_period_support_package,
    get_tb_import_support_package,
    list_attachments,
    soft_delete_document,
    upload_document,
)
from app.services.organization_service import get_organization_or_raise
from app.services.storage_service import StorageBackend

router = APIRouter(tags=["documents"])


# ---------------------------------------------------------------------------
# Upload
# ---------------------------------------------------------------------------

@router.post("/documents/upload", response_model=DocumentOut, status_code=201)
async def upload(
    organization_id: int = Form(...),
    document_type: str = Form(...),
    description: str | None = Form(default=None),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    storage: StorageBackend = Depends(get_storage),
    acting_user=Depends(get_current_user),
):
    org = get_organization_or_raise(db, organization_id)
    content = await file.read()
    try:
        return upload_document(
            db,
            organization_id=organization_id,
            content=content,
            original_file_name=file.filename or "upload.bin",
            document_type=document_type,
            storage=storage,
            org_slug=org.slug,
            description=description,
            acting_user=acting_user,
        )
    except DocumentValidationError as exc:
        raise HTTPException(status_code=422, detail=str(exc))


# ---------------------------------------------------------------------------
# Document metadata
# ---------------------------------------------------------------------------

@router.get("/documents/{doc_id}", response_model=DocumentOut)
def get_doc(doc_id: int, db: Session = Depends(get_db)):
    try:
        return get_document_or_raise(db, doc_id)
    except DocumentNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except DocumentDeletedError as exc:
        raise HTTPException(status_code=410, detail=str(exc))


# ---------------------------------------------------------------------------
# Soft delete
# ---------------------------------------------------------------------------

@router.delete("/documents/{doc_id}", status_code=204)
def delete_doc(
    doc_id: int,
    db: Session = Depends(get_db),
    storage: StorageBackend = Depends(get_storage),
    acting_user=Depends(get_current_user),
):
    try:
        soft_delete_document(db, doc_id, storage=storage, acting_user=acting_user)
    except DocumentNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


# ---------------------------------------------------------------------------
# Attach
# ---------------------------------------------------------------------------

@router.post("/documents/{doc_id}/attach", response_model=DocumentLinkOut, status_code=201)
def attach(
    doc_id: int,
    body: AttachDocumentRequest,
    db: Session = Depends(get_db),
    acting_user=Depends(get_current_user),
):
    try:
        return attach_document(
            db,
            doc_id=doc_id,
            linked_object_type=body.linked_object_type,
            linked_object_id=body.linked_object_id,
            acting_user=acting_user,
        )
    except DocumentNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except DocumentValidationError as exc:
        raise HTTPException(status_code=422, detail=str(exc))


# ---------------------------------------------------------------------------
# List attachments for any object
# ---------------------------------------------------------------------------

@router.get("/attachments/{object_type}/{object_id}", response_model=list[DocumentOut])
def list_object_attachments(
    object_type: str,
    object_id: int,
    db: Session = Depends(get_db),
):
    try:
        return list_attachments(db, object_type, object_id)
    except DocumentValidationError as exc:
        raise HTTPException(status_code=422, detail=str(exc))


# ---------------------------------------------------------------------------
# Support packages
# ---------------------------------------------------------------------------

@router.get("/journal-entries/{je_id}/support", response_model=JESupportPackageOut)
def je_support(je_id: int, db: Session = Depends(get_db)):
    pkg = get_je_support_package(db, je_id)
    return JESupportPackageOut(
        journal_entry_id=pkg["journal_entry"].id,
        documents=pkg["documents"],
    )


@router.get("/tb-imports/{import_id}/support", response_model=TbImportSupportPackageOut)
def tb_import_support(import_id: int, db: Session = Depends(get_db)):
    try:
        pkg = get_tb_import_support_package(db, import_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    return TbImportSupportPackageOut(
        tb_import_id=pkg["tb_import"].id,
        documents=pkg["documents"],
    )


@router.get("/accounting-periods/{period_id}/support", response_model=PeriodSupportPackageOut)
def period_support(period_id: int, db: Session = Depends(get_db)):
    try:
        pkg = get_period_support_package(db, period_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    return PeriodSupportPackageOut(
        accounting_period_id=pkg["accounting_period"].id,
        documents=pkg["documents"],
    )


# ---------------------------------------------------------------------------
# Import Registry — unified view of all uploaded files across modules
# ---------------------------------------------------------------------------

@router.get("/import-registry", response_model=list[dict])
def import_registry(
    entity_id: int | None = Query(default=None),
    limit: int = Query(default=100, le=500),
    db: Session = Depends(get_db),
) -> list[dict[str, Any]]:
    """Aggregate all upload events across PDF imports, TB imports, and COA imports.

    Returns a chronologically-sorted list (newest first) suitable for the
    Documents Center registry view.  Each entry has:
      id, source_module, filename, entity_id, status, line_count,
      created_at, description
    """
    from app.models.pdf_import_batch import PDFImportBatch
    from app.models.import_batch import ImportBatch
    from app.models.coa_import_batch import COAImportBatch

    entries: list[dict[str, Any]] = []

    # PDF imports
    pdf_q = db.query(PDFImportBatch)
    if entity_id is not None:
        pdf_q = pdf_q.filter(PDFImportBatch.entity_id == entity_id)
    for b in pdf_q.order_by(PDFImportBatch.id.desc()).limit(limit).all():
        entries.append({
            "id": f"pdf-{b.id}",
            "source_module": "pdf_import",
            "source_id": b.id,
            "filename": b.filename,
            "entity_id": b.entity_id,
            "source_entity_name": b.source_entity_name,
            "status": b.status,
            "line_count": b.line_count,
            "description": f"PDF financial statement — {b.source_entity_name or 'unknown entity'}",
            "created_at": b.created_at.isoformat() if b.created_at else None,
            "basis_of_accounting": b.basis_of_accounting,
            "statement_date": b.statement_date,
        })

    # Trial balance imports
    tb_q = db.query(ImportBatch)
    if entity_id is not None:
        tb_q = tb_q.filter(ImportBatch.entity_id == entity_id)
    for b in tb_q.order_by(ImportBatch.id.desc()).limit(limit).all():
        entries.append({
            "id": f"tb-{b.id}",
            "source_module": "tb_import",
            "source_id": b.id,
            "filename": b.filename,
            "entity_id": b.entity_id,
            "source_entity_name": None,
            "status": b.status,
            "line_count": b.row_count,
            "description": "Trial balance import",
            "created_at": b.uploaded_at.isoformat() if b.uploaded_at else None,
            "basis_of_accounting": None,
            "statement_date": str(b.as_of_date) if b.as_of_date else None,
        })

    # COA imports
    try:
        coa_q = db.query(COAImportBatch)
        if entity_id is not None:
            coa_q = coa_q.filter(COAImportBatch.entity_id == entity_id)
        for b in coa_q.order_by(COAImportBatch.id.desc()).limit(limit).all():
            entries.append({
                "id": f"coa-{b.id}",
                "source_module": "coa_import",
                "source_id": b.id,
                "filename": getattr(b, "filename", None) or getattr(b, "original_filename", "COA Import"),
                "entity_id": getattr(b, "entity_id", None),
                "source_entity_name": None,
                "status": getattr(b, "status", "unknown"),
                "line_count": getattr(b, "row_count", None) or getattr(b, "line_count", None),
                "description": "Chart of accounts import",
                "created_at": b.created_at.isoformat() if hasattr(b, "created_at") and b.created_at else None,
                "basis_of_accounting": None,
                "statement_date": None,
            })
    except Exception:
        pass  # COA import table may not exist in all environments

    # Sort by created_at descending (newest first), None dates last
    entries.sort(key=lambda e: e.get("created_at") or "", reverse=True)
    return entries[:limit]
