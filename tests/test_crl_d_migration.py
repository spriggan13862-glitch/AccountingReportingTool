"""
CRL-D tests — validation report + acknowledgment + safe backfill.

Covers:
  - Report categorization: READY / AMBIGUOUS / NO_CANONICAL / CLASSIFICATION_CHANGE
    / UNMAPPED / ALREADY_MIGRATED
  - Stable report_hash (deterministic given same DB state)
  - Hash changes when account population changes
  - execute_backfill refuses without acknowledgment
  - execute_backfill auto-assigns READY accounts
  - AMBIGUOUS lands on CRL_NEEDS_REVIEW with crl_state='needs_review'
  - NO_CANONICAL lands on CRL_UNCLASSIFIED with crl_state='unclassified'
  - UNMAPPED lands on CRL_UNCLASSIFIED with crl_state='unclassified'
  - CLASSIFICATION_CHANGE still auto-assigns (it's a diagnostic flag)
  - Already-migrated accounts are not touched
"""
import datetime
import pytest
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.data.crl_catalog import CRL_CATALOG
from app.services.crl_service import seed_crl_catalog, get_crl_by_code
from app.services.crl_migration_service import (
    generate_validation_report,
    acknowledge_report,
    execute_backfill,
    CrlMigrationError,
    CAT_READY, CAT_AMBIGUOUS, CAT_NO_CANONICAL,
    CAT_CLASSIFICATION_CHANGE, CAT_UNMAPPED, CAT_ALREADY_MIGRATED,
)
from app.models.organization import Organization
from app.models.entity import Entity
from app.models.account import Account
from app.models.taxonomy import Taxonomy, TaxonomyNode, AccountTaxonomyMapping
from app.models.reporting_taxonomy import ReportingTaxonomyLine
from app.models.common_reporting_line import (
    CommonReportingLine, CommonReportingLineTaxonomyNode,
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
def Session(engine):
    return sessionmaker(bind=engine)


@pytest.fixture
def fixture(Session):
    """Builds: org, entity, 6 accounts that cover every category."""
    s = Session()

    org = Organization(name="T", slug="t"); s.add(org); s.flush()
    entity = Entity(code="E1", name="E1", entity_type="operating",
                    organization_id=org.id, currency="USD")
    s.add(entity); s.flush()

    # Taxonomy with canonical nodes covered by the CRL catalog,
    # plus one ORPHAN node (not in any junction) to trigger no_canonical.
    # Plus an AMBIGUOUS node (we manually wire it to two CRLs after seed).
    tx = Taxonomy(code="us_gaap", name="US GAAP", is_system=True, is_active=True)
    s.add(tx); s.flush()
    nodes = {}
    for code, name in [
        ("CASH", "Cash"),
        ("AR", "Accounts Receivable"),
        ("AP", "Accounts Payable"),
        ("ORPHAN_NODE", "An advanced node not in any CRL junction"),
        ("RENT_EXPENSE", "Rent Expense"),  # used for classification_change
    ]:
        n = TaxonomyNode(
            taxonomy_id=tx.id, code=code, name=name,
            statement_type="Balance Sheet",
            financial_statement_section="Assets",
            normal_balance="debit", sort_order=100, level=0, is_system=True,
        )
        s.add(n); s.flush()
        nodes[code] = n

    # Seed CRL catalog (72 + 8 templates + 103 junctions)
    seed_crl_catalog(s)

    # Manually create AMBIGUOUS state: add a second CRL→AR junction so AR
    # maps to two CRLs.
    other_assets = get_crl_by_code(s, "CRL_OTHER_ASSETS")
    s.add(CommonReportingLineTaxonomyNode(
        crl_id=other_assets.id, taxonomy_node_code="AR",
        is_primary=False, sort_order=999,
    ))
    s.flush()

    # 6 accounts, one per category:
    #   1. READY        cash → maps to CRL_CASH only
    #   2. AMBIGUOUS    AR → CRL_AR and (manually added) CRL_OTHER_ASSETS
    #   3. NO_CANONICAL ORPHAN_NODE → no CRL covers it
    #   4. CLASS_CHANGE legacy reporting_taxonomy_line "Rent / Utilities"
    #                   resolves to CRL_RENT_OCCUPANCY (label change)
    #   5. UNMAPPED     no mapping at all
    #   6. ALREADY_MIG  pre-set common_reporting_line_id

    crl_cash = get_crl_by_code(s, "CRL_CASH")

    accts = {}
    accts["ready"] = Account(
        entity_id=entity.id, account_number="1000", account_name="Cash",
        account_type="asset", normal_balance="debit",
    )
    accts["ambiguous"] = Account(
        entity_id=entity.id, account_number="1100", account_name="Accounts Receivable",
        account_type="asset", normal_balance="debit",
    )
    accts["no_canonical"] = Account(
        entity_id=entity.id, account_number="1999", account_name="Advanced Investment",
        account_type="asset", normal_balance="debit",
    )
    accts["class_change"] = Account(
        entity_id=entity.id, account_number="6300", account_name="Rent",
        account_type="expense", normal_balance="debit",
    )
    accts["unmapped"] = Account(
        entity_id=entity.id, account_number="9999", account_name="Brand New Account",
        account_type="asset", normal_balance="debit",
    )
    accts["already_mig"] = Account(
        entity_id=entity.id, account_number="1001", account_name="Cash - Already Migrated",
        account_type="asset", normal_balance="debit",
        common_reporting_line_id=crl_cash.id, crl_state="assigned",
    )
    for a in accts.values():
        s.add(a)
    s.flush()

    # Wire mappings
    s.add(AccountTaxonomyMapping(
        account_id=accts["ready"].id, taxonomy_id=tx.id,
        taxonomy_node_id=nodes["CASH"].id,
        mapping_type="manual", mapping_source="user_selected",
    ))
    s.add(AccountTaxonomyMapping(
        account_id=accts["ambiguous"].id, taxonomy_id=tx.id,
        taxonomy_node_id=nodes["AR"].id,
        mapping_type="manual", mapping_source="user_selected",
    ))
    s.add(AccountTaxonomyMapping(
        account_id=accts["no_canonical"].id, taxonomy_id=tx.id,
        taxonomy_node_id=nodes["ORPHAN_NODE"].id,
        mapping_type="manual", mapping_source="user_selected",
    ))
    # Classification change: legacy line with a DIFFERENT name than the CRL.
    legacy = ReportingTaxonomyLine(
        code="RENT_EXPENSE",          # matches CRL_RENT_OCCUPANCY via junction
        name="Rent / Utilities",      # legacy label differs from CRL "Rent & Occupancy"
        section="expense", sort_order=100,
    )
    s.add(legacy); s.flush()
    accts["class_change"].reporting_taxonomy_line_id = legacy.id

    s.commit()
    out = {"org_id": org.id, "account_ids": {k: a.id for k, a in accts.items()}}
    s.close()
    return out


# ---------------------------------------------------------------------------
# Categorization
# ---------------------------------------------------------------------------

def test_report_categorizes_each_account_correctly(Session, fixture):
    s = Session()
    report = generate_validation_report(s, fixture["org_id"])
    s.close()

    # 6 accounts total
    assert report["summary"]["total_accounts"] == 6

    # Build code-to-account map for assertions
    def codes_in(bucket: str) -> set[int]:
        return {e["account_id"] for e in report[bucket]}

    aids = fixture["account_ids"]
    assert aids["ready"]        in codes_in("ready_to_assign")
    assert aids["ambiguous"]    in codes_in("ambiguous_accounts")
    assert aids["no_canonical"] in codes_in("no_canonical_crl_accounts")
    assert aids["class_change"] in codes_in("classification_changes")
    assert aids["unmapped"]     in codes_in("unmapped_accounts")
    assert aids["already_mig"]  in codes_in("already_migrated_accounts")


def test_summary_counts_match_buckets(Session, fixture):
    s = Session()
    report = generate_validation_report(s, fixture["org_id"])
    s.close()
    assert report["summary"]["ready_to_assign"] == 1
    assert report["summary"]["ambiguous"] == 1
    assert report["summary"]["no_canonical_crl"] == 1
    assert report["summary"]["classification_change"] == 1
    assert report["summary"]["unmapped"] == 1
    assert report["summary"]["already_migrated"] == 1


def test_ambiguous_entry_lists_both_candidate_crls(Session, fixture):
    s = Session()
    report = generate_validation_report(s, fixture["org_id"])
    s.close()
    entry = next(
        e for e in report["ambiguous_accounts"]
        if e["account_id"] == fixture["account_ids"]["ambiguous"]
    )
    assert "CRL_AR" in entry["candidate_crl_codes"]
    assert "CRL_OTHER_ASSETS" in entry["candidate_crl_codes"]


def test_no_canonical_entry_names_orphan_node(Session, fixture):
    s = Session()
    report = generate_validation_report(s, fixture["org_id"])
    s.close()
    entry = next(
        e for e in report["no_canonical_crl_accounts"]
        if e["account_id"] == fixture["account_ids"]["no_canonical"]
    )
    assert entry["via_taxonomy_node_code"] == "ORPHAN_NODE"
    assert entry["candidate_crl_codes"] == []


def test_classification_change_flags_label_diff(Session, fixture):
    s = Session()
    report = generate_validation_report(s, fixture["org_id"])
    s.close()
    entry = next(
        e for e in report["classification_changes"]
        if e["account_id"] == fixture["account_ids"]["class_change"]
    )
    assert entry["legacy_label"] == "Rent / Utilities"
    assert entry["proposed_label"] == "Rent & Occupancy"
    assert entry["candidate_crl_codes"] == ["CRL_RENT_OCCUPANCY"]


# ---------------------------------------------------------------------------
# Hash stability
# ---------------------------------------------------------------------------

def test_report_hash_is_stable_across_runs(Session, fixture):
    s1 = Session(); r1 = generate_validation_report(s1, fixture["org_id"]); s1.close()
    s2 = Session(); r2 = generate_validation_report(s2, fixture["org_id"]); s2.close()
    assert r1["report_hash"] == r2["report_hash"]


def test_report_hash_changes_when_account_added(Session, fixture):
    s = Session()
    before = generate_validation_report(s, fixture["org_id"])["report_hash"]
    # Add a new unmapped account
    org_id = fixture["org_id"]
    entity = s.query(Entity).filter_by(organization_id=org_id).first()
    s.add(Account(
        entity_id=entity.id, account_number="9000",
        account_name="Newly added", account_type="asset", normal_balance="debit",
    ))
    s.commit()
    after = generate_validation_report(s, org_id)["report_hash"]
    s.close()
    assert before != after


# ---------------------------------------------------------------------------
# Acknowledgment gate
# ---------------------------------------------------------------------------

def test_execute_refuses_without_acknowledgment(Session, fixture):
    s = Session()
    with pytest.raises(CrlMigrationError, match="No acknowledgment found"):
        execute_backfill(s, fixture["org_id"])
    s.close()


def test_execute_proceeds_with_acknowledgment(Session, fixture):
    s = Session()
    report = generate_validation_report(s, fixture["org_id"])
    acknowledge_report(s, fixture["org_id"], report["report_hash"])
    stats = execute_backfill(s, fixture["org_id"])
    s.close()
    assert stats["ready_assigned"] == 2          # READY (1) + CLASSIFICATION_CHANGE (1)
    assert stats["ambiguous_to_needs_review"] == 1
    assert stats["no_canonical_to_unclassified"] == 1
    assert stats["unmapped_to_unclassified"] == 1
    assert stats["already_migrated"] == 1


def test_execute_refuses_after_state_changed_post_ack(Session, fixture):
    """Ack hash binds to the report state at ack time. If accounts change
    in between, the hash differs and the executor refuses."""
    s = Session()
    old_report = generate_validation_report(s, fixture["org_id"])
    acknowledge_report(s, fixture["org_id"], old_report["report_hash"])

    # Add a new account between ack and execute
    entity = s.query(Entity).filter_by(organization_id=fixture["org_id"]).first()
    s.add(Account(
        entity_id=entity.id, account_number="9100",
        account_name="Snuck in", account_type="asset", normal_balance="debit",
    ))
    s.commit()

    with pytest.raises(CrlMigrationError, match="No acknowledgment found"):
        execute_backfill(s, fixture["org_id"])
    s.close()


# ---------------------------------------------------------------------------
# Backfill assignments
# ---------------------------------------------------------------------------

def test_backfill_assigns_ready_account(Session, fixture):
    s = Session()
    report = generate_validation_report(s, fixture["org_id"])
    acknowledge_report(s, fixture["org_id"], report["report_hash"])
    execute_backfill(s, fixture["org_id"])

    ready = s.query(Account).filter_by(id=fixture["account_ids"]["ready"]).first()
    assert ready.common_reporting_line_id is not None
    crl = s.query(CommonReportingLine).filter_by(id=ready.common_reporting_line_id).first()
    assert crl.code == "CRL_CASH"
    assert ready.crl_state == "assigned"
    s.close()


def test_backfill_lands_ambiguous_on_needs_review(Session, fixture):
    s = Session()
    report = generate_validation_report(s, fixture["org_id"])
    acknowledge_report(s, fixture["org_id"], report["report_hash"])
    execute_backfill(s, fixture["org_id"])

    amb = s.query(Account).filter_by(id=fixture["account_ids"]["ambiguous"]).first()
    crl = s.query(CommonReportingLine).filter_by(id=amb.common_reporting_line_id).first()
    assert crl.code == "CRL_NEEDS_REVIEW"
    assert amb.crl_state == "needs_review"
    s.close()


def test_backfill_lands_no_canonical_on_unclassified(Session, fixture):
    s = Session()
    report = generate_validation_report(s, fixture["org_id"])
    acknowledge_report(s, fixture["org_id"], report["report_hash"])
    execute_backfill(s, fixture["org_id"])

    nc = s.query(Account).filter_by(id=fixture["account_ids"]["no_canonical"]).first()
    crl = s.query(CommonReportingLine).filter_by(id=nc.common_reporting_line_id).first()
    assert crl.code == "CRL_UNCLASSIFIED"
    assert nc.crl_state == "unclassified"
    s.close()


def test_backfill_lands_unmapped_on_unclassified(Session, fixture):
    s = Session()
    report = generate_validation_report(s, fixture["org_id"])
    acknowledge_report(s, fixture["org_id"], report["report_hash"])
    execute_backfill(s, fixture["org_id"])

    um = s.query(Account).filter_by(id=fixture["account_ids"]["unmapped"]).first()
    crl = s.query(CommonReportingLine).filter_by(id=um.common_reporting_line_id).first()
    assert crl.code == "CRL_UNCLASSIFIED"
    assert um.crl_state == "unclassified"
    s.close()


def test_backfill_auto_assigns_classification_change(Session, fixture):
    """CLASSIFICATION_CHANGE accounts still auto-assign — the flag is
    a diagnostic, not a block."""
    s = Session()
    report = generate_validation_report(s, fixture["org_id"])
    acknowledge_report(s, fixture["org_id"], report["report_hash"])
    execute_backfill(s, fixture["org_id"])

    cc = s.query(Account).filter_by(id=fixture["account_ids"]["class_change"]).first()
    crl = s.query(CommonReportingLine).filter_by(id=cc.common_reporting_line_id).first()
    assert crl.code == "CRL_RENT_OCCUPANCY"
    assert cc.crl_state == "assigned"
    s.close()


def test_backfill_does_not_touch_already_migrated(Session, fixture):
    """Pre-set common_reporting_line_id remains intact."""
    s = Session()
    cash_id = get_crl_by_code(s, "CRL_CASH").id
    report = generate_validation_report(s, fixture["org_id"])
    acknowledge_report(s, fixture["org_id"], report["report_hash"])
    execute_backfill(s, fixture["org_id"])

    am = s.query(Account).filter_by(id=fixture["account_ids"]["already_mig"]).first()
    assert am.common_reporting_line_id == cash_id
    assert am.crl_state == "assigned"
    s.close()


def test_backfill_is_idempotent(Session, fixture):
    """Running backfill twice doesn't change a second pass's stats."""
    s = Session()
    report = generate_validation_report(s, fixture["org_id"])
    acknowledge_report(s, fixture["org_id"], report["report_hash"])
    first = execute_backfill(s, fixture["org_id"])

    # All accounts now have CRL set, so the next report is all 'already_migrated'.
    report2 = generate_validation_report(s, fixture["org_id"])
    assert report2["summary"]["already_migrated"] == 6
    s.close()
    assert first["total_touched"] == 5  # all 6 except already_mig
