"""
Comparative Report Service — M25

Builds period-over-period and actual-vs-overlay comparative reports
with amount and percentage variance calculations.

Report types:
  income_statement — Revenue and Expense accounts grouped by type
  balance_sheet    — Asset, Liability, Equity accounts

Variance:
  amount_variance = current - prior
  pct_variance    = (current - prior) / |prior|  (None when prior = 0)
  is_material     = |amount_variance| >= materiality_threshold
"""

from __future__ import annotations

import datetime
from dataclasses import dataclass, field
from decimal import Decimal, ROUND_HALF_UP
from typing import Optional

from sqlalchemy.orm import Session
from sqlalchemy import func

from app.models.account import Account
from app.models.accounting_period import AccountingPeriod
from app.models.journal_entry import JournalEntry
from app.models.journal_entry_line import JournalEntryLine


# ---------------------------------------------------------------------------
# Data structures
# ---------------------------------------------------------------------------

@dataclass
class ComparativeLineItem:
    account_id: int
    account_number: str
    account_name: str
    account_type: str
    current_amount: Decimal
    prior_amount: Decimal
    amount_variance: Decimal
    pct_variance: Optional[Decimal]   # None when prior = 0
    is_material: bool


@dataclass
class ComparativeSection:
    section: str              # e.g. "Revenue", "Expense", "Asset"
    lines: list[ComparativeLineItem] = field(default_factory=list)

    @property
    def current_total(self) -> Decimal:
        return sum((l.current_amount for l in self.lines), Decimal(0))

    @property
    def prior_total(self) -> Decimal:
        return sum((l.prior_amount for l in self.lines), Decimal(0))

    @property
    def variance_total(self) -> Decimal:
        return self.current_total - self.prior_total


@dataclass
class ComparativeReport:
    report_type: str
    entity_id: int
    current_period_id: int
    comparison_period_id: int
    current_period_name: str
    comparison_period_name: str
    scenario_id: Optional[int]
    materiality_threshold: Decimal
    sections: list[ComparativeSection] = field(default_factory=list)
    generated_at: str = ""

    @property
    def material_variances(self) -> list[ComparativeLineItem]:
        return [
            line
            for section in self.sections
            for line in section.lines
            if line.is_material
        ]


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

_IS_SECTIONS = ["revenue", "expense"]
_BS_SECTIONS = ["asset", "liability", "equity"]


def _get_period_balances(
    db: Session,
    entity_id: int,
    scenario_id: int | None,
    start_date: datetime.date,
    end_date: datetime.date,
    account_types: list[str],
) -> dict[int, tuple[Account, Decimal]]:
    """
    Returns {account_id: (account, net_amount)} where net_amount is expressed
    as the natural-sign amount for reporting:
      - Revenue/Liability/Equity: net credit (credit - debit, positive = normal)
      - Asset/Expense: net debit (debit - credit, positive = normal)
    """
    rows = (
        db.query(
            Account,
            func.sum(JournalEntryLine.debit - JournalEntryLine.credit).label("net_debit"),
        )
        .join(JournalEntryLine, JournalEntryLine.account_id == Account.id)
        .join(JournalEntry, JournalEntryLine.journal_entry_id == JournalEntry.id)
        .filter(
            JournalEntryLine.entity_id == entity_id,
            JournalEntry.entry_date >= start_date,
            JournalEntry.entry_date <= end_date,
            JournalEntry.status == "posted",
            Account.account_type.in_(account_types),
        )
        .group_by(Account.id)
    )
    if scenario_id is not None:
        rows = rows.filter(JournalEntry.scenario_id == scenario_id)

    result: dict[int, tuple[Account, Decimal]] = {}
    for acct, net_debit in rows.all():
        nd = Decimal(str(net_debit or 0))
        # Flip sign for credit-normal accounts so positive = favorable
        if acct.account_type in ("revenue", "liability", "equity"):
            amount = -nd   # credit normal: positive credit = positive amount
        else:
            amount = nd    # debit normal: positive debit = positive amount
        result[acct.id] = (acct, amount)

    return result


def _compute_variance(current: Decimal, prior: Decimal) -> tuple[Decimal, Optional[Decimal]]:
    amount_var = current - prior
    if prior == 0:
        pct_var = None
    else:
        pct_var = (amount_var / abs(prior) * 100).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    return amount_var, pct_var


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def build_comparative_report(
    db: Session,
    entity_id: int,
    current_period_id: int,
    comparison_period_id: int,
    report_type: str = "income_statement",
    scenario_id: int | None = None,
    materiality_threshold: Decimal = Decimal("1000"),
) -> ComparativeReport:
    """
    Build a period-over-period comparative report.

    Parameters
    ----------
    report_type : "income_statement" | "balance_sheet"
    materiality_threshold : flag variances >= this amount
    """
    current_period = db.get(AccountingPeriod, current_period_id)
    comparison_period = db.get(AccountingPeriod, comparison_period_id)

    if current_period is None:
        raise ValueError(f"Current period id={current_period_id} not found")
    if comparison_period is None:
        raise ValueError(f"Comparison period id={comparison_period_id} not found")

    account_types = _IS_SECTIONS if report_type == "income_statement" else _BS_SECTIONS

    current_balances = _get_period_balances(
        db, entity_id, scenario_id,
        current_period.start_date, current_period.end_date,
        account_types,
    )
    prior_balances = _get_period_balances(
        db, entity_id, scenario_id,
        comparison_period.start_date, comparison_period.end_date,
        account_types,
    )

    # Collect all account IDs
    all_account_ids = set(current_balances) | set(prior_balances)

    # Group by account_type
    sections_map: dict[str, ComparativeSection] = {}
    for atype in account_types:
        sections_map[atype] = ComparativeSection(section=atype.capitalize())

    # Fetch all accounts referenced
    all_accounts: dict[int, Account] = {}
    for aid, (acct, _) in current_balances.items():
        all_accounts[aid] = acct
    for aid, (acct, _) in prior_balances.items():
        all_accounts.setdefault(aid, acct)

    for account_id in sorted(all_account_ids):
        acct = all_accounts.get(account_id)
        if acct is None:
            continue
        current_amt = current_balances.get(account_id, (acct, Decimal(0)))[1]
        prior_amt = prior_balances.get(account_id, (acct, Decimal(0)))[1]
        amount_var, pct_var = _compute_variance(current_amt, prior_amt)

        line = ComparativeLineItem(
            account_id=account_id,
            account_number=acct.account_number,
            account_name=acct.account_name,
            account_type=acct.account_type,
            current_amount=current_amt,
            prior_amount=prior_amt,
            amount_variance=amount_var,
            pct_variance=pct_var,
            is_material=abs(amount_var) >= materiality_threshold,
        )
        section = sections_map.get(acct.account_type)
        if section:
            section.lines.append(line)

    # Sort lines within each section by account number
    for section in sections_map.values():
        section.lines.sort(key=lambda l: l.account_number)

    import datetime as dt
    report = ComparativeReport(
        report_type=report_type,
        entity_id=entity_id,
        current_period_id=current_period_id,
        comparison_period_id=comparison_period_id,
        current_period_name=current_period.period_name,
        comparison_period_name=comparison_period.period_name,
        scenario_id=scenario_id,
        materiality_threshold=materiality_threshold,
        sections=list(sections_map.values()),
        generated_at=dt.datetime.now(dt.timezone.utc).isoformat(),
    )

    return report


def get_comparable_periods(
    db: Session,
    entity_id: int,
    period_id: int,
    comparison_type: str = "prior_month",
) -> AccountingPeriod | None:
    """
    Find the comparison period for a given period.

    comparison_type: prior_month | prior_quarter | prior_year
    """
    period = db.get(AccountingPeriod, period_id)
    if period is None:
        return None

    if comparison_type == "prior_month":
        target_date = period.start_date - datetime.timedelta(days=1)
    elif comparison_type == "prior_quarter":
        target_date = period.start_date - datetime.timedelta(days=91)
    elif comparison_type == "prior_year":
        target_date = period.start_date.replace(year=period.start_date.year - 1)
    else:
        return None

    return (
        db.query(AccountingPeriod)
        .filter(
            AccountingPeriod.entity_id == entity_id,
            AccountingPeriod.start_date <= target_date,
            AccountingPeriod.end_date >= target_date,
            AccountingPeriod.period_type == period.period_type,
        )
        .first()
    )


def build_variance_summary(report: ComparativeReport) -> dict:
    """
    Summarize variance analysis for API response.
    Returns a dict suitable for JSON serialization.
    """
    def section_dict(s: ComparativeSection) -> dict:
        return {
            "section": s.section,
            "current_total": str(s.current_total),
            "prior_total": str(s.prior_total),
            "variance_total": str(s.variance_total),
            "lines": [
                {
                    "account_id": l.account_id,
                    "account_number": l.account_number,
                    "account_name": l.account_name,
                    "current_amount": str(l.current_amount),
                    "prior_amount": str(l.prior_amount),
                    "amount_variance": str(l.amount_variance),
                    "pct_variance": str(l.pct_variance) if l.pct_variance is not None else None,
                    "is_material": l.is_material,
                }
                for l in s.lines
            ],
        }

    return {
        "report_type": report.report_type,
        "entity_id": report.entity_id,
        "current_period_id": report.current_period_id,
        "comparison_period_id": report.comparison_period_id,
        "current_period_name": report.current_period_name,
        "comparison_period_name": report.comparison_period_name,
        "scenario_id": report.scenario_id,
        "materiality_threshold": str(report.materiality_threshold),
        "generated_at": report.generated_at,
        "sections": [section_dict(s) for s in report.sections],
        "material_variances_count": len(report.material_variances),
    }
