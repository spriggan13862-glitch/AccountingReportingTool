"""
Tests for fs_reporting_service: account mapping, FS aggregation, hierarchy, unmapped detection.

FS structure used throughout:

  BS ─── BS_ASSETS       (parent, sort=10, is_subtotal=True)
         ├── BS_CASH      (leaf,   sort=11)  → Cash account
         └── BS_AR        (leaf,   sort=12)  → AR account
         BS_LIABILITIES   (parent, sort=20, is_subtotal=True)
         └── BS_AP        (leaf,   sort=21)  → AP account

  IS ─── IS_REVENUE       (leaf,   sort=10, sign_flip=True)  → Revenue account
         IS_EXPENSE        (leaf,   sort=11)                  → Expense account
         IS_NET_INCOME     (subtotal, sort=12, is_subtotal=True)
           parent of IS_REVENUE + IS_EXPENSE

Account "Orphan" (account_number=9999) is intentionally unmapped.
"""
import datetime
from decimal import Decimal

import pytest

from app.models import Account, AccountMapping, Entity, FsLineItem, Scenario
from app.schemas.journal_entry import JournalEntryCreate, JournalEntryLineCreate
from app.services.fs_reporting_service import FsLineBalance, find_unmapped_accounts, get_fs_statement
from app.services.journal_entry_service import post_journal_entry
from app.services.reporting_service import get_trial_balance

AS_OF = datetime.date(2024, 12, 31)
OPEN  = datetime.date(1900, 1, 1)
CLOSE = datetime.date(9999, 12, 31)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def entity(session):
    e = Entity(code="FS_E", name="FS Test Entity", entity_type="operating")
    session.add(e)
    session.flush()
    return e


@pytest.fixture
def scenario(session):
    s = Scenario(code="FS_ACT", name="FS Actual", scenario_type="actual")
    session.add(s)
    session.flush()
    return s


@pytest.fixture
def accounts(session):
    cash    = Account(account_number="1000", account_name="Cash",
                      account_type="asset",     normal_balance="debit")
    ar      = Account(account_number="1100", account_name="Accounts Receivable",
                      account_type="asset",     normal_balance="debit")
    ap      = Account(account_number="2000", account_name="Accounts Payable",
                      account_type="liability", normal_balance="credit")
    revenue = Account(account_number="4000", account_name="Revenue",
                      account_type="revenue",   normal_balance="credit")
    expense = Account(account_number="6000", account_name="Operating Expense",
                      account_type="expense",   normal_balance="debit")
    orphan  = Account(account_number="9999", account_name="Orphan Account",
                      account_type="asset",     normal_balance="debit")
    session.add_all([cash, ar, ap, revenue, expense, orphan])
    session.flush()
    return {
        "cash": cash, "ar": ar, "ap": ap,
        "revenue": revenue, "expense": expense, "orphan": orphan,
    }


@pytest.fixture
def fs_lines(session):
    # BS hierarchy
    bs_assets = FsLineItem(code="BS_ASSETS",      name="Total Assets",
                           statement="BS", section="assets",
                           sort_order=10, is_subtotal=True)
    bs_cash   = FsLineItem(code="BS_CASH",         name="Cash",
                           statement="BS", section="current_assets", sort_order=11)
    bs_ar     = FsLineItem(code="BS_AR",           name="Accounts Receivable",
                           statement="BS", section="current_assets", sort_order=12)
    bs_liab   = FsLineItem(code="BS_LIABILITIES",  name="Total Liabilities",
                           statement="BS", section="liabilities",
                           sort_order=20, is_subtotal=True)
    bs_ap     = FsLineItem(code="BS_AP",           name="Accounts Payable",
                           statement="BS", section="current_liabilities", sort_order=21)

    # IS hierarchy
    is_rev    = FsLineItem(code="IS_REVENUE",      name="Revenue",
                           statement="IS", section="revenue",
                           sort_order=10, sign_flip=True)
    is_exp    = FsLineItem(code="IS_EXPENSE",      name="Operating Expense",
                           statement="IS", section="opex", sort_order=11)
    is_ni     = FsLineItem(code="IS_NET_INCOME",   name="Net Income",
                           statement="IS", section="bottom_line",
                           sort_order=12, is_subtotal=True)

    session.add_all([bs_assets, bs_cash, bs_ar, bs_liab, bs_ap,
                     is_rev, is_exp, is_ni])
    session.flush()

    # Wire up parent_line_id
    bs_cash.parent_line_id = bs_assets.id
    bs_ar.parent_line_id   = bs_assets.id
    bs_ap.parent_line_id   = bs_liab.id
    is_rev.parent_line_id  = is_ni.id
    is_exp.parent_line_id  = is_ni.id
    session.flush()

    return {
        "bs_assets": bs_assets, "bs_cash": bs_cash, "bs_ar": bs_ar,
        "bs_liab": bs_liab,     "bs_ap": bs_ap,
        "is_rev": is_rev,       "is_exp": is_exp,   "is_ni": is_ni,
    }


@pytest.fixture
def mappings(session, accounts, fs_lines):
    """Global mappings (entity_id=NULL) covering all time."""
    session.add_all([
        AccountMapping(account_id=accounts["cash"].id,
                       fs_line_item_id=fs_lines["bs_cash"].id,
                       effective_from=OPEN, effective_to=CLOSE),
        AccountMapping(account_id=accounts["ar"].id,
                       fs_line_item_id=fs_lines["bs_ar"].id,
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
        # "orphan" account is intentionally NOT mapped
    ])
    session.flush()


def post_je(session, entity, scenario, accounts, je_number, specs):
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
        entry_date=AS_OF,
        entity_id=entity.id,
        scenario_id=scenario.id,
        description=je_number,
        lines=lines,
    ))


def by_code(fs_output: list[FsLineBalance]) -> dict[str, FsLineBalance]:
    return {row.code: row for row in fs_output}


# ---------------------------------------------------------------------------
# 1. Accounts can be mapped to FS line items
# ---------------------------------------------------------------------------

def test_mapping_created_and_effective(session, entity, accounts, fs_lines, mappings):
    """The mapping fixture creates effective mappings; verify they resolve correctly."""
    from app.services.fs_reporting_service import _effective_mappings
    result = _effective_mappings(session, entity.id, AS_OF)
    assert accounts["cash"].id    in result
    assert accounts["revenue"].id in result
    assert accounts["orphan"].id  not in result


def test_entity_specific_mapping_overrides_global(session, entity, accounts, fs_lines, mappings):
    """An entity-specific mapping supersedes the global one for the same account."""
    # Add an entity-specific override for Cash → BS_AR (contrived, just testing precedence)
    override = AccountMapping(
        account_id=accounts["cash"].id,
        fs_line_item_id=fs_lines["bs_ar"].id,
        entity_id=entity.id,
        effective_from=OPEN, effective_to=CLOSE,
    )
    session.add(override)
    session.flush()

    from app.services.fs_reporting_service import _effective_mappings
    result = _effective_mappings(session, entity.id, AS_OF)
    assert result[accounts["cash"].id] == fs_lines["bs_ar"].id, \
        "Entity-specific mapping must override the global one"


def test_expired_mapping_not_effective(session, entity, accounts, fs_lines):
    """A mapping whose effective_to < as_of_date must not be used."""
    past = AccountMapping(
        account_id=accounts["cash"].id,
        fs_line_item_id=fs_lines["bs_cash"].id,
        effective_from=datetime.date(2000, 1, 1),
        effective_to=datetime.date(2020, 12, 31),  # expired before AS_OF
    )
    session.add(past)
    session.flush()

    from app.services.fs_reporting_service import _effective_mappings
    result = _effective_mappings(session, entity.id, AS_OF)
    assert accounts["cash"].id not in result


# ---------------------------------------------------------------------------
# 2. Mapped account balances roll up to the correct FS line
# ---------------------------------------------------------------------------

def test_account_balance_appears_on_correct_fs_line(
        session, entity, scenario, accounts, fs_lines, mappings):
    post_je(session, entity, scenario, accounts, "JE-001", [
        ("cash",    50_000, 0),
        ("revenue",      0, 50_000),
    ])

    bs = by_code(get_fs_statement(session, entity.id, AS_OF, [scenario.id], "BS"))
    assert bs["BS_CASH"].own_balance == Decimal("50000"), \
        "Cash debit balance must land on BS_CASH"

    is_ = by_code(get_fs_statement(session, entity.id, AS_OF, [scenario.id], "IS"))
    assert is_["IS_REVENUE"].own_balance == Decimal("-50000"), \
        "Revenue credit balance → net_debit=-50000 on IS_REVENUE"


def test_multiple_accounts_on_same_line_aggregate(
        session, entity, scenario, accounts, fs_lines, mappings):
    """Map a second account to BS_CASH via a new mapping; balances must sum."""
    # Give AR its own separate mapping to BS_CASH for this test (unusual but valid)
    ar_to_cash_line = AccountMapping(
        account_id=accounts["ar"].id,
        fs_line_item_id=fs_lines["bs_cash"].id,
        entity_id=entity.id,
        effective_from=OPEN, effective_to=CLOSE,
    )
    session.add(ar_to_cash_line)
    session.flush()

    post_je(session, entity, scenario, accounts, "JE-001", [
        ("cash", 30_000, 0),
        ("ar",   20_000, 0),
        ("ap",        0, 50_000),
    ])

    bs = by_code(get_fs_statement(session, entity.id, AS_OF, [scenario.id], "BS"))
    assert bs["BS_CASH"].own_balance == Decimal("50000"), \
        "cash(30k) + ar(20k) must aggregate on BS_CASH"


# ---------------------------------------------------------------------------
# 3. Unmapped accounts are clearly identified
# ---------------------------------------------------------------------------

def test_unmapped_account_identified(session, entity, scenario, accounts, fs_lines, mappings):
    post_je(session, entity, scenario, accounts, "JE-001", [
        ("orphan", 10_000, 0),
        ("revenue",     0, 10_000),
    ])

    unmapped = find_unmapped_accounts(session, entity.id, AS_OF, [scenario.id])
    unmapped_numbers = {r.account_number for r in unmapped}
    assert "9999" in unmapped_numbers, "Orphan account must appear as unmapped"
    assert "4000" not in unmapped_numbers, "Revenue is mapped; must not appear"


def test_no_activity_account_not_in_unmapped(session, entity, scenario, accounts, fs_lines, mappings):
    """Accounts with zero postings don't appear in the trial balance → not unmapped."""
    # Post nothing for orphan; only cash/revenue have activity
    post_je(session, entity, scenario, accounts, "JE-001", [
        ("cash",    500, 0),
        ("revenue",   0, 500),
    ])
    unmapped = find_unmapped_accounts(session, entity.id, AS_OF, [scenario.id])
    unmapped_numbers = {r.account_number for r in unmapped}
    assert "9999" not in unmapped_numbers, \
        "Orphan has no postings → not in trial balance → not in unmapped list"


def test_all_accounts_mapped_returns_empty_unmapped(
        session, entity, scenario, accounts, fs_lines, mappings):
    # Also map orphan so nothing is unmapped
    session.add(AccountMapping(
        account_id=accounts["orphan"].id,
        fs_line_item_id=fs_lines["bs_cash"].id,
        effective_from=OPEN, effective_to=CLOSE,
    ))
    session.flush()

    post_je(session, entity, scenario, accounts, "JE-001", [
        ("orphan", 1_000, 0),
        ("revenue",    0, 1_000),
    ])

    unmapped = find_unmapped_accounts(session, entity.id, AS_OF, [scenario.id])
    assert unmapped == [], "All active accounts are mapped; list must be empty"


# ---------------------------------------------------------------------------
# 4. Parent-child FS lines aggregate correctly
# ---------------------------------------------------------------------------

def test_parent_total_balance_includes_children(
        session, entity, scenario, accounts, fs_lines, mappings):
    post_je(session, entity, scenario, accounts, "JE-001", [
        ("cash",  60_000, 0),
        ("ar",    40_000, 0),
        ("ap",         0, 100_000),
    ])

    bs = by_code(get_fs_statement(session, entity.id, AS_OF, [scenario.id], "BS"))

    # Leaf own_balances
    assert bs["BS_CASH"].own_balance == Decimal("60000")
    assert bs["BS_AR"].own_balance   == Decimal("40000")
    assert bs["BS_AP"].own_balance   == Decimal("-100000")  # credit balance = negative net_debit

    # BS_ASSETS parent: own=0, total = cash + ar = 100000
    assert bs["BS_ASSETS"].own_balance   == Decimal("0")
    assert bs["BS_ASSETS"].total_balance == Decimal("100000")

    # BS_LIABILITIES parent: own=0, total = ap = -100000
    assert bs["BS_LIABILITIES"].own_balance   == Decimal("0")
    assert bs["BS_LIABILITIES"].total_balance == Decimal("-100000")


def test_is_net_income_rolls_up_revenue_and_expense(
        session, entity, scenario, accounts, fs_lines, mappings):
    post_je(session, entity, scenario, accounts, "JE-001", [
        ("cash",    80_000, 0),
        ("revenue",      0, 100_000),
        ("expense",  20_000, 0),
    ])

    is_ = by_code(get_fs_statement(session, entity.id, AS_OF, [scenario.id], "IS"))

    # Revenue net_debit = -100000; expense net_debit = +20000
    assert is_["IS_REVENUE"].own_balance == Decimal("-100000")
    assert is_["IS_EXPENSE"].own_balance == Decimal("20000")

    # IS_NET_INCOME total = -100000 + 20000 = -80000
    # (negative because net income is a credit to equity in the ledger)
    assert is_["IS_NET_INCOME"].total_balance == Decimal("-80000")


def test_three_level_hierarchy(session, entity, scenario, accounts, fs_lines, mappings):
    """Add a grandparent layer and verify three-level rollup."""
    grandparent = FsLineItem(
        code="BS_TOTAL", name="Total BS",
        statement="BS", sort_order=0, is_subtotal=True,
    )
    session.add(grandparent)
    session.flush()

    # Make BS_ASSETS and BS_LIABILITIES children of grandparent
    fs_lines["bs_assets"].parent_line_id = grandparent.id
    fs_lines["bs_liab"].parent_line_id   = grandparent.id
    session.flush()

    post_je(session, entity, scenario, accounts, "JE-001", [
        ("cash",  50_000, 0),
        ("ap",         0, 50_000),
    ])

    bs = by_code(get_fs_statement(session, entity.id, AS_OF, [scenario.id], "BS"))
    # grandparent.total = BS_ASSETS.total + BS_LIABILITIES.total = 50000 + (-50000) = 0
    assert bs["BS_TOTAL"].total_balance == Decimal("0")


# ---------------------------------------------------------------------------
# 5. BS and IS lines can be separated
# ---------------------------------------------------------------------------

def test_bs_filter_excludes_is_lines(session, entity, scenario, accounts, fs_lines, mappings):
    post_je(session, entity, scenario, accounts, "JE-001", [
        ("cash",    10_000, 0),
        ("revenue",      0, 10_000),
    ])
    bs_codes = {r.code for r in get_fs_statement(
        session, entity.id, AS_OF, [scenario.id], "BS")}
    assert "BS_CASH"    in bs_codes
    assert "IS_REVENUE" not in bs_codes
    assert "IS_EXPENSE" not in bs_codes


def test_is_filter_excludes_bs_lines(session, entity, scenario, accounts, fs_lines, mappings):
    post_je(session, entity, scenario, accounts, "JE-001", [
        ("cash",    10_000, 0),
        ("revenue",      0, 10_000),
    ])
    is_codes = {r.code for r in get_fs_statement(
        session, entity.id, AS_OF, [scenario.id], "IS")}
    assert "IS_REVENUE" in is_codes
    assert "BS_CASH"    not in is_codes


def test_no_statement_filter_returns_all(session, entity, scenario, accounts, fs_lines, mappings):
    post_je(session, entity, scenario, accounts, "JE-001", [
        ("cash",    10_000, 0),
        ("revenue",      0, 10_000),
    ])
    all_codes = {r.code for r in get_fs_statement(
        session, entity.id, AS_OF, [scenario.id])}
    assert "BS_CASH"    in all_codes
    assert "IS_REVENUE" in all_codes


# ---------------------------------------------------------------------------
# 6. sign_flip on display_balance
# ---------------------------------------------------------------------------

def test_sign_flip_makes_revenue_positive_for_display(
        session, entity, scenario, accounts, fs_lines, mappings):
    post_je(session, entity, scenario, accounts, "JE-001", [
        ("cash",    100_000, 0),
        ("revenue",       0, 100_000),
    ])

    is_ = by_code(get_fs_statement(session, entity.id, AS_OF, [scenario.id], "IS"))

    rev = is_["IS_REVENUE"]
    assert rev.sign_flip is True
    assert rev.own_balance     == Decimal("-100000"), "raw net_debit for credit balance"
    assert rev.display_balance == Decimal("100000"),  "sign_flip turns it positive for display"


def test_no_sign_flip_leaves_expense_positive(
        session, entity, scenario, accounts, fs_lines, mappings):
    post_je(session, entity, scenario, accounts, "JE-001", [
        ("expense", 40_000, 0),
        ("ap",           0, 40_000),
    ])

    is_ = by_code(get_fs_statement(session, entity.id, AS_OF, [scenario.id], "IS"))

    exp = is_["IS_EXPENSE"]
    assert exp.sign_flip is False
    assert exp.own_balance     == Decimal("40000")
    assert exp.display_balance == Decimal("40000")


# ---------------------------------------------------------------------------
# 7. Mapped FS output ties back to trial balance total
# ---------------------------------------------------------------------------

def test_fs_mapped_lines_tie_to_trial_balance(
        session, entity, scenario, accounts, fs_lines, mappings):
    """
    For all mapped accounts, sum of FS leaf own_balances must equal
    sum of trial balance net_debits for those same accounts.
    """
    post_je(session, entity, scenario, accounts, "JE-001", [
        ("cash",    80_000, 0),
        ("ar",      20_000, 0),
        ("revenue",      0, 70_000),
        ("expense",  30_000, 0),
        ("ap",           0, 60_000),
    ])

    tb = get_trial_balance(session, entity.id, AS_OF, [scenario.id])
    # orphan has no postings → only mapped accounts in TB
    tb_net = sum(r.net_debit for r in tb if r.account_number != "9999")

    fs_all = get_fs_statement(session, entity.id, AS_OF, [scenario.id])
    # Leaf lines (own_balance) carry the account-level detail; sum them
    leaf_sum = sum(r.own_balance for r in fs_all)

    assert leaf_sum == tb_net, (
        f"Leaf FS line sum ({leaf_sum}) must equal TB net_debit sum ({tb_net})"
    )


def test_sort_order_respected(session, entity, scenario, accounts, fs_lines, mappings):
    """Lines must be returned in ascending sort_order."""
    post_je(session, entity, scenario, accounts, "JE-001", [
        ("cash",    1_000, 0),
        ("revenue",     0, 1_000),
    ])
    bs = get_fs_statement(session, entity.id, AS_OF, [scenario.id], "BS")
    orders = [r.sort_order for r in bs]
    assert orders == sorted(orders), "BS lines must be in sort_order order"
