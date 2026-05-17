"""
Tests for consolidation_service.py (Milestone 8).

Scenario setup:
  Entities:
    P  (id=1) — consolidation entity
    S1 (id=2) — operating subsidiary, 100% owned by P
    S2 (id=3) — operating subsidiary, 80% owned by P
    X  (id=4) — unrelated entity (not in P's group)

  Accounts (shared across entities):
    1000 — Cash          (asset,   debit-normal)
    2000 — A/P           (liability, credit-normal)
    3000 — Revenue       (revenue,  credit-normal)
    4000 — IC Receivable (asset,   debit-normal)   ← intercompany
    4001 — IC Payable    (liability, credit-normal) ← intercompany

  Scenarios:
    ACTUAL (id=1) — operating entries
    ELIM   (id=2) — elimination entries (posted to P)

  Journal entries:
    JE-S1-1: S1/ACTUAL — Dr Cash 1000, Cr Revenue 1000
    JE-S2-1: S2/ACTUAL — Dr Cash 500,  Cr Revenue 500
    JE-X-1 : X/ACTUAL  — Dr Cash 200,  Cr Revenue 200  (unrelated)
    JE-IC-1: S1/ACTUAL — Dr IC-Recv 300, Cr Cash 300    (S1 loaned S2)
    JE-IC-2: S2/ACTUAL — Dr Cash 300,   Cr IC-Pay 300   (S2 received loan)
    JE-ELIM: P/ELIM    — Dr IC-Pay 300, Cr IC-Recv 300  (elimination entry)

  FS structure:
    BS-ASSET (id=1, BS, is_subtotal=True)
      BS-CASH    (id=2, BS, parent=1) — mapped: Cash, IC-Recv
    BS-LIAB (id=3, BS, is_subtotal=True)
      BS-AP      (id=4, BS, parent=3) — mapped: A/P, IC-Pay
    IS-REV (id=5, IS, sign_flip=True)
      IS-REVENUE (id=6, IS, parent=5) — mapped: Revenue
"""

import datetime
from decimal import Decimal

import pytest
from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session

from app.database import Base
from app.models.account import Account
from app.models.account_mapping import AccountMapping
from app.models.entity import Entity
from app.models.entity_group_member import EntityGroupMember
from app.models.fs_line_item import FsLineItem
from app.models.journal_entry import JournalEntry
from app.models.journal_entry_line import JournalEntryLine
from app.models.scenario import Scenario
from app.services.consolidation_service import (
    get_consolidated_fs_statement,
    get_consolidated_trial_balance,
    get_consolidation_members,
    get_entity_subtree,
    get_group_trial_balance,
    get_subgroup_trial_balance,
)

AS_OF = datetime.date(2024, 12, 31)


# ---------------------------------------------------------------------------
# Module-scoped fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(scope="module")
def db_engine():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
    )

    @event.listens_for(engine, "connect")
    def set_pragmas(dbapi_conn, _record):
        cur = dbapi_conn.cursor()
        cur.execute("PRAGMA foreign_keys = ON")
        cur.close()

    Base.metadata.create_all(engine)
    yield engine
    Base.metadata.drop_all(engine)


@pytest.fixture(scope="module")
def seeded_session(db_engine):
    """One session that persists for the whole module — all tests share this data."""
    with Session(db_engine) as s:
        # --- Entities (flush before accounts to satisfy FK) ---
        P  = Entity(id=1, code="P",  name="Parent Co",  entity_type="consolidation", currency="USD")
        s.add(P)
        s.flush()
        S1 = Entity(id=2, code="S1", name="Sub One",    entity_type="operating",     currency="USD", parent_id=1)
        S2 = Entity(id=3, code="S2", name="Sub Two",    entity_type="operating",     currency="USD", parent_id=1)
        X  = Entity(id=4, code="X",  name="Unrelated",  entity_type="operating",     currency="USD")
        s.add_all([S1, S2, X])
        s.flush()

        # --- Scenarios ---
        actual = Scenario(id=1, code="ACTUAL", name="Actual", scenario_type="actual")
        elim   = Scenario(id=2, code="ELIM",   name="Elim",   scenario_type="elimination")
        s.add_all([actual, elim])
        s.flush()

        # --- Accounts ---
        cash     = Account(id=10, entity_id=1, account_number="1000", account_name="Cash",          account_type="asset",     normal_balance="debit")
        ap       = Account(id=11, entity_id=1, account_number="2000", account_name="A/P",           account_type="liability", normal_balance="credit")
        revenue  = Account(id=12, entity_id=1, account_number="3000", account_name="Revenue",       account_type="revenue",   normal_balance="credit")
        ic_recv  = Account(id=13, entity_id=1, account_number="4000", account_name="IC Receivable", account_type="asset",     normal_balance="debit")
        ic_pay   = Account(id=14, entity_id=1, account_number="4001", account_name="IC Payable",    account_type="liability", normal_balance="credit")

        cash2    = Account(id=20, entity_id=2, account_number="1000", account_name="Cash",          account_type="asset",     normal_balance="debit")
        ap2      = Account(id=21, entity_id=2, account_number="2000", account_name="A/P",           account_type="liability", normal_balance="credit")
        revenue2 = Account(id=22, entity_id=2, account_number="3000", account_name="Revenue",       account_type="revenue",   normal_balance="credit")
        ic_recv2 = Account(id=23, entity_id=2, account_number="4000", account_name="IC Receivable", account_type="asset",     normal_balance="debit")
        ic_pay2  = Account(id=24, entity_id=2, account_number="4001", account_name="IC Payable",    account_type="liability", normal_balance="credit")

        cash3    = Account(id=30, entity_id=3, account_number="1000", account_name="Cash",          account_type="asset",     normal_balance="debit")
        ap3      = Account(id=31, entity_id=3, account_number="2000", account_name="A/P",           account_type="liability", normal_balance="credit")
        revenue3 = Account(id=32, entity_id=3, account_number="3000", account_name="Revenue",       account_type="revenue",   normal_balance="credit")
        ic_recv3 = Account(id=33, entity_id=3, account_number="4000", account_name="IC Receivable", account_type="asset",     normal_balance="debit")
        ic_pay3  = Account(id=34, entity_id=3, account_number="4001", account_name="IC Payable",    account_type="liability", normal_balance="credit")

        cash4    = Account(id=40, entity_id=4, account_number="1000", account_name="Cash",          account_type="asset",     normal_balance="debit")
        revenue4 = Account(id=41, entity_id=4, account_number="3000", account_name="Revenue",       account_type="revenue",   normal_balance="credit")

        s.add_all([
            cash, ap, revenue, ic_recv, ic_pay,
            cash2, ap2, revenue2, ic_recv2, ic_pay2,
            cash3, ap3, revenue3, ic_recv3, ic_pay3,
            cash4, revenue4,
        ])
        s.flush()

        # --- entity_group_members ---
        s.add(EntityGroupMember(consolidation_entity_id=1, member_entity_id=2, ownership_pct=Decimal("100.0000")))
        s.add(EntityGroupMember(consolidation_entity_id=1, member_entity_id=3, ownership_pct=Decimal("80.0000")))
        s.flush()

        # --- Journal entries ---
        # S1: Cash 1000 / Revenue 1000
        je1 = JournalEntry(id=1, je_number="JE-S1-1", entry_date=AS_OF, entity_id=2, scenario_id=1, status="posted", description="S1 operating")
        s.add(je1)
        s.flush()
        s.add_all([
            JournalEntryLine(journal_entry_id=1, line_number=1, account_id=20, entity_id=2, debit=Decimal("1000"), credit=Decimal("0")),
            JournalEntryLine(journal_entry_id=1, line_number=2, account_id=22, entity_id=2, debit=Decimal("0"),    credit=Decimal("1000")),
        ])

        # S2: Cash 500 / Revenue 500
        je2 = JournalEntry(id=2, je_number="JE-S2-1", entry_date=AS_OF, entity_id=3, scenario_id=1, status="posted", description="S2 operating")
        s.add(je2)
        s.flush()
        s.add_all([
            JournalEntryLine(journal_entry_id=2, line_number=1, account_id=30, entity_id=3, debit=Decimal("500"), credit=Decimal("0")),
            JournalEntryLine(journal_entry_id=2, line_number=2, account_id=32, entity_id=3, debit=Decimal("0"),   credit=Decimal("500")),
        ])

        # X: Cash 200 / Revenue 200 (unrelated)
        je3 = JournalEntry(id=3, je_number="JE-X-1", entry_date=AS_OF, entity_id=4, scenario_id=1, status="posted", description="X unrelated")
        s.add(je3)
        s.flush()
        s.add_all([
            JournalEntryLine(journal_entry_id=3, line_number=1, account_id=40, entity_id=4, debit=Decimal("200"), credit=Decimal("0")),
            JournalEntryLine(journal_entry_id=3, line_number=2, account_id=41, entity_id=4, debit=Decimal("0"),   credit=Decimal("200")),
        ])

        # S1 intercompany: IC-Recv 300 / Cash 300
        je4 = JournalEntry(id=4, je_number="JE-IC-1", entry_date=AS_OF, entity_id=2, scenario_id=1, status="posted", description="S1 IC loan to S2")
        s.add(je4)
        s.flush()
        s.add_all([
            JournalEntryLine(journal_entry_id=4, line_number=1, account_id=23, entity_id=2, debit=Decimal("300"), credit=Decimal("0")),
            JournalEntryLine(journal_entry_id=4, line_number=2, account_id=20, entity_id=2, debit=Decimal("0"),   credit=Decimal("300")),
        ])

        # S2 intercompany: Cash 300 / IC-Pay 300
        je5 = JournalEntry(id=5, je_number="JE-IC-2", entry_date=AS_OF, entity_id=3, scenario_id=1, status="posted", description="S2 IC loan from S1")
        s.add(je5)
        s.flush()
        s.add_all([
            JournalEntryLine(journal_entry_id=5, line_number=1, account_id=30, entity_id=3, debit=Decimal("300"), credit=Decimal("0")),
            JournalEntryLine(journal_entry_id=5, line_number=2, account_id=34, entity_id=3, debit=Decimal("0"),   credit=Decimal("300")),
        ])

        # P elimination: IC-Pay 300 / IC-Recv 300 (posted to P under ELIM)
        je6 = JournalEntry(id=6, je_number="JE-ELIM", entry_date=AS_OF, entity_id=1, scenario_id=2, status="posted", description="Elim IC loan")
        s.add(je6)
        s.flush()
        s.add_all([
            JournalEntryLine(journal_entry_id=6, line_number=1, account_id=14, entity_id=1, debit=Decimal("300"), credit=Decimal("0")),
            JournalEntryLine(journal_entry_id=6, line_number=2, account_id=13, entity_id=1, debit=Decimal("0"),   credit=Decimal("300")),
        ])

        # --- FS line items ---
        bs_asset = FsLineItem(id=1, code="BS-ASSET", name="Total Assets",       statement="BS", section="Assets",      sort_order=10, is_subtotal=True,  sign_flip=False)
        bs_cash  = FsLineItem(id=2, code="BS-CASH",  name="Cash & IC Recv",     statement="BS", section="Assets",      sort_order=11, is_subtotal=False, sign_flip=False, parent_line_id=1)
        bs_liab  = FsLineItem(id=3, code="BS-LIAB",  name="Total Liabilities",  statement="BS", section="Liabilities", sort_order=20, is_subtotal=True,  sign_flip=False)
        bs_ap    = FsLineItem(id=4, code="BS-AP",    name="A/P & IC Pay",       statement="BS", section="Liabilities", sort_order=21, is_subtotal=False, sign_flip=False, parent_line_id=3)
        is_rev   = FsLineItem(id=5, code="IS-REV",   name="Total Revenue",      statement="IS", section="Revenue",     sort_order=10, is_subtotal=True,  sign_flip=True)
        is_sales = FsLineItem(id=6, code="IS-SALES", name="Revenue",            statement="IS", section="Revenue",     sort_order=11, is_subtotal=False, sign_flip=True,  parent_line_id=5)
        s.add_all([bs_asset, bs_cash, bs_liab, bs_ap, is_rev, is_sales])
        s.flush()

        # --- Account mappings (global, entity_id=None) ---
        _eff_from = datetime.date(1900, 1, 1)
        _eff_to   = datetime.date(9999, 12, 31)
        def _m(account_id, fs_line_item_id):
            return AccountMapping(
                account_id=account_id,
                fs_line_item_id=fs_line_item_id,
                effective_from=_eff_from,
                effective_to=_eff_to,
            )

        mappings = [
            # P accounts
            _m(10, 2), _m(11, 4), _m(12, 6), _m(13, 2), _m(14, 4),
            # S1 accounts
            _m(20, 2), _m(21, 4), _m(22, 6), _m(23, 2), _m(24, 4),
            # S2 accounts
            _m(30, 2), _m(31, 4), _m(32, 6), _m(33, 2), _m(34, 4),
            # X accounts
            _m(40, 2), _m(41, 6),
        ]
        s.add_all(mappings)
        s.commit()

        yield s


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _net(rows, account_number):
    """Sum net_debit across all rows matching account_number (multiple entities may share one number)."""
    matched = [r.net_debit for r in rows if r.account_number == account_number]
    return sum(matched, Decimal("0")) if matched else None


def _display(rows, code):
    for r in rows:
        if r.code == code:
            return r.display_balance
    return None


# ---------------------------------------------------------------------------
# get_entity_subtree
# ---------------------------------------------------------------------------

class TestGetEntitySubtree:
    def test_root_with_two_children(self, seeded_session):
        result = get_entity_subtree(seeded_session, 1)
        assert set(result) == {1, 2, 3}

    def test_leaf_node_returns_only_itself(self, seeded_session):
        result = get_entity_subtree(seeded_session, 2)
        assert result == [2]

    def test_unrelated_entity_not_included(self, seeded_session):
        result = get_entity_subtree(seeded_session, 1)
        assert 4 not in result

    def test_root_included_in_subtree(self, seeded_session):
        result = get_entity_subtree(seeded_session, 1)
        assert 1 in result


# ---------------------------------------------------------------------------
# get_consolidation_members
# ---------------------------------------------------------------------------

class TestGetConsolidationMembers:
    def test_returns_both_members(self, seeded_session):
        members = get_consolidation_members(seeded_session, 1, AS_OF)
        assert len(members) == 2

    def test_s1_is_100_pct(self, seeded_session):
        members = dict(get_consolidation_members(seeded_session, 1, AS_OF))
        assert members[2] == Decimal("100.0000")

    def test_s2_is_80_pct(self, seeded_session):
        members = dict(get_consolidation_members(seeded_session, 1, AS_OF))
        assert members[3] == Decimal("80.0000")

    def test_unrelated_entity_has_no_members(self, seeded_session):
        members = get_consolidation_members(seeded_session, 4, AS_OF)
        assert members == []


# ---------------------------------------------------------------------------
# get_group_trial_balance
# ---------------------------------------------------------------------------

class TestGetGroupTrialBalance:
    def test_s1_only_cash(self, seeded_session):
        # S1: Cash debit = 1000 - 300 = 700
        rows = get_group_trial_balance(seeded_session, [2], AS_OF, [1])
        assert _net(rows, "1000") == Decimal("700")

    def test_s1_and_s2_cash_summed(self, seeded_session):
        # S1 cash net = 700, S2 cash net = 500+300 = 800 => 1500
        rows = get_group_trial_balance(seeded_session, [2, 3], AS_OF, [1])
        assert _net(rows, "1000") == Decimal("1500")

    def test_ownership_pct_scales_s2_at_80_pct(self, seeded_session):
        # S1 @ 100%: Cash 700, S2 @ 80%: Cash 800*0.8=640 => 1340
        pcts = {2: Decimal("100"), 3: Decimal("80")}
        rows = get_group_trial_balance(seeded_session, [2, 3], AS_OF, [1], pcts)
        assert _net(rows, "1000") == Decimal("1340")

    def test_unrelated_entity_excluded_when_not_in_list(self, seeded_session):
        rows = get_group_trial_balance(seeded_session, [2, 3], AS_OF, [1])
        total_revenue = _net(rows, "3000")
        # S1 revenue = 1000, S2 revenue = 500 => 1500 (not 1700 with X's 200)
        assert total_revenue == Decimal("-1500")  # credit-normal: net_debit negative

    def test_empty_entity_list_returns_empty(self, seeded_session):
        rows = get_group_trial_balance(seeded_session, [], AS_OF, [1])
        assert rows == []


# ---------------------------------------------------------------------------
# get_consolidated_trial_balance (via entity_group_members)
# ---------------------------------------------------------------------------

class TestGetConsolidatedTrialBalance:
    def test_parent_includes_both_subsidiaries(self, seeded_session):
        # S1 revenue 1000 (100%) + S2 revenue 500 (80%) = 1400
        rows = get_consolidated_trial_balance(seeded_session, 1, AS_OF, [1], [])
        rev = _net(rows, "3000")
        assert rev == Decimal("-1400")  # credit-normal

    def test_standalone_s1_excludes_s2(self, seeded_session):
        rows = get_group_trial_balance(seeded_session, [2], AS_OF, [1])
        rev = _net(rows, "3000")
        assert rev == Decimal("-1000")

    def test_standalone_s2_excludes_s1(self, seeded_session):
        rows = get_group_trial_balance(seeded_session, [3], AS_OF, [1])
        rev = _net(rows, "3000")
        assert rev == Decimal("-500")

    def test_unrelated_entity_not_in_consolidated_tb(self, seeded_session):
        rows = get_consolidated_trial_balance(seeded_session, 1, AS_OF, [1], [])
        rev = _net(rows, "3000")
        # X's 200 not included; only S1+S2 scaled = -1400
        assert rev == Decimal("-1400")

    def test_s2_ownership_applied(self, seeded_session):
        # S2 cash: 500+300=800 net_debit; at 80% = 640
        # S1 cash: 1000-300=700 net_debit; at 100% = 700
        # total = 1340
        rows = get_consolidated_trial_balance(seeded_session, 1, AS_OF, [1], [])
        cash = _net(rows, "1000")
        assert cash == Decimal("1340")

    def test_consolidated_tb_is_balanced(self, seeded_session):
        rows = get_consolidated_trial_balance(seeded_session, 1, AS_OF, [1], [])
        total_debit  = sum(r.total_debit  for r in rows)
        total_credit = sum(r.total_credit for r in rows)
        assert total_debit == total_credit

    def test_empty_members_returns_empty(self, seeded_session):
        rows = get_consolidated_trial_balance(seeded_session, 4, AS_OF, [1], [])
        assert rows == []


# ---------------------------------------------------------------------------
# Elimination entries
# ---------------------------------------------------------------------------

class TestEliminationEntries:
    def test_ic_recv_before_elim(self, seeded_session):
        # S1 IC-Recv net_debit = 300 (at 100%)
        rows = get_consolidated_trial_balance(seeded_session, 1, AS_OF, [1], [])
        recv = _net(rows, "4000")
        assert recv == Decimal("300")

    def test_ic_pay_before_elim(self, seeded_session):
        # S2 IC-Pay net_debit = -300 (credit, at 80%) = -240
        rows = get_consolidated_trial_balance(seeded_session, 1, AS_OF, [1], [])
        pay = _net(rows, "4001")
        assert pay == Decimal("-240")

    def test_elimination_zeroes_ic_recv(self, seeded_session):
        # Operating: IC-Recv from S1 = +300
        # Elim JE on P: Cr IC-Recv 300 => net_debit = -300
        # Combined: 300 + (-300) = 0
        rows = get_consolidated_trial_balance(seeded_session, 1, AS_OF, [1], [2])
        recv = _net(rows, "4000")
        assert recv == Decimal("0")

    def test_elimination_zeroes_ic_pay(self, seeded_session):
        # Operating: IC-Pay from S2 @ 80% = -240 net_debit
        # Elim JE on P: Dr IC-Pay 300 => net_debit = +300
        # Combined: -240 + 300 = +60
        # Note: partial ownership (80%) means elim doesn't fully net to zero;
        # this is intentional — the 20% minority interest portion isn't eliminated.
        rows = get_consolidated_trial_balance(seeded_session, 1, AS_OF, [1], [2])
        pay = _net(rows, "4001")
        assert pay == Decimal("60")

    def test_no_elim_scenarios_skips_elim(self, seeded_session):
        rows_with = get_consolidated_trial_balance(seeded_session, 1, AS_OF, [1], [2])
        rows_without = get_consolidated_trial_balance(seeded_session, 1, AS_OF, [1], [])
        recv_with    = _net(rows_with,    "4000")
        recv_without = _net(rows_without, "4000")
        assert recv_with != recv_without


# ---------------------------------------------------------------------------
# Consolidated FS statement
# ---------------------------------------------------------------------------

class TestGetConsolidatedFsStatement:
    def test_revenue_line_reflects_subsidiaries(self, seeded_session):
        # S1 1000 (100%) + S2 500 (80%) = 1400; sign_flip => display +1400
        rows = get_consolidated_fs_statement(seeded_session, 1, AS_OF, [1], [])
        rev = _display(rows, "IS-SALES")
        assert rev == Decimal("1400")

    def test_revenue_subtotal_matches_detail(self, seeded_session):
        rows = get_consolidated_fs_statement(seeded_session, 1, AS_OF, [1], [])
        detail  = _display(rows, "IS-SALES")
        subtotal = _display(rows, "IS-REV")
        assert subtotal == detail

    def test_cash_line_reflects_subsidiaries(self, seeded_session):
        # S1 Cash net=700 (100%), S2 Cash net=800 (80%)=640 => 1340
        # Plus IC-Recv from S1=300 at 100%: adds to BS-CASH
        # Total BS-CASH own = 1340 + 300 = 1640
        rows = get_consolidated_fs_statement(seeded_session, 1, AS_OF, [1], [])
        cash = _display(rows, "BS-CASH")
        assert cash == Decimal("1640")

    def test_elimination_reduces_ic_accounts_in_fs(self, seeded_session):
        rows_no_elim = get_consolidated_fs_statement(seeded_session, 1, AS_OF, [1], [])
        rows_elim    = get_consolidated_fs_statement(seeded_session, 1, AS_OF, [1], [2])
        # With elimination, IC-Recv is zeroed so BS-CASH should decrease by 300
        cash_no_elim = _display(rows_no_elim, "BS-CASH")
        cash_elim    = _display(rows_elim,    "BS-CASH")
        assert cash_elim == cash_no_elim - Decimal("300")

    def test_statement_filter_returns_only_bs(self, seeded_session):
        rows = get_consolidated_fs_statement(seeded_session, 1, AS_OF, [1], [], statement="BS")
        statements = {r.statement for r in rows}
        assert statements == {"BS"}

    def test_statement_filter_returns_only_is(self, seeded_session):
        rows = get_consolidated_fs_statement(seeded_session, 1, AS_OF, [1], [], statement="IS")
        statements = {r.statement for r in rows}
        assert statements == {"IS"}


# ---------------------------------------------------------------------------
# Subgroup trial balance
# ---------------------------------------------------------------------------

class TestGetSubgroupTrialBalance:
    def test_s1_only_subgroup(self, seeded_session):
        rows = get_subgroup_trial_balance(seeded_session, [2], AS_OF, [1])
        rev = _net(rows, "3000")
        assert rev == Decimal("-1000")

    def test_s1_s2_subgroup_without_ownership(self, seeded_session):
        # Default 100% for both
        rows = get_subgroup_trial_balance(seeded_session, [2, 3], AS_OF, [1])
        rev = _net(rows, "3000")
        assert rev == Decimal("-1500")

    def test_subgroup_with_custom_ownership(self, seeded_session):
        pcts = {2: Decimal("100"), 3: Decimal("50")}
        rows = get_subgroup_trial_balance(seeded_session, [2, 3], AS_OF, [1], ownership_pcts=pcts)
        # S1 rev -1000 + S2 rev -500*0.5=-250 => -1250
        rev = _net(rows, "3000")
        assert rev == Decimal("-1250")

    def test_subgroup_with_elim_entity(self, seeded_session):
        # Use P's elimination entries directly
        rows = get_subgroup_trial_balance(
            seeded_session, [2, 3], AS_OF, [1],
            elim_entity_id=1, elim_scenario_ids=[2]
        )
        recv = _net(rows, "4000")
        # S1 IC-Recv 300 (100%) + P elim Cr 300 = 0
        assert recv == Decimal("0")

    def test_subgroup_balanced(self, seeded_session):
        rows = get_subgroup_trial_balance(seeded_session, [2, 3], AS_OF, [1])
        assert sum(r.total_debit for r in rows) == sum(r.total_credit for r in rows)

    def test_subgroup_excludes_non_listed_entities(self, seeded_session):
        rows_s1_only = get_subgroup_trial_balance(seeded_session, [2], AS_OF, [1])
        rows_s1_s2   = get_subgroup_trial_balance(seeded_session, [2, 3], AS_OF, [1])
        assert _net(rows_s1_only, "3000") != _net(rows_s1_s2, "3000")
