"""
Tests for import readiness matrix (Sprint B).

Tests get_readiness_status() across COA-only, TB-only, COA+TB scenarios.
"""
import datetime
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base
from app.services.import_source_logic import get_readiness_status, IMPORT_SOURCE_CAPABILITIES


# ---------------------------------------------------------------------------
# In-memory DB setup
# ---------------------------------------------------------------------------

@pytest.fixture
def db():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()

    # Bootstrap minimum required rows (organization + entity)
    from app.models.organization import Organization
    from app.models.entity import Entity

    org = Organization(name="Test Org", slug="test-org", is_active=True)
    session.add(org)
    session.flush()

    entity = Entity(
        organization_id=org.id,
        code="E1",
        name="Test Entity",
        entity_type="operating",
        currency="USD",
        fiscal_year_end_month=12,
        fiscal_year_convention="calendar",
    )
    session.add(entity)
    session.flush()

    yield session, entity.id
    session.close()


# ---------------------------------------------------------------------------
# IMPORT_SOURCE_CAPABILITIES constants
# ---------------------------------------------------------------------------

def test_capabilities_structure():
    for key in ('coa', 'tb', 'gl', 'fs'):
        cap = IMPORT_SOURCE_CAPABILITIES[key]
        assert 'creates_accounts' in cap
        assert 'creates_balances' in cap
        assert 'requires_period' in cap
        assert 'suggests_fsli' in cap
        assert 'provides' in cap
        assert 'label' in cap


def test_coa_capabilities():
    cap = IMPORT_SOURCE_CAPABILITIES['coa']
    assert cap['creates_accounts'] is True
    assert cap['creates_hierarchy'] is True
    assert cap['creates_balances'] is False
    assert cap['requires_period'] is False


def test_tb_capabilities():
    cap = IMPORT_SOURCE_CAPABILITIES['tb']
    assert cap['creates_accounts'] is True
    assert cap['creates_balances'] is True
    assert cap['requires_period'] is True
    assert cap['suggests_fsli'] is True


def test_gl_capabilities():
    cap = IMPORT_SOURCE_CAPABILITIES['gl']
    assert cap['creates_accounts'] is True
    assert cap['creates_balances'] is True  # derived
    assert cap['requires_period'] is True
    assert cap['suggests_fsli'] is False


def test_fs_capabilities():
    cap = IMPORT_SOURCE_CAPABILITIES['fs']
    assert cap['creates_accounts'] is False
    assert cap['creates_balances'] is False
    assert cap['requires_period'] is False
    assert cap['suggests_fsli'] is True


# ---------------------------------------------------------------------------
# Readiness status — empty entity
# ---------------------------------------------------------------------------

def test_empty_entity_readiness(db):
    session, entity_id = db
    result = get_readiness_status(entity_id=entity_id, period_id=None, db=session)

    assert result['coa_available'] is False
    assert result['coa_account_count'] == 0
    assert result['tb_available'] is False
    assert result['tb_has_balances'] is False
    assert result['gl_available'] is False
    assert result['fs_available'] is False
    assert result['taxonomy_mapped_pct'] == 0.0
    assert result['unmapped_account_count'] == 0
    assert result['ready_for_accounting_view'] is False
    assert result['ready_for_fs_presentation'] is False
    assert result['ready_for_bridge'] is False
    assert result['ready_for_drilldown'] is False
    assert len(result['missing_for_accounting_view']) > 0
    assert len(result['missing_for_fs_presentation']) > 0


# ---------------------------------------------------------------------------
# COA-only readiness
# ---------------------------------------------------------------------------

def test_coa_only_readiness(db):
    """COA-only: accounts created, no balances, not ready for accounting view."""
    session, entity_id = db

    from app.models.account import Account
    acct = Account(
        entity_id=entity_id,
        account_number="1000",
        account_name="Cash",
        account_type="asset",
        normal_balance="debit",
    )
    session.add(acct)
    session.flush()

    result = get_readiness_status(entity_id=entity_id, period_id=None, db=session)

    assert result['coa_available'] is True
    assert result['coa_account_count'] == 1
    assert result['tb_available'] is False
    assert result['tb_has_balances'] is False
    assert result['ready_for_accounting_view'] is False
    assert result['ready_for_fs_presentation'] is False
    assert result['ready_for_bridge'] is False
    # Missing TB should show up
    assert any('Trial Balance' in m or 'trial balance' in m.lower() for m in result['missing_for_accounting_view'])


# ---------------------------------------------------------------------------
# TB-only readiness (no COA import, but TB creates accounts)
# ---------------------------------------------------------------------------

def test_tb_only_readiness(db):
    """TB-only: accounts + balances created by TB, partial FSLI mapping."""
    session, entity_id = db

    from app.models.organization import Organization
    from app.models.account import Account
    from app.models.import_batch import ImportBatch

    org = session.query(Organization).first()

    # Create account from TB import
    acct = Account(
        entity_id=entity_id,
        account_number="1000",
        account_name="Cash",
        account_type="asset",
        normal_balance="debit",
    )
    session.add(acct)
    session.flush()

    # Create a posted import batch (TB)
    batch = ImportBatch(
        organization_id=org.id,
        entity_id=entity_id,
        filename="tb.csv",
        source_format="csv",
        content_hash="abc123",
        column_mapping={},
        as_of_date=datetime.date(2024, 12, 31),
        status="posted",
    )
    session.add(batch)
    session.flush()

    result = get_readiness_status(entity_id=entity_id, period_id=None, db=session)

    assert result['coa_available'] is True
    assert result['tb_available'] is True
    assert result['tb_has_balances'] is True
    assert result['ready_for_accounting_view'] is True
    assert result['ready_for_bridge'] is True
    # No taxonomy mapping yet
    assert result['taxonomy_mapped_pct'] == 0.0
    assert result['ready_for_fs_presentation'] is False


# ---------------------------------------------------------------------------
# COA + TB readiness
# ---------------------------------------------------------------------------

def test_coa_plus_tb_readiness(db):
    """COA + TB: ready for accounting view if present."""
    session, entity_id = db

    from app.models.organization import Organization
    from app.models.account import Account
    from app.models.import_batch import ImportBatch

    org = session.query(Organization).first()

    for num, name in [("1000", "Cash"), ("2000", "Payables")]:
        session.add(Account(
            entity_id=entity_id,
            account_number=num,
            account_name=name,
            account_type="asset",
            normal_balance="debit",
        ))
    session.flush()

    batch = ImportBatch(
        organization_id=org.id,
        entity_id=entity_id,
        filename="tb.csv",
        source_format="csv",
        content_hash="def456",
        column_mapping={},
        as_of_date=datetime.date(2024, 12, 31),
        status="posted",
    )
    session.add(batch)
    session.flush()

    result = get_readiness_status(entity_id=entity_id, period_id=None, db=session)

    assert result['coa_available'] is True
    assert result['coa_account_count'] == 2
    assert result['tb_available'] is True
    assert result['ready_for_accounting_view'] is True
    assert result['ready_for_bridge'] is True
    assert result['missing_for_accounting_view'] == []


# ---------------------------------------------------------------------------
# Taxonomy mapping percentage
# ---------------------------------------------------------------------------

def test_taxonomy_mapped_pct(db):
    """Correct percentage calculation of FSLI-mapped accounts."""
    session, entity_id = db

    from app.models.organization import Organization
    from app.models.account import Account
    from app.models.reporting_taxonomy import ReportingTaxonomyLine

    # Create a minimal taxonomy line
    tax_line = ReportingTaxonomyLine(
        code="ASSETS.CURRENT.CASH",
        name="Cash and Cash Equivalents",
        section="assets",
        normal_balance="debit",
        sort_order=1,
    )
    session.add(tax_line)
    session.flush()

    # 3 accounts: 2 mapped, 1 not
    for i, (num, mapped) in enumerate([("1000", True), ("1100", True), ("2000", False)]):
        acct = Account(
            entity_id=entity_id,
            account_number=num,
            account_name=f"Account {i}",
            account_type="asset",
            normal_balance="debit",
            reporting_taxonomy_line_id=tax_line.id if mapped else None,
        )
        session.add(acct)
    session.flush()

    result = get_readiness_status(entity_id=entity_id, period_id=None, db=session)

    assert result['coa_account_count'] == 3
    assert abs(result['taxonomy_mapped_pct'] - 66.7) < 0.5
    assert result['unmapped_account_count'] == 1
