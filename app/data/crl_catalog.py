"""
Canonical 72-CRL catalog + 8 system reporting templates + initial
CRL → Taxonomy node junctions.

Per CRL architecture v2 + final requirements:
  - Every CRL has an immutable `CRL_` prefixed code.
  - 2 mandatory system CRLs (UNCLASSIFIED, NEEDS_REVIEW).
  - 17 sub-lines via parent_crl_id self-FK.
  - Industry overlays live in the Taxonomy layer (not CRLs).

Templates expose CRL subsets without changing the catalog.
"""
from __future__ import annotations
from dataclasses import dataclass, field


@dataclass
class CrlSpec:
    code: str                       # immutable, CRL_-prefixed
    name: str                       # user-editable display label
    section: str
    statement_type: str
    sort_order: int
    normal_balance: str | None = None
    parent_code: str | None = None
    is_mandatory: bool = False
    description: str | None = None
    # CRL → many TaxonomyNode codes. First entry is the primary
    # back-translation target. (One-to-many supported per final requirement.)
    taxonomy_node_codes: list[str] = field(default_factory=list)


@dataclass
class TemplateSpec:
    code: str
    name: str
    description: str
    crl_codes: list[str]            # whitelist of CRL codes visible in this template


# ---------------------------------------------------------------------------
# CRL CATALOG — 72 entries
# ---------------------------------------------------------------------------

CRL_CATALOG: list[CrlSpec] = [
    # ── System / mandatory (2) ────────────────────────────────────────────
    CrlSpec("CRL_UNCLASSIFIED", "Unclassified", "System", "System", 1,
            is_mandatory=True,
            description="Account exists but has not yet been classified."),
    CrlSpec("CRL_NEEDS_REVIEW", "Needs Review", "System", "System", 2,
            is_mandatory=True,
            description="Account had a mapping that's no longer valid or unambiguous; user action required."),

    # ── Assets (11) ───────────────────────────────────────────────────────
    CrlSpec("CRL_CASH",                "Cash & Cash Equivalents",  "Assets", "Balance Sheet", 100, "debit",
            taxonomy_node_codes=["CASH", "CASH_EQUIV"]),
    CrlSpec("CRL_AR",                  "Accounts Receivable",      "Assets", "Balance Sheet", 110, "debit",
            taxonomy_node_codes=["AR", "AR_ALLOWANCE"]),
    CrlSpec("CRL_INVENTORY",           "Inventory",                "Assets", "Balance Sheet", 120, "debit",
            taxonomy_node_codes=["INVENTORY", "INVENTORY_RAW", "INVENTORY_WIP", "INVENTORY_FG"]),
    CrlSpec("CRL_PREPAIDS",            "Prepaids",                 "Assets", "Balance Sheet", 130, "debit",
            taxonomy_node_codes=["PREPAID", "PREPAID_INSURANCE", "PREPAID_RENT"]),
    CrlSpec("CRL_OTHER_CURRENT_ASSETS","Other Current Assets",     "Assets", "Balance Sheet", 140, "debit",
            taxonomy_node_codes=["OTHER_CURRENT_ASSET"]),
    CrlSpec("CRL_FIXED_ASSETS",        "Fixed Assets",             "Assets", "Balance Sheet", 200, "debit",
            taxonomy_node_codes=[
                "PPE", "PPE_EQUIPMENT", "PPE_BUILDINGS", "PPE_LAND",
                "PPE_LEASEHOLD", "PPE_VEHICLES", "PPE_FURNITURE",
            ]),
    CrlSpec("CRL_ACCUM_DEPRECIATION",  "Accumulated Depreciation", "Assets", "Balance Sheet", 210, "credit",
            taxonomy_node_codes=["PPE_ACCUM_DEPR"]),
    CrlSpec("CRL_INTANGIBLES",         "Intangible Assets",        "Assets", "Balance Sheet", 220, "debit",
            taxonomy_node_codes=["INTANGIBLE", "GOODWILL"]),
    CrlSpec("CRL_ACCUM_AMORTIZATION",  "Accumulated Amortization", "Assets", "Balance Sheet", 230, "credit",
            taxonomy_node_codes=["INTANGIBLE_ACCUM_AMORT"]),
    CrlSpec("CRL_INVESTMENTS",         "Investments",              "Assets", "Balance Sheet", 240, "debit",
            taxonomy_node_codes=["INVESTMENTS"]),
    CrlSpec("CRL_OTHER_ASSETS",        "Other Assets",             "Assets", "Balance Sheet", 250, "debit",
            taxonomy_node_codes=["OTHER_LT_ASSET", "DEFERRED_TAX_ASSET", "ROU_ASSET"]),

    # ── Liabilities (10) ──────────────────────────────────────────────────
    CrlSpec("CRL_AP",                  "Accounts Payable",         "Liabilities", "Balance Sheet", 300, "credit",
            taxonomy_node_codes=["AP"]),
    CrlSpec("CRL_ACCRUED_EXPENSES",    "Accrued Expenses",         "Liabilities", "Balance Sheet", 310, "credit",
            taxonomy_node_codes=["ACCRUED_LIABILITIES"]),
    CrlSpec("CRL_PAYROLL_LIABILITIES", "Payroll Liabilities",      "Liabilities", "Balance Sheet", 320, "credit",
            taxonomy_node_codes=["ACCRUED_PAYROLL", "PAYROLL_TAX_PAYABLE"]),
    CrlSpec("CRL_SALES_TAX_PAYABLE",   "Sales Tax Payable",        "Liabilities", "Balance Sheet", 330, "credit",
            taxonomy_node_codes=["SALES_TAX_PAYABLE"]),
    CrlSpec("CRL_INCOME_TAX_PAYABLE",  "Income Tax Payable",       "Liabilities", "Balance Sheet", 340, "credit",
            taxonomy_node_codes=["INCOME_TAX_PAYABLE"]),
    CrlSpec("CRL_DEFERRED_REVENUE",    "Deferred Revenue",         "Liabilities", "Balance Sheet", 350, "credit",
            taxonomy_node_codes=["DEFERRED_REVENUE", "CUSTOMER_DEPOSITS"]),
    CrlSpec("CRL_CURRENT_DEBT",        "Current Debt",             "Liabilities", "Balance Sheet", 360, "credit",
            taxonomy_node_codes=["NOTES_PAYABLE", "LINE_OF_CREDIT", "CREDIT_CARD"]),
    CrlSpec("CRL_LONG_TERM_DEBT",      "Long-Term Debt",           "Liabilities", "Balance Sheet", 370, "credit",
            taxonomy_node_codes=["LONG_TERM_DEBT"]),
    CrlSpec("CRL_LEASE_LIABILITIES",   "Lease Liabilities",        "Liabilities", "Balance Sheet", 380, "credit",
            taxonomy_node_codes=["LEASE_LIABILITY"]),
    CrlSpec("CRL_OTHER_LIABILITIES",   "Other Liabilities",        "Liabilities", "Balance Sheet", 390, "credit",
            taxonomy_node_codes=["OTHER_CURRENT_LIABILITY", "DEFERRED_TAX_LIABILITY"]),

    # ── Equity (5) ────────────────────────────────────────────────────────
    CrlSpec("CRL_COMMON_STOCK",        "Common Stock",             "Equity", "Balance Sheet", 400, "credit",
            taxonomy_node_codes=["COMMON_STOCK", "PREFERRED_STOCK"]),
    CrlSpec("CRL_APIC",                "APIC",                     "Equity", "Balance Sheet", 410, "credit",
            taxonomy_node_codes=["APIC"]),
    CrlSpec("CRL_RETAINED_EARNINGS",   "Retained Earnings",        "Equity", "Balance Sheet", 420, "credit",
            taxonomy_node_codes=["RETAINED_EARNINGS"]),
    CrlSpec("CRL_DISTRIBUTIONS",       "Distributions / Dividends","Equity", "Balance Sheet", 430, "debit",
            taxonomy_node_codes=["DISTRIBUTIONS", "OWNER_DRAW"]),
    CrlSpec("CRL_OTHER_EQUITY",        "Other Equity",             "Equity", "Balance Sheet", 440, "credit",
            taxonomy_node_codes=["OWNER_EQUITY", "MEMBER_EQUITY", "TREASURY_STOCK"]),

    # ── Revenue (3) — per change #6 "Other Revenue" removed ───────────────
    CrlSpec("CRL_PRODUCT_REVENUE",     "Product Revenue",          "Revenue", "Income Statement", 500, "credit",
            taxonomy_node_codes=["REVENUE_SALES"]),
    CrlSpec("CRL_SERVICE_REVENUE",     "Service Revenue",          "Revenue", "Income Statement", 510, "credit",
            taxonomy_node_codes=["REVENUE_SERVICE", "REVENUE_PROF_SERVICES"]),
    CrlSpec("CRL_SUBSCRIPTION_REVENUE","Subscription Revenue",     "Revenue", "Income Statement", 520, "credit",
            taxonomy_node_codes=["REVENUE_SUBSCRIPTION", "REVENUE_LICENSE"]),

    # ── Cost of Revenue (3) ───────────────────────────────────────────────
    CrlSpec("CRL_COGS",                "Cost of Goods Sold",       "Cost of Revenue", "Income Statement", 600, "debit",
            taxonomy_node_codes=["COGS", "COGS_OVERHEAD"]),
    CrlSpec("CRL_COST_OF_SERVICES",    "Cost of Services",         "Cost of Revenue", "Income Statement", 610, "debit",
            taxonomy_node_codes=["COGS_SERVICES"]),
    CrlSpec("CRL_HOSTING_INFRA",       "Hosting / Infrastructure Costs", "Cost of Revenue", "Income Statement", 620, "debit",
            taxonomy_node_codes=["COGS_HOSTING", "PAYMENT_PROCESSING_FEES"]),

    # ── Operating Expenses (15) ───────────────────────────────────────────
    CrlSpec("CRL_PAYROLL_EXPENSE",     "Payroll Expense",          "Operating Expenses", "Income Statement", 700, "debit",
            taxonomy_node_codes=["SALARIES_WAGES"]),
    CrlSpec("CRL_EMPLOYEE_BENEFITS",   "Employee Benefits",        "Operating Expenses", "Income Statement", 710, "debit",
            taxonomy_node_codes=["EMPLOYEE_BENEFITS"]),
    CrlSpec("CRL_RENT_OCCUPANCY",      "Rent & Occupancy",         "Operating Expenses", "Income Statement", 720, "debit",
            taxonomy_node_codes=["RENT_EXPENSE"]),
    CrlSpec("CRL_PROFESSIONAL_FEES",   "Professional Fees",        "Operating Expenses", "Income Statement", 730, "debit",
            taxonomy_node_codes=["PROFESSIONAL_FEES"]),
    CrlSpec("CRL_ADVERTISING_MARKETING","Advertising & Marketing", "Operating Expenses", "Income Statement", 740, "debit",
            taxonomy_node_codes=["MARKETING_EXPENSE"]),
    CrlSpec("CRL_TRAVEL_ENTERTAINMENT","Travel & Entertainment",   "Operating Expenses", "Income Statement", 750, "debit",
            taxonomy_node_codes=["TRAVEL_EXPENSE", "MEALS_ENTERTAINMENT"]),
    CrlSpec("CRL_SOFTWARE_SAAS",       "Software & SaaS",          "Operating Expenses", "Income Statement", 760, "debit",
            taxonomy_node_codes=["SOFTWARE_EXPENSE", "TELECOM"]),
    CrlSpec("CRL_INSURANCE",           "Insurance",                "Operating Expenses", "Income Statement", 770, "debit",
            taxonomy_node_codes=["INSURANCE_EXPENSE"]),
    CrlSpec("CRL_OFFICE_EXPENSE",      "Office Expense",           "Operating Expenses", "Income Statement", 780, "debit",
            taxonomy_node_codes=["OFFICE_SUPPLIES"]),
    CrlSpec("CRL_REPAIRS_MAINTENANCE", "Repairs & Maintenance",    "Operating Expenses", "Income Statement", 790, "debit",
            taxonomy_node_codes=["REPAIRS_MAINTENANCE"]),
    CrlSpec("CRL_UTILITIES",           "Utilities",                "Operating Expenses", "Income Statement", 800, "debit",
            taxonomy_node_codes=["UTILITIES"]),
    CrlSpec("CRL_DEPRECIATION",        "Depreciation",             "Operating Expenses", "Income Statement", 810, "debit",
            taxonomy_node_codes=["DEPRECIATION_EXPENSE"]),
    CrlSpec("CRL_AMORTIZATION",        "Amortization",             "Operating Expenses", "Income Statement", 820, "debit",
            taxonomy_node_codes=["AMORTIZATION_EXPENSE"]),
    CrlSpec("CRL_BAD_DEBT",            "Bad Debt",                 "Operating Expenses", "Income Statement", 830, "debit",
            taxonomy_node_codes=["BAD_DEBT_EXPENSE"]),
    CrlSpec("CRL_OTHER_OPERATING_EXPENSE","Other Operating Expense","Operating Expenses", "Income Statement", 840, "debit",
            taxonomy_node_codes=["OTHER_EXPENSE", "BANK_FEES"]),

    # ── Other Income / Expense (6) ────────────────────────────────────────
    CrlSpec("CRL_INTEREST_INCOME",     "Interest Income",          "Other Income / Expense", "Income Statement", 900, "credit",
            taxonomy_node_codes=["INTEREST_INCOME"]),
    CrlSpec("CRL_INTEREST_EXPENSE",    "Interest Expense",         "Other Income / Expense", "Income Statement", 910, "debit",
            taxonomy_node_codes=["INTEREST_EXPENSE"]),
    CrlSpec("CRL_GAIN_LOSS",           "Gain / Loss",              "Other Income / Expense", "Income Statement", 920, None,
            taxonomy_node_codes=["GAIN_ON_SALE"]),
    CrlSpec("CRL_INCOME_TAXES",        "Income Taxes",             "Other Income / Expense", "Income Statement", 930, "debit",
            taxonomy_node_codes=["INCOME_TAX_EXPENSE"]),
    CrlSpec("CRL_OTHER_INCOME",        "Other Income",             "Other Income / Expense", "Income Statement", 940, "credit",
            taxonomy_node_codes=["OTHER_INCOME", "RENTAL_INCOME"]),
    CrlSpec("CRL_OTHER_EXPENSE",       "Other Expense",            "Other Income / Expense", "Income Statement", 950, "debit",
            taxonomy_node_codes=["OTHER_EXPENSE"]),

    # ── Sub-lines (17 — parent_code set) ──────────────────────────────────
    # Under Payroll Liabilities (CRL_PAYROLL_LIABILITIES, #16 in v2 catalog)
    CrlSpec("CRL_PAYROLL_LIAB_SALARIES",   "Salaries Payable",     "Liabilities", "Balance Sheet", 321, "credit",
            parent_code="CRL_PAYROLL_LIABILITIES",
            taxonomy_node_codes=["ACCRUED_PAYROLL"]),
    CrlSpec("CRL_PAYROLL_LIAB_TAXES",      "Payroll Tax Payable",  "Liabilities", "Balance Sheet", 322, "credit",
            parent_code="CRL_PAYROLL_LIABILITIES",
            taxonomy_node_codes=["PAYROLL_TAX_PAYABLE"]),
    CrlSpec("CRL_PAYROLL_LIAB_BENEFITS",   "Benefits Payable",     "Liabilities", "Balance Sheet", 323, "credit",
            parent_code="CRL_PAYROLL_LIABILITIES",
            taxonomy_node_codes=["EMPLOYEE_BENEFITS"]),

    # Under Payroll Expense
    CrlSpec("CRL_PAYROLL_SALARIES",    "Salaries",                 "Operating Expenses", "Income Statement", 701, "debit",
            parent_code="CRL_PAYROLL_EXPENSE",
            taxonomy_node_codes=["SALARIES_WAGES"]),
    CrlSpec("CRL_PAYROLL_TAXES",       "Payroll Taxes",            "Operating Expenses", "Income Statement", 702, "debit",
            parent_code="CRL_PAYROLL_EXPENSE",
            taxonomy_node_codes=["PAYROLL_TAXES"]),
    CrlSpec("CRL_PAYROLL_BONUSES",     "Bonuses",                  "Operating Expenses", "Income Statement", 703, "debit",
            parent_code="CRL_PAYROLL_EXPENSE",
            taxonomy_node_codes=["BONUSES"]),
    CrlSpec("CRL_PAYROLL_COMMISSIONS", "Commissions",              "Operating Expenses", "Income Statement", 704, "debit",
            parent_code="CRL_PAYROLL_EXPENSE",
            taxonomy_node_codes=["COMMISSIONS"]),
    CrlSpec("CRL_PAYROLL_STOCK_COMP",  "Stock-Based Compensation", "Operating Expenses", "Income Statement", 705, "debit",
            parent_code="CRL_PAYROLL_EXPENSE",
            taxonomy_node_codes=["STOCK_BASED_COMP"]),

    # Under Employee Benefits
    CrlSpec("CRL_BENEFITS_HEALTH",     "Health Insurance",         "Operating Expenses", "Income Statement", 711, "debit",
            parent_code="CRL_EMPLOYEE_BENEFITS",
            taxonomy_node_codes=["EMPLOYEE_BENEFITS"]),
    CrlSpec("CRL_BENEFITS_401K",       "401(k) Match",             "Operating Expenses", "Income Statement", 712, "debit",
            parent_code="CRL_EMPLOYEE_BENEFITS",
            taxonomy_node_codes=["EMPLOYEE_BENEFITS"]),
    CrlSpec("CRL_BENEFITS_OTHER",      "Other Benefits",           "Operating Expenses", "Income Statement", 713, "debit",
            parent_code="CRL_EMPLOYEE_BENEFITS",
            taxonomy_node_codes=["EMPLOYEE_BENEFITS"]),

    # Under Professional Fees
    CrlSpec("CRL_PROF_AUDIT",          "Audit",                    "Operating Expenses", "Income Statement", 731, "debit",
            parent_code="CRL_PROFESSIONAL_FEES",
            taxonomy_node_codes=["PROFESSIONAL_FEES"]),
    CrlSpec("CRL_PROF_TAX",            "Tax",                      "Operating Expenses", "Income Statement", 732, "debit",
            parent_code="CRL_PROFESSIONAL_FEES",
            taxonomy_node_codes=["PROFESSIONAL_FEES"]),
    CrlSpec("CRL_PROF_LEGAL",          "Legal",                    "Operating Expenses", "Income Statement", 733, "debit",
            parent_code="CRL_PROFESSIONAL_FEES",
            taxonomy_node_codes=["LEGAL_FEES"]),
    CrlSpec("CRL_PROF_CONSULTING",     "Consulting",               "Operating Expenses", "Income Statement", 734, "debit",
            parent_code="CRL_PROFESSIONAL_FEES",
            taxonomy_node_codes=["PROFESSIONAL_FEES"]),

    # Under COGS
    CrlSpec("CRL_COGS_MATERIALS",      "Direct Materials",         "Cost of Revenue", "Income Statement", 601, "debit",
            parent_code="CRL_COGS",
            taxonomy_node_codes=["COGS_MATERIALS"]),
    CrlSpec("CRL_COGS_LABOR",          "Direct Labor",             "Cost of Revenue", "Income Statement", 602, "debit",
            parent_code="CRL_COGS",
            taxonomy_node_codes=["COGS_LABOR"]),
]


# ---------------------------------------------------------------------------
# REPORTING TEMPLATES — 8 system templates
# ---------------------------------------------------------------------------

# Common parents-only subset used by SMB General + most industry templates
# as their core. Templates add sub-lines or industry-specific exposure on top.
_PARENT_CRL_CODES = [
    c.code for c in CRL_CATALOG
    if c.parent_code is None and not c.is_mandatory
]
_ALL_CRL_CODES = [c.code for c in CRL_CATALOG]


TEMPLATE_CATALOG: list[TemplateSpec] = [
    TemplateSpec(
        code="smb_general",
        name="SMB General",
        description="Industry-neutral default for small/mid-market businesses. "
                    "Parent CRLs only; sub-lines are hidden by default but can be "
                    "enabled per-org under Settings.",
        crl_codes=_PARENT_CRL_CODES,
    ),
    TemplateSpec(
        code="healthcare",
        name="Healthcare",
        description="Healthcare reporting. Industry-specific revenue (patient, "
                    "capitation) lives in the Healthcare taxonomy beneath each CRL.",
        crl_codes=_PARENT_CRL_CODES + [
            # Surface Revenue sub-lines where relevant
            "CRL_PAYROLL_SALARIES", "CRL_PAYROLL_TAXES", "CRL_PAYROLL_BONUSES",
        ],
    ),
    TemplateSpec(
        code="saas",
        name="SaaS",
        description="SaaS reporting. Subscription Revenue + Hosting/Infrastructure "
                    "Costs prominent. SaaS taxonomy (ARR/MRR/CAC) overlays beneath.",
        crl_codes=_PARENT_CRL_CODES + [
            "CRL_PAYROLL_SALARIES", "CRL_PAYROLL_COMMISSIONS",
            "CRL_PAYROLL_STOCK_COMP",
        ],
    ),
    TemplateSpec(
        code="manufacturing",
        name="Manufacturing",
        description="Manufacturing reporting. Direct Materials / Direct Labor / "
                    "Overhead sub-lines surfaced under COGS.",
        crl_codes=_PARENT_CRL_CODES + [
            "CRL_COGS_MATERIALS", "CRL_COGS_LABOR",
        ],
    ),
    TemplateSpec(
        code="construction",
        name="Construction",
        description="Construction reporting. Contract revenue/cost details in the "
                    "Construction taxonomy beneath each CRL.",
        crl_codes=_PARENT_CRL_CODES + ["CRL_COGS_MATERIALS", "CRL_COGS_LABOR"],
    ),
    TemplateSpec(
        code="real_estate",
        name="Real Estate",
        description="Real Estate reporting. Rental revenue + property operating "
                    "expenses via the Real Estate taxonomy beneath each CRL.",
        crl_codes=_PARENT_CRL_CODES,
    ),
    TemplateSpec(
        code="nonprofit",
        name="Nonprofit",
        description="Nonprofit reporting. Donor-restricted / unrestricted net assets "
                    "in the Nonprofit taxonomy beneath Equity CRLs.",
        crl_codes=_PARENT_CRL_CODES,
    ),
    TemplateSpec(
        code="spac_public",
        name="SPAC / Public Company",
        description="SPAC and public-company reporting. All sub-lines surfaced; "
                    "SEC disclosure overlay from the SPAC/Public taxonomy.",
        crl_codes=_ALL_CRL_CODES,
    ),
]
