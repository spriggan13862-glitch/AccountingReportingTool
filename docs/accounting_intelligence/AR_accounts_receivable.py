"""Accounts Receivable — 10 issue templates (AR_001–AR_010)"""

ACCOUNTS_RECEIVABLE = [
    {
        "code": "AR_001",
        "category": "accounts_receivable",
        "subcategory": "allowance",
        "issue_type": "financial_analytics",
        "name": "Allowance for Doubtful Accounts Understated",
        "description": (
            "The allowance for doubtful accounts (AFDA) is insufficient relative to the "
            "aging profile and historical loss rates of the accounts receivable portfolio. "
            "An understated AFDA overstates net AR on the balance sheet and understates "
            "bad debt expense on the income statement."
        ),
        "risk_level": "high",
        "materiality_note": "Flag when AFDA as a percentage of gross AR is below historical average or industry norms, or when accounts >90 days past due exceed the reserve.",
        "detection_logic": "Allowance as % of gross AR declining while aging buckets are deteriorating; bad debt expense unusually low relative to revenue.",
        "potential_causes": [
            "Allowance percentage not updated to reflect current aging profile",
            "Specific reserves for known bad accounts not recorded",
            "Management override of reserve to improve reported earnings",
            "Economic downturn affecting customer credit quality not reflected",
            "Acquired receivables reserved at lower rates than warranted",
        ],
        "suggested_procedures": [
            "Obtain AR aging schedule; calculate reserve percentages by aging bucket",
            "Compare current AFDA % to prior 3 years and industry data",
            "Identify accounts >90 days past due; assess collectibility for each",
            "Review subsequent cash collections for period-end AR balances",
            "Test bad debt write-offs against allowance; assess adequacy of replenishment",
        ],
        "suggested_ajes": [
            "Dr Bad Debt Expense / Cr Allowance for Doubtful Accounts — to increase reserve to appropriate level",
        ],
        "management_questions": [
            "What methodology is used to estimate the allowance?",
            "Are there any specific customers with known collectibility concerns?",
            "Have there been any changes in customer credit quality or payment patterns?",
            "What is the write-off policy and approval process?",
        ],
        "affected_account_types": ["asset"],
        "affected_statements": ["IncomeStatement", "BalanceSheet"],
        "audit_assertions": ["valuation", "completeness", "accuracy"],
        "references": ["ASC 310-10-35-7", "ASC 326 (CECL)", "AU-C 540"],
        "sort_order": 10,
    },
    {
        "code": "AR_002",
        "category": "accounts_receivable",
        "subcategory": "aging",
        "issue_type": "financial_analytics",
        "name": "AR Days Outstanding (DSO) Increasing — Collection Deterioration",
        "description": (
            "Days Sales Outstanding (DSO) is increasing significantly relative to prior "
            "periods, indicating deteriorating collections, potential customer credit "
            "issues, or revenue recognized on transactions that will not be collected. "
            "Rising DSO is a key QoE and credit quality indicator."
        ),
        "risk_level": "moderate",
        "materiality_note": "Flag when DSO increases more than 10 days period-over-period or exceeds payment terms by >50%.",
        "detection_logic": "DSO = (AR / Revenue) × days in period; compare current vs. prior period and prior year same period.",
        "potential_causes": [
            "Relaxed credit standards to boost revenue",
            "Billing disputes causing payment holds",
            "Customer financial distress",
            "Premature revenue recognition on uncollectable accounts",
            "Process breakdown in collections follow-up",
        ],
        "suggested_procedures": [
            "Calculate DSO for current and prior 4 quarters; identify trend",
            "Analyze aging schedule for concentration of older buckets",
            "Review collections activity for top 20 AR balances",
            "Confirm that revenue recognized on aged accounts represents bona fide transactions",
        ],
        "suggested_ajes": [
            "Dr Bad Debt Expense / Cr AFDA — if specific accounts are uncollectable",
            "Dr Revenue / Cr Accounts Receivable — if revenue on aged accounts should be reversed",
        ],
        "management_questions": [
            "What collection actions are being taken on accounts >60 days past due?",
            "Have payment terms been modified for any significant customers?",
            "Are there any disputed invoices that are holding up payment?",
        ],
        "affected_account_types": ["asset", "revenue"],
        "affected_statements": ["IncomeStatement", "BalanceSheet"],
        "audit_assertions": ["valuation", "existence", "completeness"],
        "references": ["ASC 310-10", "QoE best practices"],
        "sort_order": 20,
    },
    {
        "code": "AR_003",
        "category": "accounts_receivable",
        "subcategory": "fictitious",
        "issue_type": "fraud",
        "name": "Fictitious or Inflated Accounts Receivable",
        "description": (
            "AR balances may include fictitious invoices, duplicate billings, or amounts "
            "billed without valid sales transactions. Fictitious AR inflates assets and "
            "revenue. This is a common financial fraud scheme, particularly in advance of "
            "financing events or business sales."
        ),
        "risk_level": "critical",
        "materiality_note": "Any confirmed fictitious AR is qualitatively material regardless of dollar amount.",
        "detection_logic": "AR growth significantly exceeds revenue growth; large round-number AR balances; customers with no prior history; AR from customers not in CRM or order system.",
        "potential_causes": [
            "Channel stuffing with right-of-return arrangements",
            "Invoicing shell or related-party entities with no real sales",
            "Recording side agreements that eliminate collection obligation",
            "Lapping scheme to conceal prior period write-offs",
        ],
        "suggested_procedures": [
            "Independently confirm AR balances directly with customers (positive confirmation)",
            "Reconcile AR sub-ledger to general ledger",
            "Trace AR to underlying sales orders, shipping documents, and customer contracts",
            "Review credit memos and write-offs for unusual patterns",
            "Verify that top AR balances correspond to known, active customers",
        ],
        "suggested_ajes": [
            "Dr Bad Debt Expense / Cr Accounts Receivable — to write off fictitious balances",
            "Dr Revenue / Cr Accounts Receivable — if corresponding revenue must be reversed",
        ],
        "management_questions": [
            "Can you provide source documentation (sales orders, contracts) for the 10 largest AR balances?",
            "Have any customers requested cancellation or right-of-return arrangements?",
            "Are any AR balances from entities related to management or owners?",
        ],
        "affected_account_types": ["asset", "revenue"],
        "affected_statements": ["IncomeStatement", "BalanceSheet"],
        "audit_assertions": ["existence", "occurrence", "valuation"],
        "references": ["AU-C 505", "AU-C 240", "ACFE Fraud Triangle"],
        "sort_order": 30,
    },
    {
        "code": "AR_004",
        "category": "accounts_receivable",
        "subcategory": "write_offs",
        "issue_type": "audit",
        "name": "Uncollectable AR Not Written Off — Balance Sheet Overstatement",
        "description": (
            "Known uncollectable receivables are being carried on the balance sheet "
            "without write-off or specific reserve, overstating assets. This may reflect "
            "management reluctance to recognize losses or inadequate review of aged "
            "balances."
        ),
        "risk_level": "moderate",
        "materiality_note": "Flag balances >180 days past due without documented collection plan or reserve.",
        "detection_logic": "Significant balances in >180 days bucket with no corresponding AFDA reserve; write-offs significantly below historical rates.",
        "potential_causes": [
            "Management delay in recognizing losses to preserve balance sheet",
            "Hope-based collections approach without write-off policy enforcement",
            "Disputes preventing write-off authorization",
            "Lack of regular AR review process",
        ],
        "suggested_procedures": [
            "Review all AR balances >180 days past due; assess collectibility",
            "Obtain documentation of collection efforts for aged balances",
            "Compare write-off activity to prior periods and industry norms",
            "Assess whether AFDA adequately covers identified uncollectable amounts",
        ],
        "suggested_ajes": [
            "Dr Bad Debt Expense / Cr AFDA — to establish specific reserve",
            "Dr AFDA / Cr Accounts Receivable — to write off confirmed uncollectable balances",
        ],
        "management_questions": [
            "What is the status of collection efforts on the top 10 aged balances?",
            "What is the formal write-off authorization policy?",
            "Are there any disputed amounts preventing collections?",
        ],
        "affected_account_types": ["asset"],
        "affected_statements": ["BalanceSheet", "IncomeStatement"],
        "audit_assertions": ["valuation", "completeness"],
        "references": ["ASC 310-10-35-7", "AU-C 540"],
        "sort_order": 40,
    },
    {
        "code": "AR_005",
        "category": "accounts_receivable",
        "subcategory": "classification",
        "issue_type": "balance_sheet",
        "name": "Long-Term Receivables Classified as Current",
        "description": (
            "Receivables with collection dates beyond 12 months from the balance sheet "
            "date are classified as current assets. Under GAAP, only assets expected to "
            "be realized within the normal operating cycle or 12 months should be current. "
            "Misclassification overstates current assets and working capital."
        ),
        "risk_level": "moderate",
        "materiality_note": "Material when long-term receivables exceed 10% of current assets or significantly affect working capital ratios.",
        "detection_logic": "Notes receivable or installment receivables with payment schedules extending beyond 12 months classified entirely as current.",
        "potential_causes": [
            "Installment payment plans not split into current and long-term portions",
            "Employee loans classified as trade receivables",
            "Extended payment terms granted to key customers not separately classified",
        ],
        "suggested_procedures": [
            "Review terms of all non-trade receivables and long-duration payment plans",
            "Split receivables into current (within 12 months) and long-term (beyond 12 months) portions",
            "Ensure notes receivable are presented separately from trade AR",
        ],
        "suggested_ajes": [
            "Dr Notes Receivable — Long Term / Cr Accounts Receivable — to reclassify beyond-12-month portion",
        ],
        "management_questions": [
            "Are there any receivables with payment terms exceeding 12 months?",
            "Have extended payment plans been granted to any customers?",
            "Are there any employee or officer loans included in AR?",
        ],
        "affected_account_types": ["asset"],
        "affected_statements": ["BalanceSheet"],
        "audit_assertions": ["presentation", "classification", "valuation"],
        "references": ["ASC 210-10-45-1", "ASC 310-10-45-9"],
        "sort_order": 50,
    },
    {
        "code": "AR_006",
        "category": "accounts_receivable",
        "subcategory": "concentration",
        "issue_type": "qoe",
        "name": "AR Concentration — Single Customer Exceeds 25% of AR Balance",
        "description": (
            "A single customer accounts for more than 25% of the total AR balance, "
            "creating significant credit concentration risk. This is a credit quality "
            "and QoE concern; loss of this customer or default on the balance would "
            "materially impair assets and future collections."
        ),
        "risk_level": "moderate",
        "materiality_note": "Flag at 25% threshold; always disclose per ASC 280.",
        "detection_logic": "AR by customer schedule shows single customer >= 25% of gross AR.",
        "potential_causes": [
            "Large period-end invoice to dominant customer",
            "Seasonal concentration from year-end project billings",
            "Credit extended beyond normal terms to key customer",
        ],
        "suggested_procedures": [
            "Prepare AR by customer; identify concentration",
            "Assess credit quality of concentrated customer",
            "Review subsequent cash collections from concentrated customer",
            "Evaluate whether concentration is growing over time",
        ],
        "suggested_ajes": [],
        "management_questions": [
            "What is the payment history of the concentrated customer?",
            "Is there a credit limit policy for individual customers?",
            "Has the concentrated customer indicated any payment difficulties?",
        ],
        "affected_account_types": ["asset"],
        "affected_statements": ["BalanceSheet"],
        "audit_assertions": ["valuation", "presentation"],
        "references": ["ASC 280-10-50-42", "ASC 825-10-50-20"],
        "sort_order": 60,
    },
    {
        "code": "AR_007",
        "category": "accounts_receivable",
        "subcategory": "lapping",
        "issue_type": "fraud",
        "name": "Lapping Scheme — Misappropriation of Cash Receipts",
        "description": (
            "Lapping involves the theft of a customer payment and concealment by applying "
            "a later payment from another customer to the first account, creating a "
            "rotating pattern of misapplied receipts. It results in AR balances being "
            "applied to incorrect customers and can persist undetected for extended periods."
        ),
        "risk_level": "critical",
        "materiality_note": "Any confirmed lapping is qualitatively material and a reportable control deficiency.",
        "detection_logic": "Customer complaints about misapplied payments; AR credits applied to wrong customer accounts; cash receipts timing inconsistencies.",
        "potential_causes": [
            "Single person controls both cash receipts and AR posting (segregation failure)",
            "No independent reconciliation of customer remittances to postings",
            "Lack of lockbox or third-party payment processing",
        ],
        "suggested_procedures": [
            "Confirm AR balances directly with customers",
            "Trace a sample of cash receipts from bank deposit to AR credit; verify correct customer account",
            "Identify instances where same customer credit amount matches another customer payment",
            "Assess segregation of duties over cash receipts and AR posting",
        ],
        "suggested_ajes": [
            "Dr Cash / Cr Accounts Receivable — to correct misapplied receipts",
        ],
        "management_questions": [
            "Who handles incoming cash receipts? Who posts to AR? Are these different people?",
            "Is there a lockbox arrangement for customer payments?",
            "Are customer statements sent directly to customers independently of collections staff?",
        ],
        "affected_account_types": ["asset"],
        "affected_statements": ["BalanceSheet"],
        "audit_assertions": ["existence", "valuation", "completeness"],
        "references": ["AU-C 240", "COSO Internal Control Framework"],
        "sort_order": 70,
    },
    {
        "code": "AR_008",
        "category": "accounts_receivable",
        "subcategory": "credit_notes",
        "issue_type": "audit",
        "name": "Unauthorized or Excessive Credit Memos",
        "description": (
            "Credit memos are being issued without adequate authorization or at rates "
            "significantly above historical norms. Excessive credits reduce AR and revenue "
            "and may indicate fictitious credits to conceal theft, satisfy undisclosed "
            "return arrangements, or manipulate earnings downward."
        ),
        "risk_level": "moderate",
        "materiality_note": "Flag when credit memo volume or dollar amount exceeds 5% of gross revenue.",
        "detection_logic": "Credit memo dollar volume as % of gross revenue significantly above prior periods; large credit memos near period end.",
        "potential_causes": [
            "Undisclosed right-of-return arrangements being honored via credit memo",
            "Credits issued to reduce AR concentration without actual returns",
            "Fraud: fictitious credits to divert cash",
            "Revenue reversal to manage earnings",
        ],
        "suggested_procedures": [
            "Obtain listing of all credit memos; sort by amount and date",
            "Verify authorization for credit memos above threshold",
            "Trace large credits to underlying return or allowance documentation",
            "Analyze concentration of credits by customer, sales rep, or approver",
        ],
        "suggested_ajes": [
            "Dr Accounts Receivable / Cr Revenue — to reverse unsupported credit memos",
        ],
        "management_questions": [
            "What is the approval process for issuing credit memos?",
            "Are there any return or satisfaction guarantee policies not disclosed?",
            "Who has authority to issue credit memos, and is there supervisory review?",
        ],
        "affected_account_types": ["asset", "revenue"],
        "affected_statements": ["IncomeStatement", "BalanceSheet"],
        "audit_assertions": ["occurrence", "accuracy", "authorization"],
        "references": ["AU-C 240", "COSO Control Activities"],
        "sort_order": 80,
    },
    {
        "code": "AR_009",
        "category": "accounts_receivable",
        "subcategory": "factoring",
        "issue_type": "balance_sheet",
        "name": "Factored Receivables Not Derecognized or Incorrectly Presented",
        "description": (
            "Accounts receivable that have been factored (sold) are still carried on the "
            "balance sheet without derecognition, or factored AR is presented without "
            "disclosing the recourse obligation. Under ASC 860, transferred receivables "
            "must be derecognized if control has been surrendered."
        ),
        "risk_level": "moderate",
        "materiality_note": "Material when factored amounts exceed 10% of gross AR or when recourse exposure is significant.",
        "detection_logic": "Factoring agreement in place but AR balance not reduced; or cash proceeds from factor recorded as debt rather than derecognition.",
        "potential_causes": [
            "AR factored with recourse treated as a collateralized borrowing rather than a sale",
            "Factoring arrangement not communicated to accounting team",
            "Factor notification requirements not met, preventing derecognition",
        ],
        "suggested_procedures": [
            "Obtain all factoring agreements; apply ASC 860 criteria for derecognition",
            "If derecognized, verify AR balance is reduced and gain/loss is recorded",
            "If not derecognized, verify the secured borrowing is properly recorded",
            "Ensure recourse obligation is disclosed",
        ],
        "suggested_ajes": [
            "Dr Cash / Dr Recourse Obligation / Cr Accounts Receivable / Cr Gain on Sale — for qualifying sale",
            "Dr Cash / Cr Secured Borrowing — for factoring with recourse treated as borrowing",
        ],
        "management_questions": [
            "Are any AR balances subject to factoring arrangements?",
            "What are the recourse terms of any factoring agreements?",
            "Are factored receivables deducted from the AR balance on the balance sheet?",
        ],
        "affected_account_types": ["asset", "liability"],
        "affected_statements": ["BalanceSheet"],
        "audit_assertions": ["existence", "presentation", "completeness"],
        "references": ["ASC 860-10-40-4", "ASC 860-10-55"],
        "sort_order": 90,
    },
    {
        "code": "AR_010",
        "category": "accounts_receivable",
        "subcategory": "related_party",
        "issue_type": "fraud",
        "name": "Intercompany or Related Party Receivables Without Elimination",
        "description": (
            "Receivables from related parties (subsidiaries, affiliates, officers) are "
            "included in trade AR without separate disclosure, or intercompany balances "
            "are not eliminated in consolidation. This overstates third-party AR and "
            "may obscure loans to insiders presented as trade receivables."
        ),
        "risk_level": "high",
        "materiality_note": "Always qualitatively material; requires disclosure under ASC 850.",
        "detection_logic": "AR from entities listed as related parties; AR from officers or shareholders included in trade AR.",
        "potential_causes": [
            "Owner withdrawals recast as AR rather than distributions",
            "Intercompany loans presented as trade AR",
            "Elimination entries not made in consolidated financial statements",
        ],
        "suggested_procedures": [
            "Cross-reference AR customer list against related party register",
            "Confirm related party AR balances and terms independently",
            "Ensure intercompany balances are eliminated in consolidation",
            "Assess whether related party AR represents bona fide trade transactions",
        ],
        "suggested_ajes": [
            "Dr Receivable from Related Party / Cr Accounts Receivable — to reclassify to proper presentation",
        ],
        "management_questions": [
            "Are any AR balances owed by related parties, affiliates, or officers?",
            "Are owner draws or advances included in AR?",
            "For consolidated entities, have intercompany balances been eliminated?",
        ],
        "affected_account_types": ["asset"],
        "affected_statements": ["BalanceSheet"],
        "audit_assertions": ["existence", "presentation", "completeness"],
        "references": ["ASC 850-10", "ASC 810-10-45-1"],
        "sort_order": 100,
    },
]
