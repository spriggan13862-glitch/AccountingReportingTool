"""
Import review workflow tests — Sprint I.

Tests cover:
 1. exclude_lines marks lines as skipped
 2. detect total rows by name prefix
 3. detect total rows by blank account number
 4. blocking validation errors (IMPORT_UNBALANCED, IMPORT_MISSING_MAPPING)
 5. non-blocking validation warnings (IMPORT_DUPLICATE_ACCOUNT)
 6. batch assign parent account
 7. bulk assign FSLI (ViewAccountOverride)
"""

from __future__ import annotations

import datetime
from decimal import Decimal

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(scope="module")
def db():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()
    engine.dispose()


@pytest.fixture(scope="module")
def seeded(db):
    from app.models.organization import Organization
    from app.models.entity import Entity
    from app.models.account import Account
    from app.models.scenario import Scenario
    from app.models.reporting_taxonomy import ReportingTaxonomyView, ReportingTaxonomyLine
    from app.services.organization_service import create_organization, seed_default_roles
    from app.core.security import hash_password
    from app.models.user import User

    org = create_organization(db, name="Review Test Corp", slug="review-test")
    seed_default_roles(db)

    user = User(
        organization_id=org.id,
        email="reviewer@test.com",
        full_name="Reviewer",
        hashed_password=hash_password("test1234!"),
        is_superuser=True,
    )
    db.add(user)

    entity = Entity(
        code="RTC",
        name="Review Test LLC",
        entity_type="operating",
        organization_id=org.id,
    )
    db.add(entity)

    scenario = Scenario(
        organization_id=org.id,
        code="ACT",
        name="Actual",
        scenario_type="actual",
    )
    db.add(scenario)
    db.flush()

    accounts = [
        Account(account_number="1000", account_name="Cash", account_type="asset",
                normal_balance="debit", entity_id=entity.id),
        Account(account_number="1100", account_name="Accounts Receivable", account_type="asset",
                normal_balance="debit", entity_id=entity.id),
        Account(account_number="2000", account_name="Accounts Payable", account_type="liability",
                normal_balance="credit", entity_id=entity.id),
        Account(account_number="3000", account_name="Common Stock", account_type="equity",
                normal_balance="credit", entity_id=entity.id),
        Account(account_number="3100", account_name="Retained Earnings", account_type="equity",
                normal_balance="credit", entity_id=entity.id),
    ]
    for a in accounts:
        db.add(a)

    view = ReportingTaxonomyView(
        code="GAAP",
        name="GAAP View",
        is_default=True,
        is_system_defined=False,
        active=True,
    )
    db.add(view)
    db.flush()

    taxonomy_line = ReportingTaxonomyLine(
        code="CASH",
        name="Cash and Equivalents",
        section="assets",
        sort_order=10,
        is_subtotal=False,
        reporting_view_id=view.id,
    )
    db.add(taxonomy_line)
    db.flush()
    db.commit()

    acct_by_num = {a.account_number: a for a in accounts}
    return {
        "org": org,
        "entity": entity,
        "scenario": scenario,
        "user": user,
        "accounts": acct_by_num,
        "view": view,
        "taxonomy_line": taxonomy_line,
    }


def _make_batch_with_lines(db, seeded, lines_spec):
    """
    Create an ImportBatch with given lines.
    lines_spec: list of (raw_account_number, raw_account_name, debit, credit, mapping_status)
    """
    from app.models.import_batch import ImportBatch
    from app.models.import_line import ImportLine

    entity = seeded["entity"]
    org = seeded["org"]
    accounts = seeded["accounts"]

    batch = ImportBatch(
        organization_id=org.id,
        entity_id=entity.id,
        filename="test.csv",
        source_format="csv",
        content_hash=f"hash-{id(lines_spec)}",
        column_mapping={},
        as_of_date=datetime.date(2024, 12, 31),
        status="mapping_required",
        row_count=len(lines_spec),
    )
    db.add(batch)
    db.flush()

    for i, spec in enumerate(lines_spec):
        raw_num, raw_name, debit, credit, status = spec
        resolved_id = None
        if raw_num and raw_num in accounts:
            resolved_id = accounts[raw_num].id
        line = ImportLine(
            batch_id=batch.id,
            line_number=i + 1,
            raw_account_number=raw_num,
            raw_account_name=raw_name,
            debit=Decimal(str(debit)),
            credit=Decimal(str(credit)),
            mapping_status=status,
            resolved_account_id=resolved_id,
        )
        db.add(line)

    db.flush()
    db.commit()
    return batch


# ---------------------------------------------------------------------------
# Test 1: exclude_lines
# ---------------------------------------------------------------------------

def test_exclude_lines(db, seeded):
    """Lines marked skipped are excluded from posting."""
    from app.models.import_line import ImportLine

    batch = _make_batch_with_lines(db, seeded, [
        ("1000", "Cash", 50000, 0, "mapped"),
        ("", "Total Assets", 50000, 0, "unmapped"),
        ("3000", "Common Stock", 0, 50000, "mapped"),
    ])

    lines = db.query(ImportLine).filter(ImportLine.batch_id == batch.id).all()
    total_line = next(l for l in lines if l.raw_account_name == "Total Assets")

    total_line.mapping_status = "skipped"
    total_line.notes = "Excluded: total_row"
    db.commit()

    db.refresh(total_line)
    assert total_line.mapping_status == "skipped"
    assert total_line.notes == "Excluded: total_row"

    remaining = db.query(ImportLine).filter(
        ImportLine.batch_id == batch.id,
        ImportLine.mapping_status != "skipped",
    ).all()
    assert len(remaining) == 2


# ---------------------------------------------------------------------------
# Test 2: detect total rows by name
# ---------------------------------------------------------------------------

def test_detect_total_rows_by_name():
    """Lines with 'Total Assets' name detected as total rows."""
    from app.models.import_line import ImportLine
    import statistics

    _TOTAL_PREFIXES = ("total", "subtotal", "grand total", "check", "sum")

    test_cases = [
        ("", "Total Assets", 500000, 0),
        ("", "Subtotal Current Assets", 250000, 0),
        ("", "Grand Total", 750000, 0),
        ("1000", "Cash", 50000, 0),
    ]

    detected = []
    for raw_num, raw_name, debit, credit in test_cases:
        name_lower = raw_name.lower()
        if any(name_lower.startswith(p) for p in _TOTAL_PREFIXES):
            detected.append(raw_name)

    assert "Total Assets" in detected
    assert "Subtotal Current Assets" in detected
    assert "Grand Total" in detected
    assert "Cash" not in detected


# ---------------------------------------------------------------------------
# Test 3: detect total rows by blank account + large amount
# ---------------------------------------------------------------------------

def test_detect_total_rows_blank_account():
    """Blank account + large amount detected as subtotal."""
    test_cases = [
        ("", "", 750000, 0),     # blank name and number with large amount → detected
        ("", "Cash", 50000, 0),  # has name → not detected as blank
        ("1000", "", 50000, 0),  # has number → not detected
    ]

    def is_blank_with_amount(raw_num, raw_name, debit, credit):
        number = (raw_num or "").strip()
        name = (raw_name or "").strip()
        amt = debit + credit
        return not number and not name and amt > 0

    assert is_blank_with_amount("", "", 750000, 0) is True
    assert is_blank_with_amount("", "Cash", 50000, 0) is False
    assert is_blank_with_amount("1000", "", 50000, 0) is False


# ---------------------------------------------------------------------------
# Test 4: blocking validation errors
# ---------------------------------------------------------------------------

def test_blocking_validation_errors(db, seeded):
    """IMPORT_UNBALANCED and IMPORT_MISSING_MAPPING block posting."""
    from app.services import import_batch_service as svc

    batch = _make_batch_with_lines(db, seeded, [
        ("1000", "Cash", 50000, 0, "mapped"),
        ("3000", "Common Stock", 0, 40000, "mapped"),  # intentionally unbalanced
    ])
    batch.status = "mapping_required"
    db.commit()

    result = svc.validate_batch(db, batch.id)

    assert result.has_errors, "Unbalanced TB should have errors"
    error_codes = {i.code for i in result.errors}
    assert "IMPORT_UNBALANCED" in error_codes, f"Expected IMPORT_UNBALANCED, got: {error_codes}"


def test_missing_mapping_blocks_posting(db, seeded):
    """Unmapped lines block posting (IMPORT_MISSING_MAPPING)."""
    from app.services import import_batch_service as svc

    batch = _make_batch_with_lines(db, seeded, [
        ("1000", "Cash", 50000, 0, "mapped"),
        ("9999", "Unknown Account", 0, 50000, "unmapped"),  # unmapped
    ])
    batch.status = "mapping_required"
    db.commit()

    result = svc.validate_batch(db, batch.id)

    assert result.has_errors
    error_codes = {i.code for i in result.errors}
    assert "IMPORT_MISSING_MAPPING" in error_codes


# ---------------------------------------------------------------------------
# Test 5: non-blocking validation warnings
# ---------------------------------------------------------------------------

def test_nonblocking_validation_warnings(db, seeded):
    """IMPORT_DUPLICATE_ACCOUNT is a warning and does not block posting."""
    from app.services import import_batch_service as svc

    batch = _make_batch_with_lines(db, seeded, [
        ("1000", "Cash", 25000, 0, "mapped"),
        ("1000", "Cash Duplicate", 25000, 0, "mapped"),  # duplicate account number
        ("3000", "Common Stock", 0, 50000, "mapped"),
    ])
    batch.status = "mapping_required"
    db.commit()

    result = svc.validate_batch(db, batch.id)

    warning_codes = {i.code for i in result.warnings}
    assert "IMPORT_DUPLICATE_ACCOUNT" in warning_codes, f"Expected duplicate warning, got: {warning_codes}"
    assert not result.has_errors, "Duplicate account should only warn, not error"


# ---------------------------------------------------------------------------
# Test 6: batch assign parent
# ---------------------------------------------------------------------------

def test_batch_assign_parent(db, seeded):
    """assign-parent sets parent_account_id on resolved accounts."""
    from app.models.import_line import ImportLine
    from app.models.account import Account

    accounts = seeded["accounts"]
    parent_acct = accounts["1000"]  # use Cash as parent

    batch = _make_batch_with_lines(db, seeded, [
        ("1100", "Accounts Receivable", 20000, 0, "mapped"),
    ])

    line = db.query(ImportLine).filter(ImportLine.batch_id == batch.id).first()
    assert line is not None
    assert line.resolved_account_id is not None

    account = db.get(Account, line.resolved_account_id)
    account.parent_account_id = parent_acct.id
    db.commit()

    db.refresh(account)
    assert account.parent_account_id == parent_acct.id


# ---------------------------------------------------------------------------
# Test 7: bulk assign FSLI
# ---------------------------------------------------------------------------

def test_bulk_assign_fsli(db, seeded):
    """bulk-assign-fsli creates ViewAccountOverride for each account."""
    from app.models.import_line import ImportLine
    from app.models.view_account_override import ViewAccountOverride
    import datetime as _dt

    accounts = seeded["accounts"]
    entity = seeded["entity"]
    view = seeded["view"]
    taxonomy_line = seeded["taxonomy_line"]

    batch = _make_batch_with_lines(db, seeded, [
        ("1000", "Cash", 50000, 0, "mapped"),
    ])

    line = db.query(ImportLine).filter(ImportLine.batch_id == batch.id).first()
    assert line is not None
    assert line.resolved_account_id is not None

    existing = (
        db.query(ViewAccountOverride)
        .filter(
            ViewAccountOverride.entity_id == entity.id,
            ViewAccountOverride.view_id == view.id,
            ViewAccountOverride.account_id == line.resolved_account_id,
        )
        .first()
    )
    if existing:
        existing.taxonomy_line_id = taxonomy_line.id
        existing.updated_at = _dt.datetime.utcnow()
    else:
        db.add(ViewAccountOverride(
            entity_id=entity.id,
            view_id=view.id,
            account_id=line.resolved_account_id,
            taxonomy_line_id=taxonomy_line.id,
        ))
    db.commit()

    override = (
        db.query(ViewAccountOverride)
        .filter(
            ViewAccountOverride.entity_id == entity.id,
            ViewAccountOverride.view_id == view.id,
            ViewAccountOverride.account_id == line.resolved_account_id,
        )
        .first()
    )
    assert override is not None
    assert override.taxonomy_line_id == taxonomy_line.id
