"""Fraud Indicators — 8 issue templates (FRAUD_001–FRAUD_008)"""

FRAUD_INDICATORS = [
    {
        "code": "FRAUD_001",
        "category": "fraud_indicators",
        "subcategory": "journal_entries",
        "issue_type": "fraud",
        "name": "Unusual Journal Entries — Fraud Risk Indicators",
        "description": (
            "Journal entries with characteristics associated with fraudulent financial "
            "reporting: entries posted late at night or on weekends, entries by users "
            "who do not normally post, entries with round numbers, entries reversing "
            "prior period fraud, or entries posted directly to key accounts without "
            "sub-ledger support."
        ),
        "risk_level": "critical",
        "materiality_note": "Any confirmed fraudulent journal entry is critical regardless of amount.",
        "detection_logic": "Entries posted outside business hours; entries by unexpected preparers; large round-number entries to revenue or equity; entries debiting expenses and crediting cash without description.",
        "potential_causes": [
            "Management override of controls",
            "Accounting staff perpetrating financial statement fraud",
            "Intentional misclassification of transactions",
        ],
        "suggested_procedures": [
            "Export complete journal entry listing with preparer, date/time, and description",
            "Identify entries posted outside business hours or by unexpected users",
            "Test entries without sub-ledger support",
            "Interview preparers of unusual entries",
        ],
        "suggested_ajes": [
            "Reverse fraudulent entries and record correct accounting",
        ],
        "management_questions": [
            "Who has authorization to post journal entries to the general ledger?",
            "Are journal entries reviewed and approved before posting?",
            "Is there an exception report for entries posted outside business hours?",
        ],
        "affected_account_types": ["revenue", "asset", "equity"],
        "affected_statements": ["IncomeStatement", "BalanceSheet"],
        "audit_assertions": ["occurrence", "accuracy"],
        "references": ["AU-C 240", "PCAOB AS 2401"],
        "sort_order": 10,
    },
    {
        "code": "FRAUD_002",
        "category": "fraud_indicators",
        "subcategory": "revenue_fraud",
        "issue_type": "fraud",
        "name": "Revenue Fraud Triangle — Pressure, Opportunity, Rationalization Present",
        "description": (
            "The Fraud Triangle conditions for revenue manipulation are present: "
            "pressure (bonus tied to revenue, covenant requirement, pending transaction), "
            "opportunity (weak controls over revenue recognition, limited segregation), "
            "and rationalization (management believes they will 'make it up'). "
            "This is a high-risk configuration requiring heightened scrutiny."
        ),
        "risk_level": "critical",
        "materiality_note": "Presence of all three Fraud Triangle conditions is a critical risk indicator.",
        "detection_logic": "Management compensation tied to revenue targets + weak revenue recognition controls + revenue near a significant threshold.",
        "potential_causes": [
            "Earnout or bonus tied to specific revenue targets",
            "Loan covenant with minimum revenue requirement",
            "Pending sale or financing with revenue-dependent valuation",
        ],
        "suggested_procedures": [
            "Assess all three fraud triangle factors explicitly",
            "Expand revenue testing: more confirmations, more cutoff tests",
            "Review contracts for side agreements and right-of-return clauses",
            "Perform analytical procedures: actual vs. expected revenue by month",
        ],
        "suggested_ajes": [],
        "management_questions": [
            "Are any management bonuses tied to specific revenue targets?",
            "Are there any pending transactions or financings that are contingent on revenue levels?",
            "Are there any revenue-based covenants in loan agreements?",
        ],
        "affected_account_types": ["revenue"],
        "affected_statements": ["IncomeStatement"],
        "audit_assertions": ["occurrence", "completeness"],
        "references": ["AU-C 240", "ACFE Fraud Triangle", "SAS No. 99"],
        "sort_order": 20,
    },
    {
        "code": "FRAUD_003",
        "category": "fraud_indicators",
        "subcategory": "expense_fraud",
        "issue_type": "fraud",
        "name": "Expense Reimbursement Fraud",
        "description": (
            "Employees or management are submitting fraudulent expense reimbursement "
            "claims: fictitious expenses, personal expenses submitted as business, "
            "duplicate submissions, or inflated expenses. This is one of the most "
            "common asset misappropriation schemes."
        ),
        "risk_level": "moderate",
        "materiality_note": "Individual claims may be immaterial; aggregate and systemic risk may be material.",
        "detection_logic": "Round-number expense claims; multiple employees submitting same expense; expenses without adequate receipts; expenses for vendors not in AP master.",
        "potential_causes": [
            "Weak expense approval controls",
            "Single approver for own expense reports",
            "No receipt requirement below threshold",
            "Expense reports not reviewed for reasonableness",
        ],
        "suggested_procedures": [
            "Run duplicate expense analysis: same employee, same amount, similar date",
            "Review expenses without adequate receipts",
            "Test that approvers are not approving their own expenses",
            "Analyze expense trends by employee",
        ],
        "suggested_ajes": [
            "Dr Receivable from Employee / Cr Operating Expense — to record recovery of fraudulent claims",
        ],
        "management_questions": [
            "Who approves employee expense reports? Can managers approve their own?",
            "Are receipts required for all reimbursements?",
            "Has an expense audit been performed recently?",
        ],
        "affected_account_types": ["asset"],
        "affected_statements": ["IncomeStatement"],
        "audit_assertions": ["occurrence", "accuracy"],
        "references": ["AU-C 240", "ACFE Report to the Nations"],
        "sort_order": 30,
    },
    {
        "code": "FRAUD_004",
        "category": "fraud_indicators",
        "subcategory": "asset_misappropriation",
        "issue_type": "fraud",
        "name": "Fixed Asset Theft or Personal Use Without Disclosure",
        "description": (
            "Fixed assets are being used for personal benefit of management or employees, "
            "or are being converted (sold/scrapped) for personal gain without proper "
            "authorization and recording. Physical assets in the register that cannot "
            "be located during inspection are a primary indicator."
        ),
        "risk_level": "high",
        "materiality_note": "Critical when confirmed; high when indicators are present.",
        "detection_logic": "Fixed assets listed in register not present during physical inspection; assets in personal use of management without compensation; vehicle mileage for non-business purposes.",
        "potential_causes": [
            "No periodic physical inspection of fixed assets",
            "Management vehicles used personally without reported benefit",
            "Assets removed from service without formal write-off",
        ],
        "suggested_procedures": [
            "Perform physical inspection of significant fixed assets",
            "Identify all assets not present during inspection",
            "Assess vehicles and equipment for personal use",
            "Review disposal records for missing proceeds",
        ],
        "suggested_ajes": [
            "Dr Loss on Asset / Dr Accumulated Depreciation / Cr Fixed Asset — for missing assets",
        ],
        "management_questions": [
            "Are any company vehicles used for personal purposes? Is a fringe benefit reported?",
            "When was the last physical inspection of fixed assets?",
            "Are all assets in the register still in service?",
        ],
        "affected_account_types": ["asset"],
        "affected_statements": ["BalanceSheet"],
        "audit_assertions": ["existence"],
        "references": ["AU-C 240", "ACFE Fraud Tree — Asset Misappropriation"],
        "sort_order": 40,
    },
    {
        "code": "FRAUD_005",
        "category": "fraud_indicators",
        "subcategory": "financial_statement_fraud",
        "issue_type": "fraud",
        "name": "Beneish M-Score Elevated — Financial Statement Manipulation Indicator",
        "description": (
            "The Beneish M-Score, a statistical model using financial ratios, indicates "
            "a higher-than-normal probability of earnings manipulation. An M-Score above "
            "-1.78 suggests possible manipulation. This is an analytical screening tool, "
            "not a definitive finding, but triggers heightened audit procedures."
        ),
        "risk_level": "high",
        "materiality_note": "Analytical result requiring follow-up; not a standalone finding.",
        "detection_logic": "Beneish M-Score > -1.78 based on available financial data (DSRI, GMI, AQI, SGI, DEPI, SGAI, LVGI, TATA inputs).",
        "potential_causes": [
            "Rapid receivables growth relative to revenue (DSRI elevated)",
            "Gross margin deterioration (GMI elevated)",
            "Asset quality declining through capitalization (AQI elevated)",
            "Sales growth with leverage increase (SGI, LVGI elevated)",
        ],
        "suggested_procedures": [
            "Calculate Beneish M-Score components from financial statements",
            "Identify which components are elevated",
            "Expand procedures in areas indicated by elevated components",
            "Consider engaging forensic accountant for detailed review",
        ],
        "suggested_ajes": [],
        "management_questions": [
            "What explains the rapid growth in accounts receivable relative to revenue?",
            "Are there any accounting policy changes that have affected asset quality?",
        ],
        "affected_account_types": ["revenue", "asset"],
        "affected_statements": ["IncomeStatement", "BalanceSheet"],
        "audit_assertions": ["occurrence", "accuracy"],
        "references": ["Beneish (1999)", "AU-C 240"],
        "sort_order": 50,
    },
    {
        "code": "FRAUD_006",
        "category": "fraud_indicators",
        "subcategory": "check_tampering",
        "issue_type": "fraud",
        "name": "Check Tampering — Altered or Unauthorized Checks",
        "description": (
            "Company checks are being altered (payee or amount changed) or unauthorized "
            "checks are being issued against company bank accounts. Check tampering "
            "is a common disbursement fraud scheme that can persist undetected without "
            "positive pay controls."
        ),
        "risk_level": "high",
        "materiality_note": "Any confirmed check tampering is critical.",
        "detection_logic": "Checks clearing bank with different payee or amount than ERP records; checks clearing without corresponding AP entry; voided checks with cleared bank status.",
        "potential_causes": [
            "No positive pay controls in place",
            "Check signing authority with check printing access",
            "Pre-signed blank checks available in office",
        ],
        "suggested_procedures": [
            "Compare check register to bank-cleared checks; identify discrepancies",
            "Verify that positive pay is implemented for all accounts",
            "Reconcile voided checks to ensure none have cleared",
        ],
        "suggested_ajes": [
            "Dr Fraud Loss / Cr Cash — to record confirmed check tampering losses",
        ],
        "management_questions": [
            "Is positive pay implemented for all bank accounts?",
            "Are pre-signed checks or signature stamps accessible to unauthorized employees?",
            "Are check signatories independent of check preparation?",
        ],
        "affected_account_types": ["asset"],
        "affected_statements": ["BalanceSheet"],
        "audit_assertions": ["occurrence", "existence"],
        "references": ["AU-C 240", "ACFE Fraud Tree — Check Tampering"],
        "sort_order": 60,
    },
    {
        "code": "FRAUD_007",
        "category": "fraud_indicators",
        "subcategory": "skimming",
        "issue_type": "fraud",
        "name": "Cash Skimming — Revenue Not Recorded Before Entry",
        "description": (
            "Cash receipts are being diverted before they are recorded in the accounting "
            "system (skimming). Unlike lapping, skimming results in unrecorded revenue. "
            "Indicators include cash sales significantly below industry norms, tip income "
            "not reported, and unexplained cash shortfalls."
        ),
        "risk_level": "critical",
        "materiality_note": "Any confirmed skimming is critical; long-running schemes can be material.",
        "detection_logic": "Cash sales significantly below comparable periods or industry; register receipts not reconciling to deposits; missing sales from specific employees or time periods.",
        "potential_causes": [
            "POS receipts not reconciled to cash deposits",
            "Employees taking cash before recording transactions",
            "No independent cash count at close of business",
        ],
        "suggested_procedures": [
            "Reconcile POS transaction records to cash deposits",
            "Compare cash sales by employee or register to identify anomalies",
            "Assess segregation between cash handling and register operation",
        ],
        "suggested_ajes": [
            "Dr Cash / Cr Revenue — to record skimmed cash if identified through analysis",
        ],
        "management_questions": [
            "Are POS records reconciled to bank deposits independently?",
            "Who handles cash receipts and who records them?",
            "Are cash drawers counted by a supervisor at end of shift?",
        ],
        "affected_account_types": ["asset", "revenue"],
        "affected_statements": ["IncomeStatement", "BalanceSheet"],
        "audit_assertions": ["completeness", "occurrence"],
        "references": ["AU-C 240", "ACFE Fraud Tree — Skimming"],
        "sort_order": 70,
    },
    {
        "code": "FRAUD_008",
        "category": "fraud_indicators",
        "subcategory": "asset_diversion",
        "issue_type": "fraud",
        "name": "Business Assets Diverted to Owner-Controlled Entities",
        "description": (
            "Company assets, cash, customers, or intellectual property are being "
            "diverted to entities owned or controlled by insiders. This is a form of "
            "corporate opportunity theft and self-dealing that is a fiduciary duty "
            "violation and may constitute fraud."
        ),
        "risk_level": "critical",
        "materiality_note": "Any confirmed diversion is critical.",
        "detection_logic": "Payments to entities with ownership overlap with management; customers migrating to related entities; IP licensed to related parties at below-market rates.",
        "potential_causes": [
            "Owner establishing competing business using company resources",
            "Corporate opportunity diverted to personally controlled entity",
            "Customers redirected to related entity as exit strategy before transaction",
        ],
        "suggested_procedures": [
            "Map all related entities and their relationships to key insiders",
            "Compare customer lists across periods; identify unusual churn",
            "Review payments to entities with insider ownership overlap",
        ],
        "suggested_ajes": [
            "Dr Receivable from Related Party / Cr Revenue — to record diverted revenue",
        ],
        "management_questions": [
            "Are key insiders involved in any businesses that compete with or transact with the company?",
            "Are customers or contracts being transferred to related entities?",
            "Has the company's IP been licensed to any related party?",
        ],
        "affected_account_types": ["revenue", "asset"],
        "affected_statements": ["IncomeStatement", "BalanceSheet"],
        "audit_assertions": ["occurrence", "completeness"],
        "references": ["AU-C 240", "Uniform Fraudulent Transfer Act"],
        "sort_order": 80,
    },
]
