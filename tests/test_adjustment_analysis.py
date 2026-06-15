"""Tests for AdjustmentAnalysisService."""
import datetime
import pytest
from app.models.account import Account
from app.models.entity import Entity
from app.models.journal_entry import JournalEntry
from app.models.journal_entry_line import JournalEntryLine
from app.models.scenario import Scenario
from app.services.adjustment_analysis_service import AdjustmentAnalysisService

_CTR = [0]


def _uid():
    _CTR[0] += 1
    return _CTR[0]


@pytest.fixture
def entity(session):
    e = Entity(code=f"ADJ_{_uid()}", name="Adj Test Entity", entity_type="operating")
    session.add(e)
    session.flush()
    return e


@pytest.fixture
def scenario(session):
    s = Scenario(code=f"ADJ_ACT_{_uid()}", name="Actual", scenario_type="actual")
    session.add(s)
    session.flush()
    return s


@pytest.fixture
def accounts(session):
    rev = Account(account_number=f"4{_uid():03}", account_name="Revenue", account_type="revenue", normal_balance="credit")
    exp = Account(account_number=f"6{_uid():03}", account_name="Expense", account_type="expense", normal_balance="debit")
    cash = Account(account_number=f"1{_uid():03}", account_name="Cash", account_type="asset", normal_balance="debit")
    session.add_all([rev, exp, cash])
    session.flush()
    return {"revenue": rev, "expense": exp, "cash": cash}


def _make_je(session, entity, scenario, number, date, status, lines):
    je = JournalEntry(
        je_number=number,
        entry_date=date,
        entity_id=entity.id,
        scenario_id=scenario.id,
        description=f"Test JE {number}",
        source="manual",
        status=status,
    )
    session.add(je)
    session.flush()
    for i, (acct_id, debit, credit) in enumerate(lines, start=1):
        line = JournalEntryLine(
            journal_entry_id=je.id,
            line_number=i,
            account_id=acct_id,
            entity_id=entity.id,
            debit=debit,
            credit=credit,
            description="line",
        )
        session.add(line)
    session.flush()
    return je


DATE = datetime.date(2024, 6, 30)
AS_OF = "2024-06-30"


class TestAdjustmentAnalysisEmpty:
    def test_no_jes_returns_zero_counts(self, session, entity, scenario):
        report = AdjustmentAnalysisService.analyze(session, entity.id, AS_OF)
        assert report.total_draft == 0
        assert report.total_posted == 0
        assert report.total_amount_draft == 0.0
        assert report.total_amount_posted == 0.0
        assert report.patterns == []

    def test_entity_id_preserved(self, session, entity, scenario):
        report = AdjustmentAnalysisService.analyze(session, entity.id, AS_OF)
        assert report.entity_id == entity.id

    def test_as_of_date_preserved(self, session, entity, scenario):
        report = AdjustmentAnalysisService.analyze(session, entity.id, AS_OF)
        assert report.as_of_date == AS_OF


class TestAdjustmentAnalysisCounts:
    def test_counts_draft_and_posted_separately(self, session, entity, scenario, accounts):
        _make_je(session, entity, scenario, f"JE-D{_uid()}", DATE, "draft",
                 [(accounts["cash"].id, 1000, 0), (accounts["expense"].id, 0, 1000)])
        _make_je(session, entity, scenario, f"JE-P{_uid()}", DATE, "posted",
                 [(accounts["cash"].id, 500, 0), (accounts["expense"].id, 0, 500)])

        report = AdjustmentAnalysisService.analyze(session, entity.id, AS_OF)
        assert report.total_draft == 1
        assert report.total_posted == 1

    def test_voided_jes_excluded(self, session, entity, scenario, accounts):
        _make_je(session, entity, scenario, f"JE-V{_uid()}", DATE, "voided",
                 [(accounts["cash"].id, 1000, 0), (accounts["expense"].id, 0, 1000)])

        report = AdjustmentAnalysisService.analyze(session, entity.id, AS_OF)
        assert report.total_draft == 0
        assert report.total_posted == 0

    def test_future_jes_excluded(self, session, entity, scenario, accounts):
        future = datetime.date(2024, 12, 31)
        _make_je(session, entity, scenario, f"JE-FUT{_uid()}", future, "posted",
                 [(accounts["cash"].id, 1000, 0), (accounts["expense"].id, 0, 1000)])

        report = AdjustmentAnalysisService.analyze(session, entity.id, AS_OF)
        assert report.total_posted == 0


class TestPatternDetection:
    def test_revenue_concentration_pattern_triggered_at_3(self, session, entity, scenario, accounts):
        for i in range(3):
            _make_je(session, entity, scenario, f"JE-RC{_uid()}", DATE, "posted",
                     [(accounts["revenue"].id, 0, 10000), (accounts["cash"].id, 10000, 0)])

        report = AdjustmentAnalysisService.analyze(session, entity.id, AS_OF)
        codes = [p.code for p in report.patterns]
        assert "ADJ_REVENUE_CONCENTRATION" in codes

    def test_revenue_concentration_not_triggered_at_2(self, session, entity, scenario, accounts):
        for i in range(2):
            _make_je(session, entity, scenario, f"JE-RC2{_uid()}", DATE, "posted",
                     [(accounts["revenue"].id, 0, 10000), (accounts["cash"].id, 10000, 0)])

        report = AdjustmentAnalysisService.analyze(session, entity.id, AS_OF)
        codes = [p.code for p in report.patterns]
        assert "ADJ_REVENUE_CONCENTRATION" not in codes

    def test_unposted_backlog_triggered_at_3_drafts(self, session, entity, scenario, accounts):
        for i in range(3):
            _make_je(session, entity, scenario, f"JE-DRF{_uid()}", DATE, "draft",
                     [(accounts["expense"].id, 5000, 0), (accounts["cash"].id, 0, 5000)])

        report = AdjustmentAnalysisService.analyze(session, entity.id, AS_OF)
        codes = [p.code for p in report.patterns]
        assert "ADJ_UNPOSTED_BACKLOG" in codes

    def test_single_entry_dominance_triggered(self, session, entity, scenario, accounts):
        _make_je(session, entity, scenario, f"JE-BIG{_uid()}", DATE, "posted",
                 [(accounts["expense"].id, 90000, 0), (accounts["cash"].id, 0, 90000)])
        _make_je(session, entity, scenario, f"JE-SML{_uid()}", DATE, "posted",
                 [(accounts["expense"].id, 10000, 0), (accounts["cash"].id, 0, 10000)])

        report = AdjustmentAnalysisService.analyze(session, entity.id, AS_OF)
        codes = [p.code for p in report.patterns]
        assert "ADJ_SINGLE_ENTRY_DOMINANCE" in codes

    def test_large_ajes_populated_when_materiality_set(self, session, entity, scenario, accounts):
        _make_je(session, entity, scenario, f"JE-MAT{_uid()}", DATE, "posted",
                 [(accounts["expense"].id, 50000, 0), (accounts["cash"].id, 0, 50000)])

        report = AdjustmentAnalysisService.analyze(session, entity.id, AS_OF, materiality=40000)
        assert len(report.large_ajes) >= 1
        assert report.materiality_notes

    def test_large_ajes_empty_when_no_materiality(self, session, entity, scenario, accounts):
        _make_je(session, entity, scenario, f"JE-NM{_uid()}", DATE, "posted",
                 [(accounts["expense"].id, 50000, 0), (accounts["cash"].id, 0, 50000)])

        report = AdjustmentAnalysisService.analyze(session, entity.id, AS_OF, materiality=0)
        assert report.large_ajes == []
