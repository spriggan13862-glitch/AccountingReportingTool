"""
Reporting taxonomy service.

Seeds the standard QB-compatible taxonomy and provides helpers for auto-mapping
account detail types and QuickBooks Tax Line values to taxonomy lines.
"""
from __future__ import annotations

from sqlalchemy.orm import Session

from app.models.reporting_taxonomy import ReportingTaxonomyLine, ReportingTaxonomyView, ReportingPresentationSettings

# Standard taxonomy seed — (code, name, section, sort_order, statement_type, normal_balance, sign_behavior, is_subtotal)
STANDARD_TAXONOMY_V2: list[tuple] = [
    # (code, name, section, sort_order, statement_type, normal_balance, sign_behavior, is_subtotal)
    ("cash_equivalents",        "Cash & Cash Equivalents",       "assets",         100, "balance_sheet",    "debit",  "positive", False),
    ("accounts_receivable",     "Accounts Receivable",           "assets",         110, "balance_sheet",    "debit",  "positive", False),
    ("inventory",               "Inventory",                     "assets",         120, "balance_sheet",    "debit",  "positive", False),
    ("prepaid_expenses",        "Prepaid Expenses",              "assets",         130, "balance_sheet",    "debit",  "positive", False),
    ("other_current_assets",    "Other Current Assets",          "assets",         140, "balance_sheet",    "debit",  "positive", False),
    ("property_equipment",      "Property & Equipment",          "assets",         200, "balance_sheet",    "debit",  "positive", False),
    ("intangible_assets",       "Intangible Assets",             "assets",         210, "balance_sheet",    "debit",  "positive", False),
    ("other_non_current_assets","Other Non-Current Assets",      "assets",         220, "balance_sheet",    "debit",  "positive", False),
    ("accounts_payable",        "Accounts Payable",              "liabilities",    300, "balance_sheet",    "credit", "positive", False),
    ("accrued_liabilities",     "Accrued Liabilities",           "liabilities",    310, "balance_sheet",    "credit", "positive", False),
    ("short_term_debt",         "Short-term Debt / Credit Lines","liabilities",    320, "balance_sheet",    "credit", "positive", False),
    ("deferred_revenue",        "Deferred Revenue",              "liabilities",    330, "balance_sheet",    "credit", "positive", False),
    ("other_current_liabilities","Other Current Liabilities",    "liabilities",    340, "balance_sheet",    "credit", "positive", False),
    ("long_term_debt",          "Long-term Debt",                "liabilities",    400, "balance_sheet",    "credit", "positive", False),
    ("other_lt_liabilities",    "Other Long-term Liabilities",   "liabilities",    410, "balance_sheet",    "credit", "positive", False),
    ("common_stock",            "Common Stock / Paid-in Capital","equity",         500, "balance_sheet",    "credit", "positive", False),
    ("retained_earnings",       "Retained Earnings",             "equity",         510, "balance_sheet",    "credit", "positive", False),
    ("other_equity",            "Other Equity",                  "equity",         520, "balance_sheet",    "credit", "positive", False),
    ("revenue",                 "Revenue",                       "revenue",        600, "income_statement", "credit", "positive", False),
    ("other_income",            "Other Income",                  "other_income",   610, "income_statement", "credit", "positive", False),
    ("cogs",                    "Cost of Goods Sold",            "cogs",           700, "income_statement", "debit",  "positive", False),
    ("gross_profit",            "Gross Profit",                  "cogs",           799, "income_statement", "credit", "positive", True),
    ("operating_expenses",      "Operating Expenses",            "expense",        800, "income_statement", "debit",  "positive", False),
    ("depreciation_amort",      "Depreciation & Amortization",   "expense",        810, "income_statement", "debit",  "positive", False),
    ("interest_expense",        "Interest Expense",              "other_expense",  900, "income_statement", "debit",  "positive", False),
    ("income_tax_expense",      "Income Tax Expense",            "other_expense",  910, "income_statement", "debit",  "positive", False),
    ("other_expense",           "Other Expense",                 "other_expense",  920, "income_statement", "debit",  "positive", False),
]

# Backward-compat alias (old 4-tuple format)
STANDARD_TAXONOMY: list[tuple[str, str, str, int]] = [
    (r[0], r[1], r[2], r[3]) for r in STANDARD_TAXONOMY_V2
]

# Standard reporting views to seed
STANDARD_VIEWS: list[tuple[str, str, str, bool]] = [
    # (code, name, description, is_default)
    ("gaap",        "GAAP",           "Standard US GAAP financial reporting",      True),
    ("management",  "Management",     "Internal management reporting",             False),
    ("sba_lender",  "SBA Lender",     "SBA and bank lender package",               False),
    ("qoe",         "QoE",            "Quality of Earnings reporting",             False),
    ("tax_basis",   "Tax Basis",      "Tax-basis financial reporting",             False),
]

# Classification confidence mapping: evidence source → confidence tier
CONFIDENCE_BY_EVIDENCE: dict[str, str] = {
    "auth_type": "high",
    "tax_line":  "high",
    "qb_type":   "medium",
    "detail_type": "medium",
    "name_keyword": "low",
}


def get_confidence(evidence: str | None) -> str:
    """Return confidence tier ('high'/'medium'/'low') based on evidence string."""
    if evidence is None:
        return "low"
    if "Type = " in evidence and any(auth in evidence for auth in [
        "Fixed Asset", "Accounts Receivable", "Accounts Payable",
        "Cost of Goods Sold", "Credit Card",
    ]):
        return "high"
    if "Tax Line" in evidence:
        return "high"
    if "Type =" in evidence:
        return "medium"
    if "Detail Type" in evidence:
        return "medium"
    if "Name keyword" in evidence:
        return "low"
    return "medium"

# QB detail_type → taxonomy code mapping
DETAIL_TYPE_TO_TAXONOMY: dict[str, str] = {
    # Assets
    "checking":                     "cash_equivalents",
    "savings":                      "cash_equivalents",
    "money market":                 "cash_equivalents",
    "cash on hand":                 "cash_equivalents",
    "bank":                         "cash_equivalents",
    "accounts receivable":          "accounts_receivable",
    "inventory":                    "inventory",
    "prepaid expenses":             "prepaid_expenses",
    "other current assets":         "other_current_assets",
    "employee cash advances":       "other_current_assets",
    "retainage":                    "other_current_assets",
    "undeposited funds":            "cash_equivalents",
    "fixed asset":                  "property_equipment",
    "buildings":                    "property_equipment",
    "machinery & equipment":        "property_equipment",
    "vehicles":                     "property_equipment",
    "leasehold improvements":       "property_equipment",
    "accumulated depreciation":     "property_equipment",
    "intangible assets":            "intangible_assets",
    "accumulated amortization":     "intangible_assets",
    "licenses":                     "intangible_assets",
    "goodwill":                     "intangible_assets",
    "notes receivable":             "other_non_current_assets",
    "security deposits":            "other_non_current_assets",
    "other long-term assets":       "other_non_current_assets",
    # Liabilities
    "accounts payable":             "accounts_payable",
    "credit card":                  "short_term_debt",
    "line of credit":               "short_term_debt",
    "loan payable":                 "short_term_debt",
    "payroll tax payable":          "accrued_liabilities",
    "accrued liabilities":          "accrued_liabilities",
    "sales tax payable":            "accrued_liabilities",
    "insurance payable":            "accrued_liabilities",
    "deferred revenue":             "deferred_revenue",
    "other current liabilities":    "other_current_liabilities",
    "notes payable":                "long_term_debt",
    "long term liabilities":        "long_term_debt",
    "shareholder notes payable":    "long_term_debt",
    "other long term liabilities":  "other_lt_liabilities",
    # Equity
    "common stock":                 "common_stock",
    "preferred stock":              "common_stock",
    "paid-in capital or surplus":   "common_stock",
    "retained earnings":            "retained_earnings",
    "owner's equity":               "retained_earnings",
    "partner's equity":             "retained_earnings",
    "opening balance equity":       "retained_earnings",
    "treasury stock":               "other_equity",
    "partner distributions":        "other_equity",
    # Revenue
    "service/fee income":           "revenue",
    "sales of product income":      "revenue",
    "other primary income":         "revenue",
    "non-profit income":            "revenue",
    "income":                       "revenue",
    # COGS
    "cost of goods sold":           "cogs",
    "supplies & materials - cogs":  "cogs",
    "other costs of services - cos":"cogs",
    "equipment rental - cogs":      "cogs",
    # Expense
    "advertising/promotional":      "operating_expenses",
    "office expenses":              "operating_expenses",
    "payroll expenses":             "operating_expenses",
    "rent or lease of buildings":   "operating_expenses",
    "utilities":                    "operating_expenses",
    "insurance":                    "operating_expenses",
    "legal & professional fees":    "operating_expenses",
    "repair & maintenance":         "operating_expenses",
    "meals":                        "operating_expenses",
    "travel":                       "operating_expenses",
    "bank charges":                 "operating_expenses",
    "depreciation":                 "depreciation_amort",
    "amortization":                 "depreciation_amort",
    "interest paid":                "interest_expense",
    "income tax expense":           "income_tax_expense",
    "other business expenses":      "other_expense",
    "other income":                 "other_income",
    "dividend income":              "other_income",
    "interest earned":              "other_income",
    "other expense":                "other_expense",
    "penalties & settlements":      "other_expense",
    "exchange gain or loss":        "other_expense",
}

# QuickBooks Tax Line value → taxonomy code
# Keys are normalized (lowercase, stripped) QB Tax Line strings from COA exports.
TAX_LINE_TO_TAXONOMY: dict[str, str] = {
    # Balance Sheet — Assets
    "b/s-assets: cash":                                         "cash_equivalents",
    "b/s-assets: u.s. government obligations":                  "cash_equivalents",
    "b/s-assets: accts. rec. and trade notes":                  "accounts_receivable",
    "b/s-assets: accts receivable":                             "accounts_receivable",
    "b/s-assets: inventories":                                  "inventory",
    "b/s-assets: prepaid expenses":                             "prepaid_expenses",
    "b/s-assets: other current assets":                         "other_current_assets",
    "b/s-assets: tax-exempt securities":                        "other_current_assets",
    "b/s-assets: loans to shareholders":                        "other_non_current_assets",
    "b/s-assets: mortgage and real estate loans":               "other_non_current_assets",
    "b/s-assets: investments":                                  "other_non_current_assets",
    "b/s-assets: depreciable assets":                           "property_equipment",
    "b/s-assets: land":                                         "property_equipment",
    "b/s-assets: intangible assets":                            "intangible_assets",
    "b/s-assets: other assets":                                 "other_non_current_assets",
    # Balance Sheet — Liabilities & Capital
    "b/s-liabs/cap: accounts payable":                          "accounts_payable",
    "b/s-liabs/cap: mtgs., notes, bonds pay. < 1 yr":           "short_term_debt",
    "b/s-liabs/cap: mortgages, notes, bonds pay. < 1 year":     "short_term_debt",
    "b/s-liabs/cap: other current liabilities":                 "other_current_liabilities",
    "b/s-liabs/cap: loans from shareholders":                   "long_term_debt",
    "b/s-liabs/cap: l-t mortgage/note/bonds pay.":              "long_term_debt",
    "b/s-liabs/cap: long-term liabilities":                     "long_term_debt",
    "b/s-liabs/cap: other liabilities":                         "other_lt_liabilities",
    "b/s-liabs/cap: capital stock":                             "common_stock",
    "b/s-liabs/cap: additional paid-in capital":                "common_stock",
    "b/s-liabs/cap: paid-in or capital surplus":                "common_stock",
    "b/s-liabs/cap: retained earnings":                         "retained_earnings",
    "b/s-liabs/cap: adjustments to s/h equity":                 "other_equity",
    "b/s-liabs/cap: less cost of treasury stock":               "other_equity",
    # Income
    "income: gross receipts or sales":                          "revenue",
    "income: gross receipts":                                   "revenue",
    "income: rents":                                            "revenue",
    "income: other income":                                     "other_income",
    "income: dividends":                                        "other_income",
    "income: interest":                                         "other_income",
    "income: interest income":                                  "other_income",
    "income: capital gain (loss)":                              "other_income",
    # COGS
    "cogs-form 1125-a: purchases":                              "cogs",
    "cogs-form 1125-a: cost of labor":                          "cogs",
    "cogs-form 1125-a: cost of goods sold":                     "cogs",
    "cogs-form 1125-a: additional section 263a costs":          "cogs",
    "cogs-form 1125-a: other costs":                            "cogs",
    "cogs: purchases":                                          "cogs",
    # Deductions / Expenses
    "deductions: compensation of officers":                     "operating_expenses",
    "deductions: salaries and wages":                           "operating_expenses",
    "deductions: repairs and maintenance":                      "operating_expenses",
    "deductions: bad debts":                                    "operating_expenses",
    "deductions: rents":                                        "operating_expenses",
    "deductions: taxes and licenses":                           "operating_expenses",
    "deductions: depreciation":                                 "depreciation_amort",
    "deductions: amortization":                                 "depreciation_amort",
    "deductions: depletion":                                    "depreciation_amort",
    "deductions: advertising":                                  "operating_expenses",
    "deductions: pension/profit sharing plans":                 "operating_expenses",
    "deductions: employee benefit programs":                    "operating_expenses",
    "deductions: interest expense":                             "interest_expense",
    "deductions: other deductions":                             "operating_expenses",
    "deductions: income tax":                                   "income_tax_expense",
    # Schedule C (sole prop)
    "schedule c: gross receipts or sales":                      "revenue",
    "schedule c: other income":                                 "other_income",
    "schedule c: advertising":                                  "operating_expenses",
    "schedule c: wages":                                        "operating_expenses",
    "schedule c: rent or lease":                                "operating_expenses",
    "schedule c: utilities":                                    "operating_expenses",
    "schedule c: office expense":                               "operating_expenses",
    "schedule c: cost of goods sold":                           "cogs",
}

# Static code→display-name map derived from STANDARD_TAXONOMY (no DB needed)
CODE_TO_NAME: dict[str, str] = {code: name for code, name, _, _ in STANDARD_TAXONOMY}

# QB Type strings that unambiguously determine taxonomy — override any tax line
AUTHORITATIVE_QB_TYPES: dict[str, str] = {
    "fixed assets":                     "property_equipment",
    "fixed asset":                      "property_equipment",
    "accounts receivable (a/r)":        "accounts_receivable",
    "accounts receivable":              "accounts_receivable",
    "accounts payable (a/p)":           "accounts_payable",
    "accounts payable":                 "accounts_payable",
    "cost of goods sold":               "cogs",
    "credit card":                      "short_term_debt",
    "other current assets":             "other_current_assets",
    "other current asset":              "other_current_assets",
    "other current liabilities":        "other_current_liabilities",
    "other current liability":          "other_current_liabilities",
    "long term liabilities":            "long_term_debt",
    "long-term liabilities":            "long_term_debt",
}

# QB Type → taxonomy code for non-authoritative types (tax line can add specificity)
QB_TYPE_TO_TAXONOMY: dict[str, str] = {
    "bank":             "cash_equivalents",
    "income":           "revenue",
    "other income":     "other_income",
    "revenue":          "revenue",          # generic "revenue" type used in Format-C COA imports
    "expenses":         "operating_expenses",
    "expense":          "operating_expenses",
    "other expenses":   "other_expense",
    "other expense":    "other_expense",
    "equity":           "other_equity",
    "other assets":     "other_non_current_assets",
    "other asset":      "other_non_current_assets",
}

# Tax line values that are bad/obsolete/inactive — ignore them
BAD_TAX_LINE_PATTERNS: frozenset[str] = frozenset({
    "obsolete", "inactive", "n/a", "not applicable", "none",
    "suppressed", "omit", "do not use", "not in use", "-none-",
})

# Account-name keyword → taxonomy code fallback (last resort)
ACCOUNT_NAME_KEYWORDS: list[tuple[str, str]] = [
    ("cash",                "cash_equivalents"),
    ("checking",            "cash_equivalents"),
    ("savings",             "cash_equivalents"),
    ("petty cash",          "cash_equivalents"),
    ("money market",        "cash_equivalents"),
    ("accounts receivable", "accounts_receivable"),
    (" a/r",                "accounts_receivable"),
    ("inventory",           "inventory"),
    ("prepaid",             "prepaid_expenses"),
    ("fixed asset",         "property_equipment"),
    ("equipment",           "property_equipment"),
    ("building",            "property_equipment"),
    ("vehicle",             "property_equipment"),
    ("machinery",           "property_equipment"),
    ("accumulated deprec",  "property_equipment"),
    ("leasehold",           "property_equipment"),
    ("accumulated amort",   "intangible_assets"),   # must precede plain "amortization"
    ("intangible",          "intangible_assets"),
    ("goodwill",            "intangible_assets"),
    ("accounts payable",    "accounts_payable"),
    (" a/p",                "accounts_payable"),
    ("credit card",         "short_term_debt"),
    ("line of credit",      "short_term_debt"),
    ("loc -",               "short_term_debt"),   # LOC abbreviation e.g. "LOC - Aegis Business Credit"
    ("other current liab",  "other_current_liabilities"),
    ("payroll tax",         "accrued_liabilities"),
    ("accrued",             "accrued_liabilities"),
    ("sales tax payable",   "accrued_liabilities"),
    ("deferred revenue",    "deferred_revenue"),
    ("long term",           "long_term_debt"),
    ("mortgage",            "long_term_debt"),
    ("note payable",        "long_term_debt"),
    ("common stock",        "common_stock"),
    ("paid-in capital",     "common_stock"),
    ("retained earnings",   "retained_earnings"),
    ("owner",               "retained_earnings"),
    ("gross sales",         "revenue"),
    ("revenue",             "revenue"),
    ("sales",               "revenue"),
    ("income",              "revenue"),
    ("cost of goods",       "cogs"),
    ("cogs",                "cogs"),
    ("cost of sales",       "cogs"),
    ("purchases",           "cogs"),
    ("depreciation",        "depreciation_amort"),
    ("amortization",        "depreciation_amort"),
    ("interest expense",    "interest_expense"),
    ("income tax",          "income_tax_expense"),
    ("other income",        "other_income"),
    ("dividend",            "other_income"),
    ("other expense",       "other_expense"),
]


def _is_bad_tax_line(tax_line: str) -> bool:
    """Return True if the tax line value is obsolete, inactive, or otherwise unusable."""
    normalized = tax_line.strip().lower()
    if normalized in BAD_TAX_LINE_PATTERNS:
        return True
    for pattern in BAD_TAX_LINE_PATTERNS:
        if pattern in normalized:
            return True
    return False


def get_suggested_taxonomy_code(
    account_type: str | None = None,
    tax_line: str | None = None,
    detail_type: str | None = None,
    account_name: str | None = None,
) -> tuple[str | None, str | None]:
    """Return (taxonomy_code, source_evidence) using a hierarchy of evidence.

    Priority:
    1. Authoritative QB Type (Fixed Asset, AR, AP, COGS, Credit Card, etc.)
    2. QB Tax Line — if present and not bad/obsolete
    3. QB Type fallback (Bank, Income, Expense, Equity, etc.)
    4. Detail Type exact/partial match
    5. Account Name keyword match

    No DB access — uses static dicts only.
    """
    # --- 1. Authoritative QB Type (overrides everything including tax line) ---
    if account_type:
        norm_type = account_type.strip().lower()
        code = AUTHORITATIVE_QB_TYPES.get(norm_type)
        if code:
            return code, f"Type = {account_type}"

    # --- 2. QB Tax Line (skip if bad/obsolete) ---
    if tax_line and not _is_bad_tax_line(tax_line):
        normalized = tax_line.strip().lower()
        code = TAX_LINE_TO_TAXONOMY.get(normalized)
        if code:
            return code, f"Tax Line = {tax_line}"
        for key, val in TAX_LINE_TO_TAXONOMY.items():
            if normalized.startswith(key) or key.startswith(normalized):
                return val, f"Tax Line = {tax_line}"
        # Prefix-group fallbacks
        if normalized.startswith("b/s-assets"):
            return "other_current_assets", f"Tax Line prefix = B/S-Assets"
        if normalized.startswith("b/s-liabs"):
            return "other_current_liabilities", f"Tax Line prefix = B/S-Liabs"
        if normalized.startswith("income"):
            return "revenue", f"Tax Line prefix = Income"
        if normalized.startswith("cogs"):
            return "cogs", f"Tax Line prefix = COGS"
        if normalized.startswith("deductions") or normalized.startswith("schedule c"):
            return "operating_expenses", f"Tax Line prefix = Deductions"

    # --- 3. QB Type fallback for general types ---
    # For specific types (bank→cash_equivalents), return immediately.
    # For general types (expense→operating_expenses, equity→other_equity), save as
    # fallback and continue to detail-type/name-keyword checks so that e.g.
    # "Depreciation Expense" gets depreciation_amort instead of operating_expenses.
    _GENERAL_TYPE_CODES: frozenset[str] = frozenset({"operating_expenses", "other_equity"})
    type_fallback_code: str | None = None
    type_fallback_evidence: str | None = None
    if account_type:
        norm_type = account_type.strip().lower()
        code = QB_TYPE_TO_TAXONOMY.get(norm_type)
        if code:
            if code in _GENERAL_TYPE_CODES:
                type_fallback_code = code
                type_fallback_evidence = f"Type = {account_type}"
            else:
                return code, f"Type = {account_type}"

    # --- 4. Detail Type ---
    if detail_type:
        normalized_d = detail_type.strip().lower()
        code = DETAIL_TYPE_TO_TAXONOMY.get(normalized_d)
        if code:
            return code, f"Detail Type = {detail_type}"
        for key, val in DETAIL_TYPE_TO_TAXONOMY.items():
            if key in normalized_d or normalized_d in key:
                return val, f"Detail Type ~ {detail_type}"

    # --- 5. Account Name keywords ---
    if account_name:
        normalized_n = account_name.strip().lower()
        for keyword, code in ACCOUNT_NAME_KEYWORDS:
            if keyword in normalized_n:
                return code, f"Name keyword: {keyword.strip()}"

    # Return type fallback if no detail type or name keyword matched
    if type_fallback_code:
        return type_fallback_code, type_fallback_evidence

    return None, None


def seed_taxonomy(db: Session) -> dict[str, int]:
    """Create or update the standard taxonomy lines. Returns code→id mapping."""
    code_to_id: dict[str, int] = {}
    for row in STANDARD_TAXONOMY_V2:
        code, name, section, sort_order, statement_type, normal_balance, sign_behavior, is_subtotal = row
        line = db.query(ReportingTaxonomyLine).filter_by(code=code).first()
        if line is None:
            line = ReportingTaxonomyLine(
                code=code, name=name, section=section, sort_order=sort_order,
                statement_type=statement_type, normal_balance=normal_balance,
                sign_behavior=sign_behavior, is_subtotal=is_subtotal,
                system_defined=True, editable=True, active=True,
            )
            db.add(line)
        else:
            # Update enhanced fields on existing seeded lines
            if not line.statement_type:
                line.statement_type = statement_type
            if not line.normal_balance:
                line.normal_balance = normal_balance
            if not line.sign_behavior:
                line.sign_behavior = sign_behavior
        db.flush()
        code_to_id[code] = line.id
    db.commit()
    return code_to_id


def seed_views(db: Session) -> None:
    """Seed standard reporting views if none exist."""
    count = db.query(ReportingTaxonomyView).count()
    if count > 0:
        return
    for code, name, description, is_default in STANDARD_VIEWS:
        view = ReportingTaxonomyView(
            code=code, name=name, description=description,
            is_default=is_default, is_system_defined=True, active=True,
        )
        db.add(view)
    db.commit()


def get_or_seed_settings(org_id: int | None, db: Session) -> ReportingPresentationSettings:
    """Return org settings, creating defaults if none exist."""
    q = db.query(ReportingPresentationSettings)
    if org_id is not None:
        settings_row = q.filter_by(org_id=org_id).first()
    else:
        settings_row = q.filter_by(org_id=None).first()
    if settings_row is None:
        settings_row = ReportingPresentationSettings(org_id=org_id)
        db.add(settings_row)
        db.commit()
        db.refresh(settings_row)
    return settings_row


def get_taxonomy_id_for_detail_type(
    detail_type: str | None, db: Session
) -> int | None:
    """Return the taxonomy line id that best matches a QB detail type string."""
    if not detail_type:
        return None
    normalized = detail_type.strip().lower()
    code = DETAIL_TYPE_TO_TAXONOMY.get(normalized)
    if code is None:
        # partial match
        for key, val in DETAIL_TYPE_TO_TAXONOMY.items():
            if key in normalized or normalized in key:
                code = val
                break
    if code is None:
        return None
    line = db.query(ReportingTaxonomyLine).filter_by(code=code).first()
    return line.id if line else None


def get_taxonomy_id_for_tax_line(
    tax_line: str | None, db: Session
) -> int | None:
    """Return the taxonomy line id that best matches a QB Tax Line string."""
    code, _ = get_suggested_taxonomy_code(tax_line=tax_line)
    if code is None:
        return None
    line = db.query(ReportingTaxonomyLine).filter_by(code=code).first()
    return line.id if line else None


def get_taxonomy_id_for_account(
    account_type: str | None,
    tax_line: str | None,
    detail_type: str | None,
    account_name: str | None,
    db: Session,
) -> tuple[int | None, str | None]:
    """Resolve taxonomy id + source_evidence using the full evidence hierarchy."""
    code, evidence = get_suggested_taxonomy_code(
        account_type=account_type,
        tax_line=tax_line,
        detail_type=detail_type,
        account_name=account_name,
    )
    if code is None:
        return None, None
    line = db.query(ReportingTaxonomyLine).filter_by(code=code).first()
    return (line.id if line else None), evidence


def get_or_seed(db: Session) -> list[ReportingTaxonomyLine]:
    """Return all taxonomy lines, seeding first if empty."""
    count = db.query(ReportingTaxonomyLine).count()
    if count == 0:
        seed_taxonomy(db)
    return db.query(ReportingTaxonomyLine).order_by(
        ReportingTaxonomyLine.sort_order
    ).all()
