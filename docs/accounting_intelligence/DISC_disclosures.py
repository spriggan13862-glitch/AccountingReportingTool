"""Disclosures — 6 issue templates (DISC_001–DISC_006)"""

DISCLOSURES = [
    {
        "code": "DISC_001",
        "category": "disclosures",
        "subcategory": "accounting_policies",
        "issue_type": "presentation",
        "name": "Significant Accounting Policies Not Disclosed or Incomplete",
        "description": (
            "The summary of significant accounting policies is absent, incomplete, "
            "or does not describe the actual policies used in preparing the financial "
            "statements. ASC 235 requires disclosure of all significant accounting "
            "policies involving a selection from acceptable alternatives or specific "
            "industry practices."
        ),
        "risk_level": "moderate",
        "materiality_note": "Always required in financial statements; quality issue even when not quantitatively material.",
        "detection_logic": "No accounting policy note present; policies described do not match actual accounting methods used.",
        "potential_causes": [
            "Boilerplate policies copied without customization",
            "Revenue recognition policy generic and not specific to entity's contracts",
            "New accounting standards adopted without updated policy disclosure",
        ],
        "suggested_procedures": [
            "Review accounting policy note for completeness and accuracy",
            "Verify each policy describes the actual method used",
            "Update for any new standards adopted in the current period",
        ],
        "suggested_ajes": [],
        "management_questions": [
            "Are accounting policy disclosures current and specific to the company?",
            "Have any accounting policies changed in the current period?",
            "Are ASC 606 revenue recognition policies described in sufficient detail?",
        ],
        "affected_account_types": ["revenue", "asset"],
        "affected_statements": ["IncomeStatement", "BalanceSheet"],
        "audit_assertions": ["presentation", "accuracy"],
        "references": ["ASC 235-10-50-1", "ASC 235-10-50-3"],
        "sort_order": 10,
    },
    {
        "code": "DISC_002",
        "category": "disclosures",
        "subcategory": "debt_disclosures",
        "issue_type": "presentation",
        "name": "Long-Term Debt Disclosure Incomplete",
        "description": (
            "The financial statement note for long-term debt is missing required "
            "disclosures: terms, interest rates, maturity schedule, covenant "
            "requirements, collateral, and aggregate maturities for the next five "
            "years. Incomplete disclosure prevents users from assessing liquidity risk."
        ),
        "risk_level": "moderate",
        "materiality_note": "Material when debt is a significant portion of the capital structure.",
        "detection_logic": "Debt note lacking maturity schedule, interest rates, or covenant information.",
        "potential_causes": [
            "Loan documents not reviewed by preparer",
            "Note template not customized for entity-specific debt terms",
            "Covenant compliance status not included",
        ],
        "suggested_procedures": [
            "Review debt note against loan agreements for completeness",
            "Include 5-year maturity schedule",
            "Disclose significant covenants and compliance status",
        ],
        "suggested_ajes": [],
        "management_questions": [
            "Does the debt note include all required information: terms, rates, maturities, covenants?",
            "Are covenants and compliance status disclosed?",
        ],
        "affected_account_types": ["liability"],
        "affected_statements": ["BalanceSheet"],
        "audit_assertions": ["presentation", "completeness"],
        "references": ["ASC 470-10-50-1", "ASC 440-10-50"],
        "sort_order": 20,
    },
    {
        "code": "DISC_003",
        "category": "disclosures",
        "subcategory": "going_concern_disclosure",
        "issue_type": "audit",
        "name": "Going Concern Disclosure Absent When Required",
        "description": (
            "Conditions and events exist that raise substantial doubt about the entity's "
            "ability to continue as a going concern for the 12-month period following "
            "the financial statement date, but the required going concern disclosure "
            "under ASC 205-40 has not been included."
        ),
        "risk_level": "critical",
        "materiality_note": "Any omitted going concern disclosure is critical and constitutes a material omission.",
        "detection_logic": "Going concern conditions present (negative working capital, covenant violations, accumulated deficit, negative OCF) without corresponding disclosure.",
        "potential_causes": [
            "Management believes plans alleviate going concern but have not evaluated the ASC 205-40 standard",
            "Going concern evaluation not performed for interim periods",
            "Auditor or reviewer relying on management without independent assessment",
        ],
        "suggested_procedures": [
            "Enumerate all going concern conditions and events",
            "Evaluate management's mitigating plans and assess feasibility",
            "Determine whether substantial doubt is alleviated or remains",
            "Draft required disclosure if substantial doubt exists",
        ],
        "suggested_ajes": [],
        "management_questions": [
            "Has a formal going concern evaluation been performed?",
            "What specific plans are in place to address conditions raising doubt?",
            "Are management's plans committed and feasible within 12 months?",
        ],
        "affected_account_types": ["liability"],
        "affected_statements": ["BalanceSheet"],
        "audit_assertions": ["presentation", "completeness"],
        "references": ["ASC 205-40-50", "AU-C 570"],
        "sort_order": 30,
    },
    {
        "code": "DISC_004",
        "category": "disclosures",
        "subcategory": "concentrations",
        "issue_type": "financial_analytics",
        "name": "Concentration Risk Disclosures Missing",
        "description": (
            "Significant concentrations of credit risk, market risk, or business "
            "risk have not been disclosed as required by ASC 825-10-50 and ASC 280. "
            "Required disclosures include customers representing > 10% of revenue, "
            "geographic concentrations, and concentrations with specific suppliers "
            "or vendors."
        ),
        "risk_level": "moderate",
        "materiality_note": "ASC 825 requires disclosure of concentrations that could result in material loss.",
        "detection_logic": "Single customer > 10% of revenue without disclosure; significant geographic concentration undisclosed.",
        "potential_causes": [
            "Customer revenue analysis not performed",
            "Concentration risk considered immaterial without analysis",
            "Disclosure requirement not identified by preparer",
        ],
        "suggested_procedures": [
            "Prepare revenue by customer; identify > 10% customers",
            "Identify geographic revenue concentrations",
            "Disclose concentrations per ASC 825-10-50",
        ],
        "suggested_ajes": [],
        "management_questions": [
            "Are customer concentration disclosures included in the financial statements?",
            "Are there geographic areas representing significant revenue?",
            "Are there key suppliers without whom the business cannot operate?",
        ],
        "affected_account_types": ["revenue"],
        "affected_statements": ["IncomeStatement"],
        "audit_assertions": ["presentation", "completeness"],
        "references": ["ASC 825-10-50-20", "ASC 280-10-50-42"],
        "sort_order": 40,
    },
    {
        "code": "DISC_005",
        "category": "disclosures",
        "subcategory": "commitments_contingencies",
        "issue_type": "audit",
        "name": "Commitments and Contingencies Footnote Incomplete",
        "description": (
            "The commitments and contingencies footnote does not include all material "
            "obligations: operating lease commitments (pre-ASC 842), capital commitments, "
            "purchase obligations, legal contingencies, environmental obligations, "
            "and guarantees. Incomplete disclosure understates known future obligations."
        ),
        "risk_level": "high",
        "materiality_note": "Material omissions in C&C footnote are always significant.",
        "detection_logic": "Known obligations (leases, contracts, litigation) not in commitments footnote.",
        "potential_causes": [
            "Preparer relying on management representation without independent verification",
            "Legal department not queried for contingencies",
            "Purchase and take-or-pay obligations not summarized",
        ],
        "suggested_procedures": [
            "Review all contracts, leases, and purchase agreements for undisclosed commitments",
            "Obtain attorney letter for litigation contingencies",
            "Prepare or verify comprehensive commitments and contingencies schedule",
        ],
        "suggested_ajes": [],
        "management_questions": [
            "Are all lease, purchase, and contractual commitments disclosed?",
            "Are all pending litigation matters included in the contingencies disclosure?",
            "Are there any environmental or remediation commitments?",
        ],
        "affected_account_types": ["liability"],
        "affected_statements": ["BalanceSheet"],
        "audit_assertions": ["completeness", "presentation"],
        "references": ["ASC 440-10-50", "ASC 450-20-50", "AU-C 501"],
        "sort_order": 50,
    },
    {
        "code": "DISC_006",
        "category": "disclosures",
        "subcategory": "fair_value",
        "issue_type": "audit",
        "name": "Fair Value Disclosures Incomplete or Missing",
        "description": (
            "Required fair value disclosures under ASC 820 and ASC 825 are absent "
            "or incomplete. Entities must disclose the fair value of financial "
            "instruments, categorized by fair value hierarchy (Level 1, 2, 3). "
            "Private companies may elect ASC 825-10 practical expedient but must "
            "disclose the election."
        ),
        "risk_level": "moderate",
        "materiality_note": "Required for all entities with financial instruments; material when fair values differ significantly from carrying values.",
        "detection_logic": "No fair value disclosure note; fair value hierarchy not presented; significant Level 3 instruments without sensitivity disclosure.",
        "potential_causes": [
            "Private company practical expedient not elected or disclosed",
            "Fair value disclosure requirement not identified by preparer",
            "Level 3 measurements not adequately described",
        ],
        "suggested_procedures": [
            "Identify all financial instruments requiring fair value disclosure",
            "Assess whether private company practical expedient is available and elected",
            "Prepare or review fair value hierarchy disclosures",
        ],
        "suggested_ajes": [],
        "management_questions": [
            "Has the private company fair value practical expedient been elected?",
            "Are all financial instruments included in the fair value disclosure?",
            "Are Level 3 valuation techniques and inputs described?",
        ],
        "affected_account_types": ["asset", "liability"],
        "affected_statements": ["BalanceSheet"],
        "audit_assertions": ["presentation", "completeness"],
        "references": ["ASC 820-10-50", "ASC 825-10-50"],
        "sort_order": 60,
    },
]
