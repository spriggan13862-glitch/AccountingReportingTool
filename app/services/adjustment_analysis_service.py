"""Adjustment pattern analysis for the Accounting Intelligence Engine."""
from __future__ import annotations
from dataclasses import dataclass, field
from sqlalchemy.orm import Session
from app.models.journal_entry import JournalEntry
from app.models.journal_entry_line import JournalEntryLine
from app.models.account import Account


@dataclass
class AjePattern:
    code: str
    title: str
    severity: str   # critical | high | moderate | low
    description: str
    count: int
    total_amount: float
    affected_je_ids: list[int] = field(default_factory=list)


@dataclass
class AjeSummary:
    je_id: int
    je_number: str
    description: str
    entry_date: str
    status: str
    amount: float


@dataclass
class AdjustmentReport:
    entity_id: int
    as_of_date: str
    total_draft: int
    total_posted: int
    total_amount_draft: float
    total_amount_posted: float
    patterns: list[AjePattern]
    large_revenue_ajes: list[AjeSummary]
    large_ajes: list[AjeSummary]
    concentration_warning: str | None
    materiality_notes: list[str]


def _je_debit_total(je: JournalEntry) -> float:
    return sum(float(l.debit or 0) for l in getattr(je, "_lines_cache", []))


class AdjustmentAnalysisService:

    @staticmethod
    def analyze(
        db: Session,
        entity_id: int,
        as_of_date: str,
        materiality: float = 0.0,
    ) -> AdjustmentReport:
        jes = (
            db.query(JournalEntry)
            .filter(
                JournalEntry.entity_id == entity_id,
                JournalEntry.entry_date <= as_of_date,
                JournalEntry.status.in_(["draft", "posted", "pending_approval"]),
            )
            .all()
        )

        je_ids = [je.id for je in jes]
        if je_ids:
            all_lines = db.query(JournalEntryLine).filter(JournalEntryLine.journal_entry_id.in_(je_ids)).all()
        else:
            all_lines = []

        lines_by_je: dict[int, list[JournalEntryLine]] = {}
        for line in all_lines:
            lines_by_je.setdefault(line.journal_entry_id, []).append(line)

        for je in jes:
            je._lines_cache = lines_by_je.get(je.id, [])

        draft_jes = [je for je in jes if je.status in ("draft", "pending_approval")]
        posted_jes = [je for je in jes if je.status == "posted"]

        patterns: list[AjePattern] = []
        large_revenue_ajes: list[AjeSummary] = []
        large_ajes: list[AjeSummary] = []
        materiality_notes: list[str] = []

        all_account_ids = {l.account_id for je in jes for l in getattr(je, "_lines_cache", [])}
        account_map: dict[int, Account] = {}
        if all_account_ids:
            accts = db.query(Account).filter(Account.id.in_(all_account_ids)).all()
            account_map = {a.id: a for a in accts}

        def account_type(acct_id: int) -> str:
            a = account_map.get(acct_id)
            return (a.account_type or "").lower() if a else ""

        # --- Pattern: Revenue adjustment concentration ---
        rev_jes: list[tuple[JournalEntry, float]] = []
        for je in posted_jes:
            rev_impact = 0.0
            for line in getattr(je, "_lines_cache", []):
                acct_t = account_type(line.account_id)
                if acct_t in ("revenue", "income"):
                    rev_impact += float(line.credit or 0) - float(line.debit or 0)
            if abs(rev_impact) > 0:
                rev_jes.append((je, rev_impact))
                if materiality > 0 and abs(rev_impact) >= materiality * 0.25:
                    large_revenue_ajes.append(AjeSummary(
                        je_id=je.id,
                        je_number=je.je_number,
                        description=je.description or "",
                        entry_date=str(je.entry_date),
                        status=je.status,
                        amount=rev_impact,
                    ))

        if len(rev_jes) >= 3:
            total_rev_adj = sum(abs(amt) for _, amt in rev_jes)
            patterns.append(AjePattern(
                code="ADJ_REVENUE_CONCENTRATION",
                title="Revenue Adjustment Concentration",
                severity="high" if len(rev_jes) >= 5 else "moderate",
                description=(
                    f"{len(rev_jes)} posted AJEs affect revenue accounts "
                    f"(total impact: ${total_rev_adj:,.0f}). "
                    "Review for completeness, cutoff, and proper authorization."
                ),
                count=len(rev_jes),
                total_amount=total_rev_adj,
                affected_je_ids=[je.id for je, _ in rev_jes],
            ))

        # --- Pattern: High draft AJE count ---
        if len(draft_jes) >= 3:
            total_draft_amt = sum(_je_debit_total(je) for je in draft_jes)
            patterns.append(AjePattern(
                code="ADJ_UNPOSTED_BACKLOG",
                title="Unposted AJE Backlog",
                severity="high" if len(draft_jes) >= 10 else "moderate",
                description=(
                    f"{len(draft_jes)} AJEs remain unposted "
                    f"(${total_draft_amt:,.0f} aggregate debit exposure). "
                    "Review and post or void before period close."
                ),
                count=len(draft_jes),
                total_amount=total_draft_amt,
                affected_je_ids=[je.id for je in draft_jes],
            ))

        # --- Pattern: Single large AJE ---
        total_posted_amt = sum(_je_debit_total(je) for je in posted_jes)
        if posted_jes and total_posted_amt > 0:
            largest = max(posted_jes, key=_je_debit_total)
            largest_amt = _je_debit_total(largest)
            pct = largest_amt / total_posted_amt
            if pct >= 0.50 and len(posted_jes) >= 2:
                patterns.append(AjePattern(
                    code="ADJ_SINGLE_ENTRY_DOMINANCE",
                    title="Single AJE Dominates Total",
                    severity="moderate",
                    description=(
                        f"{largest.je_number} represents {pct*100:.0f}% of total posted adjustments "
                        f"(${largest_amt:,.0f} of ${total_posted_amt:,.0f}). "
                        "Verify this entry has adequate support and approval."
                    ),
                    count=1,
                    total_amount=largest_amt,
                    affected_je_ids=[largest.id],
                ))

        # --- Large AJEs vs materiality ---
        if materiality > 0:
            for je in posted_jes:
                amt = _je_debit_total(je)
                if amt >= materiality:
                    large_ajes.append(AjeSummary(
                        je_id=je.id,
                        je_number=je.je_number,
                        description=je.description or "",
                        entry_date=str(je.entry_date),
                        status=je.status,
                        amount=amt,
                    ))
            if large_ajes:
                materiality_notes.append(
                    f"{len(large_ajes)} posted AJE(s) exceed materiality threshold of ${materiality:,.0f}"
                )

        concentration_warning: str | None = None
        if posted_jes and total_posted_amt > 0 and len(posted_jes) >= 2:
            biggest = max(posted_jes, key=_je_debit_total)
            biggest_amt = _je_debit_total(biggest)
            if biggest_amt / total_posted_amt >= 0.60:
                concentration_warning = (
                    f"{biggest.je_number} represents "
                    f"{biggest_amt / total_posted_amt * 100:.0f}% of all posted adjustments."
                )

        return AdjustmentReport(
            entity_id=entity_id,
            as_of_date=as_of_date,
            total_draft=len(draft_jes),
            total_posted=len(posted_jes),
            total_amount_draft=sum(_je_debit_total(je) for je in draft_jes),
            total_amount_posted=total_posted_amt,
            patterns=patterns,
            large_revenue_ajes=large_revenue_ajes[:10],
            large_ajes=large_ajes[:20],
            concentration_warning=concentration_warning,
            materiality_notes=materiality_notes,
        )
