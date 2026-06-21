"""
Default mapping rule engine.

Suggests TaxonomyNode for an Account using:
  - account number patterns (e.g., 1000-1999 = current assets)
  - account name keyword matching
  - account_type (asset/liability/equity/revenue/expense/cogs/other_income/other_expense)
  - normal_balance (debit/credit)
  - industry context (saas, healthcare, manufacturing, etc.)

Returns suggestions with confidence_score 0.0-1.0.
"""
from dataclasses import dataclass
from typing import Optional
from sqlalchemy.orm import Session
from app.models.taxonomy import Taxonomy, TaxonomyNode
from app.models.account import Account


@dataclass
class MappingSuggestion:
    taxonomy_id: int
    taxonomy_code: str
    taxonomy_node_id: int
    node_code: str
    node_name: str
    confidence_score: float
    reason: str


KEYWORD_TO_NODE_CODE: dict[str, str] = {
    "cash and cash equivalents": "CASH_EQUIV",
    "cash": "CASH",
    "petty cash": "CASH",
    "restricted cash": "RESTRICTED_CASH",
    "checking": "CASH",
    "savings": "CASH",
    "money market": "CASH_EQUIV",
    "accounts receivable": "AR",
    "trade receivable": "AR",
    "allowance for doubtful": "AR_ALLOWANCE",
    "inventory": "INVENTORY",
    "raw materials": "INVENTORY_RAW",
    "work in progress": "INVENTORY_WIP",
    "finished goods": "INVENTORY_FG",
    "prepaid": "PREPAID",
    "prepaid insurance": "PREPAID_INSURANCE",
    "prepaid rent": "PREPAID_RENT",
    "fixed asset": "PPE",
    "property plant": "PPE",
    "equipment": "PPE_EQUIPMENT",
    "buildings": "PPE_BUILDINGS",
    "land": "PPE_LAND",
    "leasehold improvements": "PPE_LEASEHOLD",
    "vehicles": "PPE_VEHICLES",
    "furniture": "PPE_FURNITURE",
    "computer": "PPE_EQUIPMENT",
    "accumulated depreciation": "PPE_ACCUM_DEPR",
    "intangible": "INTANGIBLE",
    "goodwill": "GOODWILL",
    "trademark": "INTANGIBLE",
    "patent": "INTANGIBLE",
    "deferred tax asset": "DEFERRED_TAX_ASSET",
    "right of use asset": "ROU_ASSET",
    "lease asset": "ROU_ASSET",
    "accounts payable": "AP",
    "trade payable": "AP",
    "accrued": "ACCRUED_LIABILITIES",
    "accrued expenses": "ACCRUED_LIABILITIES",
    "accrued payroll": "ACCRUED_PAYROLL",
    "wages payable": "ACCRUED_PAYROLL",
    "credit card": "CREDIT_CARD",
    "line of credit": "LINE_OF_CREDIT",
    "notes payable": "NOTES_PAYABLE",
    "loan payable": "NOTES_PAYABLE",
    "long-term debt": "LONG_TERM_DEBT",
    "long term debt": "LONG_TERM_DEBT",
    "mortgage": "LONG_TERM_DEBT",
    "sales tax payable": "SALES_TAX_PAYABLE",
    "payroll tax payable": "PAYROLL_TAX_PAYABLE",
    "income tax payable": "INCOME_TAX_PAYABLE",
    "deferred revenue": "DEFERRED_REVENUE",
    "contract liabilit": "DEFERRED_REVENUE",
    "customer deposit": "CUSTOMER_DEPOSITS",
    "lease liability": "LEASE_LIABILITY",
    "deferred tax liability": "DEFERRED_TAX_LIABILITY",
    "common stock": "COMMON_STOCK",
    "preferred stock": "PREFERRED_STOCK",
    "additional paid-in capital": "APIC",
    "additional paid in capital": "APIC",
    "retained earnings": "RETAINED_EARNINGS",
    "treasury stock": "TREASURY_STOCK",
    "member equity": "MEMBER_EQUITY",
    "owner equity": "OWNER_EQUITY",
    "owner draw": "OWNER_DRAW",
    "distribution": "DISTRIBUTIONS",
    "sales revenue": "REVENUE_SALES",
    "service revenue": "REVENUE_SERVICE",
    "subscription revenue": "REVENUE_SUBSCRIPTION",
    "recurring revenue": "REVENUE_SUBSCRIPTION",
    "license revenue": "REVENUE_LICENSE",
    "professional services": "REVENUE_PROF_SERVICES",
    "interest income": "INTEREST_INCOME",
    "other income": "OTHER_INCOME",
    "gain on sale": "GAIN_ON_SALE",
    "rental income": "RENTAL_INCOME",
    "cost of goods sold": "COGS",
    "cost of revenue": "COGS",
    "cost of sales": "COGS",
    "direct materials": "COGS_MATERIALS",
    "direct labor": "COGS_LABOR",
    "manufacturing overhead": "COGS_OVERHEAD",
    "hosting": "COGS_HOSTING",
    "merchant fee": "PAYMENT_PROCESSING_FEES",
    "payment processing": "PAYMENT_PROCESSING_FEES",
    "salaries": "SALARIES_WAGES",
    "wages": "SALARIES_WAGES",
    "payroll": "SALARIES_WAGES",
    "payroll tax": "PAYROLL_TAXES",
    "employee benefit": "EMPLOYEE_BENEFITS",
    "health insurance": "EMPLOYEE_BENEFITS",
    "401k": "EMPLOYEE_BENEFITS",
    "401(k)": "EMPLOYEE_BENEFITS",
    "rent": "RENT_EXPENSE",
    "utilities": "UTILITIES",
    "telephone": "TELECOM",
    "internet": "TELECOM",
    "software subscription": "SOFTWARE_EXPENSE",
    "saas": "SOFTWARE_EXPENSE",
    "office supplies": "OFFICE_SUPPLIES",
    "travel": "TRAVEL_EXPENSE",
    "meals": "MEALS_ENTERTAINMENT",
    "entertainment": "MEALS_ENTERTAINMENT",
    "professional fee": "PROFESSIONAL_FEES",
    "legal": "LEGAL_FEES",
    "accounting": "PROFESSIONAL_FEES",
    "consulting": "PROFESSIONAL_FEES",
    "advertising": "MARKETING_EXPENSE",
    "marketing": "MARKETING_EXPENSE",
    "depreciation": "DEPRECIATION_EXPENSE",
    "amortization": "AMORTIZATION_EXPENSE",
    "interest expense": "INTEREST_EXPENSE",
    "bank fee": "BANK_FEES",
    "income tax expense": "INCOME_TAX_EXPENSE",
    "tax expense": "INCOME_TAX_EXPENSE",
    "insurance": "INSURANCE_EXPENSE",
    "bad debt": "BAD_DEBT_EXPENSE",
    "repairs and maintenance": "REPAIRS_MAINTENANCE",
    "research and development": "RD_EXPENSE",
    "r&d": "RD_EXPENSE",
}


NUMBER_RANGE_TO_NODE_CODE: list[tuple[int, int, str]] = [
    (1000, 1099, "CASH"),
    (1100, 1199, "AR"),
    (1200, 1299, "INVENTORY"),
    (1300, 1399, "PREPAID"),
    (1400, 1499, "OTHER_CURRENT_ASSET"),
    (1500, 1799, "PPE"),
    (1800, 1899, "INTANGIBLE"),
    (1900, 1999, "OTHER_LT_ASSET"),
    (2000, 2099, "AP"),
    (2100, 2199, "ACCRUED_LIABILITIES"),
    (2200, 2299, "CREDIT_CARD"),
    (2300, 2399, "SALES_TAX_PAYABLE"),
    (2400, 2499, "PAYROLL_TAX_PAYABLE"),
    (2500, 2699, "NOTES_PAYABLE"),
    (2700, 2899, "LONG_TERM_DEBT"),
    (2900, 2999, "DEFERRED_REVENUE"),
    (3000, 3099, "COMMON_STOCK"),
    (3100, 3199, "APIC"),
    (3200, 3399, "RETAINED_EARNINGS"),
    (3400, 3499, "DISTRIBUTIONS"),
    (4000, 4999, "REVENUE_SALES"),
    (5000, 5999, "COGS"),
    (6000, 6099, "SALARIES_WAGES"),
    (6100, 6199, "PAYROLL_TAXES"),
    (6200, 6299, "EMPLOYEE_BENEFITS"),
    (6300, 6399, "RENT_EXPENSE"),
    (6400, 6499, "UTILITIES"),
    (6500, 6599, "PROFESSIONAL_FEES"),
    (6600, 6699, "MARKETING_EXPENSE"),
    (6700, 6799, "OFFICE_SUPPLIES"),
    (6800, 6899, "TRAVEL_EXPENSE"),
    (6900, 6999, "INSURANCE_EXPENSE"),
    (7000, 7099, "DEPRECIATION_EXPENSE"),
    (7100, 7199, "AMORTIZATION_EXPENSE"),
    (7200, 7299, "INTEREST_EXPENSE"),
    (7300, 7399, "BANK_FEES"),
    (8000, 8999, "OTHER_EXPENSE"),
    (9000, 9099, "INCOME_TAX_EXPENSE"),
    (9100, 9999, "OTHER_INCOME"),
]


ACCOUNT_TYPE_TO_NODE_CODE: dict[str, str] = {
    "asset": "OTHER_CURRENT_ASSET",
    "liability": "OTHER_CURRENT_LIABILITY",
    "equity": "RETAINED_EARNINGS",
    "revenue": "REVENUE_SALES",
    "cogs": "COGS",
    "expense": "OTHER_EXPENSE",
    "other_income": "OTHER_INCOME",
    "other_expense": "OTHER_EXPENSE",
}


def _lookup_node(db: Session, taxonomy_id: int, node_code: str) -> Optional[TaxonomyNode]:
    return (
        db.query(TaxonomyNode)
        .filter_by(taxonomy_id=taxonomy_id, code=node_code)
        .first()
    )


def _build_suggestion(
    taxonomy: Taxonomy,
    node: TaxonomyNode,
    confidence: float,
    reason: str,
) -> MappingSuggestion:
    return MappingSuggestion(
        taxonomy_id=taxonomy.id,
        taxonomy_code=taxonomy.code,
        taxonomy_node_id=node.id,
        node_code=node.code,
        node_name=node.name,
        confidence_score=confidence,
        reason=reason,
    )


def suggest_mapping_from_strings(
    account_number: str | None,
    account_name: str | None,
    account_type: str | None,
    taxonomy: Taxonomy,
    db: Session,
) -> Optional[MappingSuggestion]:
    """
    Same logic as suggest_mapping() but operates on raw strings instead of
    an Account ORM row. Used by the TB-import wizard to suggest FSLI BEFORE
    any Account record exists (the COA may still be just the imported file).
    """
    name_lower = (account_name or "").lower()
    if name_lower:
        sorted_keywords = sorted(KEYWORD_TO_NODE_CODE.keys(), key=len, reverse=True)
        for keyword in sorted_keywords:
            if keyword in name_lower:
                node_code = KEYWORD_TO_NODE_CODE[keyword]
                node = _lookup_node(db, taxonomy.id, node_code)
                if not node:
                    continue
                strong = (
                    name_lower.startswith(keyword)
                    or (len(keyword) / max(len(name_lower), 1)) >= 0.4
                )
                if strong:
                    return _build_suggestion(taxonomy, node, 0.90, f"keyword match: '{keyword}'")
                return _build_suggestion(taxonomy, node, 0.75, f"partial keyword match: '{keyword}'")

    raw_number = (account_number or "").strip()
    if raw_number:
        try:
            num = int(raw_number.split("-")[0].split(".")[0])
        except (ValueError, AttributeError):
            num = None
        if num is not None:
            for start, end, node_code in NUMBER_RANGE_TO_NODE_CODE:
                if start <= num <= end:
                    node = _lookup_node(db, taxonomy.id, node_code)
                    if node:
                        return _build_suggestion(
                            taxonomy, node, 0.60,
                            f"account number range {start}-{end}",
                        )
                    break

    acct_type = (account_type or "").lower()
    if acct_type in ACCOUNT_TYPE_TO_NODE_CODE:
        node_code = ACCOUNT_TYPE_TO_NODE_CODE[acct_type]
        node = _lookup_node(db, taxonomy.id, node_code)
        if node:
            return _build_suggestion(taxonomy, node, 0.40, f"account_type fallback: '{acct_type}'")
    return None


def suggest_mapping(
    account: Account,
    taxonomy: Taxonomy,
    db: Session,
) -> Optional[MappingSuggestion]:
    """
    Return the best TaxonomyNode suggestion for this account in this taxonomy.
    Returns None if no match found.

    Strategy:
      1. Try keyword match on account_name (case-insensitive) -> high confidence
      2. Try account number range -> medium confidence
      3. Try account_type as broad category -> low confidence
    """
    name_lower = (account.account_name or "").lower()

    if name_lower:
        # Longest keywords first so "accounts receivable" beats "accounts"
        sorted_keywords = sorted(KEYWORD_TO_NODE_CODE.keys(), key=len, reverse=True)
        for keyword in sorted_keywords:
            if keyword in name_lower:
                node_code = KEYWORD_TO_NODE_CODE[keyword]
                node = _lookup_node(db, taxonomy.id, node_code)
                if not node:
                    continue
                # Strong match if keyword anchors the name (prefix) or is a
                # substantial fraction of it. Otherwise it's an embedded
                # keyword in a longer descriptive name.
                strong = (
                    name_lower.startswith(keyword)
                    or (len(keyword) / max(len(name_lower), 1)) >= 0.4
                )
                if strong:
                    confidence = 0.90
                    reason = f"keyword match: '{keyword}'"
                else:
                    confidence = 0.75
                    reason = f"partial keyword match: '{keyword}'"
                return _build_suggestion(taxonomy, node, confidence, reason)

    raw_number = (account.account_number or "").strip()
    if raw_number:
        try:
            num = int(raw_number.split("-")[0].split(".")[0])
        except (ValueError, AttributeError):
            num = None
        if num is not None:
            for start, end, node_code in NUMBER_RANGE_TO_NODE_CODE:
                if start <= num <= end:
                    node = _lookup_node(db, taxonomy.id, node_code)
                    if node:
                        return _build_suggestion(
                            taxonomy,
                            node,
                            0.60,
                            f"account number range {start}-{end}",
                        )
                    break

    acct_type = (account.account_type or "").lower()
    if acct_type in ACCOUNT_TYPE_TO_NODE_CODE:
        node_code = ACCOUNT_TYPE_TO_NODE_CODE[acct_type]
        node = _lookup_node(db, taxonomy.id, node_code)
        if node:
            return _build_suggestion(
                taxonomy,
                node,
                0.40,
                f"account_type fallback: '{acct_type}'",
            )

    return None


def suggest_mappings_for_taxonomies(
    account: Account,
    taxonomy_ids: list[int],
    db: Session,
) -> list[MappingSuggestion]:
    """Return one suggestion per taxonomy_id (only those with a match)."""
    suggestions = []
    for tx_id in taxonomy_ids:
        tx = db.query(Taxonomy).filter_by(id=tx_id).first()
        if not tx:
            continue
        s = suggest_mapping(account, tx, db)
        if s:
            suggestions.append(s)
    return suggestions


def bulk_suggest_mappings(
    accounts: list[Account],
    taxonomy_ids: list[int],
    db: Session,
) -> dict[int, list[MappingSuggestion]]:
    """Return {account_id: [suggestions]} for batch processing."""
    return {a.id: suggest_mappings_for_taxonomies(a, taxonomy_ids, db) for a in accounts}
