"""Advisory analysis computation — Adjusted EBITDA / QoE / SBA / DSCR."""
from __future__ import annotations

from decimal import Decimal
from typing import Optional

from sqlalchemy.orm import Session

from app.models.account import Account
from app.models.adjustment_workspace import AdjustmentPackage, AdjustmentPackageMembership
from app.models.advisor_scenario import AdvisorScenario
from app.models.journal_entry import JournalEntry
from app.models.journal_entry_line import JournalEntryLine

# ---------------------------------------------------------------------------
# Account type sets (same conventions as adjustment_workspace router)
# ---------------------------------------------------------------------------

_INCOME_TYPES = {"revenue", "other_income"}
_EXPENSE_TYPES = {"cogs", "expense", "other_expense", "tax"}
_ASSET_TYPES = {"asset"}
_LIABILITY_TYPES = {"liability", "intercompany"}
_EQUITY_TYPES = {"equity"}

# ---------------------------------------------------------------------------
# Overlay group → human-readable category mapping
# ---------------------------------------------------------------------------

OVERLAY_CATEGORY: dict[str | None, str] = {
    "normalization": "Owner Compensation Normalization",
    "topside": "Non-Recurring Items",
    "elimination": "Personal Expense Addbacks",
    "reclassification": "Related-Party Adjustments",
    "accrual": "Accrual Adjustments",
    "audit_adjustment": "Audit Adjustments",
    "pro_forma": "Pro Forma Adjustments",
    "tax": "Tax Adjustments",
}
OVERLAY_CATEGORY_ORDER = [
    "normalization",
    "topside",
    "elimination",
    "reclassification",
    "accrual",
    "audit_adjustment",
    "pro_forma",
    "tax",
    None,
]

# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _compute_line_impact(lines_and_accounts: list) -> tuple[Decimal, Decimal, Decimal, Decimal]:
    """Returns (ni, asset, liability, equity)."""
    ni = asset = liability = equity = Decimal("0")
    for line, acct in lines_and_accounts:
        net = Decimal(str(line.debit)) - Decimal(str(line.credit))
        t = acct.account_type
        if t in _INCOME_TYPES:
            ni -= net
        elif t in _EXPENSE_TYPES:
            ni += net
        if t in _ASSET_TYPES:
            asset += net
        elif t in _LIABILITY_TYPES:
            liability += net
        elif t in _EQUITY_TYPES:
            equity += net
    return ni, asset, liability, equity


def _total_debit_for_je(db: Session, je_id: int) -> Decimal:
    from sqlalchemy import func
    result = (
        db.query(func.sum(JournalEntryLine.debit))
        .filter(JournalEntryLine.journal_entry_id == je_id)
        .scalar()
    )
    return Decimal(str(result or 0))


def _collect_je_ids_for_scenarios(
    db: Session,
    scenario_ids: list[int],
    entity_id: int,
    pkg_type_filter: Optional[str] = None,
) -> list[tuple[int, str, str]]:
    """
    Returns list of (je_id, package_name, package_type) for all included
    packages across the given advisor scenarios, filtered to entity_id.
    Optionally filter by package_type.
    """
    results: list[tuple[int, str, str]] = []
    seen_je_ids: set[int] = set()

    for scen_id in scenario_ids:
        scen = db.get(AdvisorScenario, scen_id)
        if scen is None:
            continue
        for asp in scen.packages:
            if not asp.included:
                continue
            pkg = db.get(AdjustmentPackage, asp.package_id)
            if pkg is None:
                continue
            if pkg_type_filter and pkg.package_type != pkg_type_filter:
                continue
            members = (
                db.query(AdjustmentPackageMembership.journal_entry_id)
                .filter(AdjustmentPackageMembership.package_id == pkg.id)
                .all()
            )
            raw_je_ids = [m[0] for m in members]
            if not raw_je_ids:
                continue
            entity_je_ids = [
                row[0]
                for row in db.query(JournalEntry.id)
                .filter(
                    JournalEntry.id.in_(raw_je_ids),
                    JournalEntry.entity_id == entity_id,
                )
                .all()
            ]
            for je_id in entity_je_ids:
                if je_id not in seen_je_ids:
                    seen_je_ids.add(je_id)
                    results.append((je_id, pkg.name, pkg.package_type))
    return results


def _build_line_item(db: Session, je_id: int, package_name: str, package_type: str) -> dict:
    je = db.get(JournalEntry, je_id)
    if je is None:
        return {}
    lines_and_accounts = (
        db.query(JournalEntryLine, Account)
        .join(Account, JournalEntryLine.account_id == Account.id)
        .filter(JournalEntryLine.journal_entry_id == je_id)
        .all()
    )
    ni, asset, liability, equity = _compute_line_impact(lines_and_accounts)
    return {
        "je_id": je_id,
        "je_number": je.je_number,
        "entry_date": str(je.entry_date),
        "description": je.description,
        "overlay_group": je.overlay_group,
        "package_name": package_name,
        "package_type": package_type,
        "ni_impact": ni,
        "ebitda_impact": ni,
        "asset_impact": asset,
        "liability_impact": liability,
        "equity_impact": equity,
        "amount": _total_debit_for_je(db, je_id),
    }


# ---------------------------------------------------------------------------
# Public computation functions
# ---------------------------------------------------------------------------

def compute_ebitda_bridge(
    db: Session,
    entity_id: int,
    scenario_ids: list[int],
    base_ebitda: Decimal = Decimal("0"),
) -> dict:
    """
    Compute an EBITDA bridge grouped by overlay_group category.

    Returns:
      base_ebitda, sections (category + items + subtotal), total_adjustments, adjusted_ebitda
    """
    je_tuples = _collect_je_ids_for_scenarios(db, scenario_ids, entity_id)

    # Group by overlay_group
    groups: dict[str | None, list[dict]] = {}
    for je_id, pkg_name, pkg_type in je_tuples:
        item = _build_line_item(db, je_id, pkg_name, pkg_type)
        if not item:
            continue
        og = item["overlay_group"]
        groups.setdefault(og, []).append(item)

    # Build sections in canonical order
    sections = []
    for og in OVERLAY_CATEGORY_ORDER:
        items = groups.get(og, [])
        if not items:
            continue
        subtotal = sum(i["ebitda_impact"] for i in items)
        sections.append({
            "category": OVERLAY_CATEGORY.get(og, "Other Adjustments"),
            "overlay_group": og,
            "items": items,
            "subtotal": subtotal,
        })
    # Any overlay_groups not in canonical order
    for og, items in groups.items():
        if og not in OVERLAY_CATEGORY_ORDER:
            subtotal = sum(i["ebitda_impact"] for i in items)
            sections.append({
                "category": OVERLAY_CATEGORY.get(og, "Other Adjustments"),
                "overlay_group": og,
                "items": items,
                "subtotal": subtotal,
            })

    total_adjustments = sum(s["subtotal"] for s in sections)
    return {
        "entity_id": entity_id,
        "base_ebitda": base_ebitda,
        "sections": sections,
        "total_adjustments": total_adjustments,
        "adjusted_ebitda": base_ebitda + total_adjustments,
    }


def compute_qoe_schedule(
    db: Session,
    entity_id: int,
    scenario_ids: list[int],
) -> dict:
    """QoE adjustment schedule — only qoe-typed packages."""
    je_tuples = _collect_je_ids_for_scenarios(
        db, scenario_ids, entity_id, pkg_type_filter="qoe"
    )
    items = []
    for je_id, pkg_name, pkg_type in je_tuples:
        item = _build_line_item(db, je_id, pkg_name, pkg_type)
        if item:
            items.append(item)

    total = sum(i["ebitda_impact"] for i in items)
    return {
        "entity_id": entity_id,
        "items": items,
        "total": total,
        "count": len(items),
    }


def compute_sba_addback(
    db: Session,
    entity_id: int,
    scenario_ids: list[int],
) -> dict:
    """SBA addback schedule — only sba-typed packages."""
    je_tuples = _collect_je_ids_for_scenarios(
        db, scenario_ids, entity_id, pkg_type_filter="sba"
    )
    items = []
    for je_id, pkg_name, pkg_type in je_tuples:
        item = _build_line_item(db, je_id, pkg_name, pkg_type)
        if item:
            items.append(item)

    total = sum(i["ebitda_impact"] for i in items)
    return {
        "entity_id": entity_id,
        "items": items,
        "total": total,
        "count": len(items),
        "note": "SBA 7(a) addbacks — expenses not expected to continue post-transfer",
    }


def compute_dscr(
    db: Session,
    entity_id: int,
    scenario_ids: list[int],
    base_ebitda: Decimal,
    annual_debt_service: Decimal,
) -> dict:
    """Compute DSCR from adjusted EBITDA + provided debt service."""
    bridge = compute_ebitda_bridge(db, entity_id, scenario_ids, base_ebitda)
    adjusted_ebitda = bridge["adjusted_ebitda"]
    dscr: Decimal | None = None
    if annual_debt_service != Decimal("0"):
        dscr = (adjusted_ebitda / annual_debt_service).quantize(Decimal("0.01"))

    if dscr is None:
        coverage_note = "No debt service provided"
    elif dscr >= Decimal("1.25"):
        coverage_note = "Strong coverage"
    elif dscr >= Decimal("1.0"):
        coverage_note = "Adequate coverage"
    else:
        coverage_note = "Below SBA threshold (1.25x)"

    return {
        "entity_id": entity_id,
        "adjusted_ebitda": adjusted_ebitda,
        "annual_debt_service": annual_debt_service,
        "dscr": dscr,
        "coverage_note": coverage_note,
    }


def export_to_excel(
    db: Session,
    entity_id: int,
    scenario_ids: list[int],
    base_ebitda: Decimal = Decimal("0"),
    annual_debt_service: Decimal = Decimal("0"),
) -> bytes:
    """Export all four analysis schedules as a multi-sheet Excel workbook."""
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill, Alignment

    bridge = compute_ebitda_bridge(db, entity_id, scenario_ids, base_ebitda)
    qoe = compute_qoe_schedule(db, entity_id, scenario_ids)
    sba = compute_sba_addback(db, entity_id, scenario_ids)
    dscr = compute_dscr(db, entity_id, scenario_ids, base_ebitda, annual_debt_service)

    wb = Workbook()

    HDR_FILL = PatternFill("solid", fgColor="1F3864")
    HDR_FONT = Font(bold=True, color="FFFFFF")
    SEC_FILL = PatternFill("solid", fgColor="D9E1F2")
    SEC_FONT = Font(bold=True)
    TOTAL_FONT = Font(bold=True)

    def _fmt(v) -> str:
        try:
            n = float(v)
            return f"{n:,.0f}"
        except (TypeError, ValueError):
            return str(v)

    # ── Sheet 1: EBITDA Bridge ─────────────────────────────────────────────
    ws1 = wb.active
    ws1.title = "EBITDA Bridge"
    headers = ["Category", "JE Number", "Date", "Description", "Package", "EBITDA Impact"]
    col_widths = [30, 14, 12, 55, 25, 16]
    for ci, (h, w) in enumerate(zip(headers, col_widths), 1):
        c = ws1.cell(1, ci, h)
        c.font = HDR_FONT
        c.fill = HDR_FILL
        ws1.column_dimensions[c.column_letter].width = w

    ri = 2
    ws1.cell(ri, 1, "Base EBITDA").font = TOTAL_FONT
    ws1.cell(ri, 6, _fmt(bridge["base_ebitda"])).font = TOTAL_FONT
    ri += 1

    for section in bridge["sections"]:
        ws1.cell(ri, 1, section["category"]).font = SEC_FONT
        ws1.cell(ri, 1).fill = SEC_FILL
        for col in range(2, 7):
            ws1.cell(ri, col).fill = SEC_FILL
        ri += 1
        for item in section["items"]:
            ws1.cell(ri, 1, "")
            ws1.cell(ri, 2, item["je_number"])
            ws1.cell(ri, 3, item["entry_date"])
            ws1.cell(ri, 4, item["description"])
            ws1.cell(ri, 5, item["package_name"])
            ws1.cell(ri, 6, _fmt(item["ebitda_impact"]))
            ri += 1
        c = ws1.cell(ri, 1, f"  {section['category']} Subtotal")
        c.font = TOTAL_FONT
        ws1.cell(ri, 6, _fmt(section["subtotal"])).font = TOTAL_FONT
        ri += 1

    ws1.cell(ri, 1, "Total Adjustments").font = TOTAL_FONT
    ws1.cell(ri, 6, _fmt(bridge["total_adjustments"])).font = TOTAL_FONT
    ri += 1
    ws1.cell(ri, 1, "Adjusted EBITDA").font = Font(bold=True, color="1F3864")
    ws1.cell(ri, 6, _fmt(bridge["adjusted_ebitda"])).font = Font(bold=True, color="1F3864")

    # ── Sheet 2: QoE Schedule ──────────────────────────────────────────────
    ws2 = wb.create_sheet("QoE Schedule")
    for ci, (h, w) in enumerate(zip(headers, col_widths), 1):
        c = ws2.cell(1, ci, h)
        c.font = HDR_FONT
        c.fill = HDR_FILL
        ws2.column_dimensions[c.column_letter].width = w
    ri = 2
    for item in qoe["items"]:
        ws2.cell(ri, 2, item["je_number"])
        ws2.cell(ri, 3, item["entry_date"])
        ws2.cell(ri, 4, item["description"])
        ws2.cell(ri, 5, item["package_name"])
        ws2.cell(ri, 6, _fmt(item["ebitda_impact"]))
        ri += 1
    ws2.cell(ri, 1, "QoE Total").font = TOTAL_FONT
    ws2.cell(ri, 6, _fmt(qoe["total"])).font = TOTAL_FONT

    # ── Sheet 3: SBA Addbacks ──────────────────────────────────────────────
    ws3 = wb.create_sheet("SBA Addbacks")
    for ci, (h, w) in enumerate(zip(headers, col_widths), 1):
        c = ws3.cell(1, ci, h)
        c.font = HDR_FONT
        c.fill = HDR_FILL
        ws3.column_dimensions[c.column_letter].width = w
    ri = 2
    for item in sba["items"]:
        ws3.cell(ri, 2, item["je_number"])
        ws3.cell(ri, 3, item["entry_date"])
        ws3.cell(ri, 4, item["description"])
        ws3.cell(ri, 5, item["package_name"])
        ws3.cell(ri, 6, _fmt(item["ebitda_impact"]))
        ri += 1
    ws3.cell(ri, 1, "SBA Addback Total").font = TOTAL_FONT
    ws3.cell(ri, 6, _fmt(sba["total"])).font = TOTAL_FONT

    # ── Sheet 4: DSCR ─────────────────────────────────────────────────────
    ws4 = wb.create_sheet("DSCR")
    ws4.column_dimensions["A"].width = 30
    ws4.column_dimensions["B"].width = 20
    rows = [
        ("Adjusted EBITDA", _fmt(dscr["adjusted_ebitda"])),
        ("Annual Debt Service", _fmt(dscr["annual_debt_service"])),
        ("DSCR", _fmt(dscr["dscr"]) if dscr["dscr"] is not None else "N/A"),
        ("Coverage Assessment", dscr["coverage_note"]),
    ]
    for ri, (label, value) in enumerate(rows, 1):
        ws4.cell(ri, 1, label).font = Font(bold=True)
        ws4.cell(ri, 2, value)

    from io import BytesIO
    buf = BytesIO()
    wb.save(buf)
    return buf.getvalue()
