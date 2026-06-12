"""SBA Compliance — 8 issue templates (SBA_001–SBA_008)"""

SBA_COMPLIANCE = [
    {
        "code": "SBA_001",
        "category": "sba_compliance",
        "subcategory": "dscr",
        "issue_type": "sba",
        "name": "Debt Service Coverage Ratio Below SBA Minimum Threshold",
        "description": (
            "The Debt Service Coverage Ratio (DSCR) calculated using SBA-defined "
            "methodology falls below the minimum required threshold (typically 1.25x). "
            "SBA requires DSCR ≥ 1.25x on a historical and projected basis. A DSCR "
            "below this threshold will typically result in loan decline or require "
            "additional credit enhancement."
        ),
        "risk_level": "critical",
        "materiality_note": "Any DSCR below 1.25x is disqualifying for SBA 7(a) approval without special justification.",
        "detection_logic": "DSCR = (Net Operating Income + Depreciation + Interest + Owner Add-backs) / (Annual Debt Service); result < 1.25x.",
        "potential_causes": [
            "Debt service requirements too high relative to operating cash flow",
            "Recent revenue or margin decline reducing available cash flow",
            "Prior debt obligations reducing DSCR below threshold",
            "Owner compensation adjustments insufficient to achieve coverage",
        ],
        "suggested_procedures": [
            "Calculate DSCR using SBA-preferred methodology (IRS tax return basis)",
            "Calculate all potential add-backs: depreciation, interest, officer compensation above market, non-recurring items",
            "Model sensitivity: how much additional revenue or cost reduction is needed to achieve 1.25x?",
            "Identify any debt that can be retired or subordinated to improve coverage",
        ],
        "suggested_ajes": [],
        "management_questions": [
            "What is the expected DSCR using the most recent 3 years of tax returns?",
            "Are all eligible add-backs included in the DSCR calculation?",
            "Is the company's debt service expected to increase or decrease in the next 12 months?",
        ],
        "affected_account_types": ["liability"],
        "affected_statements": ["IncomeStatement", "CashFlowStatement"],
        "audit_assertions": ["accuracy", "completeness"],
        "references": ["SBA SOP 50-10 6.0", "SBA Form 1919"],
        "sort_order": 10,
    },
    {
        "code": "SBA_002",
        "category": "sba_compliance",
        "subcategory": "equity_injection",
        "issue_type": "sba",
        "name": "Borrower Equity Injection Documentation Incomplete",
        "description": (
            "The required borrower equity injection for an SBA loan has not been "
            "documented or does not meet SBA requirements. SBA generally requires "
            "10-20% equity injection from the borrower. The source of funds must be "
            "documented to confirm it is not a borrowed or gifted amount."
        ),
        "risk_level": "high",
        "materiality_note": "Missing equity injection documentation is a loan disqualifier.",
        "detection_logic": "Equity injection shown in financial statements without source of funds documentation; equity injection below 10% of total project cost.",
        "potential_causes": [
            "Equity injection from borrowed funds (e.g., credit card, home equity line)",
            "Source of funds documentation not provided",
            "Equity injection below minimum threshold",
        ],
        "suggested_procedures": [
            "Verify source of equity injection funds (bank statements showing accumulation)",
            "Confirm equity injection is not from borrowed sources",
            "Calculate injection as % of total project cost",
            "Ensure equity injection is fully committed and not conditional",
        ],
        "suggested_ajes": [],
        "management_questions": [
            "What is the source of the equity injection funds?",
            "Are funds in a liquid account confirmed by bank statement?",
            "Was any portion of the equity injection borrowed from another source?",
        ],
        "affected_account_types": ["equity", "asset"],
        "affected_statements": ["BalanceSheet"],
        "audit_assertions": ["existence", "completeness"],
        "references": ["SBA SOP 50-10 6.0 Section C", "13 CFR Part 120"],
        "sort_order": 20,
    },
    {
        "code": "SBA_003",
        "category": "sba_compliance",
        "subcategory": "size_eligibility",
        "issue_type": "sba",
        "name": "Business Size Standard Eligibility Not Confirmed",
        "description": (
            "The business may not meet SBA small business size standards for its "
            "industry. Size standards vary by NAICS code (employee count or revenue-based) "
            "and must be calculated including affiliates under SBA affiliation rules. "
            "Affiliation with larger entities may cause the borrower to exceed size limits."
        ),
        "risk_level": "high",
        "materiality_note": "Size standard violation disqualifies the loan.",
        "detection_logic": "Revenue approaching size standard threshold; ownership by larger entity without affiliation analysis; multiple entities under common control.",
        "potential_causes": [
            "Affiliation with private equity sponsor or larger parent",
            "Revenue near size threshold without formal calculation",
            "Common ownership of multiple entities creating affiliated group",
        ],
        "suggested_procedures": [
            "Identify the correct NAICS code and corresponding SBA size standard",
            "Calculate size including affiliates under SBA affiliation rules",
            "Assess whether ownership structure creates affiliation with larger entities",
        ],
        "suggested_ajes": [],
        "management_questions": [
            "Are there any entities affiliated with the borrower through common ownership or control?",
            "What is the borrower's NAICS code and the corresponding SBA size standard?",
            "Has the 3-year average annual revenue (or employee count) been calculated including affiliates?",
        ],
        "affected_account_types": ["revenue"],
        "affected_statements": ["IncomeStatement"],
        "audit_assertions": ["completeness", "accuracy"],
        "references": ["13 CFR Part 121", "SBA SOP 50-10 6.0"],
        "sort_order": 30,
    },
    {
        "code": "SBA_004",
        "category": "sba_compliance",
        "subcategory": "use_of_proceeds",
        "issue_type": "sba",
        "name": "Use of Proceeds Inconsistent with SBA Eligible Purposes",
        "description": (
            "The proposed use of loan proceeds includes purposes that are ineligible "
            "under SBA guidelines, such as real estate investment (not owner-occupied), "
            "refinancing of existing SBA debt, paying dividends, or funding speculative "
            "activities. Ineligible use of proceeds disqualifies the loan."
        ),
        "risk_level": "high",
        "materiality_note": "Any ineligible use of proceeds is disqualifying.",
        "detection_logic": "Loan proceeds designated for real estate not used in business operations; proceeds for passive investment or financial assets.",
        "potential_causes": [
            "Refinancing of existing SBA 7(a) loan without 7(a) guidelines satisfied",
            "Proceeds for investment real estate not occupied by borrower",
            "Partial proceeds for non-eligible purposes bundled with eligible purposes",
        ],
        "suggested_procedures": [
            "Review detailed use of proceeds schedule",
            "Verify each use against SBA eligible purpose list",
            "Confirm owner-occupancy requirements for real estate component",
        ],
        "suggested_ajes": [],
        "management_questions": [
            "What is the specific use for each dollar of loan proceeds?",
            "Are any proceeds being used for investment real estate?",
            "Is the real estate component owner-occupied for business operations?",
        ],
        "affected_account_types": ["asset", "liability"],
        "affected_statements": ["BalanceSheet"],
        "audit_assertions": ["occurrence", "accuracy"],
        "references": ["SBA SOP 50-10 6.0 Chapter 2", "13 CFR 120.120"],
        "sort_order": 40,
    },
    {
        "code": "SBA_005",
        "category": "sba_compliance",
        "subcategory": "management_experience",
        "issue_type": "sba",
        "name": "Management Experience Insufficient for Business Type",
        "description": (
            "The key management personnel do not have adequate experience in the "
            "industry or business type being financed. SBA lenders assess management "
            "experience as a key credit factor. Lack of relevant experience increases "
            "default risk and is a significant underwriting consideration."
        ),
        "risk_level": "moderate",
        "materiality_note": "Qualitative factor that can affect loan approval; especially relevant for acquisitions.",
        "detection_logic": "New buyer with no industry experience acquiring an established business; management with no prior business ownership experience.",
        "potential_causes": [
            "First-time business buyer with no industry background",
            "Key man risk: sole owner with no succession plan",
            "Management team with financial but no operational background",
        ],
        "suggested_procedures": [
            "Obtain resumes for all key management",
            "Assess industry-relevant experience",
            "Evaluate transition plan and seller involvement post-close",
            "Consider whether outside management expertise is needed",
        ],
        "suggested_ajes": [],
        "management_questions": [
            "What prior experience does the owner/management team have in this industry?",
            "Is there a transition plan with the seller?",
            "Are any key employees continuing post-acquisition?",
        ],
        "affected_account_types": [],
        "affected_statements": [],
        "audit_assertions": ["completeness"],
        "references": ["SBA SOP 50-10 6.0 Chapter 4"],
        "sort_order": 50,
    },
    {
        "code": "SBA_006",
        "category": "sba_compliance",
        "subcategory": "tax_returns_vs_financials",
        "issue_type": "sba",
        "name": "Material Discrepancy Between Tax Returns and Financial Statements",
        "description": (
            "There are material, unexplained differences between the entity's tax "
            "returns and its financial statements. SBA lenders use tax returns as the "
            "primary income verification tool. Discrepancies raise fraud risk and "
            "reduce reliance on either document."
        ),
        "risk_level": "critical",
        "materiality_note": "Any material unexplained discrepancy is critical for SBA underwriting.",
        "detection_logic": "Revenue or income on financial statements materially above tax returns; deductions on tax returns not in financial statements.",
        "potential_causes": [
            "Revenue on financials not reported on tax return",
            "Personal expenses deducted on tax return but not in financials",
            "Cash basis vs. accrual basis differences not reconciled",
            "Tax return filed for a different entity or period",
        ],
        "suggested_procedures": [
            "Prepare reconciliation of financial statement income to taxable income",
            "Identify and document all book-to-tax differences",
            "Obtain and review IRS tax transcripts to verify returns as filed",
            "Flag any unexplained differences for further investigation",
        ],
        "suggested_ajes": [],
        "management_questions": [
            "Can you reconcile the difference between your financial statement income and taxable income?",
            "Are there any items on the tax return not reflected in the financials?",
            "Are financials prepared on the same basis (cash vs. accrual) as tax returns?",
        ],
        "affected_account_types": ["revenue"],
        "affected_statements": ["IncomeStatement"],
        "audit_assertions": ["accuracy", "completeness"],
        "references": ["SBA SOP 50-10 6.0", "IRS Form 4506-C"],
        "sort_order": 60,
    },
    {
        "code": "SBA_007",
        "category": "sba_compliance",
        "subcategory": "collateral",
        "issue_type": "sba",
        "name": "Collateral Valuation Unsupported or Inflated",
        "description": (
            "Real estate or equipment offered as SBA loan collateral has been valued "
            "using an unsupported methodology or at a value above fair market value. "
            "SBA requires independent appraisals for real estate above $500,000 and "
            "generally requires collateral to support at least a portion of the loan."
        ),
        "risk_level": "high",
        "materiality_note": "Inflated collateral values can constitute loan fraud.",
        "detection_logic": "Collateral values significantly above assessed tax value or prior appraisals; appraisal by non-independent party.",
        "potential_causes": [
            "Appraisal by affiliated party",
            "Outdated appraisal in a declining market",
            "Equipment valued at cost rather than fair market or orderly liquidation value",
        ],
        "suggested_procedures": [
            "Obtain independent appraisal for real estate > $500,000",
            "Use orderly liquidation value for equipment and business assets",
            "Compare appraised value to assessed tax value and prior appraisals",
        ],
        "suggested_ajes": [],
        "management_questions": [
            "Who performed the collateral appraisals?",
            "Are appraisers independent of the borrower and lender?",
            "When were the appraisals performed?",
        ],
        "affected_account_types": ["asset"],
        "affected_statements": ["BalanceSheet"],
        "audit_assertions": ["valuation", "existence"],
        "references": ["SBA SOP 50-10 6.0 Chapter 5", "FIRREA appraisal requirements"],
        "sort_order": 70,
    },
    {
        "code": "SBA_008",
        "category": "sba_compliance",
        "subcategory": "prior_sba_loans",
        "issue_type": "sba",
        "name": "Undisclosed Prior SBA Loan or Federal Debt Delinquency",
        "description": (
            "The borrower or principals have prior SBA loan defaults, federal debt "
            "delinquencies, or outstanding government obligations that have not been "
            "disclosed. Undisclosed prior SBA defaults or federal debt delinquencies "
            "are grounds for loan disqualification."
        ),
        "risk_level": "critical",
        "materiality_note": "Any undisclosed federal delinquency is disqualifying under SBA eligibility rules.",
        "detection_logic": "SBA loan application does not address prior federal debt; derogatory public records for principals.",
        "potential_causes": [
            "Intentional non-disclosure of prior SBA default",
            "Principal unaware of delinquent obligation in their name",
            "Prior SBA EIDL loan in delinquency not recognized as a disqualifying factor",
        ],
        "suggested_procedures": [
            "Run CAIVRS (Credit Alert Verification Reporting System) check on all principals",
            "Verify no federal debt delinquencies through SAM.gov",
            "Check SBA loan history via SBA PGOLS",
        ],
        "suggested_ajes": [],
        "management_questions": [
            "Have you or any principal previously had an SBA loan?",
            "Are there any federal debt delinquencies for any principal?",
            "Have you or any principal previously defaulted on a government-guaranteed loan?",
        ],
        "affected_account_types": ["liability"],
        "affected_statements": ["BalanceSheet"],
        "audit_assertions": ["completeness"],
        "references": ["SBA SOP 50-10 6.0", "13 CFR 120.112", "CAIVRS"],
        "sort_order": 80,
    },
]
