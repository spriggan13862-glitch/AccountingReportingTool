import datetime
import pytest
from sqlalchemy import inspect

from app.models import Account, Entity, JournalEntry, JournalEntryLine, Scenario


# ---------------------------------------------------------------------------
# Table existence
# ---------------------------------------------------------------------------

EXPECTED_TABLES = {
    "entities",
    "accounts",
    "scenarios",
    "journal_entries",
    "journal_entry_lines",
}


def test_all_tables_created(db_engine):
    tables = set(inspect(db_engine).get_table_names())
    assert EXPECTED_TABLES.issubset(tables), f"Missing tables: {EXPECTED_TABLES - tables}"


# ---------------------------------------------------------------------------
# Entity
# ---------------------------------------------------------------------------

def test_insert_entity(session):
    entity = Entity(code="US01", name="US Operations", entity_type="operating", currency="USD")
    session.add(entity)
    session.flush()
    assert entity.id is not None
    assert entity.active is True


def test_entity_self_referential_parent(session):
    parent = Entity(code="HOLDCO", name="HoldCo", entity_type="consolidation")
    child = Entity(code="SUB01", name="Subsidiary 1", entity_type="operating")
    session.add_all([parent, child])
    session.flush()
    child.parent_id = parent.id
    session.flush()
    assert child.parent_id == parent.id


# ---------------------------------------------------------------------------
# Account
# ---------------------------------------------------------------------------

def test_insert_account(session):
    acct = Account(
        account_number="1000",
        account_name="Cash",
        account_type="asset",
        normal_balance="debit",
    )
    session.add(acct)
    session.flush()
    assert acct.id is not None


def test_account_entity_specific(session):
    entity = Entity(code="CA01", name="Canada Ops", entity_type="operating", currency="CAD")
    session.add(entity)
    session.flush()
    acct = Account(
        account_number="4000",
        account_name="Revenue",
        account_type="revenue",
        normal_balance="credit",
        entity_id=entity.id,
    )
    session.add(acct)
    session.flush()
    assert acct.entity_id == entity.id


# ---------------------------------------------------------------------------
# Scenario
# ---------------------------------------------------------------------------

def test_insert_scenario(session):
    scenario = Scenario(code="ACTUAL", name="Actual", scenario_type="actual")
    session.add(scenario)
    session.flush()
    assert scenario.id is not None
    assert scenario.active is True


def test_all_seed_scenario_types(session):
    seeds = [
        ("ACT2", "Actual 2", "actual"),
        ("TOP2", "Topside 2", "topside"),
        ("PF2", "Pro-forma 2", "pro_forma"),
        ("EL2", "Elim 2", "elimination"),
        ("CV2", "Carveout 2", "carveout"),
        ("BUD2", "Budget 2", "budget"),
        ("FC2", "Forecast 2", "forecast"),
    ]
    for code, name, stype in seeds:
        session.add(Scenario(code=code, name=name, scenario_type=stype))
    session.flush()


# ---------------------------------------------------------------------------
# JournalEntry
# ---------------------------------------------------------------------------

def _make_entity(session, code):
    e = Entity(code=code, name=code, entity_type="operating")
    session.add(e)
    session.flush()
    return e


def _make_scenario(session, code):
    s = Scenario(code=code, name=code, scenario_type="actual")
    session.add(s)
    session.flush()
    return s


def test_insert_journal_entry(session):
    entity = _make_entity(session, "JE_E1")
    scenario = _make_scenario(session, "JE_S1")
    je = JournalEntry(
        je_number="JE-0001",
        entry_date=datetime.date(2024, 12, 31),
        entity_id=entity.id,
        scenario_id=scenario.id,
        description="Opening balance",
        source="tb_import",
        status="posted",
    )
    session.add(je)
    session.flush()
    assert je.id is not None


def test_journal_entry_reversal_ref(session):
    entity = _make_entity(session, "JE_E2")
    scenario = _make_scenario(session, "JE_S2")
    original = JournalEntry(
        je_number="JE-0002",
        entry_date=datetime.date(2024, 12, 31),
        entity_id=entity.id,
        scenario_id=scenario.id,
        description="Original",
        status="reversed",
    )
    session.add(original)
    session.flush()
    reversal = JournalEntry(
        je_number="JE-0003",
        entry_date=datetime.date(2025, 1, 1),
        entity_id=entity.id,
        scenario_id=scenario.id,
        description="Reversal of JE-0002",
        status="posted",
        reversal_of_id=original.id,
    )
    session.add(reversal)
    session.flush()
    assert reversal.reversal_of_id == original.id


# ---------------------------------------------------------------------------
# JournalEntryLine
# ---------------------------------------------------------------------------

def test_insert_balanced_journal_entry_lines(session):
    entity = _make_entity(session, "JEL_E1")
    scenario = _make_scenario(session, "JEL_S1")
    cash = Account(account_number="1001", account_name="Cash", account_type="asset", normal_balance="debit")
    revenue = Account(account_number="4001", account_name="Revenue", account_type="revenue", normal_balance="credit")
    session.add_all([cash, revenue])
    session.flush()

    je = JournalEntry(
        je_number="JE-0010",
        entry_date=datetime.date(2024, 6, 30),
        entity_id=entity.id,
        scenario_id=scenario.id,
        description="Revenue recognition",
        status="posted",
    )
    session.add(je)
    session.flush()

    lines = [
        JournalEntryLine(
            journal_entry_id=je.id, line_number=1,
            account_id=cash.id, entity_id=entity.id,
            debit=1000, credit=0,
        ),
        JournalEntryLine(
            journal_entry_id=je.id, line_number=2,
            account_id=revenue.id, entity_id=entity.id,
            debit=0, credit=1000,
        ),
    ]
    session.add_all(lines)
    session.flush()

    total_debit = sum(l.debit for l in lines)
    total_credit = sum(l.credit for l in lines)
    assert total_debit == total_credit == 1000


def test_je_line_cascade_delete(session):
    entity = _make_entity(session, "JEL_E2")
    scenario = _make_scenario(session, "JEL_S2")
    acct = Account(account_number="9999", account_name="Misc", account_type="expense", normal_balance="debit")
    session.add(acct)
    session.flush()

    je = JournalEntry(
        je_number="JE-0020",
        entry_date=datetime.date(2024, 1, 1),
        entity_id=entity.id,
        scenario_id=scenario.id,
        description="To be deleted",
        status="posted",
    )
    session.add(je)
    session.flush()

    line = JournalEntryLine(
        journal_entry_id=je.id, line_number=1,
        account_id=acct.id, entity_id=entity.id,
        debit=500, credit=0,
    )
    session.add(line)
    session.flush()
    line_id = line.id

    session.delete(je)
    session.flush()
    session.expire_all()  # clear identity map so the next get() hits the DB

    deleted = session.get(JournalEntryLine, line_id)
    assert deleted is None
