"""
Tests for comparative_service: scenario stacking, overlays, variances,
comparative FS output, prior-period comparison, and unmapped account detection.

Ledger setup
------------
Scenarios: ACTUAL, TOPSIDE, BUDGET (three separate scenario rows)
Accounts:  Cash (debit), Revenue (credit), Expense (debit), AP (credit), Orphan (unmapped)

FS structure (minimal, mirrors the approach in test_fs_reporting_service):
  BS_CASH     → Cash
  BS_AP       → AP
  IS_REVENUE  → Revenue  (sign_flip=True)
  IS_EXPENSE  → Expense

Each test posts its own JEs to keep state isolated (function-scoped session).
"""
import datetime
from decimal import Decimal

import pytest

from app.models import Account, AccountMapping, Entity, FsLineItem, Scenario
from app.schemas.journal_entry import JournalEntryCreate, JournalEntryLineCreate
from app.services.comparative_service import (
    ScenarioStack,
    Variance,
    calculate_variance,
    find_comparative_unmapped_accounts,
    get_comparative_fs_statement,
    get_comparative_trial_balance,
)
from app.services.journal_entry_service import post_journal_entry
from app.services.reporting_service import get_trial_balance

OPEN  = datetime.date(1900, 1, 1)
CLOSE = datetime.date(9999, 12, 31)
D2023 = datetime.date(2023, 12, 31)
D2024 = datetime.date(2024, 12, 31)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def entity(session):
    e = Entity(code="CMP_E", name="Comparative Entity", entity_type="operating")
    session.add(e)
    session.flush()
    return e


@pytest.fixture
def scenarios(session):
    actual  = Scenario(code="CMP_ACT",  name="Actual",  scenario_type="actual")
    topside = Scenario(code="CMP_TOP",  name="Topside", scenario_type="topside")
    budget  = Scenario(code="CMP_BUD",  name="Budget",  scenario_type="budget")
    session.add_all([actual, topside, budget])
    session.flush()
    return {"actual": actual, "topside": topside, "budget": budget}


@pytest.fixture
def accounts(session):
    cash    = Account(account_number="1000", account_name="Cash",
                      account_type="asset",     normal_balance="debit")
    ap      = Account(account_number="2000", account_name="Accounts Payable",
                      account_type="liability", normal_balance="credit")
    revenue = Account(account_number="4000", account_name="Revenue",
                      account_type="revenue",   normal_balance="credit")
    expense = Account(account_number="6000", account_name="Expense",
                      account_type="expense",   normal_balance="debit")
    orphan  = Account(account_number="9999", account_name="Orphan",
                      account_type="asset",     normal_balance="debit")
    session.add_all([cash, ap, revenue, expense, orphan])
    session.flush()
    return {"cash": cash, "ap": ap, "revenue": revenue, "expense": expense, "orphan": orphan}


@pytest.fixture
def fs_lines(session):
    bs_cash = FsLineItem(code="BS_CASH",    name="Cash",
                         statement="BS", sort_order=10)
    bs_ap   = FsLineItem(code="BS_AP",      name="AP",
                         statement="BS", sort_order=20)
    is_rev  = FsLineItem(code="IS_REVENUE", name="Revenue",
                         statement="IS", sort_order=10, sign_flip=True)
    is_exp  = FsLineItem(code="IS_EXPENSE", name="Expense",
                         statement="IS", sort_order=20)
    session.add_all([bs_cash, bs_ap, is_rev, is_exp])
    session.flush()
    return {"bs_cash": bs_cash, "bs_ap": bs_ap, "is_rev": is_rev, "is_exp": is_exp}


@pytest.fixture
def mappings(session, accounts, fs_lines):
    session.add_all([
        AccountMapping(account_id=accounts["cash"].id,
                       fs_line_item_id=fs_lines["bs_cash"].id,
                       effective_from=OPEN, effective_to=CLOSE),
        AccountMapping(account_id=accounts["ap"].id,
                       fs_line_item_id=fs_lines["bs_ap"].id,
                       effective_from=OPEN, effective_to=CLOSE),
        AccountMapping(account_id=accounts["revenue"].id,
                       fs_line_item_id=fs_lines["is_rev"].id,
                       effective_from=OPEN, effective_to=CLOSE),
        AccountMapping(account_id=accounts["expense"].id,
                       fs_line_item_id=fs_lines["is_exp"].id,
                       effective_from=OPEN, effective_to=CLOSE),
        # orphan intentionally not mapped
    ])
    session.flush()


# ---------------------------------------------------------------------------
# Posting helpers
# ---------------------------------------------------------------------------

def post(session, entity, scenario, accounts, je_number, date, specs):
    """specs: list of (account_key, debit, credit)."""
    lines = [
        JournalEntryLineCreate(
            line_number=i + 1,
            account_id=accounts[k].id,
            entity_id=entity.id,
            debit=Decimal(str(d)),
            credit=Decimal(str(c)),
        )
        for i, (k, d, c) in enumerate(specs)
    ]
    return post_journal_entry(session, JournalEntryCreate(
        je_number=je_number,
        entry_date=date,
        entity_id=entity.id,
        scenario_id=scenario.id,
        description=je_number,
        lines=lines,
    ))


# ---------------------------------------------------------------------------
# 1. Multiple scenarios combine correctly
# ---------------------------------------------------------------------------

def test_two_scenarios_combine_in_stacked_view(session, entity, scenarios, accounts):
    """Stacking ACTUAL + TOPSIDE must equal the sum of each scenario's individual balance."""
    post(session, entity, scenarios["actual"],  accounts, "JE-A1", D2024, [
        ("cash",    100_000, 0),
        ("revenue",       0, 100_000),
    ])
    post(session, entity, scenarios["topside"], accounts, "JE-T1", D2024, [
        ("cash",     20_000, 0),
        ("revenue",       0, 20_000),
    ])

    stacked = ScenarioStack("Actual+Topside",
                            [scenarios["actual"].id, scenarios["topside"].id], D2024)
    actual_only = ScenarioStack("Actual", [scenarios["actual"].id], D2024)

    ctb = {r.account_number: r for r in
           get_comparative_trial_balance(session, entity.id, [stacked, actual_only])}

    assert ctb["1000"].columns["Actual+Topside"] == Decimal("120000"), \
        "Stacked cash = actual(100k) + topside(20k)"
    assert ctb["1000"].columns["Actual"]         == Decimal("100000"), \
        "Actual-only cash = 100k"


def test_three_scenario_stack_combines_all(session, entity, scenarios, accounts):
    post(session, entity, scenarios["actual"],  accounts, "JE-A1", D2024, [
        ("cash",  1_000, 0), ("revenue", 0, 1_000)])
    post(session, entity, scenarios["topside"], accounts, "JE-T1", D2024, [
        ("cash",    200, 0), ("revenue", 0,   200)])
    post(session, entity, scenarios["budget"],  accounts, "JE-B1", D2024, [
        ("cash",    300, 0), ("revenue", 0,   300)])

    full_stack = ScenarioStack("All",
        [scenarios["actual"].id, scenarios["topside"].id, scenarios["budget"].id], D2024)

    ctb = {r.account_number: r for r in
           get_comparative_trial_balance(session, entity.id, [full_stack])}

    assert ctb["1000"].columns["All"] == Decimal("1500"), \
        "Three-scenario stack: 1000+200+300 = 1500"


def test_scenario_absent_from_one_column_shows_zero(session, entity, scenarios, accounts):
    """An account active only in ACTUAL shows 0 in the BUDGET column."""
    post(session, entity, scenarios["actual"], accounts, "JE-A1", D2024, [
        ("cash",    5_000, 0),
        ("revenue",     0, 5_000),
    ])
    # No budget JEs posted

    actual = ScenarioStack("Actual", [scenarios["actual"].id], D2024)
    budget = ScenarioStack("Budget", [scenarios["budget"].id], D2024)

    ctb = {r.account_number: r for r in
           get_comparative_trial_balance(session, entity.id, [actual, budget])}

    assert ctb["1000"].columns["Actual"] == Decimal("5000")
    assert ctb["1000"].columns["Budget"] == Decimal("0"), \
        "No budget JEs → budget column must be 0"


# ---------------------------------------------------------------------------
# 2. Overlays do not duplicate balances
# ---------------------------------------------------------------------------

def test_stacking_does_not_double_count_actual(session, entity, scenarios, accounts):
    """
    A JE posted to ACTUAL appears exactly once when [ACTUAL] is the stack.
    Including a second scenario (TOPSIDE) adds only TOPSIDE entries, not actual twice.
    """
    post(session, entity, scenarios["actual"],  accounts, "JE-A1", D2024, [
        ("cash",  10_000, 0), ("revenue", 0, 10_000)])
    post(session, entity, scenarios["topside"], accounts, "JE-T1", D2024, [
        ("cash",   2_000, 0), ("revenue", 0,  2_000)])

    actual        = ScenarioStack("Actual",       [scenarios["actual"].id], D2024)
    with_topside  = ScenarioStack("Act+Top",
                                  [scenarios["actual"].id, scenarios["topside"].id], D2024)

    ctb = {r.account_number: r for r in
           get_comparative_trial_balance(session, entity.id, [actual, with_topside])}

    assert ctb["1000"].columns["Actual"]  == Decimal("10000"), "ACTUAL not duplicated"
    assert ctb["1000"].columns["Act+Top"] == Decimal("12000"), "Overlay adds only TOPSIDE"


def test_overlay_balance_equals_sum_of_parts(session, entity, scenarios, accounts):
    """overlay = actual + topside individual amounts."""
    post(session, entity, scenarios["actual"],  accounts, "JE-A1", D2024, [
        ("cash",  50_000, 0), ("revenue", 0, 50_000)])
    post(session, entity, scenarios["topside"], accounts, "JE-T1", D2024, [
        ("cash",   5_000, 0), ("revenue", 0,  5_000)])

    actual   = [{"id": scenarios["actual"].id,  "balance": Decimal("50000")}]
    topside  = [{"id": scenarios["topside"].id, "balance": Decimal("5000")}]
    combined = Decimal("50000") + Decimal("5000")

    overlay_stack = ScenarioStack("Overlay",
                                  [scenarios["actual"].id, scenarios["topside"].id], D2024)
    ctb = {r.account_number: r for r in
           get_comparative_trial_balance(session, entity.id, [overlay_stack])}

    assert ctb["1000"].columns["Overlay"] == combined


# ---------------------------------------------------------------------------
# 3. Variance calculations are accurate
# ---------------------------------------------------------------------------

def test_calculate_variance_positive(session):
    v = calculate_variance(Decimal("1000"), Decimal("800"))
    assert v.amount == Decimal("200")
    assert v.percentage == Decimal("25")        # 200/800 * 100 = 25%


def test_calculate_variance_negative(session):
    v = calculate_variance(Decimal("800"), Decimal("1000"))
    assert v.amount == Decimal("-200")
    assert v.percentage == Decimal("-20")       # -200/1000 * 100 = -20%


def test_calculate_variance_zero_base(session):
    v = calculate_variance(Decimal("500"), Decimal("0"))
    assert v.amount == Decimal("500")
    assert v.percentage is None                 # undefined: base=0


def test_calculate_variance_both_zero(session):
    v = calculate_variance(Decimal("0"), Decimal("0"))
    assert v.amount == Decimal("0")
    assert v.percentage is None


def test_comparative_fs_variance_in_output(session, entity, scenarios, accounts,
                                           fs_lines, mappings):
    """Variance between Actual and Budget must appear correctly in FS rows."""
    post(session, entity, scenarios["actual"], accounts, "JE-A1", D2024, [
        ("cash",    90_000, 0),
        ("revenue",      0, 90_000),
    ])
    post(session, entity, scenarios["budget"], accounts, "JE-B1", D2024, [
        ("cash",    80_000, 0),
        ("revenue",      0, 80_000),
    ])

    actual = ScenarioStack("Actual", [scenarios["actual"].id], D2024)
    budget = ScenarioStack("Budget", [scenarios["budget"].id], D2024)

    rows = {r.code: r for r in
            get_comparative_fs_statement(session, entity.id, [actual, budget], "IS")}

    variance_key = "Budget_vs_Actual"
    rev = rows["IS_REVENUE"]

    # Revenue sign_flip=True: display = -net_debit
    # actual display_balance = 90000, budget display_balance = 80000
    assert rev.columns["Actual"] == Decimal("90000")
    assert rev.columns["Budget"] == Decimal("80000")
    assert rev.variances[variance_key].amount == Decimal("-10000")  # budget < actual


def test_variance_percentage_precision(session):
    v = calculate_variance(Decimal("110"), Decimal("100"))
    assert v.amount == Decimal("10")
    assert v.percentage == Decimal("10")        # 10/100 * 100 = 10%


# ---------------------------------------------------------------------------
# 4. Comparative statements remain balanced
# ---------------------------------------------------------------------------

def test_each_stack_trial_balance_remains_balanced(session, entity, scenarios, accounts):
    """For every stack, SUM(net_debit) across all accounts must be 0 (debits = credits)."""
    post(session, entity, scenarios["actual"], accounts, "JE-A1", D2024, [
        ("cash",    70_000, 0),
        ("revenue",      0, 50_000),
        ("ap",           0, 20_000),
    ])
    post(session, entity, scenarios["budget"], accounts, "JE-B1", D2024, [
        ("cash",    60_000, 0),
        ("revenue",      0, 60_000),
    ])

    actual = ScenarioStack("Actual", [scenarios["actual"].id], D2024)
    budget = ScenarioStack("Budget", [scenarios["budget"].id], D2024)

    ctb = get_comparative_trial_balance(session, entity.id, [actual, budget])

    for label in ["Actual", "Budget"]:
        total = sum(r.columns[label] for r in ctb)
        assert total == Decimal("0"), \
            f"TB for '{label}' stack out of balance: sum(net_debit)={total}"


def test_stacked_overlay_trial_balance_balanced(session, entity, scenarios, accounts):
    """An overlay (multiple scenarios combined) must also net to 0."""
    post(session, entity, scenarios["actual"],  accounts, "JE-A1", D2024, [
        ("cash",  30_000, 0), ("revenue", 0, 30_000)])
    post(session, entity, scenarios["topside"], accounts, "JE-T1", D2024, [
        ("cash",   5_000, 0), ("ap",      0,  5_000)])

    overlay = ScenarioStack("Overlay",
                            [scenarios["actual"].id, scenarios["topside"].id], D2024)
    ctb = get_comparative_trial_balance(session, entity.id, [overlay])
    total = sum(r.columns["Overlay"] for r in ctb)
    assert total == Decimal("0")


# ---------------------------------------------------------------------------
# 5. Prior-period comparisons work correctly
# ---------------------------------------------------------------------------

def test_prior_period_column_excludes_current_period_entries(
        session, entity, scenarios, accounts):
    """2024 JE must not appear in the 2023 prior-period column."""
    post(session, entity, scenarios["actual"], accounts, "JE-2023", D2023, [
        ("cash",    40_000, 0),
        ("revenue",      0, 40_000),
    ])
    post(session, entity, scenarios["actual"], accounts, "JE-2024", D2024, [
        ("cash",    15_000, 0),
        ("revenue",      0, 15_000),
    ])

    current = ScenarioStack("Current Year", [scenarios["actual"].id], D2024)
    prior   = ScenarioStack("Prior Year",   [scenarios["actual"].id], D2023)

    ctb = {r.account_number: r for r in
           get_comparative_trial_balance(session, entity.id, [current, prior])}

    # Current (2024): cumulative = 40000 + 15000 = 55000
    assert ctb["1000"].columns["Current Year"] == Decimal("55000")
    # Prior (2023): only 40000; 2024 JE is excluded
    assert ctb["1000"].columns["Prior Year"]   == Decimal("40000"), \
        "2024 JE must not appear in 2023 prior-period column"


def test_prior_period_variance_reflects_current_period_activity(
        session, entity, scenarios, accounts):
    """Variance = current - prior should equal the current-period-only amount."""
    post(session, entity, scenarios["actual"], accounts, "JE-2023", D2023, [
        ("cash",  100_000, 0), ("revenue", 0, 100_000)])
    post(session, entity, scenarios["actual"], accounts, "JE-2024", D2024, [
        ("cash",   25_000, 0), ("revenue", 0,  25_000)])

    current = ScenarioStack("CY", [scenarios["actual"].id], D2024)
    prior   = ScenarioStack("PY", [scenarios["actual"].id], D2023)

    ctb = {r.account_number: r for r in
           get_comparative_trial_balance(session, entity.id, [current, prior])}

    cash_cy = ctb["1000"].columns["CY"]   # 125000
    cash_py = ctb["1000"].columns["PY"]   # 100000

    v = calculate_variance(current=cash_cy, base=cash_py)
    assert v.amount == Decimal("25000"),  "Variance = current-period activity"
    assert v.percentage == Decimal("25"), "25000/100000 * 100 = 25%"


def test_prior_period_fs_comparison(session, entity, scenarios, accounts,
                                     fs_lines, mappings):
    """FS comparative output: prior-period as a separate column."""
    post(session, entity, scenarios["actual"], accounts, "JE-2023", D2023, [
        ("cash",  50_000, 0), ("revenue", 0, 50_000)])
    post(session, entity, scenarios["actual"], accounts, "JE-2024", D2024, [
        ("cash",  10_000, 0), ("revenue", 0, 10_000)])

    current = ScenarioStack("CY", [scenarios["actual"].id], D2024)
    prior   = ScenarioStack("PY", [scenarios["actual"].id], D2023)

    rows = {r.code: r for r in
            get_comparative_fs_statement(session, entity.id, [current, prior], "IS")}

    rev = rows["IS_REVENUE"]
    assert rev.columns["CY"] == Decimal("60000"), "CY revenue = 50000 + 10000"
    assert rev.columns["PY"] == Decimal("50000"), "PY revenue = 50000 only"
    assert rev.variances["PY_vs_CY"].amount == Decimal("-10000")


# ---------------------------------------------------------------------------
# 6. Unmapped accounts are still identified correctly
# ---------------------------------------------------------------------------

def test_find_comparative_unmapped_single_stack(
        session, entity, scenarios, accounts, fs_lines, mappings):
    """Orphan account (9999) has activity but no mapping → appears as unmapped."""
    post(session, entity, scenarios["actual"], accounts, "JE-A1", D2024, [
        ("orphan",  1_000, 0),
        ("revenue",     0, 1_000),
    ])

    actual = ScenarioStack("Actual", [scenarios["actual"].id], D2024)
    unmapped = find_comparative_unmapped_accounts(session, entity.id, [actual])

    assert any(r.account_number == "9999" for r in unmapped), \
        "Orphan account must appear in unmapped list"
    assert not any(r.account_number == "4000" for r in unmapped), \
        "Revenue is mapped; must not be in unmapped list"


def test_find_comparative_unmapped_across_stacks(
        session, entity, scenarios, accounts, fs_lines, mappings):
    """Orphan active in one stack but not another still shows up as unmapped."""
    post(session, entity, scenarios["actual"],  accounts, "JE-A1", D2024, [
        ("cash",   10_000, 0), ("revenue", 0, 10_000)])
    post(session, entity, scenarios["topside"], accounts, "JE-T1", D2024, [
        ("orphan",  2_000, 0), ("revenue", 0,  2_000)])

    actual  = ScenarioStack("Actual",  [scenarios["actual"].id],  D2024)
    topside = ScenarioStack("Topside", [scenarios["topside"].id], D2024)

    unmapped = find_comparative_unmapped_accounts(session, entity.id, [actual, topside])
    assert any(r.account_number == "9999" for r in unmapped)


def test_no_unmapped_when_all_active_accounts_mapped(
        session, entity, scenarios, accounts, fs_lines, mappings):
    """When every account with activity is mapped, result is empty."""
    post(session, entity, scenarios["actual"], accounts, "JE-A1", D2024, [
        ("cash",    5_000, 0),
        ("revenue",     0, 5_000),
    ])
    # cash and revenue are mapped; orphan has no postings

    actual   = ScenarioStack("Actual", [scenarios["actual"].id], D2024)
    unmapped = find_comparative_unmapped_accounts(session, entity.id, [actual])
    assert unmapped == []


def test_comparative_tb_row_count_covers_all_active_accounts(
        session, entity, scenarios, accounts):
    """Union of accounts across stacks: each active account appears exactly once."""
    post(session, entity, scenarios["actual"],  accounts, "JE-A1", D2024, [
        ("cash",  1_000, 0), ("revenue", 0, 1_000)])
    post(session, entity, scenarios["budget"],  accounts, "JE-B1", D2024, [
        ("cash",    500, 0), ("expense", 500, 0), ("ap", 0, 1_000)])
    # budget posts expense + ap (not in actual stack)

    actual = ScenarioStack("Actual", [scenarios["actual"].id], D2024)
    budget = ScenarioStack("Budget", [scenarios["budget"].id], D2024)

    ctb = get_comparative_trial_balance(session, entity.id, [actual, budget])
    codes = [r.account_number for r in ctb]
    # All four accounts should appear; no duplicates
    assert len(codes) == len(set(codes)), "No duplicate account rows"
    assert "6000" in codes, "Expense (budget-only) must appear with actual column = 0"
    assert ctb[[r.account_number for r in ctb].index("6000")].columns["Actual"] == Decimal("0")
