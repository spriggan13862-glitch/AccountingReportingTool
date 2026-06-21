"""
CRL-B tests — schema + seed + immutability guard.

Covers:
  - Catalog count: 72 CRLs (2 mandatory + 53 standard parents + 17 sub-lines)
  - Template count: 8 system templates
  - CRL → Taxonomy junction supports one-to-many
  - Every CRL has a CRL_-prefixed code
  - Immutability: update_crl refuses to change `code`
  - Sub-line parent_crl_id is set correctly
  - Mandatory rows (UNCLASSIFIED, NEEDS_REVIEW) exist
"""
import pytest
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.data.crl_catalog import CRL_CATALOG, TEMPLATE_CATALOG
from app.services.crl_service import (
    seed_crl_catalog, list_crls, get_crl_by_code, update_crl,
    CrlImmutableCodeError,
)
from app.models.common_reporting_line import (
    CommonReportingLine,
    CommonReportingLineTaxonomyNode,
    ReportingTemplate,
    ReportingTemplateCrl,
)


@pytest.fixture
def engine():
    e = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    @event.listens_for(e, "connect")
    def pragmas(conn, _):
        cur = conn.cursor()
        cur.execute("PRAGMA foreign_keys = OFF")
        cur.close()

    Base.metadata.create_all(e)
    yield e
    Base.metadata.drop_all(e)


@pytest.fixture
def db(engine):
    Session = sessionmaker(bind=engine)
    s = Session()
    yield s
    s.close()


# ---------------------------------------------------------------------------
# Catalog shape
# ---------------------------------------------------------------------------

def test_catalog_has_72_crls():
    assert len(CRL_CATALOG) == 72


def test_catalog_has_8_templates():
    assert len(TEMPLATE_CATALOG) == 8


def test_every_crl_code_uses_crl_prefix():
    for spec in CRL_CATALOG:
        assert spec.code.startswith("CRL_"), f"Bad code: {spec.code}"


def test_catalog_contains_two_mandatory_rows():
    mandatory_codes = {c.code for c in CRL_CATALOG if c.is_mandatory}
    assert mandatory_codes == {"CRL_UNCLASSIFIED", "CRL_NEEDS_REVIEW"}


def test_catalog_codes_are_unique():
    codes = [c.code for c in CRL_CATALOG]
    assert len(codes) == len(set(codes))


def test_sub_line_parent_codes_resolve_to_real_crls():
    code_set = {c.code for c in CRL_CATALOG}
    for spec in CRL_CATALOG:
        if spec.parent_code is not None:
            assert spec.parent_code in code_set, (
                f"{spec.code} parent {spec.parent_code!r} not in catalog"
            )


# ---------------------------------------------------------------------------
# Seeding (idempotent)
# ---------------------------------------------------------------------------

def test_seed_inserts_full_catalog(db):
    stats = seed_crl_catalog(db)
    assert stats["crls_inserted"] == 72
    assert stats["templates_inserted"] == 8
    rows = db.query(CommonReportingLine).filter_by(organization_id=None).all()
    assert len(rows) == 72


def test_seed_is_idempotent(db):
    first = seed_crl_catalog(db)
    second = seed_crl_catalog(db)
    assert first["crls_inserted"] == 72
    assert second["crls_inserted"] == 0
    assert second["crls_updated"] == 72  # all matched and re-verified
    # Total CRL count unchanged after second seed
    assert db.query(CommonReportingLine).count() == 72
    assert db.query(ReportingTemplate).count() == 8


def test_sub_lines_have_parent_crl_id_set(db):
    seed_crl_catalog(db)
    sub_lines = db.query(CommonReportingLine).filter(
        CommonReportingLine.parent_crl_id.isnot(None)
    ).all()
    assert len(sub_lines) == 17


def test_mandatory_rows_seeded(db):
    seed_crl_catalog(db)
    for code in ("CRL_UNCLASSIFIED", "CRL_NEEDS_REVIEW"):
        row = get_crl_by_code(db, code)
        assert row is not None, f"{code} missing after seed"
        assert row.is_mandatory is True
        assert row.section == "System"


# ---------------------------------------------------------------------------
# One-to-many CRL → Taxonomy
# ---------------------------------------------------------------------------

def test_crl_cash_has_multiple_taxonomy_nodes(db):
    seed_crl_catalog(db)
    crl_cash = get_crl_by_code(db, "CRL_CASH")
    junctions = db.query(CommonReportingLineTaxonomyNode).filter_by(crl_id=crl_cash.id).all()
    codes = {j.taxonomy_node_code for j in junctions}
    assert "CASH" in codes
    assert "CASH_EQUIV" in codes
    # First entry in spec is marked primary
    primary = [j for j in junctions if j.is_primary]
    assert len(primary) == 1
    assert primary[0].taxonomy_node_code == "CASH"


def test_crl_revenue_supports_multiple_taxonomy_targets(db):
    seed_crl_catalog(db)
    crl_subscription = get_crl_by_code(db, "CRL_SUBSCRIPTION_REVENUE")
    junctions = db.query(CommonReportingLineTaxonomyNode).filter_by(
        crl_id=crl_subscription.id
    ).all()
    codes = {j.taxonomy_node_code for j in junctions}
    # CRL_SUBSCRIPTION_REVENUE maps to BOTH subscription and license nodes
    assert codes == {"REVENUE_SUBSCRIPTION", "REVENUE_LICENSE"}


def test_one_crl_can_have_zero_taxonomy_nodes(db):
    """Mandatory system CRLs (UNCLASSIFIED, NEEDS_REVIEW) have no
    taxonomy mapping — they're sentinel rows."""
    seed_crl_catalog(db)
    unc = get_crl_by_code(db, "CRL_UNCLASSIFIED")
    nr = get_crl_by_code(db, "CRL_NEEDS_REVIEW")
    for row in (unc, nr):
        junctions = db.query(CommonReportingLineTaxonomyNode).filter_by(crl_id=row.id).all()
        assert junctions == []


# ---------------------------------------------------------------------------
# Templates
# ---------------------------------------------------------------------------

def test_smb_general_template_seeded(db):
    seed_crl_catalog(db)
    t = db.query(ReportingTemplate).filter_by(code="smb_general").first()
    assert t is not None
    assert t.name == "SMB General"
    junctions = db.query(ReportingTemplateCrl).filter_by(template_id=t.id).all()
    # SMB General exposes parents only — should be 53 standard parents
    # (not 55 — UNCLASSIFIED + NEEDS_REVIEW are excluded by the
    # is_mandatory filter inside _PARENT_CRL_CODES).
    assert len(junctions) == 53


def test_spac_template_exposes_all_crls(db):
    seed_crl_catalog(db)
    t = db.query(ReportingTemplate).filter_by(code="spac_public").first()
    junctions = db.query(ReportingTemplateCrl).filter_by(template_id=t.id).all()
    assert len(junctions) == 72


def test_eight_system_templates_seeded(db):
    seed_crl_catalog(db)
    templates = db.query(ReportingTemplate).filter_by(organization_id=None).all()
    assert len(templates) == 8
    codes = {t.code for t in templates}
    assert codes == {
        "smb_general", "healthcare", "saas", "manufacturing",
        "construction", "real_estate", "nonprofit", "spac_public",
    }


# ---------------------------------------------------------------------------
# Immutability guard
# ---------------------------------------------------------------------------

def test_update_crl_allows_name_change(db):
    seed_crl_catalog(db)
    crl = get_crl_by_code(db, "CRL_CASH")
    updated = update_crl(db, crl.id, {"name": "Cash on Hand & at Bank"})
    assert updated.name == "Cash on Hand & at Bank"
    assert updated.code == "CRL_CASH"  # unchanged


def test_update_crl_refuses_code_change(db):
    seed_crl_catalog(db)
    crl = get_crl_by_code(db, "CRL_CASH")
    with pytest.raises(CrlImmutableCodeError):
        update_crl(db, crl.id, {"code": "CRL_LIQUID_ASSETS"})


def test_update_crl_silently_ignores_non_editable_fields(db):
    """is_system / is_mandatory / organization_id are not in the editable
    set — silently dropped from the payload."""
    seed_crl_catalog(db)
    crl = get_crl_by_code(db, "CRL_CASH")
    before_system = crl.is_system
    updated = update_crl(db, crl.id, {
        "name": "Cash & Equivalents",
        "is_system": False,        # ignored
        "is_mandatory": True,      # ignored
        "organization_id": 99,     # ignored
    })
    assert updated.name == "Cash & Equivalents"
    assert updated.is_system == before_system
    assert updated.is_mandatory is False
    assert updated.organization_id is None


# ---------------------------------------------------------------------------
# list_crls — section filter and org scoping
# ---------------------------------------------------------------------------

def test_list_crls_by_section(db):
    seed_crl_catalog(db)
    assets = list_crls(db, section="Assets")
    assert len(assets) == 11
    liabs = list_crls(db, section="Liabilities")
    # 10 standard liabilities + 3 payroll-liability sub-lines = 13
    assert len(liabs) == 13


def test_list_crls_total_visible(db):
    seed_crl_catalog(db)
    all_visible = list_crls(db)
    assert len(all_visible) == 72
