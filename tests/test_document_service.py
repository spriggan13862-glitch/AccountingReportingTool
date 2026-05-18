"""
M13 proof-point tests: document upload, storage, attachments, and workpapers.

Tests
-----
1.  Document upload — metadata persists to DB correctly
2.  Files save correctly to storage path
3.  Checksums compute correctly and match stored value
4.  Organization isolation — cross-org access blocked
5.  Same document can link to multiple objects
6.  JE support package retrieves attached documents
7.  Soft delete — is_deleted flag set, file removed from storage
8.  Deleted documents are inaccessible via get_document_or_raise
9.  Attachment validation — invalid linked_object_type raises DocumentValidationError
10. Document metadata survives reporting workflows (attach to accounting_period)
"""

import datetime
import hashlib
from decimal import Decimal
from pathlib import Path

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.models.account import Account
from app.models.entity import Entity
from app.models.organization import Organization
from app.models.scenario import Scenario
from app.schemas.journal_entry import JournalEntryCreate, JournalEntryLineCreate
from app.services.accounting_period_service import create_period
from app.services.document_service import (
    DocumentDeletedError,
    DocumentNotFoundError,
    DocumentValidationError,
    attach_document,
    get_document_or_raise,
    get_document_content,
    get_je_support_package,
    list_attachments,
    soft_delete_document,
    upload_document,
)
from app.services.journal_entry_service import post_journal_entry
from app.services.organization_service import create_organization, seed_default_roles
from app.services.storage_service import LocalStorageBackend, compute_checksum
from app.services.user_service import assign_role, create_user


# ---------------------------------------------------------------------------
# Module-scoped fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(scope="module")
def storage(tmp_path_factory):
    """Isolated local storage backed by a temp directory."""
    base = tmp_path_factory.mktemp("storage")
    return LocalStorageBackend(base)


@pytest.fixture(scope="module")
def seeded_session(storage):
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    db = Session()

    # Organizations
    org_a = create_organization(db, name="Org Alpha", slug="alpha")
    org_b = create_organization(db, name="Org Beta", slug="beta")
    seed_default_roles(db)

    # Users
    admin_a = create_user(db, org_a.id, "admin@alpha.com", "Admin A")
    assign_role(db, admin_a.id, "admin", org_a.id)
    user_b = create_user(db, org_b.id, "user@beta.com", "User B")
    assign_role(db, user_b.id, "accountant", org_b.id)

    # Entity + accounts
    entity_a = Entity(code="EA", name="Entity Alpha", entity_type="operating",
                      currency="USD", organization_id=org_a.id)
    db.add(entity_a)
    db.flush()

    cash = Account(entity_id=entity_a.id, account_number="1000", account_name="Cash",
                   account_type="asset", normal_balance="debit")
    rev = Account(entity_id=entity_a.id, account_number="4000", account_name="Revenue",
                  account_type="revenue", normal_balance="credit")
    re = Account(entity_id=entity_a.id, account_number="3900", account_name="RE",
                 account_type="equity", normal_balance="credit")
    for acc in (cash, rev, re):
        db.add(acc)
    db.flush()

    scenario = Scenario(code="ACT", name="Actual", scenario_type="actual")
    db.add(scenario)
    db.flush()

    # A posted JE to use in support-package tests
    je = post_journal_entry(db, JournalEntryCreate(
        je_number="JE-DOC-001",
        entry_date=datetime.date(2024, 3, 31),
        entity_id=entity_a.id,
        scenario_id=scenario.id,
        description="Doc test JE",
        source="test",
        lines=[
            JournalEntryLineCreate(line_number=1, account_id=cash.id,
                                   entity_id=entity_a.id, debit=Decimal("500"), credit=Decimal("0")),
            JournalEntryLineCreate(line_number=2, account_id=rev.id,
                                   entity_id=entity_a.id, debit=Decimal("0"), credit=Decimal("500")),
        ],
    ))

    db.commit()

    yield db, {
        "org_a": org_a, "org_b": org_b,
        "admin_a": admin_a, "user_b": user_b,
        "entity_a": entity_a,
        "cash": cash, "rev": rev, "re": re,
        "scenario": scenario,
        "je": je,
    }

    db.close()
    Base.metadata.drop_all(engine)


@pytest.fixture
def s(seeded_session):
    """Per-test savepoint isolation."""
    db, d = seeded_session
    db.begin_nested()
    yield db, d
    db.rollback()


# ---------------------------------------------------------------------------
# Test 1: Document upload — metadata persists
# ---------------------------------------------------------------------------

def test_upload_metadata_persists(s, storage):
    db, d = s
    content = b"This is a bank statement."
    doc = upload_document(
        db,
        organization_id=d["org_a"].id,
        content=content,
        original_file_name="statement_march.pdf",
        document_type="bank_statement",
        storage=storage,
        org_slug="alpha",
        description="March 2024 bank statement",
    )
    assert doc.id is not None
    assert doc.original_file_name == "statement_march.pdf"
    assert doc.file_extension == ".pdf"
    assert doc.mime_type == "application/pdf"
    assert doc.file_size_bytes == len(content)
    assert doc.document_type == "bank_statement"
    assert doc.description == "March 2024 bank statement"
    assert doc.organization_id == d["org_a"].id
    assert not doc.is_deleted


# ---------------------------------------------------------------------------
# Test 2: File saves to storage path
# ---------------------------------------------------------------------------

def test_file_saves_to_storage(s, storage):
    db, d = s
    content = b"Workpaper content here."
    doc = upload_document(
        db,
        organization_id=d["org_a"].id,
        content=content,
        original_file_name="workpaper.xlsx",
        document_type="workpaper",
        storage=storage,
        org_slug="alpha",
    )
    assert storage.exists(doc.storage_path)
    assert get_document_content(doc, storage) == content


# ---------------------------------------------------------------------------
# Test 3: Checksum computed correctly
# ---------------------------------------------------------------------------

def test_checksum_correct(s, storage):
    db, d = s
    content = b"Audit support document."
    expected = hashlib.sha256(content).hexdigest()
    doc = upload_document(
        db,
        organization_id=d["org_a"].id,
        content=content,
        original_file_name="audit.pdf",
        document_type="audit_support",
        storage=storage,
        org_slug="alpha",
    )
    assert doc.checksum_sha256 == expected
    assert compute_checksum(content) == expected


# ---------------------------------------------------------------------------
# Test 4: Organization isolation
# ---------------------------------------------------------------------------

def test_org_isolation_upload_blocked(s, storage):
    db, d = s
    from app.services.permission_service import OrganizationAccessError
    # user_b is in org_b; trying to upload into org_a
    with pytest.raises(OrganizationAccessError):
        upload_document(
            db,
            organization_id=d["org_a"].id,
            content=b"should be blocked",
            original_file_name="blocked.pdf",
            document_type="memo",
            storage=storage,
            org_slug="alpha",
            acting_user=d["user_b"],
        )


def test_org_isolation_delete_blocked(s, storage):
    db, d = s
    from app.services.permission_service import OrganizationAccessError
    doc = upload_document(
        db,
        organization_id=d["org_a"].id,
        content=b"org_a doc",
        original_file_name="orgA.pdf",
        document_type="memo",
        storage=storage,
        org_slug="alpha",
    )
    with pytest.raises(OrganizationAccessError):
        soft_delete_document(db, doc.id, storage=storage, acting_user=d["user_b"])


# ---------------------------------------------------------------------------
# Test 5: Same document links to multiple objects
# ---------------------------------------------------------------------------

def test_same_doc_multiple_links(s, storage):
    db, d = s
    doc = upload_document(
        db,
        organization_id=d["org_a"].id,
        content=b"Shared workpaper content.",
        original_file_name="shared.pdf",
        document_type="workpaper",
        storage=storage,
        org_slug="alpha",
    )
    link1 = attach_document(db, doc.id, "journal_entry", d["je"].id)
    link2 = attach_document(db, doc.id, "entity", d["entity_a"].id)

    assert link1.linked_object_type == "journal_entry"
    assert link1.linked_object_id == d["je"].id
    assert link2.linked_object_type == "entity"
    assert link2.linked_object_id == d["entity_a"].id

    # Both links point to the same doc
    assert link1.document_id == doc.id
    assert link2.document_id == doc.id


# ---------------------------------------------------------------------------
# Test 6: JE support package retrieves attached documents
# ---------------------------------------------------------------------------

def test_je_support_package(s, storage):
    db, d = s
    doc1 = upload_document(
        db, d["org_a"].id, b"Invoice scan.", "invoice.pdf",
        "journal_entry_support", storage, "alpha",
    )
    doc2 = upload_document(
        db, d["org_a"].id, b"Bank confirmation.", "confirmation.pdf",
        "journal_entry_support", storage, "alpha",
    )
    attach_document(db, doc1.id, "journal_entry", d["je"].id)
    attach_document(db, doc2.id, "journal_entry", d["je"].id)

    pkg = get_je_support_package(db, d["je"].id)
    doc_ids = {doc.id for doc in pkg["documents"]}
    assert doc1.id in doc_ids
    assert doc2.id in doc_ids
    assert pkg["journal_entry"].id == d["je"].id


# ---------------------------------------------------------------------------
# Test 7: Soft delete — flag set, file removed
# ---------------------------------------------------------------------------

def test_soft_delete(s, storage):
    db, d = s
    content = b"This will be deleted."
    doc = upload_document(
        db, d["org_a"].id, content, "to_delete.pdf",
        "memo", storage, "alpha",
    )
    path = doc.storage_path
    assert storage.exists(path)

    soft_delete_document(db, doc.id, storage=storage)

    assert doc.is_deleted is True
    assert not storage.exists(path)


# ---------------------------------------------------------------------------
# Test 8: Deleted documents are inaccessible
# ---------------------------------------------------------------------------

def test_deleted_doc_inaccessible(s, storage):
    db, d = s
    doc = upload_document(
        db, d["org_a"].id, b"Will be deleted.", "gone.pdf",
        "memo", storage, "alpha",
    )
    doc_id = doc.id
    soft_delete_document(db, doc_id, storage=storage)

    with pytest.raises(DocumentDeletedError):
        get_document_or_raise(db, doc_id)


def test_deleted_doc_excluded_from_attachments(s, storage):
    db, d = s
    doc = upload_document(
        db, d["org_a"].id, b"Will be deleted.", "deleted_attached.pdf",
        "journal_entry_support", storage, "alpha",
    )
    attach_document(db, doc.id, "journal_entry", d["je"].id)
    soft_delete_document(db, doc.id, storage=storage)

    # Default list_attachments excludes deleted docs
    docs = list_attachments(db, "journal_entry", d["je"].id)
    assert doc.id not in {d_.id for d_ in docs}


# ---------------------------------------------------------------------------
# Test 9: Attachment validation — invalid linked_object_type
# ---------------------------------------------------------------------------

def test_attach_invalid_object_type(s, storage):
    db, d = s
    doc = upload_document(
        db, d["org_a"].id, b"Some content.", "valid.pdf",
        "memo", storage, "alpha",
    )
    with pytest.raises(DocumentValidationError, match="linked object type"):
        attach_document(db, doc.id, "invalid_type", 99)


def test_upload_invalid_document_type(s, storage):
    db, d = s
    with pytest.raises(DocumentValidationError, match="document type"):
        upload_document(
            db, d["org_a"].id, b"Bad type.", "file.pdf",
            "not_a_real_type", storage, "alpha",
        )


# ---------------------------------------------------------------------------
# Test 10: Document metadata survives reporting workflows (period attachment)
# ---------------------------------------------------------------------------

def test_attach_to_accounting_period(s, storage):
    db, d = s
    period = create_period(
        db,
        entity_id=d["entity_a"].id,
        period_name="Q1 2024",
        start_date=datetime.date(2024, 1, 1),
        end_date=datetime.date(2024, 3, 31),
        fiscal_year=2024,
        fiscal_period=1,
        period_type="quarterly",
    )

    doc = upload_document(
        db, d["org_a"].id, b"Q1 close workpaper.", "q1_close.pdf",
        "workpaper", storage, "alpha",
        description="Q1 2024 period close workpaper",
    )
    attach_document(db, doc.id, "accounting_period", period.id)

    attached = list_attachments(db, "accounting_period", period.id)
    assert len(attached) == 1
    assert attached[0].id == doc.id
    assert attached[0].description == "Q1 2024 period close workpaper"
    assert attached[0].checksum_sha256 == compute_checksum(b"Q1 close workpaper.")
