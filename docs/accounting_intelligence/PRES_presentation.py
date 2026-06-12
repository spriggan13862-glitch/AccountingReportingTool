"""Presentation — 4 issue templates (PRES_001–PRES_004)"""

PRESENTATION = [
    {
        "code": "PRES_001",
        "category": "presentation",
        "subcategory": "income_statement_format",
        "issue_type": "presentation",
        "name": "Income Statement Classification — Operating vs. Non-Operating",
        "description": (
            "Income and expense items are improperly classified as operating vs. "
            "non-operating, distorting operating income metrics. Recurring items "
            "central to the business should be in operating income; incidental or "
            "peripheral items belong below operating income."
        ),
        "risk_level": "low",
        "materiality_note": "Evaluate based on impact on key operating metrics (EBIT, operating margin).",
        "detection_logic": "Interest income in operating revenue; gains on asset sales in COGS; FX gains in operating income.",
        "potential_causes": [
            "Gain on asset sale in revenue rather than other income",
            "Interest income from operating cash treated as operating revenue",
            "Foreign exchange gains/losses in operating expenses",
        ],
        "suggested_procedures": [
            "Review each income and expense line for proper classification",
            "Reclassify non-operating items below operating income",
            "Ensure FX gains/losses are in other income/expense",
        ],
        "suggested_ajes": [
            "Dr/Cr Operating Line / Cr/Dr Non-Operating Line — to reclassify",
        ],
        "management_questions": [
            "Are any non-operating items included in operating income?",
            "Are gains and losses from asset disposals in other income?",
        ],
        "affected_account_types": ["revenue", "cogs"],
        "affected_statements": ["IncomeStatement"],
        "audit_assertions": ["classification", "presentation"],
        "references": ["ASC 225-20-45", "ASC 230-10-45"],
        "sort_order": 10,
    },
    {
        "code": "PRES_002",
        "category": "presentation",
        "subcategory": "balance_sheet_format",
        "issue_type": "presentation",
        "name": "Balance Sheet Not Classified into Current and Non-Current",
        "description": (
            "The balance sheet is presented in unclassified format without distinguishing "
            "current from non-current assets and liabilities. A classified balance sheet "
            "is required for all entities except certain investment companies. Unclassified "
            "presentation prevents assessment of liquidity and working capital."
        ),
        "risk_level": "moderate",
        "materiality_note": "Qualitative finding; prevents liquidity analysis.",
        "detection_logic": "Balance sheet does not separate current and long-term sections.",
        "potential_causes": [
            "Template not updated from unclassified to classified format",
            "Private company or compilation engagement using simplified format",
        ],
        "suggested_procedures": [
            "Reclassify balance sheet into current/non-current categories",
            "Apply ASC 210 definitions for current assets and liabilities",
        ],
        "suggested_ajes": [],
        "management_questions": [
            "Is the balance sheet presented in classified format?",
            "Are all current and non-current items properly identified?",
        ],
        "affected_account_types": ["asset", "liability"],
        "affected_statements": ["BalanceSheet"],
        "audit_assertions": ["presentation", "classification"],
        "references": ["ASC 210-10-45-1", "ASC 210-10-45-5"],
        "sort_order": 20,
    },
    {
        "code": "PRES_003",
        "category": "presentation",
        "subcategory": "equity_section",
        "issue_type": "presentation",
        "name": "Equity Section Presentation Incomplete or Incorrect",
        "description": (
            "The equity section does not properly present all components: common stock, "
            "additional paid-in capital, retained earnings/accumulated deficit, "
            "accumulated other comprehensive income, and treasury stock. Consolidated "
            "entities must present non-controlling interests separately from parent equity."
        ),
        "risk_level": "low",
        "materiality_note": "Reclassification required; material to equity analysis.",
        "detection_logic": "Equity section combines retained earnings and APIC without separation; NCI not separately presented.",
        "potential_causes": [
            "Simplified equity presentation for privately held entity",
            "S-Corp or LLC not presenting equity components consistent with GAAP",
        ],
        "suggested_procedures": [
            "Disaggregate equity section into required components",
            "Present NCI separately if consolidated entity",
            "Include statement of changes in equity",
        ],
        "suggested_ajes": [],
        "management_questions": [
            "Are all components of equity separately presented?",
            "Is there accumulated other comprehensive income that should be separately stated?",
        ],
        "affected_account_types": ["equity"],
        "affected_statements": ["BalanceSheet"],
        "audit_assertions": ["presentation", "classification"],
        "references": ["ASC 505-10-45", "ASC 810-10-45-16"],
        "sort_order": 30,
    },
    {
        "code": "PRES_004",
        "category": "presentation",
        "subcategory": "earnings_per_share",
        "issue_type": "presentation",
        "name": "Earnings Per Share Disclosure Incorrect or Missing",
        "description": (
            "Earnings per share (EPS) is required for public entities and should be "
            "presented correctly. Errors include: using incorrect shares outstanding, "
            "not presenting diluted EPS when dilutive instruments exist, or incorrectly "
            "calculating the dilutive impact of options, warrants, or convertible debt."
        ),
        "risk_level": "low",
        "materiality_note": "Required for public entities; voluntary for private but common in debt agreements.",
        "detection_logic": "EPS uses end-of-period shares rather than weighted average; dilutive instruments excluded from diluted EPS; anti-dilutive instruments included.",
        "potential_causes": [
            "Weighted average share calculation not performed",
            "Convertible instruments not included in diluted EPS denominator",
            "Incorrect treasury stock method application",
        ],
        "suggested_procedures": [
            "Recalculate weighted average basic shares",
            "Calculate diluted shares including all dilutive instruments",
            "Verify anti-dilutive instruments are excluded from diluted EPS",
        ],
        "suggested_ajes": [],
        "management_questions": [
            "Are weighted average shares used for EPS rather than period-end shares?",
            "Are all dilutive instruments (options, warrants, convertibles) included in diluted EPS?",
        ],
        "affected_account_types": ["equity"],
        "affected_statements": ["IncomeStatement"],
        "audit_assertions": ["accuracy", "presentation"],
        "references": ["ASC 260-10-45", "ASC 260-10-55"],
        "sort_order": 40,
    },
]
