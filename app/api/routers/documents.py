"""Documents, attachments, and workpaper support endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
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
