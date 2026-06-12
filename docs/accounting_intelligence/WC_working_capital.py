"""Working Capital — 8 issue templates (WC_001–WC_008)"""

WORKING_CAPITAL = [
    {
        "code": "WC_001",
        "category": "working_capital",
        "subcategory": "current_ratio",
        "issue_type": "financial_analytics",
        "name": "Current Ratio Below 1.0 — Negative Working Capital",
        "description": (
            "Current liabilities exceed current assets, resulting in negative working "
            "capital and a current ratio below 1.0. This indicates the entity cannot "
            "meet short-term obligations from current assets without additional financing. "
            "It is a going concern indicator and a key SBA and credit underwriting flag."
        ),
        "risk_level": "high",
        "materiality_note": "Always flagged; critical for SBA and credit analysis.",
        "detection_logic": "Current Assets / Current Liabilities < 1.0.",
        "potential_causes": [
            "Rapid growth consuming working capital faster than it is generated",
            "Long-term debt reclassified to current due to covenant violation",
            "Seasonal business at a low point in the working capital cycle",
            "Structural working capital deficit due to business model",
        ],
        "suggested_procedures": [
            "Calculate current ratio and working capital for current and prior periods",
            "Identify drivers of current ratio decline",
            "Assess adequacy of credit facilities to bridge working capital needs",
            "Evaluate whether any current liabilities will be refinanced long-term",
        ],
        "suggested_ajes": [],
        "management_questions": [
            "What is the plan to address negative working capital?",
            "Is there an available credit facility to meet short-term obligations?",
            "Are any current liabilities expected to be refinanced on a long-term basis?",
        ],
        "affected_account_types": ["asset", "liability"],
        "affected_statements": ["BalanceSheet"],
        "audit_assertions": ["completeness", "classification"],
        "references": ["ASC 205-40", "SBA SOP 50-10"],
        "sort_order": 10,
    },
    {
        "code": "WC_002",
        "category": "working_capital",
        "subcategory": "prepaid_expenses",
        "issue_type": "balance_sheet",
        "name": "Prepaid Expenses Overstated or Not Amortized",
        "description": (
            "Prepaid expenses are either overstated because underlying services have "
            "been consumed without corresponding amortization, or items that should be "
            "expensed immediately are being deferred. Overstated prepaids inflate "
            "current assets."
        ),
        "risk_level": "low",
        "materiality_note": "Evaluate relative to total prepaid balance; material when prepaids are significant current assets.",
        "detection_logic": "Prepaid balance growing without corresponding growth in prepayment activity; large prepaid items with no documented amortization schedule.",
        "potential_causes": [
            "Insurance premiums renewed but prior period prepaids not fully amortized",
            "Annual license fees capitalized rather than expensed when below capitalization threshold",
            "Software subscriptions overstated due to unamortized balance",
        ],
        "suggested_procedures": [
            "Obtain prepaid schedule; verify amortization for each item",
            "Confirm that consumed services are not still in prepaid balance",
            "Test that all prepaid items have a future economic benefit",
        ],
        "suggested_ajes": [
            "Dr Operating Expense / Cr Prepaid Expense — to record consumed prepaids",
        ],
        "management_questions": [
            "What is the largest component of prepaid expenses?",
            "Are prepaids being amortized monthly?",
            "Are there any items in prepaid that have already been consumed?",
        ],
        "affected_account_types": ["asset"],
        "affected_statements": ["BalanceSheet", "IncomeStatement"],
        "audit_assertions": ["valuation", "existence"],
        "references": ["ASC 340-10-25", "ASC 250-10"],
        "sort_order": 20,
    },
    {
        "code": "WC_003",
        "category": "working_capital",
        "subcategory": "net_working_capital_target",
        "issue_type": "qoe",
        "name": "Working Capital Managed for Transaction — Abnormal Period-End Balance",
        "description": (
            "Working capital appears to have been managed at the period end to achieve "
            "a target for transaction purposes (M&A, SBA loan). Unusual collection "
            "of AR, deferral of AP payments, or inventory liquidation near period end "
            "can temporarily inflate working capital without reflecting the ongoing "
            "working capital needs of the business."
        ),
        "risk_level": "high",
        "materiality_note": "Always relevant in M&A and SBA contexts; working capital manipulation affects deal price.",
        "detection_logic": "AR DSO unusually low at period end vs. trailing periods; AP DPO unusually high; inventory below normal levels at period end.",
        "potential_causes": [
            "Accelerated AR collection in period before transaction close",
            "Deferred AP payments to inflate cash and working capital",
            "Inventory liquidation to generate cash near period end",
        ],
        "suggested_procedures": [
            "Analyze AR DSO, AP DPO, and inventory days for trailing 6 quarters",
            "Identify anomalies at the transaction period end",
            "Normalize working capital to trailing average for deal analysis",
            "Review subsequent period to confirm normalization",
        ],
        "suggested_ajes": [],
        "management_questions": [
            "Were any accelerated collection efforts made on AR near period end?",
            "Were any AP payments deferred beyond normal payment terms?",
            "Was inventory liquidated or purchases delayed near period end?",
        ],
        "affected_account_types": ["asset", "liability"],
        "affected_statements": ["BalanceSheet"],
        "audit_assertions": ["existence", "completeness"],
        "references": ["QoE best practices", "SBA SOP 50-10"],
        "sort_order": 30,
    },
    {
        "code": "WC_004",
        "category": "working_capital",
        "subcategory": "accrued_revenue",
        "issue_type": "financial_analytics",
        "name": "Contract Assets (Unbilled Receivables) Growing Disproportionately",
        "description": (
            "Contract assets (unbilled receivables under ASC 606) are growing faster "
            "than revenue, suggesting that work is being performed without subsequent "
            "billing or collection, or that revenue is being recognized aggressively "
            "on long-term contracts."
        ),
        "risk_level": "moderate",
        "materiality_note": "Flag when contract assets grow faster than revenue for two consecutive periods.",
        "detection_logic": "Contract assets as % of revenue increasing period-over-period; large unbilled balances aging beyond 90 days.",
        "potential_causes": [
            "Aggressive percentage-of-completion revenue recognition",
            "Billing delays on completed work",
            "Contract disputes preventing billing",
            "Cost-plus contracts with costs incurred but billing milestone not reached",
        ],
        "suggested_procedures": [
            "Analyze contract asset aging; identify balances > 90 days",
            "Review billing schedules for projects with large unbilled balances",
            "Assess whether revenue recognized matches work completed per project managers",
        ],
        "suggested_ajes": [
            "Dr Revenue / Cr Contract Asset — to reduce overstated unbilled receivables",
        ],
        "management_questions": [
            "What is the aging of contract assets/unbilled receivables?",
            "Are there any billing holds or disputes preventing collection?",
            "Are project managers confirming the completion percentage used for revenue recognition?",
        ],
        "affected_account_types": ["asset", "revenue"],
        "affected_statements": ["BalanceSheet", "IncomeStatement"],
        "audit_assertions": ["valuation", "completeness"],
        "references": ["ASC 606-10-45-3", "ASC 606-10-45-4"],
        "sort_order": 40,
    },
    {
        "code": "WC_005",
        "category": "working_capital",
        "subcategory": "current_maturity_reclassification",
        "issue_type": "balance_sheet",
        "name": "Current Maturities of Long-Term Debt Not Properly Classified",
        "description": (
            "Principal payments on long-term debt due within 12 months are not "
            "reclassified from long-term to current liabilities. Proper classification "
            "affects the current ratio and is essential for accurate liquidity analysis."
        ),
        "risk_level": "moderate",
        "materiality_note": "Material when current maturities are significant relative to current assets.",
        "detection_logic": "Debt amortization schedule shows payments within 12 months not reflected as current liabilities.",
        "potential_causes": [
            "Debt amortization schedule not reviewed at period close",
            "Balloon payments not reclassified",
            "Revolving line maturing within 12 months classified as long-term",
        ],
        "suggested_procedures": [
            "Review all debt amortization schedules at period end",
            "Identify amounts due within 12 months; reclassify to current",
            "Verify that current maturity agrees to the next 12 months of amortization",
        ],
        "suggested_ajes": [
            "Dr Long-Term Debt / Cr Current Portion — to reclassify current maturities",
        ],
        "management_questions": [
            "Has the current portion of long-term debt been updated at this period end?",
            "Are there any balloon payments due within 12 months?",
        ],
        "affected_account_types": ["liability"],
        "affected_statements": ["BalanceSheet"],
        "audit_assertions": ["classification", "completeness"],
        "references": ["ASC 210-10-45-9", "ASC 470-10-45-1"],
        "sort_order": 50,
    },
    {
        "code": "WC_006",
        "category": "working_capital",
        "subcategory": "netting",
        "issue_type": "balance_sheet",
        "name": "Impermissible Netting of Assets and Liabilities",
        "description": (
            "Assets and liabilities are being offset and presented net, when the "
            "right of setoff has not been established. Under ASC 210-20, assets and "
            "liabilities may only be offset when there is a legal right of setoff and "
            "intent to settle net."
        ),
        "risk_level": "low",
        "materiality_note": "Evaluate when netting materially affects current ratio or gross asset/liability presentation.",
        "detection_logic": "Same counterparty appears as both AR and AP with net presentation; intercompany balances netted without consolidation.",
        "potential_causes": [
            "AR and AP with same vendor/customer presented net",
            "Cash advance to employee netted against payroll liability",
            "Income tax receivable and payable combined to show net position",
        ],
        "suggested_procedures": [
            "Review balance sheet for offsetting; verify legal right of setoff exists",
            "Gross up amounts where netting is not permitted",
        ],
        "suggested_ajes": [
            "Dr Accounts Receivable / Cr Accounts Payable — to gross up improperly netted items",
        ],
        "management_questions": [
            "Are any AR and AP balances with the same counterparty presented net?",
            "Is there a legally enforceable right of setoff for any netted balances?",
        ],
        "affected_account_types": ["asset", "liability"],
        "affected_statements": ["BalanceSheet"],
        "audit_assertions": ["presentation", "classification"],
        "references": ["ASC 210-20-45-1"],
        "sort_order": 60,
    },
    {
        "code": "WC_007",
        "category": "working_capital",
        "subcategory": "cash_conversion",
        "issue_type": "qoe",
        "name": "Cash Conversion Cycle Deteriorating",
        "description": (
            "The Cash Conversion Cycle (CCC = DIO + DSO − DPO) is increasing, "
            "indicating the business is taking longer to convert operations into "
            "cash. A rising CCC increases working capital requirements and signals "
            "potential operational or credit quality deterioration."
        ),
        "risk_level": "moderate",
        "materiality_note": "Flag when CCC increases more than 15 days period-over-period.",
        "detection_logic": "CCC trending upward over 3+ periods; DSO or DIO increasing while DPO is not extending proportionally.",
        "potential_causes": [
            "Slower AR collections",
            "Inventory buildup from slowing demand",
            "Vendor payment terms improving (DPO decreasing) without offsetting AR/inventory improvement",
        ],
        "suggested_procedures": [
            "Calculate CCC components for 4 trailing quarters",
            "Identify which element is the primary driver of CCC deterioration",
            "Assess whether working capital facility is adequate for CCC needs",
        ],
        "suggested_ajes": [],
        "management_questions": [
            "What has driven changes in your receivable collection and inventory management?",
            "Are vendor payment terms changing?",
            "Is the working capital line of credit sized for current operational needs?",
        ],
        "affected_account_types": ["asset", "liability"],
        "affected_statements": ["BalanceSheet"],
        "audit_assertions": ["completeness"],
        "references": ["QoE best practices"],
        "sort_order": 70,
    },
    {
        "code": "WC_008",
        "category": "working_capital",
        "subcategory": "seasonal_borrowing",
        "issue_type": "qoe",
        "name": "Seasonal Working Capital Line Usage Misrepresenting Liquidity",
        "description": (
            "A revolving line of credit used for seasonal working capital needs is "
            "presented as undrawn at period end, giving an artificially favorable "
            "liquidity picture. In seasonal businesses, period-end cash positions "
            "may not represent typical intra-year liquidity needs."
        ),
        "risk_level": "moderate",
        "materiality_note": "Relevant in QoE and SBA contexts where liquidity is a key underwriting criterion.",
        "detection_logic": "Low or zero line of credit balance at fiscal year end with high peak balances during the year; significant seasonal revenue patterns.",
        "potential_causes": [
            "Fiscal year end aligned with cash-peak in the seasonal cycle",
            "Line of credit repaid at year end for reporting purposes then immediately redrawn",
        ],
        "suggested_procedures": [
            "Obtain monthly credit line utilization for trailing 12 months",
            "Calculate average and peak balance",
            "Present annualized working capital borrowing needs in analysis",
        ],
        "suggested_ajes": [],
        "management_questions": [
            "What is the typical peak borrowing level on the credit line during the year?",
            "Is the fiscal year end the natural cash-peak or cash-trough of the business cycle?",
        ],
        "affected_account_types": ["liability"],
        "affected_statements": ["BalanceSheet"],
        "audit_assertions": ["presentation"],
        "references": ["QoE best practices", "SBA SOP 50-10"],
        "sort_order": 80,
    },
]
