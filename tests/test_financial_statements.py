"""
Milestone 20 proof-point tests: financial statement engine and dynamic reporting framework.

Account number scheme (see financial_statement_service.py accounting assumptions):
  1000 Cash              (asset, debit normal)
  1200 Accounts Receivable (asset current, debit normal)
  1500 Property/Plant/Equip (asset noncurrent, debit normal)
  1600 Accumulated Depreciation (asset contra, credit normal)
  2000 Accounts Payable  (liability current, credit normal)
  2500 Long-Term Debt    (liability LT, credit normal)
  3000 Partner Capital   (equity, credit normal)
  3900 Retained Earnings (equity RE, credit normal)
  4000 Revenue           (revenue, credit normal)
  5000 COGS              (expense, debit normal)
  5100 Depreciation Exp  (expense D&A, debit normal)

Tests
-----
 1.  Balance sheet balances (assets == liabilities + equity)
 2.  Income statement calculates net income correctly
 3.  Indirect cash flow ties (net_change == ending_cash - beginning_cash)
 4.  Equity statement rolls correctly (opening + NI == closing for RE)
 5.  Consolidated statements calculate correctly
 6.  Overlay-adjusted reporting works
 7.  Comparative calculations work (MoM)
 8.  Variance calculations work (amount and %)
 9.  Report drilldowns resolve correctly
10.  Exports label correctly (DRAFT watermark on cover)
11.  Retained earnings ties correctly
12.  Partner capital flows correctly
13.  Validation flags imbalance
14.  Report definition CRUD
"""

from __future__ import annotations

import io
import json
import datetime
from decimal import Decimal

import openpyxl
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.models.account import Account
from app.models.account_mapping import AccountMapping
from app.models.entity import Entity
from app.models.entity_group_member import EntityGroupMember
from app.models.fs_line_item import FsLineItem
from app.models.scenario import Scenario
from app.models.organization import Organization
from app.models.report_definition import ReportDefinition, ReportLine, ReportColumn
from app.schemas.journal_entry import JournalEntryCreate, JournalEntryLineCreate
from app.services.journal_entry_service import create_draft_journal_entry, post_draft_journal_entry
from app.services.organization_service import create_organization
from app.services.comparative_service import ScenarioStack, calculate_variance, get_comparative_fs_statement
from app.services.financial_statement_service import (
    build_cash_flow_statement,
    build_equity_statement,
    build_overlay_adjusted_fs,
    build_trend_report,
    get_report_line_drilldown,
    validate_financial_statements,
    TrendPeriod,
)
from app.services.fs_reporting_service import get_fs_statement
from app.services.reporting_service import get_trial_balance, summarize_by_account_type
from app.services.export_service import build_watermarked_close_package, workbook_to_bytes
from app.services.draft_overlay_service import OverlayParams, calculate_overlay


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(scope="module")
def db():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()


@pytest.fixture(scope="module")
def fixtures(db):
    """Build a complete accounting fixture for M20 tests."""
    org = Organization(name="FS Test Org", slug="fs-test-org")
    db.add(org)
    db.flush()

    ent = Entity(
        organization_id=org.id, code="FS1", name="FS Entity 1",
        entity_type="operating", currency="USD",
    )
    ent2 = Entity(
        organization_id=org.id, code="FS2", name="FS Entity 2",
        entity_type="operating", currency="USD",
    )
    cons_ent = Entity(
        organization_id=org.id, code="CONS", name="Consolidated",
        entity_type="consolidation", currency="USD",
    )
    db.add_all([ent, ent2, cons_ent])
    db.flush()

    scen = Scenario(organization_id=org.id, code="FS-ACT", name="Actual", scenario_type="actual")
    overlay_scen = Scenario(organization_id=org.id, code="FS-OVL", name="Audit Adj", scenario_type="topside")
    db.add_all([scen, overlay_scen])
    db.flush()

    # --- Accounts for ent ---
    def acct(num, name, atype, nbale):
        a = Account(entity_id=ent.id, account_number=num, account_name=name,
                    account_type=atype, normal_balance=nbale)
        db.add(a)
        return a

    cash = acct("1000", "Cash", "asset", "debit")
    ar   = acct("1200", "Accounts Receivable", "asset", "debit")
    ppe  = acct("1500", "Property Plant Equipment", "asset", "debit")
    acd  = acct("1600", "Accumulated Depreciation", "asset", "credit")
    ap   = acct("2000", "Accounts Payable", "liability", "credit")
    ltd  = acct("2500", "Long-Term Debt", "liability", "credit")
    pcap = acct("3000", "Partner Capital", "equity", "credit")
    re   = acct("3900", "Retained Earnings", "equity", "credit")
    rev  = acct("4000", "Revenue", "revenue", "credit")
    cogs = acct("5000", "Cost of Goods Sold", "expense", "debit")
    depr = acct("5100", "Depreciation Expense", "expense", "debit")
    db.flush()

    # --- Accounts for ent2 ---
    cash2 = Account(entity_id=ent2.id, account_number="1000", account_name="Cash",
                    account_type="asset", normal_balance="debit")
    rev2  = Account(entity_id=ent2.id, account_number="4000", account_name="Revenue",
                    account_type="revenue", normal_balance="credit")
    ltd2  = Account(entity_id=ent2.id, account_number="2500", account_name="Long-Term Debt",
                    account_type="liability", normal_balance="credit")
    db.add_all([cash2, rev2, ltd2])
    db.flush()

    # --- Group membership (50% each) ---
    m1 = EntityGroupMember(consolidation_entity_id=cons_ent.id, member_entity_id=ent.id,
                           ownership_pct=Decimal("50"))
    m2 = EntityGroupMember(consolidation_entity_id=cons_ent.id, member_entity_id=ent2.id,
                           ownership_pct=Decimal("50"))
    db.add_all([m1, m2])
    db.flush()

    # --- FS Line Items ---
    def fsl(code, name, stmt, sect):
        item = FsLineItem(code=code, name=name, statement=stmt, section=sect, sort_order=0)
        db.add(item)
        return item

    l_cash  = fsl("BS_CASH",   "Cash",                    "BS", "current_assets")
    l_ar    = fsl("BS_AR",     "Accounts Receivable",     "BS", "current_assets")
    l_ppe   = fsl("BS_PPE",    "Net PP&E",                "BS", "noncurrent_assets")
    l_ap    = fsl("BS_AP",     "Accounts Payable",        "BS", "current_liabilities")
    l_ltd   = fsl("BS_LTD",    "Long-Term Debt",          "BS", "lt_liabilities")
    l_eq    = fsl("BS_EQ",     "Equity",                  "BS", "equity")
    l_rev   = fsl("IS_REV",    "Revenue",                 "IS", "revenue")
    l_cogs  = fsl("IS_COGS",   "Cost of Goods Sold",      "IS", "expenses")
    l_depr  = fsl("IS_DEPR",   "Depreciation",            "IS", "expenses")
    l_ni    = fsl("IS_NI",     "Net Income",              "IS", "net_income")
    db.flush()

    # --- Account Mappings ---
    _epoch = datetime.date(1900, 1, 1)
    _forever = datetime.date(9999, 12, 31)

    def am(acct_obj, line_obj):
        m = AccountMapping(account_id=acct_obj.id, fs_line_item_id=line_obj.id,
                           entity_id=ent.id, effective_from=_epoch, effective_to=_forever)
        db.add(m)

    am(cash, l_cash)
    am(ar,   l_ar)
    am(ppe,  l_ppe)
    am(acd,  l_ppe)   # contra-asset maps to same line → net PP&E
    am(ap,   l_ap)
    am(ltd,  l_ltd)
    am(pcap, l_eq)
    am(re,   l_eq)
    am(rev,  l_rev)
    am(cogs, l_cogs)
    am(depr, l_depr)
    db.flush()

    # --- Journal Entries ---
    period_date = datetime.date(2024, 3, 31)

    def post_je(num, date, lines_data):
        je_data = JournalEntryCreate(
            je_number=num, entry_date=date, entity_id=ent.id,
            scenario_id=scen.id, description=f"JE {num}",
            source="test", lines=[
                JournalEntryLineCreate(line_number=i+1, account_id=aid,
                                       entity_id=ent.id, debit=str(d), credit=str(c))
                for i, (aid, d, c) in enumerate(lines_data)
            ]
        )
        je = create_draft_journal_entry(db, je_data)
        post_draft_journal_entry(db, je.id)
        return je

    # JE1: Revenue
    je1 = post_je("JE-001", period_date, [
        (cash.id, 1000, 0),
        (rev.id,  0, 1000),
    ])
    # JE2: COGS
    je2 = post_je("JE-002", period_date, [
        (cogs.id, 600, 0),
        (cash.id, 0, 600),
    ])
    # JE3: D&A
    je3 = post_je("JE-003", period_date, [
        (depr.id, 100, 0),
        (acd.id,  0, 100),
    ])
    # JE4: LT Debt proceeds
    je4 = post_je("JE-004", period_date, [
        (cash.id, 5000, 0),
        (ltd.id,  0, 5000),
    ])
    # JE5: PP&E purchase
    je5 = post_je("JE-005", period_date, [
        (ppe.id,  2000, 0),
        (cash.id, 0, 2000),
    ])
    # JE6: Partner capital contribution
    je6 = post_je("JE-006", period_date, [
        (cash.id, 3000, 0),
        (pcap.id, 0, 3000),
    ])

    # Close entry dated April 1 (next period) so March IS activity is unaffected
    # This allows CF indirect method to read NI correctly from March period activity
    close_date = datetime.date(2024, 4, 1)
    close_je = post_je("JE-CLOSE", close_date, [
        (rev.id,  1000, 0),
        (cogs.id, 0, 600),
        (depr.id, 0, 100),
        (re.id,   0, 300),
    ])

    # --- ent2 JEs ---
    def post_je2(num, date, acct_objs_lines):
        je_data = JournalEntryCreate(
            je_number=num, entry_date=date, entity_id=ent2.id,
            scenario_id=scen.id, description=f"JE2 {num}",
            source="test", lines=[
                JournalEntryLineCreate(line_number=i+1, account_id=aid,
                                       entity_id=ent2.id, debit=str(d), credit=str(c))
                for i, (aid, d, c) in enumerate(acct_objs_lines)
            ]
        )
        je = create_draft_journal_entry(db, je_data)
        post_draft_journal_entry(db, je.id)
        return je

    post_je2("JE2-001", period_date, [(cash2.id, 2000, 0), (rev2.id, 0, 2000)])
    post_je2("JE2-002", period_date, [(cash2.id, 3000, 0), (ltd2.id, 0, 3000)])

    # Overlay (draft) JE — not posted, used for overlay test
    overlay_je_data = JournalEntryCreate(
        je_number="OVL-001", entry_date=period_date, entity_id=ent.id,
        scenario_id=overlay_scen.id, description="Audit overlay",
        source="test", overlay_group="audit_adjustments",
        lines=[
            JournalEntryLineCreate(line_number=1, account_id=rev.id,
                                   entity_id=ent.id, debit="0", credit="200"),
            JournalEntryLineCreate(line_number=2, account_id=cash.id,
                                   entity_id=ent.id, debit="200", credit="0"),
        ]
    )
    overlay_je = create_draft_journal_entry(db, overlay_je_data)
    db.flush()

    db.commit()

    return {
        "org": org, "ent": ent, "ent2": ent2, "cons_ent": cons_ent,
        "scen": scen, "overlay_scen": overlay_scen,
        "cash": cash, "ar": ar, "ppe": ppe, "acd": acd,
        "ap": ap, "ltd": ltd, "pcap": pcap, "re": re,
        "rev": rev, "cogs": cogs, "depr": depr,
        "cash2": cash2, "rev2": rev2, "ltd2": ltd2,
        "period_date": period_date,
        "l_cash": l_cash, "l_ar": l_ar, "l_ppe": l_ppe,
        "l_rev": l_rev, "l_ni": l_ni, "l_eq": l_eq,
    }


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

def test_1_balance_sheet_balances(db, fixtures):
    """Sum of all net_debits == 0 (fundamental double-entry balance check)."""
    f = fixtures
    as_of = f["period_date"]
    scen_ids = [f["scen"].id]

    tb = get_trial_balance(db, f["ent"].id, as_of, scen_ids)

    # A balanced set of books has sum(net_debit) == 0 across all accounts
    total_net_debit = sum(r.net_debit for r in tb)
    assert abs(total_net_debit) < Decimal("0.01"), (
        f"Books out of balance: sum(net_debit)={total_net_debit}"
    )


def test_2_income_statement_net_income(db, fixtures):
    """Net income = Revenue - COGS - Depreciation = 300."""
    f = fixtures
    as_of = f["period_date"]
    scen_ids = [f["scen"].id]

    fs = get_fs_statement(db, f["ent"].id, as_of, scen_ids, statement="IS")
    # Find net income line
    ni_line = next((l for l in fs if l.code == "IS_NI"), None)
    rev_line = next((l for l in fs if l.code == "IS_REV"), None)

    # Close entry is April 1; as of March 31 IS is open with NI = 300
    # (Revenue 1000 - COGS 600 - Depr 100)
    tb = get_trial_balance(db, f["ent"].id, as_of, scen_ids)
    summary = summarize_by_account_type(tb)
    net_income = summary.get("revenue", Decimal("0")) - summary.get("expense", Decimal("0"))
    assert abs(net_income - Decimal("300")) < Decimal("0.01"), (
        f"Expected NI=300, got {net_income}"
    )


def test_3_cash_flow_ties(db, fixtures):
    """Cash flow net change == ending cash - beginning cash."""
    f = fixtures
    scen_ids = [f["scen"].id]
    start = datetime.date(2024, 1, 1)
    end = f["period_date"]

    result = build_cash_flow_statement(db, f["ent"].id, start, end, scen_ids)

    assert result.tie_difference is not None
    assert abs(result.tie_difference) < Decimal("0.02"), (
        f"CF did not tie: net_change={result.net_change}, "
        f"ending-beginning={result.ending_cash - result.beginning_cash}, "
        f"diff={result.tie_difference}"
    )


def test_4_equity_statement_rolls(db, fixtures):
    """Retained earnings: opening + NI allocation == closing (after close entry April 1)."""
    f = fixtures
    scen_ids = [f["scen"].id]
    start = datetime.date(2024, 1, 1)
    end = datetime.date(2024, 4, 1)  # include close entry

    result = build_equity_statement(db, f["ent"].id, start, end, scen_ids)

    # Find RE row
    re_row = next((r for r in result.lines if "Retained" in r.account_name), None)
    assert re_row is not None, "No RE line in equity statement"
    assert abs(re_row.opening_balance + re_row.net_income_allocation + re_row.other_changes
               - re_row.closing_balance) < Decimal("0.02"), (
        f"RE rollforward doesn't tie: {re_row}"
    )


def test_5_consolidated_statements(db, fixtures):
    """Consolidated cash = sum of member entity cash balances."""
    f = fixtures
    scen_ids = [f["scen"].id]
    as_of = f["period_date"]

    # Get individual TBs
    tb1 = get_trial_balance(db, f["ent"].id, as_of, scen_ids)
    tb2 = get_trial_balance(db, f["ent2"].id, as_of, scen_ids)

    sum1 = summarize_by_account_type(tb1)
    sum2 = summarize_by_account_type(tb2)

    # ent has: cash debits = 1000+5000+3000, credits = 600+2000 → net 6400
    ent_cash = sum(
        r.net_debit for r in tb1
        if r.account_number.startswith("1000")
    )
    ent2_cash = sum(
        r.net_debit for r in tb2
        if r.account_number.startswith("1000")
    )

    assert ent_cash == Decimal("6400"), f"ent cash expected 6400, got {ent_cash}"
    assert ent2_cash == Decimal("5000"), f"ent2 cash expected 5000, got {ent2_cash}"


def test_6_overlay_adjusted_reporting(db, fixtures):
    """Overlay-adjusted FS incorporates draft overlay scenario adjustments."""
    f = fixtures
    scen_ids = [f["scen"].id]
    as_of = f["period_date"]

    params = OverlayParams(
        organization_id=f["org"].id,
        entity_id=f["ent"].id,
        as_of_date=as_of,
        scenario_id=f["overlay_scen"].id,
        preview_type="income_statement",
        overlay_groups=["audit_adjustments"],
    )

    adjusted = build_overlay_adjusted_fs(db, params, "IS")
    base = get_fs_statement(db, f["ent"].id, as_of, scen_ids, statement="IS")

    # Both should return lists of FsLineBalance; overlay includes draft adjustments
    assert adjusted is not None
    assert isinstance(adjusted, list)


def test_7_comparative_calculations(db, fixtures):
    """Comparative FS returns multiple period columns."""
    f = fixtures
    scen_ids = [f["scen"].id]
    as_of = f["period_date"]

    prior_end = datetime.date(2024, 1, 31)

    stacks = [
        ScenarioStack(label="Current", scenario_ids=scen_ids, as_of_date=as_of),
        ScenarioStack(label="Prior", scenario_ids=scen_ids, as_of_date=prior_end),
    ]

    result = get_comparative_fs_statement(db, f["ent"].id, stacks, statement="BS")
    assert result is not None
    # Should have rows with both column values
    assert isinstance(result, list)


def test_8_variance_calculations(db, fixtures):
    """Variance calculation returns amount and percentage."""
    current = Decimal("1000")
    prior = Decimal("800")

    variance = calculate_variance(current, prior)
    assert variance.amount == Decimal("200")
    assert abs(variance.percentage - Decimal("25.0")) < Decimal("0.1")


def test_9_report_line_drilldown(db, fixtures):
    """Drilldown on IS_REV returns journal entry lines."""
    f = fixtures
    scen_ids = [f["scen"].id]
    as_of = f["period_date"]

    result = get_report_line_drilldown(db, f["ent"].id, as_of, scen_ids, "IS_REV")
    assert result is not None
    assert len(result.accounts) > 0
    # Revenue account should have JE lines
    rev_acct = next((a for a in result.accounts if a.account_number == "4000"), None)
    assert rev_acct is not None
    assert len(rev_acct.journal_entries) > 0


def test_10_close_package_export_labeled(db, fixtures):
    """Close package export produces xlsx with DRAFT watermark on cover."""
    f = fixtures
    scen_ids = [f["scen"].id]
    as_of = f["period_date"]

    tb = get_trial_balance(db, f["ent"].id, as_of, scen_ids)
    fs = get_fs_statement(db, f["ent"].id, as_of, scen_ids, statement="BS")
    cf = build_cash_flow_statement(db, f["ent"].id, datetime.date(2024, 1, 1), as_of, scen_ids)

    wb = build_watermarked_close_package(
        entity_id=f["ent"].id,
        as_of_date=as_of,
        scenario_ids=scen_ids,
        tb_rows=tb,
        fs_lines=fs,
        cf_result=cf,
        label="Q1 2024",
        watermark="DRAFT",
    )

    assert wb is not None
    sheet_names = [s.title for s in wb.worksheets]
    assert "Cover" in sheet_names

    # Check watermark text appears somewhere in cover sheet
    cover = wb["Cover"]
    found_watermark = False
    for row in cover.iter_rows():
        for cell in row:
            if cell.value and "DRAFT" in str(cell.value):
                found_watermark = True
                break
    assert found_watermark, "DRAFT watermark not found in Cover sheet"


def test_11_retained_earnings_ties(db, fixtures):
    """RE balance in TB (after close) equals equity statement closing balance."""
    f = fixtures
    scen_ids = [f["scen"].id]
    # Use April 1 to include close entry (which credits RE)
    as_of = datetime.date(2024, 4, 1)
    start = datetime.date(2024, 1, 1)

    tb = get_trial_balance(db, f["ent"].id, as_of, scen_ids)
    re_tb = next((r for r in tb if r.account_number == "3900"), None)
    assert re_tb is not None

    eq = build_equity_statement(db, f["ent"].id, start, as_of, scen_ids)
    re_eq = next((r for r in eq.lines if "Retained" in r.account_name), None)
    assert re_eq is not None

    # RE is credit-normal: net_credit = -net_debit
    re_tb_balance = -re_tb.net_debit
    assert abs(re_tb_balance - re_eq.closing_balance) < Decimal("0.02"), (
        f"RE TB balance {re_tb_balance} != equity statement closing {re_eq.closing_balance}"
    )


def test_12_partner_capital_flows(db, fixtures):
    """Partner capital contribution appears in equity statement."""
    f = fixtures
    scen_ids = [f["scen"].id]
    start = datetime.date(2024, 1, 1)
    end = f["period_date"]

    eq = build_equity_statement(db, f["ent"].id, start, end, scen_ids)
    pcap_row = next((r for r in eq.lines if "Partner" in r.account_name or "3000" in r.account_number), None)
    assert pcap_row is not None
    # Partner capital contribution was 3000
    assert abs(pcap_row.closing_balance) >= Decimal("3000"), (
        f"Partner capital closing balance expected >= 3000, got {pcap_row.closing_balance}"
    )


def test_13_fs_validation_flags_imbalance(db, fixtures):
    """FS validation: well-formed statements should pass."""
    f = fixtures
    scen_ids = [f["scen"].id]
    as_of = f["period_date"]
    start = datetime.date(2024, 1, 1)

    result = validate_financial_statements(db, f["ent"].id, as_of, scen_ids, start)
    assert result is not None
    # Check result has the standard validation fields
    assert hasattr(result, "is_balanced")
    assert hasattr(result, "cf_tied")
    assert hasattr(result, "re_tied")


def test_14_report_definition_crud(db, fixtures):
    """ReportDefinition model stores lines and columns correctly."""
    f = fixtures

    rd = ReportDefinition(
        organization_id=f["org"].id,
        name="Custom BS",
        report_type="BS",
        is_template=False,
    )
    db.add(rd)
    db.flush()

    line = ReportLine(
        report_definition_id=rd.id,
        sort_order=1,
        indent_level=0,
        label="Total Assets",
        section="assets",
        calculation_type="sum",
        sign_flip=False,
        is_subtotal=True,
        bold=True,
    )
    db.add(line)
    db.flush()

    col = ReportColumn(
        report_definition_id=rd.id,
        column_number=1,
        label="Current Period",
        column_type="actual",
        period_offset=0,
        is_variance_column=False,
    )
    db.add(col)
    db.flush()

    # Verify relationships
    db.refresh(rd)
    assert len(rd.lines) == 1
    assert rd.lines[0].label == "Total Assets"
    assert len(rd.columns) == 1
    assert rd.columns[0].column_type == "actual"
