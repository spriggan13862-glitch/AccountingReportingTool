"""
M23 import pipeline tests.

Tests prove:
 1. CSV imports parse correctly (debit/credit format)
 2. CSV imports parse correctly (signed balance format)
 3. XLSX imports parse correctly
 4. Duplicate uploads detected
 5. Invalid TBs rejected (unbalanced)
 6. Balanced TBs import correctly (posted JE balances)
 7. Mappings persist correctly (template round-trip)
 8. Import-generated JEs balance
 9. Rollback/reversal works
10. Validation severities work (ERROR vs WARNING vs INFO)
11. Effective-dated mappings respected (orphan accounts flagged)
12. Unmapped accounts blocked from posting
13. Import preview matches posted balances
14. Combined "6125 Merchant Fees" account parsing
15. Fuzzy account name suggestion
"""

from __future__ import annotations

import datetime
import io
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
    """Seed the minimal data needed for import tests."""
    from app.models.organization import Organization
    from app.models.entity import Entity
    from app.models.account import Account
    from app.models.scenario import Scenario
    from app.services.organization_service import create_organization, seed_default_roles
    from app.core.security import hash_password

    org = create_organization(db, name="Import Test Corp", slug="import-test")
    seed_default_roles(db)

    from app.models.user import User
    user = User(
        organization_id=org.id,
        email="importer@test.com",
        full_name="Importer",
        hashed_password=hash_password("test1234!"),
        is_superuser=True,
    )
    db.add(user)

    entity = Entity(
        code="ITC-LLC",
        name="Import Test LLC",
        entity_type="operating",
        organization_id=org.id,
    )
    db.add(entity)

    scenario = Scenario(
        organization_id=org.id,
        code="ACTUAL",
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
        Account(account_number="4000", account_name="Revenue", account_type="revenue",
                normal_balance="credit", entity_id=entity.id),
        Account(account_number="5000", account_name="Expenses", account_type="expense",
                normal_balance="debit", entity_id=entity.id),
    ]
    for a in accounts:
        db.add(a)
    db.flush()
    db.commit()

    acct_by_num = {a.account_number: a for a in accounts}
    return {
        "org": org, "entity": entity, "scenario": scenario, "user": user,
        "accounts": acct_by_num,
    }


def _make_csv_dc(rows: list[tuple[str, str, str]]) -> bytes:
    """Build a debit/credit CSV: account_number, debit, credit."""
    lines = ["account_number,debit,credit"]
    for acct, dr, cr in rows:
        lines.append(f"{acct},{dr},{cr}")
    return "\n".join(lines).encode()


def _make_csv_signed(rows: list[tuple[str, str]]) -> bytes:
    """Build a signed-balance CSV: account_number, balance."""
    lines = ["account_number,balance"]
    for acct, bal in rows:
        lines.append(f"{acct},{bal}")
    return "\n".join(lines).encode()


# ---------------------------------------------------------------------------
# 1. CSV — debit/credit format
# ---------------------------------------------------------------------------

def test_csv_debit_credit_parse(db, seeded):
    from app.services.import_batch_service import upload_import_batch
    entity = seeded["entity"]
    org = seeded["org"]
    content = _make_csv_dc([
        ("1000", "50000", "0"),
        ("2000", "0", "30000"),
        ("3000", "0", "20000"),
    ])
    batch = upload_import_batch(
        db, content, "test_dc.csv",
        entity_id=entity.id, organization_id=org.id,
        as_of_date=datetime.date(2024, 1, 31),
    )
    db.commit()
    assert batch.row_count == 3
    assert batch.mapped_row_count == 3
    assert batch.unmapped_row_count == 0
    assert batch.status == "validating"


# ---------------------------------------------------------------------------
# 2. CSV — signed balance format
# ---------------------------------------------------------------------------

def test_csv_signed_balance_parse(db, seeded):
    from app.services.import_batch_service import upload_import_batch
    entity = seeded["entity"]
    org = seeded["org"]
    # 1000 (debit-normal) positive → debit side
    # 2000 (credit-normal) negative means it has a debit (contra) balance
    content = _make_csv_signed([
        ("1000", "50000"),
        ("2000", "-10000"),  # unusual debit balance on AP — sign anomaly
        ("3000", "40000"),   # credit-normal positive → credit
    ])
    batch = upload_import_batch(
        db, content, "test_signed.csv",
        entity_id=entity.id, organization_id=org.id,
        as_of_date=datetime.date(2024, 1, 31),
    )
    db.commit()
    assert batch.row_count == 3
    assert batch.mapped_row_count == 3
    # Check that Cash got debit=50000, credit=0
    from app.models.import_line import ImportLine
    lines = db.query(ImportLine).filter(ImportLine.batch_id == batch.id).all()
    cash_line = next(l for l in lines if l.raw_account_number == "1000")
    assert float(cash_line.debit) == 50000.0
    assert float(cash_line.credit) == 0.0


# ---------------------------------------------------------------------------
# 3. XLSX parse
# ---------------------------------------------------------------------------

def test_xlsx_parse(db, seeded):
    """Test that XLSX files are parsed correctly using openpyxl."""
    import openpyxl
    from app.services.import_batch_service import upload_import_batch

    # Build a minimal XLSX in memory
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.append(["account_number", "debit", "credit"])
    ws.append(["1000", 40000, 0])
    ws.append(["2000", 0, 20000])
    ws.append(["3000", 0, 20000])
    buf = io.BytesIO()
    wb.save(buf)
    xlsx_bytes = buf.getvalue()

    entity = seeded["entity"]
    org = seeded["org"]
    batch = upload_import_batch(
        db, xlsx_bytes, "test.xlsx",
        entity_id=entity.id, organization_id=org.id,
        as_of_date=datetime.date(2024, 2, 29),
    )
    db.commit()
    assert batch.source_format == "xlsx"
    assert batch.row_count == 3
    assert batch.mapped_row_count == 3


def test_xlsx_detect_preserves_blank_leading_columns():
    """raw_rows must include blank column A; column letters must not shift."""
    import io
    import openpyxl
    from app.services.import_batch_service import detect_file

    wb = openpyxl.Workbook()
    ws = wb.active
    # Row 1: header — blank A, Account Name B, Debit C, blank D, Credit E
    ws.cell(row=1, column=1, value=None)
    ws.cell(row=1, column=2, value="Account Name")
    ws.cell(row=1, column=3, value="Debit")
    ws.cell(row=1, column=4, value=None)
    ws.cell(row=1, column=5, value="Credit")
    # Row 2: data
    ws.cell(row=2, column=2, value="Cash")
    ws.cell(row=2, column=3, value=50000)
    ws.cell(row=2, column=5, value=0)

    buf = io.BytesIO()
    wb.save(buf)

    result = detect_file(buf.getvalue(), "test_blank_cols.xlsx")

    assert result["sheets"], "Expected at least one sheet in detect result"
    sheet = result["sheets"][0]

    # raw_rows must be present and non-empty
    assert sheet["raw_rows"], "raw_rows must not be empty"

    hdr_idx = sheet["auto_header_row_idx"]
    header_row = sheet["raw_rows"][hdr_idx]

    # Must have 5 columns (A through E), not 4 (B through E)
    assert len(header_row) >= 5, f"Expected ≥5 cols, got {len(header_row)}: {header_row}"

    # Column A (index 0) must be blank
    assert header_row[0] == "", f"Column A should be blank, got {header_row[0]!r}"

    # Column B (index 1) must be Account Name
    assert header_row[1] == "Account Name", f"Column B should be 'Account Name', got {header_row[1]!r}"

    # Column C (index 2) must be Debit
    assert header_row[2] == "Debit", f"Column C should be 'Debit', got {header_row[2]!r}"

    # Column D (index 3) must be blank
    assert header_row[3] == "", f"Column D should be blank, got {header_row[3]!r}"

    # Column E (index 4) must be Credit
    assert header_row[4] == "Credit", f"Column E should be 'Credit', got {header_row[4]!r}"


# ---------------------------------------------------------------------------
# 4. Duplicate upload detection
# ---------------------------------------------------------------------------

def test_duplicate_upload_warning(db, seeded):
    from app.services.import_batch_service import upload_import_batch, validate_batch
    entity = seeded["entity"]
    org = seeded["org"]
    content = _make_csv_dc([
        ("1000", "60000", "0"),
        ("2000", "0", "30000"),
        ("3100", "0", "30000"),
    ])
    # First upload
    batch1 = upload_import_batch(
        db, content, "dup_test.csv",
        entity_id=entity.id, organization_id=org.id,
        as_of_date=datetime.date(2024, 3, 31),
    )
    db.commit()
    # Force to ready_to_post so it shows as a prior import
    batch1.status = "ready_to_post"
    db.flush()
    db.commit()

    # Second upload with identical content
    batch2 = upload_import_batch(
        db, content, "dup_test.csv",
        entity_id=entity.id, organization_id=org.id,
        as_of_date=datetime.date(2024, 3, 31),
    )
    db.commit()
    result = validate_batch(db, batch2.id)
    db.commit()

    warnings = [i for i in result.issues if i.severity.value == "WARNING"]
    dup_warnings = [w for w in warnings if w.code == "IMPORT_DUPLICATE_UPLOAD"]
    assert len(dup_warnings) >= 1


# ---------------------------------------------------------------------------
# 5. Unbalanced TB rejected
# ---------------------------------------------------------------------------

def test_unbalanced_tb_validation_error(db, seeded):
    from app.services.import_batch_service import upload_import_batch, validate_batch
    entity = seeded["entity"]
    org = seeded["org"]
    content = _make_csv_dc([
        ("1000", "50000", "0"),
        ("2000", "0", "30000"),  # 50k DR ≠ 30k CR → unbalanced
    ])
    batch = upload_import_batch(
        db, content, "unbalanced.csv",
        entity_id=entity.id, organization_id=org.id,
        as_of_date=datetime.date(2024, 1, 31),
    )
    db.commit()
    result = validate_batch(db, batch.id)
    db.commit()

    assert result.has_errors
    error_codes = {e.code for e in result.errors}
    assert "IMPORT_UNBALANCED" in error_codes
    assert batch.status == "validation_failed"


# ---------------------------------------------------------------------------
# 6. Balanced TB posts correctly
# ---------------------------------------------------------------------------

def test_balanced_tb_posts(db, seeded):
    from app.services.import_batch_service import (
        upload_import_batch, validate_batch, post_batch
    )
    entity = seeded["entity"]
    org = seeded["org"]
    scenario = seeded["scenario"]
    user = seeded["user"]

    content = _make_csv_dc([
        ("1000", "100000", "0"),
        ("2000", "0", "60000"),
        ("3100", "0", "40000"),
    ])
    batch = upload_import_batch(
        db, content, "balanced.csv",
        entity_id=entity.id, organization_id=org.id,
        scenario_id=scenario.id,
        as_of_date=datetime.date(2024, 1, 31),
    )
    db.commit()

    result = validate_batch(db, batch.id)
    db.commit()
    assert not result.has_errors
    assert batch.status == "ready_to_post"

    posted_batch = post_batch(db, batch.id, je_number="IMPORT-001", acting_user=user)
    db.commit()

    assert posted_batch.status == "posted"
    assert posted_batch.posted_je_id is not None


# ---------------------------------------------------------------------------
# 7. Template round-trip
# ---------------------------------------------------------------------------

def test_template_create_and_reuse(db, seeded):
    from app.services.import_batch_service import create_template, list_templates
    org = seeded["org"]
    user = seeded["user"]

    tmpl = create_template(
        db,
        organization_id=org.id,
        name="QuickBooks Desktop",
        source_format="qbo",
        column_mapping={
            "account_number": "Acct #",
            "debit": "Debit",
            "credit": "Credit",
        },
        created_by_user_id=user.id,
    )
    db.commit()

    templates = list_templates(db, org.id)
    assert any(t.id == tmpl.id for t in templates)
    found = next(t for t in templates if t.id == tmpl.id)
    assert found.column_mapping["account_number"] == "Acct #"
    assert found.source_format == "qbo"


# ---------------------------------------------------------------------------
# 8. Import-generated JE balances
# ---------------------------------------------------------------------------

def test_import_je_balances(db, seeded):
    from app.services.import_batch_service import (
        upload_import_batch, validate_batch, post_batch
    )
    from app.models.journal_entry_line import JournalEntryLine
    entity = seeded["entity"]
    org = seeded["org"]
    scenario = seeded["scenario"]
    user = seeded["user"]

    content = _make_csv_dc([
        ("1100", "75000", "0"),
        ("4000", "0",     "75000"),
    ])
    batch = upload_import_batch(
        db, content, "ar_revenue.csv",
        entity_id=entity.id, organization_id=org.id,
        scenario_id=scenario.id,
        as_of_date=datetime.date(2024, 2, 28),
    )
    db.commit()

    validate_batch(db, batch.id)
    db.commit()
    post_batch(db, batch.id, je_number="IMPORT-AR-001", acting_user=user)
    db.commit()

    # Verify the JE is balanced
    je_lines = (
        db.query(JournalEntryLine)
        .filter(JournalEntryLine.journal_entry_id == batch.posted_je_id)
        .all()
    )
    total_dr = sum(float(l.debit) for l in je_lines)
    total_cr = sum(float(l.credit) for l in je_lines)
    assert abs(total_dr - total_cr) < 0.01


# ---------------------------------------------------------------------------
# 9. Rollback / reversal
# ---------------------------------------------------------------------------

def test_rollback_creates_reversing_je(db, seeded):
    from app.services.import_batch_service import (
        upload_import_batch, validate_batch, post_batch, rollback_batch
    )
    from app.models.journal_entry import JournalEntry
    entity = seeded["entity"]
    org = seeded["org"]
    scenario = seeded["scenario"]
    user = seeded["user"]

    content = _make_csv_dc([
        ("1000", "80000", "0"),
        ("3000", "0",     "80000"),
    ])
    batch = upload_import_batch(
        db, content, "to_rollback.csv",
        entity_id=entity.id, organization_id=org.id,
        scenario_id=scenario.id,
        as_of_date=datetime.date(2024, 3, 31),
    )
    db.commit()
    validate_batch(db, batch.id)
    db.commit()
    post_batch(db, batch.id, je_number="IMPORT-RBK-001", acting_user=user)
    db.commit()

    original_je_id = batch.posted_je_id

    rolled = rollback_batch(db, batch.id, acting_user=user)
    db.commit()

    assert rolled.status == "rolled_back"
    assert rolled.reversal_je_id is not None
    assert rolled.reversal_je_id != original_je_id

    # Original JE should be reversed
    orig = db.get(JournalEntry, original_je_id)
    assert orig.status == "reversed"


# ---------------------------------------------------------------------------
# 10. Validation severities
# ---------------------------------------------------------------------------

def test_validation_severity_levels(db, seeded):
    from app.services.import_batch_service import (
        upload_import_batch, validate_batch
    )
    entity = seeded["entity"]
    org = seeded["org"]

    # Balanced but has a sign anomaly (credit-normal AP with debit balance)
    content = _make_csv_dc([
        ("1000", "50000", "0"),
        ("2000", "50000", "0"),   # AP with debit balance → sign anomaly WARNING
        # unbalanced by 50000 → ERROR too
    ])
    batch = upload_import_batch(
        db, content, "severity_test.csv",
        entity_id=entity.id, organization_id=org.id,
        as_of_date=datetime.date(2024, 4, 30),
    )
    db.commit()

    result = validate_batch(db, batch.id)
    db.commit()

    severities = {i.severity.value for i in result.issues}
    assert "ERROR" in severities        # unbalanced
    assert "WARNING" in severities      # sign anomaly on AP

    error_codes = {e.code for e in result.errors}
    warning_codes = {w.code for w in result.warnings}
    assert "IMPORT_UNBALANCED" in error_codes
    assert "IMPORT_SIGN_ANOMALY" in warning_codes


# ---------------------------------------------------------------------------
# 11. Orphan accounts flagged (no FS mapping)
# ---------------------------------------------------------------------------

def test_orphan_account_info(db, seeded):
    from app.services.import_batch_service import upload_import_batch, validate_batch
    entity = seeded["entity"]
    org = seeded["org"]

    # No AccountMapping entries exist for any account in our test entity
    content = _make_csv_dc([
        ("1000", "50000", "0"),
        ("3100", "0",     "50000"),
    ])
    batch = upload_import_batch(
        db, content, "orphan_test.csv",
        entity_id=entity.id, organization_id=org.id,
        as_of_date=datetime.date(2024, 5, 31),
    )
    db.commit()

    result = validate_batch(db, batch.id)
    db.commit()

    # INFO issues about orphan accounts
    info_codes = {i.code for i in result.infos}
    assert "IMPORT_ORPHAN_ACCOUNT" in info_codes


# ---------------------------------------------------------------------------
# 12. Unmapped accounts block posting
# ---------------------------------------------------------------------------

def test_unmapped_blocks_posting(db, seeded):
    from app.services.import_batch_service import (
        upload_import_batch, validate_batch, post_batch, ImportBatchStateError
    )
    entity = seeded["entity"]
    org = seeded["org"]
    scenario = seeded["scenario"]
    user = seeded["user"]

    # Both number and name missing → unmapped
    content = _make_csv_dc([
        ("1000", "50000", "0"),
        ("", "0",     "50000"),  # unknown/blank account
    ])
    batch = upload_import_batch(
        db, content, "unmapped_block.csv",
        entity_id=entity.id, organization_id=org.id,
        scenario_id=scenario.id,
        as_of_date=datetime.date(2024, 6, 30),
    )
    db.commit()

    assert batch.unmapped_row_count == 1
    assert batch.status == "mapping_required"

    # Validation will also error on unmapped accounts
    result = validate_batch(db, batch.id)
    db.commit()

    assert result.has_errors
    error_codes = {e.code for e in result.errors}
    assert "IMPORT_MISSING_MAPPING" in error_codes

    # Cannot post while validation_failed
    with pytest.raises(ImportBatchStateError):
        post_batch(db, batch.id, je_number="BLOCKED", acting_user=user)


# ---------------------------------------------------------------------------
# 13. Import preview matches posted balances
# ---------------------------------------------------------------------------

def test_preview_matches_posted_balances(db, seeded):
    from app.services.import_batch_service import (
        upload_import_batch, validate_batch, post_batch, get_batch_lines
    )
    from app.models.journal_entry_line import JournalEntryLine
    entity = seeded["entity"]
    org = seeded["org"]
    scenario = seeded["scenario"]
    user = seeded["user"]

    content = _make_csv_dc([
        ("1000", "200000", "0"),
        ("2000", "0",      "120000"),
        ("3000", "0",      "80000"),
    ])
    batch = upload_import_batch(
        db, content, "preview_match.csv",
        entity_id=entity.id, organization_id=org.id,
        scenario_id=scenario.id,
        as_of_date=datetime.date(2024, 7, 31),
    )
    db.commit()

    # Capture preview line totals before posting
    lines = get_batch_lines(db, batch.id, mapping_status="mapped")
    preview_dr = sum(float(l.debit) for l in lines)
    preview_cr = sum(float(l.credit) for l in lines)

    validate_batch(db, batch.id)
    db.commit()
    post_batch(db, batch.id, je_number="IMPORT-PREVIEW-001", acting_user=user)
    db.commit()

    # Posted JE totals should match preview
    je_lines = (
        db.query(JournalEntryLine)
        .filter(JournalEntryLine.journal_entry_id == batch.posted_je_id)
        .all()
    )
    posted_dr = sum(float(l.debit) for l in je_lines)
    posted_cr = sum(float(l.credit) for l in je_lines)

    assert abs(preview_dr - posted_dr) < 0.01
    assert abs(preview_cr - posted_cr) < 0.01


# ---------------------------------------------------------------------------
# 14. Combined "6125 Merchant Fees" account parsing
# ---------------------------------------------------------------------------

def test_combined_account_field_parsing(db, seeded):
    from app.services.import_batch_service import parse_combined_account_field

    # Standard combined format
    num, name = parse_combined_account_field("6125 Merchant Fees")
    assert num == "6125"
    assert name == "Merchant Fees"

    # With dash separator
    num2, name2 = parse_combined_account_field("4000 - Revenue")
    assert num2 == "4000"
    assert "Revenue" in name2

    # Pure number (no name part)
    num3, name3 = parse_combined_account_field("1000")
    assert num3 == "1000"
    assert name3 == ""

    # Non-numeric (no split)
    num4, name4 = parse_combined_account_field("Cash and Equivalents")
    assert num4 == "Cash and Equivalents"
    assert name4 == ""


# ---------------------------------------------------------------------------
# 15. Fuzzy account suggestion
# ---------------------------------------------------------------------------

def test_fuzzy_account_suggestion(db, seeded):
    from app.services.import_batch_service import _suggest_account
    entity = seeded["entity"]

    # Exact match by number
    acct = _suggest_account(db, entity.id, "1000", "")
    assert acct is not None
    assert acct.account_number == "1000"

    # Prefix match (partial number)
    acct2 = _suggest_account(db, entity.id, "100", "")
    assert acct2 is not None  # should match "1000"

    # Name match
    acct3 = _suggest_account(db, entity.id, "", "Receivable")
    assert acct3 is not None
    assert "Receivable" in acct3.account_name


# ---------------------------------------------------------------------------
# 16. Manual mapping overrides auto-mapping
# ---------------------------------------------------------------------------

def test_manual_mapping_overrides(db, seeded):
    from app.services.import_batch_service import (
        upload_import_batch, map_line_to_account, get_batch_lines
    )
    entity = seeded["entity"]
    org = seeded["org"]
    user = seeded["user"]

    # Upload with an unmapped account (both blank)
    content = _make_csv_dc([
        ("1000", "50000", "0"),
        ("", "0",  "50000"),
    ])
    batch = upload_import_batch(
        db, content, "manual_map.csv",
        entity_id=entity.id, organization_id=org.id,
        as_of_date=datetime.date(2024, 8, 31),
    )
    db.commit()

    assert batch.unmapped_row_count == 1

    # Get the unmapped line
    lines = get_batch_lines(db, batch.id, mapping_status="unmapped")
    assert len(lines) == 1
    unmapped_line = lines[0]

    # Manually map to account 3100
    cash_acct = seeded["accounts"]["3100"]
    mapped_line = map_line_to_account(
        db, batch.id, unmapped_line.id, cash_acct.id, acting_user_id=user.id
    )
    db.commit()

    assert mapped_line.mapping_status == "mapped"
    assert mapped_line.is_manually_mapped is True
    assert mapped_line.resolved_account_id == cash_acct.id
    assert mapped_line.mapped_by_user_id == user.id

    # Batch should now have 0 unmapped
    db.refresh(batch)
    assert batch.unmapped_row_count == 0
    assert batch.status == "validating"


# ---------------------------------------------------------------------------
# 17. Column auto-detection
# ---------------------------------------------------------------------------

def test_column_auto_detection():
    from app.services.import_batch_service import auto_detect_column_mapping

    # Standard headers
    headers = ["Account Number", "Debit Amount", "Credit Amount"]
    mapping = auto_detect_column_mapping(headers)
    assert "account_number" in mapping
    assert "debit" in mapping
    assert "credit" in mapping

    # QB-style headers
    qb_headers = ["Acct #", "Dr Amount", "Cr Amount", "Memo"]
    qb_mapping = auto_detect_column_mapping(qb_headers)
    assert "account_number" in qb_mapping
    assert "debit" in qb_mapping
    assert "credit" in qb_mapping


# ---------------------------------------------------------------------------
# 18. Audit trail preserved
# ---------------------------------------------------------------------------

def test_import_audit_trail(db, seeded):
    from app.services.import_batch_service import (
        upload_import_batch, validate_batch, post_batch
    )
    from app.models.import_validation_issue import ImportValidationIssue
    entity = seeded["entity"]
    org = seeded["org"]
    scenario = seeded["scenario"]
    user = seeded["user"]

    content = _make_csv_dc([
        ("1000", "50000", "0"),
        ("3000", "0",     "50000"),
    ])
    batch = upload_import_batch(
        db, content, "audit_trail.csv",
        entity_id=entity.id, organization_id=org.id,
        scenario_id=scenario.id,
        uploaded_by_user_id=user.id,
        as_of_date=datetime.date(2024, 9, 30),
    )
    db.commit()

    # Audit: uploader tracked
    assert batch.uploaded_by_user_id == user.id
    assert batch.filename == "audit_trail.csv"
    assert batch.content_hash is not None and len(batch.content_hash) == 64

    validate_batch(db, batch.id)
    db.commit()
    post_batch(db, batch.id, je_number="IMPORT-AUDIT-001", acting_user=user)
    db.commit()

    # Audit: reviewer tracked
    assert batch.reviewed_by_user_id == user.id
    assert batch.reviewed_at is not None
    assert batch.posted_je_id is not None

    # Source lineage: JE source_ref contains batch id
    from app.models.journal_entry import JournalEntry
    je = db.get(JournalEntry, batch.posted_je_id)
    assert je.source == "tb_import"
    assert str(batch.id) in je.source_ref


# ---------------------------------------------------------------------------
# 19. Direct COA Ingestion test
# ---------------------------------------------------------------------------

def test_direct_coa_ingestion(db, seeded):
    from app.services.import_batch_service import upload_import_batch
    from app.models.account import Account
    entity = seeded["entity"]
    org = seeded["org"]
    scenario = seeded["scenario"]
    
    # 5555 does not exist in COA
    content = _make_csv_dc([
        ("1000", "50000", "0"),
        ("5555", "0", "50000"),
    ])
    
    # Verify account does not exist beforehand
    existing = db.query(Account).filter(Account.account_number == "5555", Account.entity_id == entity.id).first()
    if existing:
        db.delete(existing)
        db.commit()
    
    batch = upload_import_batch(
        db, content, "auto_coa.csv",
        entity_id=entity.id, organization_id=org.id,
        scenario_id=scenario.id,
        as_of_date=datetime.date(2024, 6, 30),
    )
    db.commit()
    
    # Batch should have 0 unmapped because it was auto-created!
    assert batch.unmapped_row_count == 0
    assert batch.status == "validating"
    
    # The account should now exist in the COA
    new_acct = db.query(Account).filter(Account.account_number == "5555", Account.entity_id == entity.id).first()
    assert new_acct is not None
    assert new_acct.account_type == "expense"  # guessed from 5xxx prefix
    assert new_acct.normal_balance == "debit"


# ---------------------------------------------------------------------------
# 20. Delete Batch hard-deletes child lines and issues
# ---------------------------------------------------------------------------

def test_delete_batch_cleans_children(db, seeded):
    from app.services.import_batch_service import upload_import_batch, delete_batch, validate_batch
    from app.models.import_line import ImportLine
    from app.models.import_validation_issue import ImportValidationIssue
    from app.models.import_batch import ImportBatch
    entity = seeded["entity"]
    org = seeded["org"]
    scenario = seeded["scenario"]
    
    # 9999 does not exist in COA, which will cause a validation/mapping issue.
    # Let's make it unbalanced to trigger validation issues as well.
    content = _make_csv_dc([
        ("1000", "50000", "0"),
        ("9999", "0", "40000"),
    ])
    
    batch = upload_import_batch(
        db, content, "delete_test.csv",
        entity_id=entity.id, organization_id=org.id,
        scenario_id=scenario.id,
        as_of_date=datetime.date(2024, 6, 30),
    )
    db.commit()
    
    validate_batch(db, batch.id)
    db.commit()
    
    # Confirm lines and issues exist in DB
    lines = db.query(ImportLine).filter(ImportLine.batch_id == batch.id).all()
    issues = db.query(ImportValidationIssue).filter(ImportValidationIssue.batch_id == batch.id).all()
    assert len(lines) > 0
    assert len(issues) > 0
    
    # Delete the batch
    delete_batch(db, batch.id)
    db.commit()
    
    # Verify the batch, lines, and issues are gone from DB
    deleted_batch = db.get(ImportBatch, batch.id)
    assert deleted_batch is None
    
    deleted_lines = db.query(ImportLine).filter(ImportLine.batch_id == batch.id).all()
    assert len(deleted_lines) == 0
    
    deleted_issues = db.query(ImportValidationIssue).filter(ImportValidationIssue.batch_id == batch.id).all()
    assert len(deleted_issues) == 0


# ---------------------------------------------------------------------------
# Import architecture tests — three-layer model (Source → COA → Taxonomy)
# ---------------------------------------------------------------------------

def test_tb_import_auto_creates_coa_accounts(db, seeded):
    """TB import with auto_create_accounts=True creates COA rows for unknown accounts."""
    from app.services.import_batch_service import upload_import_batch
    from app.models.account import Account
    entity = seeded["entity"]
    org = seeded["org"]
    scenario = seeded["scenario"]

    new_acct_num = "9800"
    assert db.query(Account).filter(
        Account.entity_id == entity.id, Account.account_number == new_acct_num
    ).first() is None

    content = _make_csv_dc([
        ("1000", "5000", "0"),
        (new_acct_num, "0", "5000"),  # not in pre-seeded COA
    ])
    batch = upload_import_batch(
        db, content, "auto_coa.csv",
        entity_id=entity.id, organization_id=org.id,
        scenario_id=scenario.id,
        as_of_date=datetime.date(2024, 9, 30),
        auto_create_accounts=True,
    )
    db.commit()

    created = db.query(Account).filter(
        Account.entity_id == entity.id, Account.account_number == new_acct_num
    ).first()
    assert created is not None, "auto_create_accounts=True must create missing COA account"
    assert batch.mapped_row_count == 2


def test_tb_import_matches_existing_coa(db, seeded):
    """TB import resolves rows against pre-existing COA accounts by account_number."""
    from app.services.import_batch_service import upload_import_batch
    entity = seeded["entity"]
    org = seeded["org"]
    scenario = seeded["scenario"]

    content = _make_csv_dc([
        ("1000", "10000", "0"),
        ("2000", "0", "10000"),
    ])
    batch = upload_import_batch(
        db, content, "match_coa.csv",
        entity_id=entity.id, organization_id=org.id,
        scenario_id=scenario.id,
        as_of_date=datetime.date(2024, 10, 31),
        auto_create_accounts=False,
    )
    db.commit()

    assert batch.mapped_row_count == 2
    assert batch.unmapped_row_count == 0


def test_tb_import_combined_account_field_with_colon(db, seeded):
    """Combined 'NNNN: Name' (colon separator) is parsed by _COMBINED_PATTERN."""
    from app.services.import_batch_service import parse_combined_account_field
    num, name = parse_combined_account_field("6125: Merchant Fees")
    assert num == "6125"
    assert name == "Merchant Fees"


def test_tb_import_combined_account_field_with_middle_dot(db, seeded):
    """Combined 'NNNN · Name' (middle-dot) is parsed by _COMBINED_PATTERN."""
    from app.services.import_batch_service import parse_combined_account_field
    num, name = parse_combined_account_field("6125 · Merchant Fees")
    assert num == "6125"
    assert name == "Merchant Fees"


def test_taxonomy_mapping_is_view_specific(db, seeded):
    """ViewAccountOverride stores per-view taxonomy assignments; different views are independent."""
    from app.models.view_account_override import ViewAccountOverride
    from app.models.reporting_taxonomy import ReportingTaxonomyView
    org = seeded["org"]
    accounts = seeded["accounts"]

    view_a = ReportingTaxonomyView(
        code="GAAP-TST", name="GAAP View Test",
    )
    view_b = ReportingTaxonomyView(
        code="TAX-TST", name="Tax View Test",
    )
    db.add_all([view_a, view_b])
    db.flush()

    acct = accounts["4000"]

    override_a = ViewAccountOverride(
        view_id=view_a.id, account_id=acct.id,
        taxonomy_line_id=None,
    )
    override_b = ViewAccountOverride(
        view_id=view_b.id, account_id=acct.id,
        taxonomy_line_id=None,
    )
    db.add_all([override_a, override_b])
    db.flush()

    rows_a = db.query(ViewAccountOverride).filter(
        ViewAccountOverride.view_id == view_a.id,
        ViewAccountOverride.account_id == acct.id,
    ).all()
    rows_b = db.query(ViewAccountOverride).filter(
        ViewAccountOverride.view_id == view_b.id,
        ViewAccountOverride.account_id == acct.id,
    ).all()
    assert len(rows_a) == 1
    assert len(rows_b) == 1
    assert rows_a[0].id != rows_b[0].id, "Each view must have its own override row"


def test_import_readiness_no_data(db, seeded):
    """Readiness for a brand-new entity: nothing available."""
    from app.models.entity import Entity
    from app.models.account import Account
    from app.models.import_batch import ImportBatch

    org = seeded["org"]
    empty_entity = Entity(
        code="EMPTY-E2", name="Empty Entity 2", entity_type="operating",
        organization_id=org.id,
    )
    db.add(empty_entity)
    db.flush()
    db.commit()

    coa_count = db.query(Account).filter(Account.entity_id == empty_entity.id).count()
    assert coa_count == 0

    balances = db.query(ImportBatch).filter(
        ImportBatch.entity_id == empty_entity.id, ImportBatch.status == "posted"
    ).first()
    assert balances is None

    taxonomy_pct = 0.0
    ready_for_statements = coa_count > 0 and balances is not None and taxonomy_pct >= 80
    assert not ready_for_statements


def test_import_readiness_with_coa_and_balances(db, seeded):
    """A batch that reaches 'validating' status signals balances are loaded for this entity."""
    from app.services.import_batch_service import upload_import_batch, validate_batch
    from app.models.import_batch import ImportBatch
    entity = seeded["entity"]
    org = seeded["org"]
    scenario = seeded["scenario"]

    content = _make_csv_dc([
        ("1000", "20000", "0"),
        ("3000", "0", "20000"),
    ])
    batch = upload_import_batch(
        db, content, "readiness_post.csv",
        entity_id=entity.id, organization_id=org.id,
        scenario_id=scenario.id,
        as_of_date=datetime.date(2024, 11, 30),
    )
    db.commit()

    # Fully mapped batch with no errors should be ready to post
    validation = validate_batch(db, batch.id)
    db.commit()

    assert batch.mapped_row_count == 2
    assert batch.unmapped_row_count == 0
    assert not validation.has_errors, f"Expected no errors: {[i.message for i in validation.errors]}"

    # Readiness check: batch in any non-failed state means balances loaded
    loaded = db.query(ImportBatch).filter(
        ImportBatch.entity_id == entity.id,
        ImportBatch.status.in_(["validating", "validated", "posted"]),
    ).first()
    assert loaded is not None, "Uploaded batch should be visible in readiness query"

