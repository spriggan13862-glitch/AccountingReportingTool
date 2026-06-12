"""Cash Management — 8 issue templates (CASH_001–CASH_008)"""

CASH_MANAGEMENT = [
    {
        "code": "CASH_001",
        "category": "cash_management",
        "subcategory": "reconciliation",
        "issue_type": "audit",
        "name": "Bank Reconciliation Not Performed or Has Outstanding Items",
        "description": (
            "Bank reconciliations have not been performed timely, or the reconciliation "
            "contains long-outstanding reconciling items that have not been investigated "
            "or cleared. Outstanding items >30 days may represent errors, fraud, or "
            "improper entries."
        ),
        "risk_level": "high",
        "materiality_note": "Flag any unreconciled items; high risk for items outstanding > 30 days.",
        "detection_logic": "Reconciling items outstanding > 30 days; book-to-bank difference material; reconciliation not dated within 30 days of period end.",
        "potential_causes": [
            "Lack of segregation of duties — same person handles cash and reconciliation",
            "Deposits in transit not clearing in subsequent period",
            "Outstanding checks representing fraud or voided checks not removed",
            "Manual journal entries to cash without bank support",
        ],
        "suggested_procedures": [
            "Obtain bank statements and reconciliations for each bank account",
            "Verify all outstanding items; investigate items > 30 days",
            "Confirm that book balance agrees to general ledger",
            "Assess whether the person performing the reconciliation is independent of cash handling",
        ],
        "suggested_ajes": [
            "Dr/Cr Cash — to record book adjustments identified through reconciliation",
        ],
        "management_questions": [
            "Who performs the bank reconciliation? Who reviews and approves it?",
            "Are there any reconciling items outstanding > 30 days?",
            "Have there been any NSF checks or bank errors in the period?",
        ],
        "affected_account_types": ["asset"],
        "affected_statements": ["BalanceSheet"],
        "audit_assertions": ["existence", "completeness", "accuracy"],
        "references": ["AU-C 315", "COSO Control Activities"],
        "sort_order": 10,
    },
    {
        "code": "CASH_002",
        "category": "cash_management",
        "subcategory": "restricted_cash",
        "issue_type": "balance_sheet",
        "name": "Restricted Cash Not Separately Classified",
        "description": (
            "Cash subject to legal or contractual restrictions (escrow deposits, debt "
            "service reserves, letters of credit collateral) is classified as unrestricted "
            "cash. Under ASC 230 and ASU 2016-18, restricted cash must be separately "
            "presented on the balance sheet and excluded from operating cash flow."
        ),
        "risk_level": "moderate",
        "materiality_note": "Material when restricted cash exceeds 5% of total cash or liquidity analysis is affected.",
        "detection_logic": "Escrow accounts, bond reserves, or collateral deposits included in unrestricted cash line item.",
        "potential_causes": [
            "Escrow deposits from M&A transaction not reclassified",
            "SBA or bank loan cash reserve requirements not separately classified",
            "Security deposits held in operating bank account",
        ],
        "suggested_procedures": [
            "Review all bank accounts and identify any with restrictions",
            "Obtain documentation for escrow, reserve, or collateral arrangements",
            "Reclassify restricted cash to separate balance sheet line",
            "Verify cash flow statement reconciliation includes restricted cash",
        ],
        "suggested_ajes": [
            "Dr Restricted Cash / Cr Cash — to reclassify restricted amounts",
        ],
        "management_questions": [
            "Are there any bank accounts with withdrawal restrictions or minimum balance requirements?",
            "Are there any escrow or reserve accounts held by lenders or counterparties?",
            "Are there any letters of credit backed by cash collateral?",
        ],
        "affected_account_types": ["asset"],
        "affected_statements": ["BalanceSheet", "CashFlowStatement"],
        "audit_assertions": ["presentation", "completeness"],
        "references": ["ASC 230-10-45-4", "ASU 2016-18"],
        "sort_order": 20,
    },
    {
        "code": "CASH_003",
        "category": "cash_management",
        "subcategory": "petty_cash",
        "issue_type": "fraud",
        "name": "Petty Cash and Imprest Fund Misappropriation Risk",
        "description": (
            "Petty cash funds are uncontrolled, not reconciled regularly, or used for "
            "unauthorized expenditures. While petty cash balances are often individually "
            "small, weak controls create a fraud environment and indicate broader "
            "control deficiencies."
        ),
        "risk_level": "low",
        "materiality_note": "Generally not quantitatively material but is an indicator of control environment weakness.",
        "detection_logic": "Petty cash replenishments with unusual frequency or amounts; supporting receipts missing or for non-business purposes.",
        "potential_causes": [
            "Petty cash custodian not performing regular counts",
            "Lack of receipts required for disbursements",
            "Personal expenses reimbursed through petty cash",
            "No surprise counts by management",
        ],
        "suggested_procedures": [
            "Perform surprise count of petty cash fund(s)",
            "Verify vouchers and receipts for recent disbursements",
            "Confirm fund total: cash + vouchers = authorized fund amount",
            "Review replenishment history for frequency and amounts",
        ],
        "suggested_ajes": [
            "Dr Miscellaneous Expense / Cr Cash — to record unvouchered disbursements",
        ],
        "management_questions": [
            "Who is the custodian of petty cash funds?",
            "How often are counts performed? Who performs them?",
            "Are receipts required for all disbursements?",
        ],
        "affected_account_types": ["asset"],
        "affected_statements": ["BalanceSheet"],
        "audit_assertions": ["existence", "completeness"],
        "references": ["COSO Control Activities", "AU-C 315"],
        "sort_order": 30,
    },
    {
        "code": "CASH_004",
        "category": "cash_management",
        "subcategory": "overdraft",
        "issue_type": "balance_sheet",
        "name": "Book Overdraft Presented as Cash Rather Than Current Liability",
        "description": (
            "The general ledger cash account has a negative (credit) balance resulting "
            "from outstanding checks exceeding bank balance. This book overdraft should "
            "be reclassified to a current liability rather than presented as a negative "
            "cash balance."
        ),
        "risk_level": "moderate",
        "materiality_note": "Reclassification always required when material to liquidity assessment.",
        "detection_logic": "Cash account balance is negative; bank balance is positive while book balance is negative.",
        "potential_causes": [
            "Float management practice of issuing checks before funding",
            "Automated payroll or AP disbursements exceeding current bank balance",
        ],
        "suggested_procedures": [
            "Identify all bank accounts with negative book balances",
            "Reclassify negative cash to 'Book Overdraft' current liability",
            "Assess whether overdraft facility is in place and properly disclosed",
        ],
        "suggested_ajes": [
            "Dr Cash / Cr Book Overdraft (Current Liability) — to reclassify negative cash",
        ],
        "management_questions": [
            "Is there a revolving credit facility covering check float?",
            "Are checks regularly issued before funds are transferred?",
        ],
        "affected_account_types": ["asset", "liability"],
        "affected_statements": ["BalanceSheet"],
        "audit_assertions": ["presentation", "classification"],
        "references": ["ASC 210-10-45-4", "ASC 230-10-45-14"],
        "sort_order": 40,
    },
    {
        "code": "CASH_005",
        "category": "cash_management",
        "subcategory": "kiting",
        "issue_type": "fraud",
        "name": "Check Kiting — Float Exploitation Between Bank Accounts",
        "description": (
            "Check kiting involves writing a check from one bank account while relying "
            "on funds from another account not yet cleared to cover the check, creating "
            "artificial cash balances. Kiting inflates cash and can obscure cash "
            "shortfalls or fraud."
        ),
        "risk_level": "critical",
        "materiality_note": "Any confirmed kiting is a critical finding; both qualitatively material and indicative of fraud.",
        "detection_logic": "Deposits in transit near period end from internal transfers; bank transfer schedule shows transfers outstanding > 3 days; multiple bank accounts with near-simultaneous large transfers.",
        "potential_causes": [
            "Cash flow shortage leading to float manipulation",
            "Deliberate inflation of cash balance for financing or reporting purposes",
            "Concealment of misappropriation through circular transfers",
        ],
        "suggested_procedures": [
            "Prepare bank transfer schedule for 2 weeks before and after period end",
            "Identify all inter-bank transfers; confirm both sides recorded in same period",
            "Obtain cutoff bank statements and trace all outstanding transfers",
            "Assess reasonableness of deposits in transit at period end",
        ],
        "suggested_ajes": [
            "Dr Suspense / Cr Cash — to eliminate fictitious cash created by kiting",
        ],
        "management_questions": [
            "Are there regular transfers between bank accounts? What is the purpose?",
            "What is the typical clearing time for inter-bank transfers?",
        ],
        "affected_account_types": ["asset"],
        "affected_statements": ["BalanceSheet"],
        "audit_assertions": ["existence", "accuracy"],
        "references": ["AU-C 240", "ACFE Fraud Tree"],
        "sort_order": 50,
    },
    {
        "code": "CASH_006",
        "category": "cash_management",
        "subcategory": "concentration",
        "issue_type": "qoe",
        "name": "Cash Concentration Risk — Uninsured Balances Above FDIC Limits",
        "description": (
            "Cash balances at a single financial institution exceed FDIC insurance limits "
            "($250,000 per depositor per institution) without any offsetting credit "
            "arrangement, creating uninsured concentration risk. This is a disclosure "
            "item and a risk factor for lenders and acquirers."
        ),
        "risk_level": "low",
        "materiality_note": "Disclosure-level item; flag for any entity with operational cash needs. Not a GAAP error but a significant risk disclosure.",
        "detection_logic": "Cash balance at single institution exceeds $250,000 without disclosed mitigation.",
        "potential_causes": [
            "Operating account concentration without sweep arrangement",
            "Lack of cash management policy requiring diversification",
        ],
        "suggested_procedures": [
            "Identify all bank accounts and institutions",
            "Calculate uninsured portion at each institution",
            "Assess whether ICS, CDARS, or other programs are in place",
        ],
        "suggested_ajes": [],
        "management_questions": [
            "Are uninsured cash balances disclosed in the financial statements?",
            "Is there a bank diversification policy?",
            "Are any cash management programs (ICS, CDARS) in place?",
        ],
        "affected_account_types": ["asset"],
        "affected_statements": ["BalanceSheet"],
        "audit_assertions": ["presentation"],
        "references": ["ASC 825-10-50", "FDIC regulations"],
        "sort_order": 60,
    },
    {
        "code": "CASH_007",
        "category": "cash_management",
        "subcategory": "owner_commingling",
        "issue_type": "fraud",
        "name": "Owner Personal Expenses Paid Through Business Accounts",
        "description": (
            "Personal expenses of the owner(s) or related parties are being paid through "
            "business bank accounts and recorded as business expenses. This understates "
            "taxable income, overstates business expenses, and is particularly impactful "
            "in QoE and SBA loan contexts where add-backs affect underwriting."
        ),
        "risk_level": "high",
        "materiality_note": "Any confirmed personal expenses are QoE add-backs; always material in transaction context.",
        "detection_logic": "Personal-sounding payees in disbursements (personal insurance, club memberships, personal vehicles, mortgage payments, family payroll); credit card charges at personal merchants.",
        "potential_causes": [
            "Owner treating company as personal checking account",
            "Lack of formal expense reporting and approval process",
            "Family member salaries and benefits above market rate",
        ],
        "suggested_procedures": [
            "Review general ledger detail for officer expenses, credit card, and miscellaneous accounts",
            "Identify payees suggesting personal use: insurance companies, country clubs, personal vehicles",
            "Quantify personal expense add-backs for QoE or SBA purposes",
            "Assess whether officer compensation is at market rate",
        ],
        "suggested_ajes": [
            "Dr Owner Draw / Distributions / Cr Expense — to reclassify personal expenses",
        ],
        "management_questions": [
            "Are any personal expenses of the owner paid through the business?",
            "Are any family members on payroll? What are their roles and compensation?",
            "Are there any vehicles, insurance policies, or club memberships for personal use?",
        ],
        "affected_account_types": ["asset"],
        "affected_statements": ["IncomeStatement", "BalanceSheet"],
        "audit_assertions": ["occurrence", "accuracy"],
        "references": ["IRS Rev. Rul. 2004-34", "QoE best practices", "SBA SOP 50-10"],
        "sort_order": 70,
    },
    {
        "code": "CASH_008",
        "category": "cash_management",
        "subcategory": "cash_flow_ops",
        "issue_type": "financial_analytics",
        "name": "Operating Cash Flow Materially Below Net Income — Earnings Quality Concern",
        "description": (
            "Operating cash flow is materially below net income, indicating that reported "
            "earnings are not being converted to cash. This is a key earnings quality "
            "indicator. Persistent divergence may indicate aggressive accrual accounting, "
            "revenue recognition issues, or working capital deterioration."
        ),
        "risk_level": "high",
        "materiality_note": "Flag when operating cash flow is less than 70% of net income for two consecutive periods.",
        "detection_logic": "OCF/Net Income ratio < 0.7; large non-cash accruals increasing; working capital consuming cash.",
        "potential_causes": [
            "Revenue recognized but not yet collected (AR growth)",
            "Inventory buildup consuming cash",
            "Aggressive revenue recognition creating book income without cash",
            "Deferred expenses being amortized (non-cash income)",
        ],
        "suggested_procedures": [
            "Calculate OCF/NI ratio for current and prior 3 years",
            "Analyze major working capital changes in the period",
            "Identify non-cash income items included in net income",
            "Assess sustainability of accrual-based income",
        ],
        "suggested_ajes": [],
        "management_questions": [
            "What is driving the difference between net income and operating cash flow?",
            "Are there significant changes in working capital accounts?",
            "Are there any large non-cash accruals affecting reported income?",
        ],
        "affected_account_types": ["asset"],
        "affected_statements": ["CashFlowStatement", "IncomeStatement"],
        "audit_assertions": ["accuracy", "completeness"],
        "references": ["ASC 230-10", "QoE best practices"],
        "sort_order": 80,
    },
]
