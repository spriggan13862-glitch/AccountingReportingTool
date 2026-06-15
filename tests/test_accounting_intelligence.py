"""
Tests for accounting_intelligence_service — Sprint 3.12.

Covers:
- PeriodMetrics computation from journal entry data
- Rule evaluation: AR Growth > Revenue, Gross Margin Compression, Working Capital Deterioration
- run_detection() end-to-end
- compute_diagnostics()
- list_detected_issues()
- update_issue_status()
"""
import datetime
from decimal import Decimal

import pytest

from app.models.account import Account
from app.models.accounting_period import AccountingPeriod
from app.models.entity import Entity
from app.models.journal_entry import JournalEntry
from app.models.journal_entry_line import JournalEntryLine
from app.models.scenario import Scenario
from app.services import accounting_intelligence_service as svc


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

_COUNTER = [0]

@pytest.fixture
def entity(session):
    _COUNTER[0] += 1
    e = Entity(code=f"AI_{_COUNTER[0]}", name="AI Test Entity", entity_type="operating")
    session.add(e)
    session.flush()
    return e


@pytest.fixture
def scenario(session):
    _COUNTER[0] += 1
    s = Scenario(code=f"AI_ACT_{_COUNTER[0]}", name="Actual", scenario_type="actual")
    session.add(s)
    session.flush()
    return s


@pytest.fixture
def accounts(session):
    cash     = Account(account_number="1000", account_name="Cash",                account_type="asset",     normal_balance="debit")
    ar       = Account(account_number="1100", account_name="Accounts Receivable", account_type="asset",     normal_balance="debit")
    inv      = Account(account_number="1200", account_name="Inventory",           account_type="asset",     normal_balance="debit")
    ca_other = Account(account_number="1400", account_name="Prepaid Expenses",    account_type="asset",     normal_balance="debit")
    ppe      = Account(account_number="1600", account_name="PP&E",                account_type="asset",     normal_balance="debit")
    cl       = Account(account_number="2000", account_name="Accounts Payable",    account_type="liability", normal_balance="credit")
    ltd      = Account(account_number="2500", account_name="Long Term Debt",      account_type="liability", normal_balance="credit")
    equity   = Account(account_number="3000", account_name="Common Stock",        account_type="equity",    normal_balance="credit")
    revenue  = Account(account_number="4000", account_name="Revenue",             account_type="revenue",   normal_balance="credit")
    cogs     = Account(account_number="5000", account_name="Cost of Goods Sold",  account_type="cogs",      normal_balance="debit")
    salaries = Account(account_number="6000", account_name="Salaries and Wages",  account_type="expense",   normal_balance="debit")
    rent     = Account(account_number="6100", account_name="Rent Expense",        account_type="expense",   normal_balance="debit")

    session.add_all([cash, ar, inv, ca_other, ppe, cl, ltd, equity, revenue, cogs, salaries, rent])
    session.flush()
    return {
        "cash": cash, "ar": ar, "inv": inv, "ca_other": ca_other, "ppe": ppe,
        "cl": cl, "ltd": ltd, "equity": equity,
        "revenue": revenue, "cogs": cogs, "salaries": salaries, "rent": rent,
    }


def _period(session, entity, name, start, end, fy, fp):
    p = AccountingPeriod(
        entity_id=entity.id,
        period_name=name,
        start_date=start,
        end_date=end,
        fiscal_year=fy,
        fiscal_period=fp,
    )
    session.add(p)
    session.flush()
    return p


def _je(session, entity, scenario, date, lines):
    je = JournalEntry(
        je_number=f"TEST-{date.isoformat()}",
        entry_date=date,
        entity_id=entity.id,
        scenario_id=scenario.id,
        description="Test JE",
        source="test",
        status="posted",
    )
    session.add(je)
    session.flush()
    for acct, debit, credit in lines:
        line = JournalEntryLine(
            journal_entry_id=je.id,
            line_number=1,
            account_id=acct.id,
            entity_id=entity.id,
            debit=Decimal(str(debit)),
            credit=Decimal(str(credit)),
        )
        session.add(line)
    session.flush()
    return je


# ---------------------------------------------------------------------------
# Metrics computation
# ---------------------------------------------------------------------------

class TestComputeMetrics:
    def test_revenue_and_cogs(self, session, entity, scenario, accounts):
        period = _period(session, entity, "Q1 2024",
                         datetime.date(2024, 1, 1), datetime.date(2024, 3, 31), 2024, 1)
        a = accounts
        # Revenue 100k, COGS 60k
        _je(session, entity, scenario, datetime.date(2024, 1, 15), [
            (a["ar"],      100_000, 0),
            (a["revenue"], 0,       100_000),
        ])
        _je(session, entity, scenario, datetime.date(2024, 1, 20), [
            (a["cogs"], 60_000, 0),
            (a["cash"], 0,      60_000),
        ])
        m = svc._compute_metrics(session, entity.id, period, scenario.id)
        assert m.revenue == Decimal("100000")
        assert m.cogs == Decimal("60000")
        assert m.gross_profit == Decimal("40000")
        assert m.gross_margin_pct == Decimal("40.00")

    def test_balance_sheet_accounts(self, session, entity, scenario, accounts):
        period = _period(session, entity, "Q1 2024 BS",
                         datetime.date(2024, 2, 1), datetime.date(2024, 2, 28), 2024, 2)
        a = accounts
        _je(session, entity, scenario, datetime.date(2024, 2, 1), [
            (a["cash"], 50_000, 0),
            (a["ar"],   30_000, 0),
            (a["inv"],  20_000, 0),
            (a["cl"],   0,      40_000),
            (a["equity"], 0,    60_000),
        ])
        m = svc._compute_metrics(session, entity.id, period, scenario.id)
        assert m.cash == Decimal("50000")
        assert m.accounts_receivable == Decimal("30000")
        assert m.inventory == Decimal("20000")
        assert m.total_current_assets == Decimal("100000")  # cash + ar + inv
        assert m.total_current_liabilities == Decimal("40000")
        assert m.working_capital == Decimal("60000")
        assert m.current_ratio == Decimal("2.50")


# ---------------------------------------------------------------------------
# Detection rules
# ---------------------------------------------------------------------------

class TestDetectionRules:
    def _make_metrics(self, **overrides) -> svc.PeriodMetrics:
        defaults = dict(
            period_id=1, period_name="Current", start_date=datetime.date(2024, 1, 1),
            end_date=datetime.date(2024, 3, 31),
            revenue=Decimal("100000"), cogs=Decimal("60000"), gross_profit=Decimal("40000"),
            gross_margin_pct=Decimal("40.00"), total_expenses=Decimal("20000"),
            payroll_expense=Decimal("15000"), net_income=Decimal("20000"),
            cash=Decimal("50000"), accounts_receivable=Decimal("30000"),
            inventory=Decimal("20000"), total_current_assets=Decimal("100000"),
            total_assets=Decimal("200000"), total_current_liabilities=Decimal("40000"),
            total_liabilities=Decimal("80000"), total_debt=Decimal("50000"),
            total_equity=Decimal("120000"), working_capital=Decimal("60000"),
            current_ratio=Decimal("2.50"),
        )
        defaults.update(overrides)
        return svc.PeriodMetrics(**defaults)

    def test_ar_growth_exceeds_revenue_triggers(self):
        cur = self._make_metrics(revenue=Decimal("110000"), accounts_receivable=Decimal("60000"))
        pri = self._make_metrics(period_id=2, period_name="Prior",
                                 revenue=Decimal("100000"), accounts_receivable=Decimal("30000"))
        thresholds = {k: v for k, (_, v) in svc._DEFAULTS.items()}
        results = svc._rule_ar_growth_exceeds_revenue(cur, pri, thresholds)
        assert len(results) == 1
        assert results[0].issue_code == "AR_GROWTH_EXCEEDS_REVENUE"
        assert results[0].severity == "high"

    def test_ar_growth_no_trigger_when_within_threshold(self):
        cur = self._make_metrics(revenue=Decimal("120000"), accounts_receivable=Decimal("35000"))
        pri = self._make_metrics(period_id=2, period_name="Prior",
                                 revenue=Decimal("100000"), accounts_receivable=Decimal("30000"))
        thresholds = {k: v for k, (_, v) in svc._DEFAULTS.items()}
        results = svc._rule_ar_growth_exceeds_revenue(cur, pri, thresholds)
        assert len(results) == 0

    def test_gross_margin_compression_triggers(self):
        cur = self._make_metrics(gross_margin_pct=Decimal("35.00"))
        pri = self._make_metrics(period_id=2, period_name="Prior", gross_margin_pct=Decimal("40.00"))
        thresholds = {k: v for k, (_, v) in svc._DEFAULTS.items()}
        results = svc._rule_gross_margin_compression(cur, pri, thresholds)
        assert len(results) == 1
        assert results[0].issue_code == "GROSS_MARGIN_COMPRESSION"

    def test_gross_margin_no_trigger_when_within_threshold(self):
        cur = self._make_metrics(gross_margin_pct=Decimal("38.50"))
        pri = self._make_metrics(period_id=2, period_name="Prior", gross_margin_pct=Decimal("40.00"))
        thresholds = {k: v for k, (_, v) in svc._DEFAULTS.items()}
        results = svc._rule_gross_margin_compression(cur, pri, thresholds)
        assert len(results) == 0

    def test_working_capital_deterioration_triggers(self):
        cur = self._make_metrics(current_ratio=Decimal("1.10"))
        pri = self._make_metrics(period_id=2, period_name="Prior", current_ratio=Decimal("2.50"))
        thresholds = {k: v for k, (_, v) in svc._DEFAULTS.items()}
        results = svc._rule_working_capital_deterioration(cur, pri, thresholds)
        assert len(results) == 1
        assert results[0].severity in ("critical", "high")

    def test_cash_decline_positive_earnings_triggers(self):
        cur = self._make_metrics(cash=Decimal("30000"), net_income=Decimal("20000"))
        pri = self._make_metrics(period_id=2, period_name="Prior", cash=Decimal("50000"))
        thresholds = {k: v for k, (_, v) in svc._DEFAULTS.items()}
        results = svc._rule_cash_decline_positive_earnings(cur, pri, thresholds)
        assert len(results) == 1
        assert results[0].issue_code == "CASH_DECLINE_POSITIVE_EARNINGS"

    def test_cash_decline_no_trigger_when_earnings_negative(self):
        cur = self._make_metrics(cash=Decimal("30000"), net_income=Decimal("-5000"))
        pri = self._make_metrics(period_id=2, period_name="Prior", cash=Decimal("50000"))
        thresholds = {k: v for k, (_, v) in svc._DEFAULTS.items()}
        results = svc._rule_cash_decline_positive_earnings(cur, pri, thresholds)
        assert len(results) == 0

    def test_revenue_spike_triggers(self):
        cur = self._make_metrics(revenue=Decimal("140000"))
        pri = self._make_metrics(period_id=2, period_name="Prior", revenue=Decimal("100000"))
        thresholds = {k: v for k, (_, v) in svc._DEFAULTS.items()}
        results = svc._rule_revenue_spike(cur, pri, thresholds)
        assert len(results) == 1  # 40% > 25% threshold

    def test_debt_increase_triggers(self):
        cur = self._make_metrics(total_debt=Decimal("70000"))
        pri = self._make_metrics(period_id=2, period_name="Prior", total_debt=Decimal("50000"))
        thresholds = {k: v for k, (_, v) in svc._DEFAULTS.items()}
        results = svc._rule_debt_increase(cur, pri, thresholds)
        assert len(results) == 1  # 40% > 20%

    def test_payroll_growth_triggers(self):
        cur = self._make_metrics(payroll_expense=Decimal("20000"), revenue=Decimal("110000"))
        pri = self._make_metrics(period_id=2, period_name="Prior",
                                  payroll_expense=Decimal("15000"), revenue=Decimal("100000"))
        thresholds = {k: v for k, (_, v) in svc._DEFAULTS.items()}
        results = svc._rule_payroll_growth_exceeds_revenue(cur, pri, thresholds)
        assert len(results) == 1  # payroll +33%, revenue +10% → spread ~23pp

    def test_inventory_growth_triggers(self):
        cur = self._make_metrics(inventory=Decimal("40000"), revenue=Decimal("110000"))
        pri = self._make_metrics(period_id=2, period_name="Prior",
                                  inventory=Decimal("20000"), revenue=Decimal("100000"))
        thresholds = {k: v for k, (_, v) in svc._DEFAULTS.items()}
        results = svc._rule_inventory_growth_exceeds_sales(cur, pri, thresholds)
        assert len(results) == 1  # inv +100%, revenue +10%


# ---------------------------------------------------------------------------
# End-to-end run_detection
# ---------------------------------------------------------------------------

class TestRunDetection:
    def test_run_detection_with_ar_buildup(self, session, entity, scenario, accounts):
        a = accounts
        prior_period = _period(session, entity, "Q4 2023",
                                datetime.date(2023, 10, 1), datetime.date(2023, 12, 31), 2023, 4)
        current_period = _period(session, entity, "Q1 2024 RD",
                                  datetime.date(2024, 1, 1), datetime.date(2024, 3, 31), 2024, 11)

        # Prior period: Revenue 100k, AR 10k
        _je(session, entity, scenario, datetime.date(2023, 10, 15), [
            (a["cash"],    90_000, 0),
            (a["ar"],      10_000, 0),
            (a["revenue"], 0,      100_000),
        ])
        _je(session, entity, scenario, datetime.date(2023, 10, 20), [
            (a["cogs"], 60_000, 0),
            (a["cash"], 0,      60_000),
        ])

        # Current period: Revenue 110k (+10%), AR 60k (+500%) — AR buildup
        _je(session, entity, scenario, datetime.date(2024, 1, 15), [
            (a["cash"],    50_000, 0),
            (a["ar"],      60_000, 0),
            (a["revenue"], 0,      110_000),
        ])
        _je(session, entity, scenario, datetime.date(2024, 1, 20), [
            (a["cogs"], 65_000, 0),
            (a["cash"], 0,      65_000),
        ])

        issues = svc.run_detection(
            session, entity.id,
            current_period_id=current_period.id,
            comparison_period_id=prior_period.id,
            scenario_id=scenario.id,
            persist=True,
        )
        assert len(issues) >= 1
        codes = [i["issue_code"] for i in issues]
        assert "AR_GROWTH_EXCEEDS_REVENUE" in codes

    def test_run_detection_persists_and_list(self, session, entity, scenario, accounts):
        a = accounts
        prior_p = _period(session, entity, "Q4 2023 L",
                           datetime.date(2023, 7, 1), datetime.date(2023, 9, 30), 2023, 3)
        current_p = _period(session, entity, "Q1 2024 L",
                              datetime.date(2024, 4, 1), datetime.date(2024, 6, 30), 2024, 12)

        _je(session, entity, scenario, datetime.date(2023, 7, 1), [
            (a["revenue"], 0, 100_000),
            (a["ar"],      100_000, 0),
        ])
        _je(session, entity, scenario, datetime.date(2024, 4, 1), [
            (a["revenue"], 0, 200_000),
            (a["ar"],      200_000, 0),
        ])

        svc.run_detection(
            session, entity.id,
            current_period_id=current_p.id,
            comparison_period_id=prior_p.id,
            scenario_id=scenario.id,
            persist=True,
        )

        listed = svc.list_detected_issues(session, entity.id, current_period_id=current_p.id)
        assert len(listed) >= 1


# ---------------------------------------------------------------------------
# compute_diagnostics
# ---------------------------------------------------------------------------

class TestDiagnostics:
    def test_diagnostics_balance_check(self, session, entity, scenario, accounts):
        a = accounts
        period = _period(session, entity, "Diag Period",
                          datetime.date(2024, 5, 1), datetime.date(2024, 5, 31), 2024, 5)
        # Balanced entry: Asset = Equity
        _je(session, entity, scenario, datetime.date(2024, 5, 1), [
            (a["cash"],   100_000, 0),
            (a["equity"], 0,       100_000),
        ])

        result = svc.compute_diagnostics(session, entity.id, period.id, scenario.id)
        assert "balance_check" in result
        assert result["balance_check"]["balanced"] is True

    def test_diagnostics_gross_margin(self, session, entity, scenario, accounts):
        a = accounts
        period = _period(session, entity, "GM Period",
                          datetime.date(2024, 6, 1), datetime.date(2024, 6, 30), 2024, 6)
        _je(session, entity, scenario, datetime.date(2024, 6, 15), [
            (a["ar"],      200_000, 0),
            (a["revenue"], 0,       200_000),
        ])
        _je(session, entity, scenario, datetime.date(2024, 6, 16), [
            (a["cogs"], 80_000, 0),
            (a["cash"], 0,      80_000),
        ])

        result = svc.compute_diagnostics(session, entity.id, period.id, scenario.id)
        assert result["gross_margin_pct"] == "60.00"


# ---------------------------------------------------------------------------
# update_issue_status
# ---------------------------------------------------------------------------

class TestIssueStatus:
    def test_acknowledge_and_resolve(self, session, entity, scenario, accounts):
        a = accounts
        prior_p = _period(session, entity, "Q2 2023",
                           datetime.date(2023, 4, 1), datetime.date(2023, 6, 30), 2023, 2)
        current_p = _period(session, entity, "Q3 2024",
                              datetime.date(2024, 7, 1), datetime.date(2024, 9, 30), 2024, 3)

        _je(session, entity, scenario, datetime.date(2023, 4, 1), [
            (a["revenue"], 0, 100_000),
            (a["ar"],      100_000, 0),
        ])
        _je(session, entity, scenario, datetime.date(2024, 7, 1), [
            (a["revenue"], 0, 300_000),
            (a["ar"],      300_000, 0),
        ])

        issues = svc.run_detection(
            session, entity.id,
            current_period_id=current_p.id,
            comparison_period_id=prior_p.id,
            scenario_id=scenario.id,
            persist=True,
        )
        assert len(issues) >= 1
        issue_id = issues[0]["id"]

        acknowledged = svc.update_issue_status(session, issue_id, "acknowledged")
        assert acknowledged["status"] == "acknowledged"
        assert acknowledged["acknowledged_at"] is not None

        resolved = svc.update_issue_status(session, issue_id, "resolved")
        assert resolved["status"] == "resolved"
        assert resolved["resolved_at"] is not None


# ---------------------------------------------------------------------------
# _build_metrics_dict
# ---------------------------------------------------------------------------

class TestBuildMetricsDict:
    def _make_metrics(self, **kwargs):
        defaults = dict(
            period_id=1, period_name="Current",
            start_date=datetime.date(2024, 1, 1),
            end_date=datetime.date(2024, 12, 31),
        )
        return svc.PeriodMetrics(**{**defaults, **kwargs})

    def test_current_values_included(self):
        cur = self._make_metrics(revenue=Decimal("1000000"), cash=Decimal("50000"))
        pri = self._make_metrics(period_id=2, period_name="Prior", revenue=Decimal("800000"))
        d = svc._build_metrics_dict(cur, pri)
        assert d["revenue"] == 1_000_000.0
        assert d["cash"] == 50_000.0

    def test_pct_change_computed(self):
        cur = self._make_metrics(revenue=Decimal("1100000"))
        pri = self._make_metrics(period_id=2, period_name="Prior", revenue=Decimal("1000000"))
        d = svc._build_metrics_dict(cur, pri)
        assert "revenue_pct_change" in d
        assert abs(d["revenue_pct_change"] - 10.0) < 0.1

    def test_trend_labels(self):
        cur = self._make_metrics(revenue=Decimal("1100000"))
        pri = self._make_metrics(period_id=2, period_name="Prior", revenue=Decimal("1000000"))
        d = svc._build_metrics_dict(cur, pri)
        assert d.get("revenue_trend") == "increasing"

    def test_negative_cash_flag(self):
        cur = self._make_metrics(cash=Decimal("-5000"))
        pri = self._make_metrics(period_id=2, period_name="Prior")
        d = svc._build_metrics_dict(cur, pri)
        assert d.get("negative_cash_balance") is True

    def test_negative_equity_flag(self):
        cur = self._make_metrics(total_equity=Decimal("-10000"))
        pri = self._make_metrics(period_id=2, period_name="Prior")
        d = svc._build_metrics_dict(cur, pri)
        assert d.get("negative_equity") is True

    def test_cash_declining_with_positive_ni_flag(self):
        cur = self._make_metrics(cash=Decimal("30000"), net_income=Decimal("20000"))
        pri = self._make_metrics(period_id=2, period_name="Prior", cash=Decimal("50000"))
        d = svc._build_metrics_dict(cur, pri)
        assert d.get("cash_declining_with_positive_ni") is True

    def test_no_pct_change_when_prior_zero(self):
        cur = self._make_metrics(inventory=Decimal("10000"))
        pri = self._make_metrics(period_id=2, period_name="Prior", inventory=Decimal("0"))
        d = svc._build_metrics_dict(cur, pri)
        assert "inventory_pct_change" not in d


# ---------------------------------------------------------------------------
# run_detection() — single-period (no comparison)
# ---------------------------------------------------------------------------

class TestRunDetectionSinglePeriod:
    def _je_unique(self, session, entity, scenario, date, lines):
        import random
        import string
        suffix = ''.join(random.choices(string.ascii_uppercase + string.digits, k=6))
        je = JournalEntry(
            je_number=f"SP-{date.isoformat()}-{suffix}",
            entry_date=date,
            entity_id=entity.id,
            scenario_id=scenario.id,
            description="SP Test JE",
            source="test",
            status="posted",
        )
        session.add(je)
        session.flush()
        for i, (acct, debit, credit) in enumerate(lines, 1):
            session.add(JournalEntryLine(
                journal_entry_id=je.id, line_number=i,
                account_id=acct.id, entity_id=entity.id,
                debit=Decimal(str(debit)), credit=Decimal(str(credit)),
            ))
        session.flush()
        return je

    def test_single_period_does_not_raise(self, session, entity, scenario, accounts):
        a = accounts
        period = _period(session, entity, "SP Q1 2024",
                         datetime.date(2024, 1, 1), datetime.date(2024, 3, 31), 2024, 101)
        self._je_unique(session, entity, scenario, datetime.date(2024, 1, 15), [
            (a["ar"],      100_000, 0),
            (a["revenue"], 0,       100_000),
        ])
        issues = svc.run_detection(
            session, entity.id,
            current_period_id=period.id,
            comparison_period_id=None,
            scenario_id=scenario.id,
            persist=True,
        )
        assert isinstance(issues, list)

    def test_single_period_negative_cash_detected(self, session, entity, scenario, accounts):
        a = accounts
        period = _period(session, entity, "SP NegCash",
                         datetime.date(2024, 2, 1), datetime.date(2024, 2, 29), 2024, 102)
        # Debit expense, credit cash below zero (net cash negative)
        self._je_unique(session, entity, scenario, datetime.date(2024, 2, 15), [
            (a["salaries"], 200_000, 0),
            (a["cash"],     0,       200_000),
        ])
        issues = svc.run_detection(
            session, entity.id,
            current_period_id=period.id,
            comparison_period_id=None,
            scenario_id=scenario.id,
            persist=True,
        )
        codes = [i["issue_code"] for i in issues]
        assert "NEGATIVE_CASH_BALANCE" in codes or any("cash" in c.lower() for c in codes)


# ---------------------------------------------------------------------------
# run_detection() — repository rules integration
# ---------------------------------------------------------------------------

class TestRunDetectionRepositoryIntegration:
    def test_repository_rules_fire_on_triggered_metrics(self, session, entity, scenario, accounts):
        a = accounts
        prior_p = _period(session, entity, "Repo Prior",
                           datetime.date(2023, 1, 1), datetime.date(2023, 12, 31), 2023, 201)
        current_p = _period(session, entity, "Repo Current",
                              datetime.date(2024, 1, 1), datetime.date(2024, 12, 31), 2024, 202)

        # Prior: Revenue 1M, AR 100k (AR days ~37)
        _je(session, entity, scenario, datetime.date(2023, 6, 15), [
            (a["cash"],    900_000, 0),
            (a["ar"],      100_000, 0),
            (a["revenue"], 0,       1_000_000),
        ])
        _je(session, entity, scenario, datetime.date(2023, 6, 16), [
            (a["cogs"],    600_000, 0),
            (a["cash"],    0,       600_000),
        ])

        # Current: Revenue 1.1M (+10%), AR 500k (+400%) → AR buildup
        _je(session, entity, scenario, datetime.date(2024, 6, 15), [
            (a["cash"],    600_000, 0),
            (a["ar"],      500_000, 0),
            (a["revenue"], 0,       1_100_000),
        ])
        _je(session, entity, scenario, datetime.date(2024, 6, 16), [
            (a["cogs"],    660_000, 0),
            (a["cash"],    0,       660_000),
        ])

        issues = svc.run_detection(
            session, entity.id,
            current_period_id=current_p.id,
            comparison_period_id=prior_p.id,
            scenario_id=scenario.id,
            persist=True,
        )
        assert len(issues) >= 1
        codes = [i["issue_code"] for i in issues]
        # Hardcoded rule fires for AR buildup
        assert "AR_GROWTH_EXCEEDS_REVENUE" in codes

    def test_run_detection_returns_all_fields(self, session, entity, scenario, accounts):
        a = accounts
        prior_p = _period(session, entity, "Fields Prior",
                           datetime.date(2023, 3, 1), datetime.date(2023, 3, 31), 2023, 203)
        current_p = _period(session, entity, "Fields Current",
                              datetime.date(2024, 3, 1), datetime.date(2024, 3, 31), 2024, 204)

        _je(session, entity, scenario, datetime.date(2023, 3, 1), [
            (a["revenue"], 0, 100_000), (a["ar"], 100_000, 0),
        ])
        _je(session, entity, scenario, datetime.date(2024, 3, 1), [
            (a["revenue"], 0, 200_000), (a["ar"], 200_000, 0),
        ])

        issues = svc.run_detection(
            session, entity.id,
            current_period_id=current_p.id,
            comparison_period_id=prior_p.id,
            scenario_id=scenario.id,
            persist=True,
        )
        if issues:
            issue = issues[0]
            assert "issue_code" in issue
            assert "severity" in issue
            assert "title" in issue
            assert "status" in issue
            assert issue["status"] == "open"
