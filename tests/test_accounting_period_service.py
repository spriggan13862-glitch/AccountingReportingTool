"""
Milestone 11: Accounting periods, period close, and retained earnings tests.

Proof points:
  1.  Posting into a closed period fails with ClosedPeriodError
  2.  Retained earnings rolls forward correctly across periods
  3.  Net income closes properly (IS accounts zeroed, RE credited)
  4.  Comparative retained earnings works across stacks
  5.  Consolidated retained earnings sums across entities
  6.  Balance sheet remains balanced (Assets = Liabilities + Equity) after close
  7.  Close process locks the period (is_closed=True, closed_at set)
  8.  Draft entries cannot be posted into a closed period
"""

import datetime
from decimal import Decimal

import pytest

from app.models import Account, Entity, Scenario
from app.models.accounting_period import AccountingPeriod
from app.schemas.journal_entry import JournalEntryCreate, JournalEntryLineCreate
from app.services.accounting_period_service import (
    CloseResult,
    PeriodAlreadyClosedError,
    PeriodNotClosedError,
    close_period,
    create_period,
    get_period_for_date,
    list_periods,
    reopen_period,
)
from app.services.comparative_service import ScenarioStack
from app.services.journal_entry_service import (
    ClosedPeriodError,
    create_draft_journal_entry,
    post_draft_journal_entry,
    post_journal_entry,
)
from app.services.reporting_service import get_trial_balance, summarize_by_account_type
from app.services.retained_earnings_service import (
    get_comparative_retained_earnings,
    get_consolidated_retained_earnings,
    get_net_income,
    get_re_account_balance,
    get_retained_earnings_balance,
)

# ---------------------------------------------------------------------------
# Dates
# ---------------------------------------------------------------------------

JAN_START = datetime.date(2024, 1, 1)
JAN_END   = datetime.date(2024, 1, 31)
FEB_START = datetime.date(2024, 2, 1)
FEB_END   = datetime.date(2024, 2, 29)
DEC_31    = datetime.date(2024, 12, 31)

FY_START  = datetime.date(2024, 1, 1)   # fiscal year start


# ---------------------------------------------------------------------------
# Module-scoped seeded session
# ---------------------------------------------------------------------------

@pytest.fixture(scope="module")
def seeded_session(db_engine):
    """
    Single session with all seed data committed once for the module.

    Entities:   E1 (operating), E2 (operating)
    Scenario:   ACTUAL (shared)
    Accounts per entity:
        Cash      (asset,   debit-normal)
        Revenue   (revenue, credit-normal)
        Expense   (expense, debit-normal)
        Liability (liability, credit-normal)
        RE        (equity,  credit-normal)  ← retained earnings account
    January 2024 period registered for E1 only (used for close tests).
    """
    from sqlalchemy.orm import sessionmaker
    Session = sessionmaker(bind=db_engine)
    s = Session()

    # ---- entities ----
    e1 = Entity(code="M11_E1", name="M11 Entity 1", entity_type="operating")
    e2 = Entity(code="M11_E2", name="M11 Entity 2", entity_type="operating")
    s.add_all([e1, e2])
    s.flush()

    # ---- scenario ----
    sc = Scenario(code="M11_ACT", name="Actual", scenario_type="actual")
    s.add(sc)
    s.flush()

    # ---- chart of accounts ----
    def _acct(entity, number, name, atype, normal):
        a = Account(
            entity_id=entity.id,
            account_number=number,
            account_name=name,
            account_type=atype,
            normal_balance=normal,
        )
        s.add(a)
        return a

    cash1    = _acct(e1, "1000", "Cash E1",      "asset",     "debit")
    rev1     = _acct(e1, "4000", "Revenue E1",   "revenue",   "credit")
    exp1     = _acct(e1, "5000", "Expense E1",   "expense",   "debit")
    liab1    = _acct(e1, "2000", "Liability E1", "liability", "credit")
    re1      = _acct(e1, "3100", "RE E1",        "equity",    "credit")

    cash2    = _acct(e2, "1000", "Cash E2",      "asset",     "debit")
    rev2     = _acct(e2, "4000", "Revenue E2",   "revenue",   "credit")
    exp2     = _acct(e2, "5000", "Expense E2",   "expense",   "debit")
    re2      = _acct(e2, "3100", "RE E2",        "equity",    "credit")

    s.flush()

    # ---- January 2024 period for E1 ----
    jan_period = AccountingPeriod(
        entity_id=e1.id,
        period_name="January 2024",
        start_date=JAN_START,
        end_date=JAN_END,
        fiscal_year=2024,
        fiscal_period=1,
        period_type="monthly",
        is_closed=False,
    )
    s.add(jan_period)
    s.flush()

    s.commit()

    yield s, {
        "e1": e1, "e2": e2, "sc": sc,
        "cash1": cash1, "rev1": rev1, "exp1": exp1,
        "liab1": liab1, "re1": re1,
        "cash2": cash2, "rev2": rev2, "exp2": exp2, "re2": re2,
        "jan_period": jan_period,
    }

    s.close()


# ---------------------------------------------------------------------------
# Per-test session that wraps seeded_session in a rollback savepoint
# ---------------------------------------------------------------------------

@pytest.fixture
def s(seeded_session):
    """
    Each test gets its own subtransaction (savepoint) so mutations are
    rolled back after the test, keeping the module seed data intact.
    """
    session, refs = seeded_session
    session.begin_nested()
    yield session, refs
    session.rollback()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _je(s, accts, amounts, scenario_id, entity_id, entry_date, je_number, description="Test JE"):
    """
    Post a balanced journal entry.

    accts   : list of account objects
    amounts : list of (debit, credit) tuples, one per account
    """
    lines = [
        JournalEntryLineCreate(
            line_number=i + 1,
            account_id=acct.id,
            entity_id=entity_id,
            debit=Decimal(str(d)),
            credit=Decimal(str(c)),
        )
        for i, (acct, (d, c)) in enumerate(zip(accts, amounts))
    ]
    return post_journal_entry(s, JournalEntryCreate(
        je_number=je_number,
        entry_date=entry_date,
        entity_id=entity_id,
        scenario_id=scenario_id,
        description=description,
        source="test",
        lines=lines,
    ))


def _post_revenue_expense(s, refs, je_num, revenue, expense, date=None):
    """Post revenue + expense to E1 in the given date (default Jan 15)."""
    date = date or datetime.date(2024, 1, 15)
    e1, sc = refs["e1"], refs["sc"]
    cash1, rev1, exp1 = refs["cash1"], refs["rev1"], refs["exp1"]
    # Revenue: DR Cash / CR Revenue
    # Expense: DR Expense / CR Cash
    # Combined: DR Cash (revenue-expense net), CR Revenue, DR Expense, CR Cash
    # Use two lines: DR Cash, CR Rev; then DR Exp, CR Cash
    _je(s, [cash1, rev1], [(revenue, 0), (0, revenue)], sc.id, e1.id, date, je_num + "a")
    _je(s, [exp1, cash1], [(expense, 0), (0, expense)], sc.id, e1.id, date, je_num + "b")


# ===========================================================================
# Test 7 (first — least state-dependent): close locks the period
# ===========================================================================

class TestPeriodCloseLocksThePeriod:

    def test_close_sets_is_closed_true(self, s):
        session, refs = s
        e1, sc, re1, jan_period = refs["e1"], refs["sc"], refs["re1"], refs["jan_period"]

        # Post some IS activity so closing entries can be generated
        _post_revenue_expense(session, refs, "LOCK-01", 1000, 700)

        result = close_period(
            session,
            period_id=jan_period.id,
            re_account_id=re1.id,
            scenario_id=sc.id,
            closing_je_number="CL-LOCK-01",
            closed_by="tester",
        )
        assert result.period.is_closed is True

    def test_close_sets_closed_at(self, s):
        session, refs = s
        e1, sc, re1, jan_period = refs["e1"], refs["sc"], refs["re1"], refs["jan_period"]
        _post_revenue_expense(session, refs, "LOCK-02", 500, 200)
        result = close_period(
            session, jan_period.id, re1.id, sc.id, "CL-LOCK-02"
        )
        assert result.period.closed_at is not None

    def test_close_sets_closed_by(self, s):
        session, refs = s
        e1, sc, re1, jan_period = refs["e1"], refs["sc"], refs["re1"], refs["jan_period"]
        _post_revenue_expense(session, refs, "LOCK-03", 300, 100)
        result = close_period(
            session, jan_period.id, re1.id, sc.id, "CL-LOCK-03", closed_by="controller"
        )
        assert result.period.closed_by == "controller"

    def test_double_close_raises(self, s):
        session, refs = s
        e1, sc, re1, jan_period = refs["e1"], refs["sc"], refs["re1"], refs["jan_period"]
        _post_revenue_expense(session, refs, "LOCK-04", 200, 100)
        close_period(session, jan_period.id, re1.id, sc.id, "CL-LOCK-04")
        with pytest.raises(PeriodAlreadyClosedError):
            close_period(session, jan_period.id, re1.id, sc.id, "CL-LOCK-04b")

    def test_reopen_clears_is_closed(self, s):
        session, refs = s
        e1, sc, re1, jan_period = refs["e1"], refs["sc"], refs["re1"], refs["jan_period"]
        _post_revenue_expense(session, refs, "LOCK-05", 400, 150)
        close_period(session, jan_period.id, re1.id, sc.id, "CL-LOCK-05")
        period = reopen_period(session, jan_period.id)
        assert period.is_closed is False
        assert period.closed_at is None


# ===========================================================================
# Test 1: posting into a closed period fails
# ===========================================================================

class TestPostingIntoClosedPeriodFails:

    def test_post_je_into_closed_period_raises(self, s):
        session, refs = s
        e1, sc, re1, jan_period = refs["e1"], refs["sc"], refs["re1"], refs["jan_period"]
        cash1, rev1 = refs["cash1"], refs["rev1"]

        # Post some IS activity then close
        _post_revenue_expense(session, refs, "CLOSED-01", 800, 300)
        close_period(session, jan_period.id, re1.id, sc.id, "CL-CLOSED-01")

        with pytest.raises(ClosedPeriodError, match="closed period"):
            _je(
                session,
                [cash1, rev1],
                [(500, 0), (0, 500)],
                sc.id, e1.id,
                datetime.date(2024, 1, 20),  # in January — now closed
                "POST-INTO-CLOSED",
            )

    def test_post_into_different_entity_is_allowed(self, s):
        """A closed period on E1 does not block posting for E2."""
        session, refs = s
        e1, e2, sc, re1, jan_period = (
            refs["e1"], refs["e2"], refs["sc"], refs["re1"], refs["jan_period"]
        )
        cash2, rev2 = refs["cash2"], refs["rev2"]

        _post_revenue_expense(session, refs, "CLOSED-02", 200, 100)
        close_period(session, jan_period.id, re1.id, sc.id, "CL-CLOSED-02")

        # E2 has no periods registered — posting in January should succeed
        je = _je(
            session,
            [cash2, rev2],
            [(300, 0), (0, 300)],
            sc.id, e2.id,
            datetime.date(2024, 1, 10),
            "E2-JAN-OK",
        )
        assert je.status == "posted"

    def test_post_into_open_period_succeeds(self, s):
        """Posting in February succeeds while January is closed."""
        session, refs = s
        e1, sc, re1, jan_period = refs["e1"], refs["sc"], refs["re1"], refs["jan_period"]
        cash1, rev1 = refs["cash1"], refs["rev1"]

        _post_revenue_expense(session, refs, "OPEN-FEB-01", 600, 200)
        close_period(session, jan_period.id, re1.id, sc.id, "CL-OPEN-FEB-01")

        # February is open — should succeed
        je = _je(
            session,
            [cash1, rev1],
            [(700, 0), (0, 700)],
            sc.id, e1.id,
            datetime.date(2024, 2, 1),
            "FEB-OK",
        )
        assert je.status == "posted"


# ===========================================================================
# Test 8: draft entries cannot bypass close controls
# ===========================================================================

class TestDraftCannotPostIntoClosed:

    def test_draft_can_exist_in_closed_period(self, s):
        """Creating a draft in a closed period is allowed (no posting occurs)."""
        session, refs = s
        e1, sc, re1, jan_period = refs["e1"], refs["sc"], refs["re1"], refs["jan_period"]
        cash1, rev1 = refs["cash1"], refs["rev1"]

        _post_revenue_expense(session, refs, "DRAFT-01", 400, 100)
        close_period(session, jan_period.id, re1.id, sc.id, "CL-DRAFT-01")

        draft = create_draft_journal_entry(
            session,
            JournalEntryCreate(
                je_number="DRAFT-IN-CLOSED",
                entry_date=datetime.date(2024, 1, 10),
                entity_id=e1.id,
                scenario_id=sc.id,
                description="Draft in closed period",
                source="test",
                lines=[
                    JournalEntryLineCreate(
                        line_number=1, account_id=cash1.id,
                        entity_id=e1.id, debit=Decimal("100"), credit=Decimal("0"),
                    ),
                    JournalEntryLineCreate(
                        line_number=2, account_id=rev1.id,
                        entity_id=e1.id, debit=Decimal("0"), credit=Decimal("100"),
                    ),
                ],
            ),
        )
        assert draft.status == "draft"

    def test_posting_draft_in_closed_period_fails(self, s):
        """post_draft_journal_entry raises ClosedPeriodError for a closed period."""
        session, refs = s
        e1, sc, re1, jan_period = refs["e1"], refs["sc"], refs["re1"], refs["jan_period"]
        cash1, rev1 = refs["cash1"], refs["rev1"]

        _post_revenue_expense(session, refs, "DRAFT-02", 300, 200)
        close_period(session, jan_period.id, re1.id, sc.id, "CL-DRAFT-02")

        draft = create_draft_journal_entry(
            session,
            JournalEntryCreate(
                je_number="DRAFT-POST-FAIL",
                entry_date=datetime.date(2024, 1, 5),
                entity_id=e1.id,
                scenario_id=sc.id,
                description="Will fail on post",
                source="test",
                lines=[
                    JournalEntryLineCreate(
                        line_number=1, account_id=cash1.id,
                        entity_id=e1.id, debit=Decimal("500"), credit=Decimal("0"),
                    ),
                    JournalEntryLineCreate(
                        line_number=2, account_id=rev1.id,
                        entity_id=e1.id, debit=Decimal("0"), credit=Decimal("500"),
                    ),
                ],
            ),
        )
        with pytest.raises(ClosedPeriodError):
            post_draft_journal_entry(session, draft.id)


# ===========================================================================
# Test 3: net income closes properly
# ===========================================================================

class TestNetIncomeClosesProper:

    def test_closing_entry_zeroes_is_accounts_in_period(self, s):
        """After close, IS accounts have zero net activity for the closed period."""
        session, refs = s
        e1, sc, re1, jan_period = refs["e1"], refs["sc"], refs["re1"], refs["jan_period"]

        _post_revenue_expense(session, refs, "NI-01", 2000, 1200)

        close_period(session, jan_period.id, re1.id, sc.id, "CL-NI-01")

        # Net income for January should be zero now (closing entry offsets it)
        ni = get_net_income(session, e1.id, [sc.id], JAN_START, JAN_END)
        assert ni == Decimal("0")

    def test_closing_entry_credits_re_with_net_income(self, s):
        """RE account receives credit equal to net income."""
        session, refs = s
        e1, sc, re1, jan_period = refs["e1"], refs["sc"], refs["re1"], refs["jan_period"]

        revenue = Decimal("3000")
        expense = Decimal("1800")
        expected_ni = revenue - expense

        _post_revenue_expense(session, refs, "NI-02", int(revenue), int(expense))

        result = close_period(session, jan_period.id, re1.id, sc.id, "CL-NI-02")
        assert result.net_income == expected_ni

        re_bal = get_re_account_balance(session, e1.id, [sc.id], JAN_END, re1.id)
        assert re_bal == expected_ni

    def test_net_loss_debits_re(self, s):
        """A net loss produces a debit to the RE account."""
        session, refs = s
        e1, sc, re1, jan_period = refs["e1"], refs["sc"], refs["re1"], refs["jan_period"]

        # Expenses exceed revenue → net loss
        _post_revenue_expense(session, refs, "NI-03", 500, 800)

        result = close_period(session, jan_period.id, re1.id, sc.id, "CL-NI-03")
        assert result.net_income == Decimal("-300")

        re_bal = get_re_account_balance(session, e1.id, [sc.id], JAN_END, re1.id)
        assert re_bal == Decimal("-300")

    def test_closing_je_is_posted_status(self, s):
        """The closing journal entry itself has status='posted'."""
        session, refs = s
        e1, sc, re1, jan_period = refs["e1"], refs["sc"], refs["re1"], refs["jan_period"]
        _post_revenue_expense(session, refs, "NI-04", 1000, 600)
        result = close_period(session, jan_period.id, re1.id, sc.id, "CL-NI-04")
        assert result.closing_je is not None
        assert result.closing_je.status == "posted"

    def test_no_closing_entries_when_flag_false(self, s):
        """generate_closing_entries=False locks the period without posting a JE."""
        session, refs = s
        e1, sc, re1, jan_period = refs["e1"], refs["sc"], refs["re1"], refs["jan_period"]
        _post_revenue_expense(session, refs, "NI-05", 500, 300)
        result = close_period(
            session, jan_period.id, re1.id, sc.id, "CL-NI-05",
            generate_closing_entries=False,
        )
        assert result.closing_je is None
        assert result.period.is_closed is True


# ===========================================================================
# Test 2: retained earnings rolls forward
# ===========================================================================

class TestRetainedEarningsRollForward:

    def test_re_balance_equals_ni_after_close(self, s):
        """After closing January, RE balance = net income for the period."""
        session, refs = s
        e1, sc, re1, jan_period = refs["e1"], refs["sc"], refs["re1"], refs["jan_period"]

        _post_revenue_expense(session, refs, "RE-01", 5000, 3000)
        close_period(session, jan_period.id, re1.id, sc.id, "CL-RE-01")

        # Cumulative RE through January end = $2000
        re_bal = get_re_account_balance(session, e1.id, [sc.id], JAN_END, re1.id)
        assert re_bal == Decimal("2000")

    def test_re_includes_ytd_ni_before_close(self, s):
        """Before close, get_retained_earnings_balance includes open-period net income."""
        session, refs = s
        e1, sc, re1, jan_period = refs["e1"], refs["sc"], refs["re1"], refs["jan_period"]

        _post_revenue_expense(session, refs, "RE-02", 4000, 2500)

        # Period is still open — RE account has $0 (no closing entry)
        # But get_retained_earnings_balance should return the YTD net income
        re_bal = get_retained_earnings_balance(
            session, e1.id, [sc.id], JAN_END, re1.id, fiscal_year_start=FY_START
        )
        assert re_bal == Decimal("1500")

    def test_re_rolls_forward_into_feb(self, s):
        """After close of Jan, the Feb RE balance = Jan net income + Feb YTD net income."""
        session, refs = s
        e1, sc, re1, jan_period = refs["e1"], refs["sc"], refs["re1"], refs["jan_period"]
        cash1, rev1, exp1 = refs["cash1"], refs["rev1"], refs["exp1"]

        # January: revenue $5000, expense $3000 → net income $2000
        _post_revenue_expense(session, refs, "RE-03", 5000, 3000)
        close_period(session, jan_period.id, re1.id, sc.id, "CL-RE-03")

        # February (no separate period registered — just activity): revenue $1000, expense $400
        _je(session, [cash1, rev1], [(1000, 0), (0, 1000)], sc.id, e1.id,
            datetime.date(2024, 2, 15), "FEB-REV-03")
        _je(session, [exp1, cash1], [(400, 0), (0, 400)], sc.id, e1.id,
            datetime.date(2024, 2, 15), "FEB-EXP-03")

        # RE balance as of Feb 29: closed RE ($2000) + Feb YTD net income ($600)
        re_bal = get_retained_earnings_balance(
            session, e1.id, [sc.id],
            as_of_date=FEB_END,
            re_account_id=re1.id,
            fiscal_year_start=FY_START,
        )
        assert re_bal == Decimal("2600")

    def test_re_account_balance_excludes_ytd_ni(self, s):
        """get_re_account_balance returns only ledger balance (not open-period NI)."""
        session, refs = s
        e1, sc, re1, jan_period = refs["e1"], refs["sc"], refs["re1"], refs["jan_period"]

        _post_revenue_expense(session, refs, "RE-04", 6000, 4000)

        # Before close: RE account has $0 (no closing entry yet)
        re_ledger = get_re_account_balance(session, e1.id, [sc.id], JAN_END, re1.id)
        assert re_ledger == Decimal("0")

        close_period(session, jan_period.id, re1.id, sc.id, "CL-RE-04")

        # After close: RE account has $2000 (from closing entry)
        re_ledger = get_re_account_balance(session, e1.id, [sc.id], JAN_END, re1.id)
        assert re_ledger == Decimal("2000")


# ===========================================================================
# Test 4: comparative retained earnings
# ===========================================================================

class TestComparativeRetainedEarnings:

    def test_comparative_re_returns_both_columns(self, s):
        """Two stacks produce two labelled RE balances."""
        session, refs = s
        e1, sc, re1, jan_period = refs["e1"], refs["sc"], refs["re1"], refs["jan_period"]
        cash1, rev1, exp1 = refs["cash1"], refs["rev1"], refs["exp1"]

        # January: revenue $3000, expense $1000 → NI $2000
        _post_revenue_expense(session, refs, "COMP-01", 3000, 1000)
        close_period(session, jan_period.id, re1.id, sc.id, "CL-COMP-01")

        # February: revenue $800, expense $300 → YTD NI $500
        _je(session, [cash1, rev1], [(800, 0), (0, 800)], sc.id, e1.id,
            datetime.date(2024, 2, 10), "COMP-FEB-REV")
        _je(session, [exp1, cash1], [(300, 0), (0, 300)], sc.id, e1.id,
            datetime.date(2024, 2, 10), "COMP-FEB-EXP")

        stacks = [
            ScenarioStack(label="Jan-2024",  scenario_ids=[sc.id], as_of_date=JAN_END),
            ScenarioStack(label="Feb-2024",  scenario_ids=[sc.id], as_of_date=FEB_END),
        ]

        row = get_comparative_retained_earnings(session, e1.id, re1.id, stacks)

        # Jan: closing entries have been posted, IS zeroed → RE = $2000 (ledger) + $0 YTD
        # Feb: RE = $2000 (ledger) + $500 YTD Feb net income
        assert row.columns["Jan-2024"] == Decimal("2000")
        assert row.columns["Feb-2024"] == Decimal("2500")

    def test_comparative_re_before_close(self, s):
        """Before any close, comparative RE = YTD net income only."""
        session, refs = s
        e1, sc, re1 = refs["e1"], refs["sc"], refs["re1"]

        _post_revenue_expense(session, refs, "COMP-02", 2000, 800)

        stacks = [
            ScenarioStack(label="Jan-open", scenario_ids=[sc.id], as_of_date=JAN_END),
        ]
        row = get_comparative_retained_earnings(session, e1.id, re1.id, stacks)
        # RE account has $0 (no close), YTD NI = $1200
        assert row.columns["Jan-open"] == Decimal("1200")


# ===========================================================================
# Test 5: consolidated retained earnings
# ===========================================================================

class TestConsolidatedRetainedEarnings:

    def test_consolidated_re_sums_entities(self, s):
        """Consolidated RE = E1 RE + E2 RE."""
        session, refs = s
        e1, e2, sc = refs["e1"], refs["e2"], refs["sc"]
        cash1, rev1, exp1 = refs["cash1"], refs["rev1"], refs["exp1"]
        cash2, rev2, exp2 = refs["cash2"], refs["rev2"], refs["exp2"]
        re1, re2 = refs["re1"], refs["re2"]
        jan_period = refs["jan_period"]

        # E1: revenue $4000, expense $1500 → NI $2500; close Jan
        _post_revenue_expense(session, refs, "CONS-01-E1", 4000, 1500)
        close_period(session, jan_period.id, re1.id, sc.id, "CL-CONS-E1")

        # E2: revenue $2000, expense $800 → NI $1200 (no period close — open period)
        _je(session, [cash2, rev2], [(2000, 0), (0, 2000)], sc.id, e2.id,
            datetime.date(2024, 1, 15), "CONS-E2-REV")
        _je(session, [exp2, cash2], [(800, 0), (0, 800)], sc.id, e2.id,
            datetime.date(2024, 1, 15), "CONS-E2-EXP")

        cons_re = get_consolidated_retained_earnings(
            session,
            entity_re_pairs=[(e1.id, re1.id), (e2.id, re2.id)],
            scenario_ids=[sc.id],
            as_of_date=JAN_END,
            fiscal_year_start=FY_START,
        )
        # E1 RE = $2500 (in ledger via close), E2 RE = $1200 (open-period YTD)
        assert cons_re == Decimal("3700")

    def test_consolidated_re_single_entity(self, s):
        """Single-entity consolidated RE equals that entity's RE balance."""
        session, refs = s
        e1, sc, re1, jan_period = refs["e1"], refs["sc"], refs["re1"], refs["jan_period"]

        _post_revenue_expense(session, refs, "CONS-02", 1000, 400)

        single_re = get_consolidated_retained_earnings(
            session,
            entity_re_pairs=[(e1.id, re1.id)],
            scenario_ids=[sc.id],
            as_of_date=JAN_END,
            fiscal_year_start=FY_START,
        )
        direct_re = get_retained_earnings_balance(
            session, e1.id, [sc.id], JAN_END, re1.id, FY_START
        )
        assert single_re == direct_re


# ===========================================================================
# Test 6: balance sheet remains balanced after close
# ===========================================================================

class TestBalanceSheetBalancedAfterClose:

    def test_bs_equation_holds_after_close(self, s):
        """
        After a period close, the BS equation holds:
          Assets = Liabilities + Equity

        Before close this fails (IS accounts hold net income that isn't yet in equity).
        After close, IS accounts are zeroed and net income is in RE (equity).
        """
        session, refs = s
        e1, sc, re1, jan_period = refs["e1"], refs["sc"], refs["re1"], refs["jan_period"]
        cash1, rev1, exp1, liab1 = (
            refs["cash1"], refs["rev1"], refs["exp1"], refs["liab1"]
        )

        # Initial balance sheet entries (mimick opening balances):
        # DR Cash $10000, CR Liability $6000, CR RE $4000 (equity)
        _je(session,
            [cash1, liab1, re1],
            [(10000, 0), (0, 6000), (0, 4000)],
            sc.id, e1.id, datetime.date(2023, 12, 31), "OB-M11")

        # Revenue $2000, Expense $800 in January
        _post_revenue_expense(session, refs, "BS-JAN", 2000, 800)

        # Before close: BS equation should NOT hold because $1200 net income
        # is in IS accounts (revenue/expense), not equity.
        tb_pre = get_trial_balance(session, e1.id, JAN_END, [sc.id])
        by_type_pre = summarize_by_account_type(tb_pre)
        assets_pre = by_type_pre.get("asset", Decimal("0"))
        liabilities_pre = by_type_pre.get("liability", Decimal("0"))
        equity_pre = by_type_pre.get("equity", Decimal("0"))
        # Assets ≠ Liabilities + Equity before close (net income sits in IS)
        assert assets_pre != liabilities_pre + equity_pre

        # After close
        close_period(session, jan_period.id, re1.id, sc.id, "CL-BS-M11")

        tb_post = get_trial_balance(session, e1.id, JAN_END, [sc.id])
        by_type_post = summarize_by_account_type(tb_post)
        assets  = by_type_post.get("asset",     Decimal("0"))
        liabs   = by_type_post.get("liability", Decimal("0"))
        equity  = by_type_post.get("equity",    Decimal("0"))
        # After close: Assets = Liabilities + Equity
        assert assets == liabs + equity

    def test_tb_always_balances_debit_credit(self, s):
        """
        The trial balance total debits always equal total credits regardless
        of close state — this is invariant in double-entry bookkeeping.
        """
        session, refs = s
        e1, sc, re1, jan_period = refs["e1"], refs["sc"], refs["re1"], refs["jan_period"]

        _post_revenue_expense(session, refs, "TB-BAL", 3000, 1500)
        close_period(session, jan_period.id, re1.id, sc.id, "CL-TB-BAL")

        tb = get_trial_balance(session, e1.id, JAN_END, [sc.id])
        total_debit  = sum(r.total_debit  for r in tb)
        total_credit = sum(r.total_credit for r in tb)
        assert total_debit == total_credit


# ===========================================================================
# Test: period model and CRUD basics
# ===========================================================================

class TestPeriodCRUD:

    def test_create_period(self, s):
        session, refs = s
        e1 = refs["e1"]
        p = create_period(
            session,
            entity_id=e1.id,
            period_name="February 2024",
            start_date=FEB_START,
            end_date=FEB_END,
            fiscal_year=2024,
            fiscal_period=2,
            period_type="monthly",
        )
        assert p.id is not None
        assert p.is_closed is False
        assert p.period_name == "February 2024"

    def test_list_periods(self, s):
        session, refs = s
        e1 = refs["e1"]
        periods = list_periods(session, e1.id, fiscal_year=2024)
        assert len(periods) >= 1
        assert all(p.fiscal_year == 2024 for p in periods)

    def test_get_period_for_date(self, s):
        session, refs = s
        e1, jan_period = refs["e1"], refs["jan_period"]
        found = get_period_for_date(session, e1.id, datetime.date(2024, 1, 15))
        assert found is not None
        assert found.id == jan_period.id

    def test_get_period_for_date_no_match(self, s):
        session, refs = s
        e1 = refs["e1"]
        # March has no registered period
        found = get_period_for_date(session, e1.id, datetime.date(2024, 3, 15))
        assert found is None
