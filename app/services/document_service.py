"""
Document and workpaper service.

Responsibilities
----------------
- Upload files: compute checksum, resolve storage path, persist metadata.
- Attach documents to any supported object type (polymorphic linking).
- Retrieve support packages for JEs, TB imports, and reporting objects.
- Enforce organization isolation: documents are org-scoped.
- Soft-delete: mark is_deleted, remove from storage; links preserved for audit.

Immutability contract
---------------------
Attaching documents to a posted JE is explicitly allowed — evidence may be
added after posting without violating the posted-entry immutability rule.
The JE lines/status remain immutable; only the document set changes.
"""

from __future__ import annotations

import datetime
import mimetypes
import uuid
from pathlib import Path
from typing import TYPE_CHECKING

from sqlalchemy.orm import Session

from app.models.document import Document, DOCUMENT_TYPES
from app.models.document_link import DocumentLink, LINKED_OBJECT_TYPES
from app.services.permission_service import OrganizationAccessError
from app.services.storage_service import StorageBackend, compute_checksum

if TYPE_CHECKING:
    from app.models.user import User


# ---------------------------------------------------------------------------
# Exceptions
# ---------------------------------------------------------------------------

class DocumentNotFoundError(LookupError):
    """Raised when a document record does not exist."""


class DocumentDeletedError(LookupError):
    """Raised when a document exists but is soft-deleted."""


class DocumentValidationError(ValueError):
    """Raised for invalid document type, link type, or other input errors."""


# ---------------------------------------------------------------------------
# Internal org-access guard
# ---------------------------------------------------------------------------

def _assert_org_access(acting_user: User, org_id: int) -> None:
    if acting_user.is_superuser:
        return
    if acting_user.organization_id != org_id:
        raise OrganizationAccessError(
            f"User '{acting_user.email}' (org={acting_user.organization_id}) "
            f"cannot access documents in org {org_id}"
        )


# ---------------------------------------------------------------------------
# Upload
# ---------------------------------------------------------------------------

def upload_document(
    db: Session,
    organization_id: int,
    content: bytes,
    original_file_name: str,
    document_type: str,
    storage: StorageBackend,
    org_slug: str,
    description: str | None = None,
    uploaded_by_user_id: int | None = None,
    acting_user: User | None = None,
) -> Document:
    """
    Save file content to storage and persist document metadata to the DB.

    Parameters
    ----------
    content
        Raw file bytes.
    original_file_name
        The user-supplied filename (preserved in DB for display; not used for storage).
    document_type
        Must be one of DOCUMENT_TYPES.
    storage
        The StorageBackend implementation to use. Inject a test backend in tests.
    org_slug
        Used to build the storage path: {org_slug}/{document_type}/{uuid}{ext}.

    Storage path
    ------------
    Relative path is stored in Document.storage_path and is backend-agnostic.
    S3 backends use it as an object key; local backends resolve it to a file path.
    """
    if document_type not in DOCUMENT_TYPES:
        raise DocumentValidationError(
            f"Unknown document type '{document_type}'. "
            f"Valid types: {sorted(DOCUMENT_TYPES)}"
        )
    if acting_user is not None:
        _assert_org_access(acting_user, organization_id)

    ext = Path(original_file_name).suffix.lower() or ".bin"
    stored_name = f"{uuid.uuid4()}{ext}"
    relative_path = f"{org_slug}/{document_type}/{stored_name}"
    mime = mimetypes.guess_type(original_file_name)[0] or "application/octet-stream"
    checksum = compute_checksum(content)

    storage.save(relative_path, content)

    doc = Document(
        organization_id=organization_id,
        uploaded_by_user_id=uploaded_by_user_id or (acting_user.id if acting_user else None),
        file_name=stored_name,
        original_file_name=original_file_name,
        file_extension=ext,
        mime_type=mime,
        file_size_bytes=len(content),
        storage_path=relative_path,
        document_type=document_type,
        description=description,
        checksum_sha256=checksum,
        uploaded_at=datetime.datetime.now(),
        is_deleted=False,
    )
    db.add(doc)
    db.flush()
    db.refresh(doc)
    return doc


# ---------------------------------------------------------------------------
# Retrieval
# ---------------------------------------------------------------------------

def get_document_or_raise(
    db: Session,
    doc_id: int,
    include_deleted: bool = False,
) -> Document:
    """Return a Document by id. Raises DocumentDeletedError for soft-deleted records."""
    doc = db.get(Document, doc_id)
    if doc is None:
        raise DocumentNotFoundError(f"Document id={doc_id} not found")
    if doc.is_deleted and not include_deleted:
        raise DocumentDeletedError(f"Document id={doc_id} has been deleted")
    return doc


def get_document_content(doc: Document, storage: StorageBackend) -> bytes:
    """Return the raw file bytes for a document."""
    return storage.load(doc.storage_path)


# ---------------------------------------------------------------------------
# Soft delete
# ---------------------------------------------------------------------------

def soft_delete_document(
    db: Session,
    doc_id: int,
    storage: StorageBackend,
    acting_user: User | None = None,
) -> None:
    """
    Mark a document as deleted and remove it from storage.
    DocumentLink rows are preserved intentionally — they form an audit trail
    showing that evidence was once attached to an object.
    """
    doc = get_document_or_raise(db, doc_id)
    if acting_user is not None:
        _assert_org_access(acting_user, doc.organization_id)
    doc.is_deleted = True
    storage.delete(doc.storage_path)
    db.flush()


# ---------------------------------------------------------------------------
# Attachment linking
# ---------------------------------------------------------------------------

def attach_document(
    db: Session,
    doc_id: int,
    linked_object_type: str,
    linked_object_id: int,
    acting_user: User | None = None,
) -> DocumentLink:
    """
    Create a link between a document and any attachable object.

    Idempotent: returns the existing link if one already exists for this
    (doc, object_type, object_id) combination.

    Attaching to a posted JE is permitted — evidence may be added post-posting
    without modifying the immutable JE record.
    """
    if linked_object_type not in LINKED_OBJECT_TYPES:
        raise DocumentValidationError(
            f"Unknown linked object type '{linked_object_type}'. "
            f"Valid types: {sorted(LINKED_OBJECT_TYPES)}"
        )
    doc = get_document_or_raise(db, doc_id)
    if acting_user is not None:
        _assert_org_access(acting_user, doc.organization_id)

    existing = (
        db.query(DocumentLink)
        .filter(
            DocumentLink.document_id == doc_id,
            DocumentLink.linked_object_type == linked_object_type,
            DocumentLink.linked_object_id == linked_object_id,
        )
        .first()
    )
    if existing:
        return existing

    link = DocumentLink(
        document_id=doc_id,
        linked_object_type=linked_object_type,
        linked_object_id=linked_object_id,
        created_at=datetime.datetime.now(),
    )
    db.add(link)
    db.flush()
    db.refresh(link)
    return link


def list_attachments(
    db: Session,
    linked_object_type: str,
    linked_object_id: int,
    include_deleted: bool = False,
) -> list[Document]:
    """Return all documents linked to an object, excluding soft-deleted by default."""
    q = (
        db.query(Document)
        .join(DocumentLink, DocumentLink.document_id == Document.id)
        .filter(
            DocumentLink.linked_object_type == linked_object_type,
            DocumentLink.linked_object_id == linked_object_id,
        )
    )
    if not include_deleted:
        q = q.filter(Document.is_deleted == False)  # noqa: E712
    return q.order_by(Document.uploaded_at).all()


# ---------------------------------------------------------------------------
# Support packages
# ---------------------------------------------------------------------------

def get_je_support_package(db: Session, je_id: int) -> dict:
    """Return the journal entry and all linked support documents."""
    from app.models.journal_entry import JournalEntry
    from app.services.journal_entry_service import JournalEntryNotFoundError
    je = db.get(JournalEntry, je_id)
    if je is None:
        raise JournalEntryNotFoundError(f"Journal entry id={je_id} not found")
    docs = list_attachments(db, "journal_entry", je_id)
    return {"journal_entry": je, "documents": docs}


def get_tb_import_support_package(db: Session, import_id: int) -> dict:
    """Return the TB import and all linked support documents."""
    from app.models.tb_import import TbImport
    tb = db.get(TbImport, import_id)
    if tb is None:
        raise LookupError(f"TB import id={import_id} not found")
    docs = list_attachments(db, "tb_import", import_id)
    return {"tb_import": tb, "documents": docs}


def get_period_support_package(db: Session, period_id: int) -> dict:
    """Return the accounting period and all linked support documents."""
    from app.models.accounting_period import AccountingPeriod
    from app.services.accounting_period_service import PeriodNotFoundError
    period = db.get(AccountingPeriod, period_id)
    if period is None:
        raise PeriodNotFoundError(f"Accounting period id={period_id} not found")
    docs = list_attachments(db, "accounting_period", period_id)
    return {"accounting_period": period, "documents": docs}
