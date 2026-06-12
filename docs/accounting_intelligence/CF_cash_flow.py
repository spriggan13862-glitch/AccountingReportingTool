"""Cash Flow Statement — 8 issue templates (CF_001–CF_008)"""

CASH_FLOW_STATEMENT = [
    {
        "code": "CF_001",
        "category": "cash_flow_statement",
        "subcategory": "classification",
        "issue_type": "financial_analytics",
        "name": "Cash Flow Classification Error — Operating vs. Financing vs. Investing",
        "description": (
            "Cash flows are classified incorrectly between operating, investing, and "
            "financing activities on the statement of cash flows. Misclassification "
            "distorts key OCF metrics that analysts and lenders use to assess cash "
            "generation capability."
        ),
        "risk_level": "moderate",
        "materiality_note": "Material when OCF is significantly affected by misclassified items.",
        "detection_logic": "Finance lease payments in operating activities; debt issuance costs in operating activities; proceeds from asset sales in operating cash flows.",
        "potential_causes": [
            "Finance lease payments classified as operating when they should be split (financing and operating)",
            "Proceeds from long-term asset sales in operating rather than investing",
            "Debt issuance costs netted against proceeds rather than shown in financing",
        ],
        "suggested_procedures": [
            "Review all significant cash flow items for proper classification",
            "Apply ASC 230 guidance to each significant item",
            "Recalculate OCF with corrections",
        ],
        "suggested_ajes": [
            "Reclassification within cash flow statement — no balance sheet impact",
        ],
        "management_questions": [
            "Are finance lease payments properly split between interest (operating) and principal (financing)?",
            "Are proceeds from asset sales in investing activities?",
            "Are acquisition-related payments in investing activities?",
        ],
        "affected_account_types": ["asset"],
        "affected_statements": ["CashFlowStatement"],
        "audit_assertions": ["classification", "accuracy"],
        "references": ["ASC 230-10-45", "ASC 842-20-45"],
        "sort_order": 10,
    },
    {
        "code": "CF_002",
        "category": "cash_flow_statement",
        "subcategory": "non_cash",
        "issue_type": "audit",
        "name": "Non-Cash Transactions Not Disclosed",
        "description": (
            "Significant non-cash investing and financing transactions are not disclosed "
            "in a supplemental schedule to the cash flow statement. ASC 230 requires "
            "disclosure of non-cash transactions that would otherwise be investing or "
            "financing activities."
        ),
        "risk_level": "moderate",
        "materiality_note": "Flag any significant non-cash transactions not disclosed.",
        "detection_logic": "New assets or liabilities on balance sheet without corresponding cash flow; known non-cash transactions (stock-based comp, debt-for-equity swap) without supplemental disclosure.",
        "potential_causes": [
            "Assets acquired through debt or equity not shown as non-cash",
            "Stock-based compensation supplemental disclosure missing",
            "Finance lease inception entries not disclosed",
        ],
        "suggested_procedures": [
            "Review balance sheet changes for items without corresponding cash flows",
            "Prepare or verify supplemental non-cash activity disclosure",
            "Include ROU asset/lease liability recognition in non-cash disclosures",
        ],
        "suggested_ajes": [],
        "management_questions": [
            "Were there any asset acquisitions financed without cash (debt, equity, barter)?",
            "Are all non-cash transactions included in the supplemental disclosure?",
        ],
        "affected_account_types": ["asset", "liability"],
        "affected_statements": ["CashFlowStatement"],
        "audit_assertions": ["completeness", "presentation"],
        "references": ["ASC 230-10-50-3", "ASC 230-10-50-4"],
        "sort_order": 20,
    },
    {
        "code": "CF_003",
        "category": "cash_flow_statement",
        "subcategory": "free_cash_flow",
        "issue_type": "qoe",
        "name": "Free Cash Flow to Equity Negative Despite Positive Net Income",
        "description": (
            "Free Cash Flow to Equity (FCFE = OCF − CapEx) is negative while net "
            "income is positive, indicating that capital requirements are consuming "
            "more than earned income. This signals a cash-hungry business model and "
            "is a critical QoE and credit concern."
        ),
        "risk_level": "moderate",
        "materiality_note": "Flag for two consecutive periods of negative FCFE with positive net income.",
        "detection_logic": "FCFE = Operating Cash Flow − Capital Expenditures < 0 with Net Income > 0.",
        "potential_causes": [
            "Highly capital-intensive business requiring ongoing reinvestment",
            "Growth investments depressing near-term FCF",
            "Working capital expansion consuming operating cash flow",
        ],
        "suggested_procedures": [
            "Calculate FCFE for trailing 4 quarters",
            "Decompose gap between net income and FCFE",
            "Assess CapEx composition: maintenance vs. growth",
            "Project FCFE under different scenarios",
        ],
        "suggested_ajes": [],
        "management_questions": [
            "What is driving the gap between net income and free cash flow?",
            "At what revenue level does the business expect to generate positive FCF?",
            "What is the CapEx plan for the next 12 months?",
        ],
        "affected_account_types": ["asset"],
        "affected_statements": ["CashFlowStatement", "IncomeStatement"],
        "audit_assertions": ["accuracy", "completeness"],
        "references": ["QoE best practices"],
        "sort_order": 30,
    },
    {
        "code": "CF_004",
        "category": "cash_flow_statement",
        "subcategory": "indirect_method",
        "issue_type": "audit",
        "name": "Indirect Method Cash Flow Reconciliation Error",
        "description": (
            "The indirect method cash flow reconciliation from net income to OCF "
            "contains errors. Common errors include: not reversing all non-cash "
            "charges, working capital changes using incorrect beginning or ending "
            "balances, or including non-operating items in OCF."
        ),
        "risk_level": "moderate",
        "materiality_note": "Error materially affects OCF if working capital changes are misquantified.",
        "detection_logic": "Sum of beginning and ending balance sheet does not agree to cash flow statement working capital changes; non-cash add-backs missing or duplicated.",
        "potential_causes": [
            "Working capital change calculation using average rather than net change",
            "Non-cash items not fully added back (deferred revenue, accruals)",
            "Acquisition-related balance sheet changes included in operating working capital",
        ],
        "suggested_procedures": [
            "Reconcile each working capital line item to balance sheet change",
            "Verify all non-cash charges are added back",
            "Exclude acquisition-related changes from operating working capital",
        ],
        "suggested_ajes": [],
        "management_questions": [
            "Has the cash flow statement been reconciled to balance sheet changes?",
            "Are acquisition-related working capital changes excluded from operating activities?",
        ],
        "affected_account_types": ["asset", "liability"],
        "affected_statements": ["CashFlowStatement"],
        "audit_assertions": ["accuracy", "completeness"],
        "references": ["ASC 230-10-45-28", "ASC 230-10-45-29"],
        "sort_order": 40,
    },
    {
        "code": "CF_005",
        "category": "cash_flow_statement",
        "subcategory": "capex",
        "issue_type": "financial_analytics",
        "name": "Capital Expenditures Not Disclosed or Understated in Cash Flow",
        "description": (
            "Capital expenditures in the investing section of the cash flow statement "
            "do not include all cash paid for property, plant, equipment, and other "
            "long-lived assets. Understated CapEx may result from capitalizing "
            "through AP without cash outflow disclosure or missing internal-use "
            "software capitalization."
        ),
        "risk_level": "moderate",
        "materiality_note": "Material when CapEx is a significant use of cash for capital-intensive businesses.",
        "detection_logic": "Fixed asset additions on balance sheet exceed CapEx in investing activities; internal-use software asset growth without corresponding CapEx.",
        "potential_causes": [
            "Assets acquired through vendor financing not shown in CapEx",
            "Internal-use software development costs not in CapEx",
            "Assets transferred in from affiliates at book value without cash flow",
        ],
        "suggested_procedures": [
            "Reconcile fixed asset additions to investing cash outflows",
            "Identify non-cash asset acquisitions; disclose in supplemental schedule",
        ],
        "suggested_ajes": [],
        "management_questions": [
            "Were any assets acquired through vendor financing or debt rather than cash?",
            "Are software development capitalization outflows included in CapEx?",
        ],
        "affected_account_types": ["asset"],
        "affected_statements": ["CashFlowStatement"],
        "audit_assertions": ["completeness", "accuracy"],
        "references": ["ASC 230-10-45-12", "ASC 230-10-50-3"],
        "sort_order": 50,
    },
    {
        "code": "CF_006",
        "category": "cash_flow_statement",
        "subcategory": "fx_impact",
        "issue_type": "audit",
        "name": "Foreign Currency Effect on Cash Not Separately Presented",
        "description": (
            "For entities with foreign currency cash balances, the effect of exchange "
            "rate changes on cash and cash equivalents must be presented separately "
            "on the cash flow statement. Failing to isolate the FX effect distorts "
            "OCF, investing, and financing cash flows."
        ),
        "risk_level": "low",
        "materiality_note": "Flag when foreign currency cash is significant and exchange rate movements are material.",
        "detection_logic": "Foreign subsidiaries or foreign currency bank accounts without separate FX effect line on cash flow statement.",
        "potential_causes": [
            "FX effect on cash omitted from cash flow statement",
            "FX included in operating cash flows rather than as a separate line",
        ],
        "suggested_procedures": [
            "Calculate FX effect on cash by translating foreign cash balances at opening and closing rates",
            "Present FX effect as a separate reconciling item on cash flow statement",
        ],
        "suggested_ajes": [],
        "management_questions": [
            "Are there significant cash balances held in foreign currencies?",
            "Is the FX effect on cash separately presented on the cash flow statement?",
        ],
        "affected_account_types": ["asset"],
        "affected_statements": ["CashFlowStatement"],
        "audit_assertions": ["presentation", "accuracy"],
        "references": ["ASC 230-10-45-28", "ASC 830-230-45"],
        "sort_order": 60,
    },
    {
        "code": "CF_007",
        "category": "cash_flow_statement",
        "subcategory": "distributions",
        "issue_type": "financial_analytics",
        "name": "Owner Distributions Understated in Financing Activities",
        "description": (
            "Cash distributions to owners are understated or misclassified in the "
            "cash flow statement. All distributions to owners (dividends, S-corp "
            "distributions, partner withdrawals) are financing outflows. Understatement "
            "makes the business appear to generate more net cash than it actually does."
        ),
        "risk_level": "moderate",
        "materiality_note": "Material when distributions are significant relative to operating cash flow.",
        "detection_logic": "Retained earnings reconciliation implies distributions not reflected in financing activities; equity decreasing without corresponding financing outflow.",
        "potential_causes": [
            "Distributions paid from operating account coded to operating cash flows",
            "Owner draws not consistently categorized as financing",
        ],
        "suggested_procedures": [
            "Reconcile equity section changes to financing activities",
            "Identify all distribution payments; confirm financing classification",
        ],
        "suggested_ajes": [],
        "management_questions": [
            "Are all owner distributions reflected in financing activities on the cash flow statement?",
            "Is there a reconciliation of equity section to financing activities?",
        ],
        "affected_account_types": ["equity"],
        "affected_statements": ["CashFlowStatement"],
        "audit_assertions": ["completeness", "classification"],
        "references": ["ASC 230-10-45-15"],
        "sort_order": 70,
    },
    {
        "code": "CF_008",
        "category": "cash_flow_statement",
        "subcategory": "cash_equivalents",
        "issue_type": "balance_sheet",
        "name": "Cash Equivalents Classification Incorrect",
        "description": (
            "Short-term investments classified as cash equivalents do not meet the "
            "90-day maturity criteria under ASC 230, or instruments with maturity "
            "< 90 days but with significant market risk are incorrectly treated as "
            "cash equivalents."
        ),
        "risk_level": "low",
        "materiality_note": "Evaluate when cash equivalents are material relative to total cash.",
        "detection_logic": "Money market funds with restrictions or equity features classified as cash equivalents; short-term investments with > 90 day maturity in cash equivalents.",
        "potential_causes": [
            "Treasury bills with > 90 day maturity classified as cash equivalents",
            "Restricted money market funds not excluded",
        ],
        "suggested_procedures": [
            "Review all items classified as cash equivalents",
            "Verify maturity ≤ 90 days and no significant market risk",
            "Reclassify non-qualifying items to short-term investments",
        ],
        "suggested_ajes": [
            "Dr Short-Term Investments / Cr Cash and Cash Equivalents — to reclassify non-qualifying items",
        ],
        "management_questions": [
            "What instruments are classified as cash equivalents?",
            "Do all cash equivalents have maturity dates within 90 days of purchase?",
        ],
        "affected_account_types": ["asset"],
        "affected_statements": ["BalanceSheet", "CashFlowStatement"],
        "audit_assertions": ["classification", "accuracy"],
        "references": ["ASC 230-10-20", "ASC 230-10-45-1"],
        "sort_order": 80,
    },
]
