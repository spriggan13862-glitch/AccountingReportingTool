"""Debt Obligations — 8 issue templates (DEBT_001–DEBT_008)"""

DEBT_OBLIGATIONS = [
    {
        "code": "DEBT_001",
        "category": "debt_obligations",
        "subcategory": "covenant",
        "issue_type": "financial_analytics",
        "name": "Debt Covenant Violation — Potential Acceleration Risk",
        "description": (
            "The entity may be in violation of a financial covenant in a loan or credit "
            "agreement (e.g., minimum DSCR, maximum leverage ratio, minimum liquidity). "
            "Covenant violations can trigger acceleration of debt to current, require "
            "waiver disclosure, and create going concern considerations."
        ),
        "risk_level": "critical",
        "materiality_note": "Always critical; a covenant breach can reclassify long-term debt to current and trigger going concern evaluation.",
        "detection_logic": "Key financial ratios approaching or below covenant thresholds: Debt/EBITDA, DSCR, current ratio.",
        "potential_causes": [
            "Revenue decline or margin compression reducing DSCR",
            "Additional debt incurred without triggering covenant review",
            "EBITDA add-backs not permitted under loan agreement definition",
            "Current period loss reducing equity below minimum net worth covenant",
        ],
        "suggested_procedures": [
            "Calculate all financial covenant ratios under loan agreement definitions",
            "Identify any violations or near-violations",
            "Obtain waiver or compliance certificate from lender if applicable",
            "Reclassify long-term debt to current if in technical default without waiver",
        ],
        "suggested_ajes": [
            "Dr Long-Term Debt / Cr Current Portion of Long-Term Debt — to reclassify on covenant breach",
        ],
        "management_questions": [
            "Are you in compliance with all loan covenants as of the balance sheet date?",
            "Have any waivers been requested or received from lenders?",
            "Are there any upcoming covenant measurement dates where compliance is uncertain?",
        ],
        "affected_account_types": ["liability"],
        "affected_statements": ["BalanceSheet"],
        "audit_assertions": ["classification", "presentation", "completeness"],
        "references": ["ASC 470-10-45-11", "AU-C 570"],
        "sort_order": 10,
    },
    {
        "code": "DEBT_002",
        "category": "debt_obligations",
        "subcategory": "classification",
        "issue_type": "balance_sheet",
        "name": "Current vs. Long-Term Debt Misclassification",
        "description": (
            "Debt maturities are misclassified between current and long-term portions. "
            "Amounts due within 12 months must be classified as current liabilities. "
            "Incorrect classification overstates long-term liabilities and understates "
            "current liabilities, distorting working capital and liquidity ratios."
        ),
        "risk_level": "moderate",
        "materiality_note": "Material when misclassification affects current ratio or working capital calculation.",
        "detection_logic": "Current portion of long-term debt does not match next 12 months of amortization schedule.",
        "potential_causes": [
            "Amortization schedule not properly disaggregated into current/long-term",
            "Balloon payment within 12 months not reclassified",
            "Revolving credit balance classified as long-term when maturity is within 12 months",
        ],
        "suggested_procedures": [
            "Obtain amortization schedules for all debt instruments",
            "Identify all payments due within 12 months of balance sheet date",
            "Reclassify current portion to current liabilities",
        ],
        "suggested_ajes": [
            "Dr Long-Term Debt / Cr Current Portion of Long-Term Debt — to reclassify",
        ],
        "management_questions": [
            "Is the current portion of long-term debt based on the amortization schedule?",
            "Are there any balloon payments due within the next 12 months?",
            "Does any revolving credit facility mature within 12 months?",
        ],
        "affected_account_types": ["liability"],
        "affected_statements": ["BalanceSheet"],
        "audit_assertions": ["classification", "presentation"],
        "references": ["ASC 210-10-45-9", "ASC 470-10-45-1"],
        "sort_order": 20,
    },
    {
        "code": "DEBT_003",
        "category": "debt_obligations",
        "subcategory": "issuance_costs",
        "issue_type": "balance_sheet",
        "name": "Debt Issuance Costs Improperly Classified or Amortized",
        "description": (
            "Debt issuance costs (origination fees, legal fees, underwriting fees) are "
            "classified as an asset rather than as a direct deduction from the debt "
            "liability, or are not being amortized over the debt term using the effective "
            "interest method. Post-ASU 2015-03, these must be presented as contra-liability."
        ),
        "risk_level": "low",
        "materiality_note": "Reclassification required; may affect presentation only when immaterial to total debt.",
        "detection_logic": "Debt issuance costs appearing as other assets rather than as contra to the related debt liability.",
        "potential_causes": [
            "Legacy accounting treatment not updated for ASU 2015-03",
            "Issuance costs capitalized to asset account and straight-line amortized",
            "New debt origination fees not immediately deducted from debt proceeds",
        ],
        "suggested_procedures": [
            "Identify all debt issuance cost balances in asset accounts",
            "Reclassify to contra-liability presented with related debt",
            "Verify amortization using effective interest method",
        ],
        "suggested_ajes": [
            "Dr Long-Term Debt / Cr Other Assets — to reclassify debt issuance costs",
        ],
        "management_questions": [
            "Are debt issuance costs presented as a deduction from the debt balance or as an asset?",
            "What amortization method is used for debt issuance costs?",
        ],
        "affected_account_types": ["liability"],
        "affected_statements": ["BalanceSheet"],
        "audit_assertions": ["presentation", "classification"],
        "references": ["ASU 2015-03", "ASC 835-30-45-1A"],
        "sort_order": 30,
    },
    {
        "code": "DEBT_004",
        "category": "debt_obligations",
        "subcategory": "interest",
        "issue_type": "audit",
        "name": "Interest Expense Accrual Missing or Incorrect",
        "description": (
            "Interest expense accruals are not recorded for the period or are materially "
            "incorrect. Interest accrues on outstanding debt regardless of payment timing. "
            "Missing accruals understate expenses and liabilities; incorrect accruals "
            "misstate interest expense."
        ),
        "risk_level": "moderate",
        "materiality_note": "Flag when interest expense is unusually low relative to total debt outstanding.",
        "detection_logic": "Interest expense as % of average debt outstanding significantly below the stated interest rate.",
        "potential_causes": [
            "Accrued interest not recorded between payment dates",
            "Floating rate adjustments not incorporated in accrual",
            "PIK interest not accrued",
            "Discount amortization not reflected in interest expense",
        ],
        "suggested_procedures": [
            "Recalculate expected interest expense for the period using debt balances and rates",
            "Compare to recorded interest expense; investigate differences",
            "Verify accrued interest balance at period end",
        ],
        "suggested_ajes": [
            "Dr Interest Expense / Cr Accrued Interest Payable — to record unaccrued interest",
        ],
        "management_questions": [
            "Are interest accruals recorded between payment dates?",
            "Has the interest rate on variable-rate debt been updated?",
            "Is PIK or deferred interest being accrued?",
        ],
        "affected_account_types": ["liability"],
        "affected_statements": ["BalanceSheet", "IncomeStatement"],
        "audit_assertions": ["completeness", "accuracy", "cutoff"],
        "references": ["ASC 835-30", "ASC 470-10"],
        "sort_order": 40,
    },
    {
        "code": "DEBT_005",
        "category": "debt_obligations",
        "subcategory": "related_party_debt",
        "issue_type": "audit",
        "name": "Related Party Debt Not Disclosed or Below-Market Rate",
        "description": (
            "Loans from or to related parties (owners, affiliates, family members) are "
            "not separately disclosed or are at below-market interest rates without "
            "disclosure. ASC 850 requires disclosure of related party transaction terms. "
            "Below-market rates may require imputed interest recognition."
        ),
        "risk_level": "moderate",
        "materiality_note": "Always requires disclosure; imputed interest required when rate is below AFR.",
        "detection_logic": "Liabilities to owners or affiliates in debt accounts; loans at 0% or below-market rates.",
        "potential_causes": [
            "Owner loans recorded as notes payable without disclosure",
            "Intercompany financing at preferential rates",
            "Informal loans from related parties without proper documentation",
        ],
        "suggested_procedures": [
            "Identify all debt to related parties",
            "Compare interest rates to AFR; calculate imputed interest if below-market",
            "Verify proper disclosure in financial statement footnotes",
        ],
        "suggested_ajes": [
            "Dr Interest Expense / Cr Additional Paid-In Capital — to impute below-market interest on owner loans",
        ],
        "management_questions": [
            "Are there any loans from owners, family members, or affiliates?",
            "What interest rates apply to related party loans?",
            "Are related party loan terms disclosed in the financial statements?",
        ],
        "affected_account_types": ["liability"],
        "affected_statements": ["BalanceSheet", "IncomeStatement"],
        "audit_assertions": ["presentation", "completeness"],
        "references": ["ASC 850-10-50", "IRC Section 7872"],
        "sort_order": 50,
    },
    {
        "code": "DEBT_006",
        "category": "debt_obligations",
        "subcategory": "sba_ppp",
        "issue_type": "sba",
        "name": "PPP Loan Forgiveness Accounting Error",
        "description": (
            "Paycheck Protection Program (PPP) loan forgiveness has been recognized "
            "before meeting the eligibility criteria, or has been recorded incorrectly. "
            "Under ASC 470 (debt model) or ASC 958-605 (conditional contribution model), "
            "forgiveness is recognized only when conditions are substantially met."
        ),
        "risk_level": "moderate",
        "materiality_note": "Material for any entity with a PPP loan; must determine accounting model.",
        "detection_logic": "PPP loan balance eliminated without formal forgiveness application submitted and approved.",
        "potential_causes": [
            "Forgiveness recognized at application submission before SBA approval",
            "Forgiveness recorded as revenue instead of gain on extinguishment or grant income",
            "Partial forgiveness not properly bifurcated",
        ],
        "suggested_procedures": [
            "Verify SBA forgiveness approval documentation",
            "Confirm timing of recognition matches approval date",
            "Verify classification of forgiveness in income statement (not revenue)",
        ],
        "suggested_ajes": [
            "Dr PPP Loan Payable / Cr Gain on PPP Forgiveness (Other Income) — only upon formal approval",
        ],
        "management_questions": [
            "Has PPP forgiveness been formally approved by the SBA?",
            "How is the forgiveness presented in the income statement?",
            "Was full or partial forgiveness received?",
        ],
        "affected_account_types": ["liability"],
        "affected_statements": ["BalanceSheet", "IncomeStatement"],
        "audit_assertions": ["cutoff", "occurrence", "accuracy"],
        "references": ["ASC 470-50", "ASC 958-605", "CARES Act Section 1106"],
        "sort_order": 60,
    },
    {
        "code": "DEBT_007",
        "category": "debt_obligations",
        "subcategory": "convertible",
        "issue_type": "audit",
        "name": "Convertible Debt Bifurcation Error",
        "description": (
            "Convertible debt instruments with embedded conversion features have not "
            "been bifurcated into debt and equity components, or the bifurcation is "
            "incorrect. Under ASC 470-20 (pre-ASU 2020-06) or updated guidance, "
            "convertible instruments may require separation of the conversion option."
        ),
        "risk_level": "moderate",
        "materiality_note": "Material for entities with significant convertible debt outstanding.",
        "detection_logic": "Convertible notes outstanding without corresponding equity component; beneficial conversion feature not recognized.",
        "potential_causes": [
            "Embedded conversion feature not evaluated for bifurcation",
            "ASU 2020-06 transition not completed",
            "Beneficial conversion feature calculation error",
        ],
        "suggested_procedures": [
            "Review all convertible instruments for bifurcation requirements",
            "Assess applicability of ASU 2020-06 (effective for FY2022+)",
            "Verify calculation of any required equity component",
        ],
        "suggested_ajes": [
            "Dr Debt Discount / Cr Additional Paid-In Capital — to record equity component of convertible",
        ],
        "management_questions": [
            "Are there any convertible notes or instruments outstanding?",
            "Have these been reviewed for bifurcation requirements?",
            "Has the entity adopted ASU 2020-06?",
        ],
        "affected_account_types": ["liability"],
        "affected_statements": ["BalanceSheet", "IncomeStatement"],
        "audit_assertions": ["accuracy", "completeness"],
        "references": ["ASC 470-20", "ASU 2020-06"],
        "sort_order": 70,
    },
    {
        "code": "DEBT_008",
        "category": "debt_obligations",
        "subcategory": "going_concern",
        "issue_type": "audit",
        "name": "Debt Maturity Within 12 Months Without Refinancing Plan — Going Concern Indicator",
        "description": (
            "Significant debt matures within 12 months and there is no documented "
            "refinancing plan or available credit facility to replace it. This is a "
            "going concern indicator requiring management evaluation and potential "
            "disclosure under ASC 205-40."
        ),
        "risk_level": "critical",
        "materiality_note": "Always requires management evaluation; may require going concern disclosure.",
        "detection_logic": "Debt maturing within 12 months exceeds available liquidity (cash + credit facility) without documented refinancing plan.",
        "potential_causes": [
            "Revolving credit approaching maturity without renewal executed",
            "Term loan balloon payment within 12 months",
            "Bridge financing without long-term solution in place",
        ],
        "suggested_procedures": [
            "Confirm debt maturity dates within 12 months",
            "Obtain management's refinancing plan and assess feasibility",
            "Evaluate whether conditions and events raise substantial doubt about going concern",
            "Determine whether going concern disclosure is required",
        ],
        "suggested_ajes": [],
        "management_questions": [
            "What is the plan for refinancing debt maturing within the next 12 months?",
            "Are there any executed commitments from lenders for refinancing?",
            "Does available liquidity cover maturing debt without refinancing?",
        ],
        "affected_account_types": ["liability"],
        "affected_statements": ["BalanceSheet"],
        "audit_assertions": ["completeness", "presentation"],
        "references": ["ASC 205-40", "ASC 470-10-45-11", "AU-C 570"],
        "sort_order": 80,
    },
]
