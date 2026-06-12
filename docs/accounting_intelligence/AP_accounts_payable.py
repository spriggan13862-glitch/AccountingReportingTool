"""Accounts Payable — 8 issue templates (AP_001–AP_008)"""

ACCOUNTS_PAYABLE = [
    {
        "code": "AP_001",
        "category": "accounts_payable",
        "subcategory": "completeness",
        "issue_type": "audit",
        "name": "Accounts Payable Understatement — Unrecorded Liabilities",
        "description": (
            "Obligations to vendors and suppliers incurred before period end have not "
            "been recorded as accounts payable. Unrecorded liabilities understate expenses "
            "and liabilities, overstating net income and equity. This is one of the most "
            "common financial statement errors."
        ),
        "risk_level": "high",
        "materiality_note": "Flag when vendor invoices received after period end for services rendered before period end exceed materiality threshold.",
        "detection_logic": "AP balance declining while revenue/operations are stable; large vendor invoices received in first 30 days after period end for prior period services.",
        "potential_causes": [
            "Invoice receipt lag — vendor invoices not received until after period end",
            "Deliberate delay of liability recording to improve balance sheet",
            "Month-end close cutoff not applied to AP",
            "Purchases recorded only when paid rather than when incurred",
        ],
        "suggested_procedures": [
            "Review vendor invoices received in first 30 days after period end; accrue for prior period amounts",
            "Compare AP balance as % of COGS/operating expenses to prior periods",
            "Search for unmatched receiving reports without corresponding AP entries",
            "Confirm significant vendor balances",
        ],
        "suggested_ajes": [
            "Dr Expense (COGS or Operating) / Cr Accounts Payable — to accrue unrecorded obligations",
        ],
        "management_questions": [
            "Are there any vendor invoices received after period end for services provided before period end?",
            "What is the process for accruing uninvoiced receipts at period end?",
            "Are there any large service contracts where the invoice is expected but not yet received?",
        ],
        "affected_account_types": ["liability"],
        "affected_statements": ["BalanceSheet", "IncomeStatement"],
        "audit_assertions": ["completeness", "cutoff", "accuracy"],
        "references": ["AU-C 560", "COSO Control Activities"],
        "sort_order": 10,
    },
    {
        "code": "AP_002",
        "category": "accounts_payable",
        "subcategory": "duplicate_payments",
        "issue_type": "fraud",
        "name": "Duplicate Vendor Payments",
        "description": (
            "The same vendor invoice is paid more than once, either through error or "
            "fraud. Duplicate payments inflate expenses and reduce cash. Recoveries may "
            "be difficult if the vendor has already applied the payment."
        ),
        "risk_level": "moderate",
        "materiality_note": "Flag when duplicate payment risk is systematic; individual instances may be immaterial but indicate control failure.",
        "detection_logic": "Same invoice number paid twice; same amount paid to same vendor within 30 days; vendor credits on account without corresponding credit memo.",
        "potential_causes": [
            "Invoice processed from both paper and email copy",
            "AP system does not block duplicate invoice numbers",
            "Manual check runs without matching to ERP records",
            "Intentional fraud by AP employee directing excess payment to controlled entity",
        ],
        "suggested_procedures": [
            "Run duplicate payment analysis: same vendor, same amount, within 30-day window",
            "Review vendor credits or unapplied balances on vendor accounts",
            "Test AP system duplicate invoice controls",
            "Review manual check disbursements outside normal AP process",
        ],
        "suggested_ajes": [
            "Dr Cash / Cr Accounts Payable — to record recovery of duplicate payment",
        ],
        "management_questions": [
            "Does the AP system have controls to prevent duplicate invoice numbers?",
            "Are vendor statements reconciled to AP sub-ledger?",
            "Who approves payments and how are they matched to purchase orders?",
        ],
        "affected_account_types": ["liability", "asset"],
        "affected_statements": ["IncomeStatement", "BalanceSheet"],
        "audit_assertions": ["occurrence", "accuracy"],
        "references": ["COSO Control Activities", "AU-C 240"],
        "sort_order": 20,
    },
    {
        "code": "AP_003",
        "category": "accounts_payable",
        "subcategory": "vendor_fraud",
        "issue_type": "fraud",
        "name": "Fictitious Vendor or Shell Company Payments",
        "description": (
            "Payments are being made to fictitious vendors or shell companies controlled "
            "by insiders. This is one of the most common employee fraud schemes. "
            "Fictitious vendor payments inflate expenses and divert cash."
        ),
        "risk_level": "critical",
        "materiality_note": "Any confirmed fictitious vendor payment is critical regardless of amount.",
        "detection_logic": "Vendors with PO box only addresses; vendors with no web presence or phone number; new vendors added and paid immediately; vendors sharing addresses or bank accounts with employees.",
        "potential_causes": [
            "Weak vendor master file controls — employees can add vendors",
            "No positive pay or vendor verification process",
            "Single person controls vendor setup and payment approval",
        ],
        "suggested_procedures": [
            "Analyze vendor master for addresses matching employee addresses",
            "Identify vendors with only PO box addresses; verify legitimacy",
            "Review new vendor setups near period end; trace to approval documentation",
            "Test that vendor tax IDs (EIN/SSN) match IRS records",
        ],
        "suggested_ajes": [
            "Dr Fraud Loss / Cr Cash — to record confirmed fictitious vendor payments",
        ],
        "management_questions": [
            "What is the process for adding new vendors to the vendor master?",
            "Who approves new vendors and who approves payments? Are these different people?",
            "Are vendor addresses and bank accounts verified against a third-party source?",
        ],
        "affected_account_types": ["liability", "asset"],
        "affected_statements": ["IncomeStatement", "BalanceSheet"],
        "audit_assertions": ["occurrence", "existence", "authorization"],
        "references": ["AU-C 240", "ACFE Fraud Tree — Billing Schemes"],
        "sort_order": 30,
    },
    {
        "code": "AP_004",
        "category": "accounts_payable",
        "subcategory": "cutoff",
        "issue_type": "audit",
        "name": "AP Cutoff Error — Liabilities Recorded in Wrong Period",
        "description": (
            "Accounts payable transactions are recorded in the wrong accounting period "
            "due to improper cutoff. Goods or services received before period end are "
            "recorded in the following period, or post-period liabilities are recorded "
            "early."
        ),
        "risk_level": "moderate",
        "materiality_note": "Evaluate against AP balance; higher risk near year-end.",
        "detection_logic": "Receiving reports dated before period end without corresponding AP entry; large AP entries recorded on first day of new period.",
        "potential_causes": [
            "ERP processes invoices on receipt of paper invoice, not goods receipt",
            "Month-end accrual process not applied consistently",
            "Vendor invoices dated in prior period but processed in current period",
        ],
        "suggested_procedures": [
            "Test AP cutoff: select receiving reports from last 5 days of period; confirm recorded in correct period",
            "Review large AP journal entries on first day of subsequent period",
            "Compare goods receipt dates to AP posting dates",
        ],
        "suggested_ajes": [
            "Dr Expense / Cr Accounts Payable — to record goods received but not yet invoiced in correct period",
        ],
        "management_questions": [
            "How does the AP team handle period-end accruals for uninvoiced receipts?",
            "Are there any known large vendor invoices expected that had not been received at period end?",
        ],
        "affected_account_types": ["liability"],
        "affected_statements": ["BalanceSheet", "IncomeStatement"],
        "audit_assertions": ["cutoff", "completeness", "accuracy"],
        "references": ["ASC 420-10", "AU-C 560"],
        "sort_order": 40,
    },
    {
        "code": "AP_005",
        "category": "accounts_payable",
        "subcategory": "related_party",
        "issue_type": "audit",
        "name": "Related Party Payables Not Separately Disclosed",
        "description": (
            "Amounts payable to related parties (owners, affiliates, officers) are "
            "commingled with trade AP without separate disclosure. ASC 850 requires "
            "related party transactions to be separately identified and disclosed. "
            "Related party payables may have non-standard terms affecting financial analysis."
        ),
        "risk_level": "moderate",
        "materiality_note": "Always requires disclosure; qualitatively material regardless of amount.",
        "detection_logic": "Payables to vendors that are also identified as related parties; large payable balances to individuals who are also shareholders or officers.",
        "potential_causes": [
            "Loans from owners recorded as trade AP",
            "Affiliate management fees included in AP without disclosure",
            "Rent or equipment lease payments to owner entities in AP",
        ],
        "suggested_procedures": [
            "Cross-reference AP vendor list against related party register",
            "Reclassify and separately disclose related party payables",
            "Confirm that related party transactions are on arm's-length terms",
        ],
        "suggested_ajes": [
            "Dr Accounts Payable / Cr Due to Related Party — to reclassify related party payables",
        ],
        "management_questions": [
            "Are any vendors related to owners, officers, or affiliates?",
            "Are management fees or rent paid to related entities?",
            "Are any owner loans or advances included in AP?",
        ],
        "affected_account_types": ["liability"],
        "affected_statements": ["BalanceSheet"],
        "audit_assertions": ["presentation", "completeness"],
        "references": ["ASC 850-10-50", "AU-C 550"],
        "sort_order": 50,
    },
    {
        "code": "AP_006",
        "category": "accounts_payable",
        "subcategory": "days_payable",
        "issue_type": "qoe",
        "name": "Days Payable Outstanding Unusually High — Liquidity Concern",
        "description": (
            "Days Payable Outstanding (DPO) is significantly above normal for the "
            "business or industry, indicating that payables are being stretched beyond "
            "terms. This may signal cash flow stress, vendor disputes, or intentional "
            "payable management to inflate cash balances temporarily."
        ),
        "risk_level": "moderate",
        "materiality_note": "Flag when DPO exceeds stated vendor terms by more than 50% or increases more than 15 days period-over-period.",
        "detection_logic": "DPO = (AP / COGS) × days; current DPO significantly above prior periods or vendor payment terms.",
        "potential_causes": [
            "Cash flow constraint forcing payable extension",
            "Deliberate payable stretching to inflate period-end cash",
            "Vendor disputes causing payment hold",
            "Weak AP management and follow-up process",
        ],
        "suggested_procedures": [
            "Calculate DPO and compare to prior 4 quarters and vendor terms",
            "Identify top payables by age; confirm payment status",
            "Assess whether any vendor relationships are at risk due to late payment",
            "Determine if DPO normalization would affect liquidity analysis",
        ],
        "suggested_ajes": [],
        "management_questions": [
            "Are there any vendors on hold due to late payments?",
            "Has cash flow been sufficient to pay vendors within terms?",
            "Are there any disputed vendor balances causing payment delays?",
        ],
        "affected_account_types": ["liability"],
        "affected_statements": ["BalanceSheet"],
        "audit_assertions": ["completeness", "valuation"],
        "references": ["QoE best practices", "SBA SOP 50-10"],
        "sort_order": 60,
    },
    {
        "code": "AP_007",
        "category": "accounts_payable",
        "subcategory": "debit_balances",
        "issue_type": "balance_sheet",
        "name": "Debit Balances in Accounts Payable",
        "description": (
            "AP accounts contain debit balances (prepayments or overpayments to vendors) "
            "that should be reclassified as prepaid assets or vendor receivables rather "
            "than netted against AP liabilities. Netting of debits and credits in AP "
            "understates both assets and liabilities."
        ),
        "risk_level": "low",
        "materiality_note": "Reclassify when debit balances are material relative to total current assets.",
        "detection_logic": "AP sub-ledger contains individual vendor accounts with debit balances.",
        "potential_causes": [
            "Vendor credits or refunds creating debit balance without offset",
            "Overpayments to vendors not yet recovered",
            "Prepayments to vendors recorded through AP rather than prepaid account",
        ],
        "suggested_procedures": [
            "Review AP aging for debit balances by vendor",
            "Reclassify material debit balances to prepaid or vendor receivable",
            "Assess collectibility of overpayments",
        ],
        "suggested_ajes": [
            "Dr Prepaid / Vendor Receivable / Cr Accounts Payable — to reclassify debit AP balances",
        ],
        "management_questions": [
            "Are there any vendors with credit or debit balances in AP?",
            "Have overpayments to vendors been pursued for recovery?",
        ],
        "affected_account_types": ["liability", "asset"],
        "affected_statements": ["BalanceSheet"],
        "audit_assertions": ["presentation", "classification"],
        "references": ["ASC 210-10-45-7", "ASC 210-20-45-1"],
        "sort_order": 70,
    },
    {
        "code": "AP_008",
        "category": "accounts_payable",
        "subcategory": "purchase_commitments",
        "issue_type": "balance_sheet",
        "name": "Onerous Purchase Commitments Not Accrued",
        "description": (
            "The entity has non-cancelable purchase commitments for goods or services "
            "at prices that are now above market (onerous). Under ASC 420, losses on "
            "purchase commitments should be recognized when the purchase price exceeds "
            "market value and there is no ability to recover the excess."
        ),
        "risk_level": "moderate",
        "materiality_note": "Flag when committed purchase prices exceed current market price by a material amount.",
        "detection_logic": "Non-cancelable purchase orders for inventory at prices above current market; commodity contracts where market price has declined below contracted price.",
        "potential_causes": [
            "Long-term supply contracts negotiated when commodity prices were higher",
            "Take-or-pay contracts with minimum purchase requirements",
            "Raw material contracts with price floors exceeding current spot prices",
        ],
        "suggested_procedures": [
            "Obtain schedule of non-cancelable purchase commitments",
            "Compare contracted prices to current market prices",
            "Accrue loss on commitments where contracted price exceeds market",
            "Disclose remaining purchase commitment obligations in notes",
        ],
        "suggested_ajes": [
            "Dr Loss on Purchase Commitment / Cr Estimated Liability — to accrue onerous commitment loss",
        ],
        "management_questions": [
            "Are there non-cancelable purchase agreements? What are the remaining obligations?",
            "Have commodity prices or market conditions changed materially since contracts were signed?",
            "Are there take-or-pay or minimum purchase clauses in supplier contracts?",
        ],
        "affected_account_types": ["liability"],
        "affected_statements": ["BalanceSheet", "IncomeStatement"],
        "audit_assertions": ["completeness", "valuation"],
        "references": ["ASC 420-10-30", "ASC 440-10-50"],
        "sort_order": 80,
    },
]
