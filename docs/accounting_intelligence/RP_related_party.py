"""Related Party — 6 issue templates (RP_001–RP_006)"""

RELATED_PARTY = [
    {
        "code": "RP_001",
        "category": "related_party",
        "subcategory": "disclosure",
        "issue_type": "audit",
        "name": "Related Party Transactions Not Disclosed in Financial Statements",
        "description": (
            "Material transactions with related parties (owners, officers, affiliates, "
            "family members) are not disclosed in the financial statements as required "
            "by ASC 850. Disclosure must include: nature of relationship, description "
            "of transaction, dollar amounts, and amounts due to/from related parties."
        ),
        "risk_level": "high",
        "materiality_note": "Always qualitatively material; ASC 850 disclosure required regardless of amount.",
        "detection_logic": "Payments to or from entities or individuals with ownership overlap not separately disclosed.",
        "potential_causes": [
            "Management unaware of disclosure requirement",
            "Transactions considered immaterial without applying qualitative test",
            "Related party not identified in accounting system",
        ],
        "suggested_procedures": [
            "Obtain complete related party register including all entities under common ownership",
            "Cross-reference to accounts payable, accounts receivable, and expense accounts",
            "Prepare or review related party footnote disclosure",
            "Obtain management representation regarding completeness of related party identification",
        ],
        "suggested_ajes": [],
        "management_questions": [
            "Are all transactions with related parties included in financial statement disclosures?",
            "Are there any transactions with family members or businesses controlled by owners?",
            "Are intercompany transactions with affiliated entities disclosed?",
        ],
        "affected_account_types": ["asset", "liability", "revenue"],
        "affected_statements": ["BalanceSheet", "IncomeStatement"],
        "audit_assertions": ["presentation", "completeness"],
        "references": ["ASC 850-10-50-1", "AU-C 550"],
        "sort_order": 10,
    },
    {
        "code": "RP_002",
        "category": "related_party",
        "subcategory": "arm_length",
        "issue_type": "audit",
        "name": "Related Party Transactions Not on Arm's Length Terms",
        "description": (
            "Transactions with related parties are at prices, terms, or rates that "
            "would not be available in an arm's-length market transaction. Non-arm's-"
            "length transactions distort reported financial results and may be used "
            "to transfer value between entities."
        ),
        "risk_level": "high",
        "materiality_note": "Non-arm's-length related party transactions are always qualitatively material.",
        "detection_logic": "Rent paid to related party above market; goods purchased from related party above market; services charged below cost.",
        "potential_causes": [
            "Owner-controlled real estate leased to business at above-market rent",
            "Family members receiving above-market compensation",
            "Below-cost services from affiliate reducing reported expenses",
        ],
        "suggested_procedures": [
            "Benchmark related party transaction prices to market",
            "Obtain independent appraisal or market comparison for significant transactions",
            "Quantify above/below-market amounts as financial statement adjustments",
            "Disclose non-arm's-length nature and market rate comparison",
        ],
        "suggested_ajes": [
            "Dr/Cr Operating Expense / Cr/Dr Owner Compensation or Equity — to normalize to market rate",
        ],
        "management_questions": [
            "Are related party transactions priced at market rates?",
            "Has there been an independent review of any significant related party pricing?",
        ],
        "affected_account_types": ["revenue", "cogs"],
        "affected_statements": ["IncomeStatement"],
        "audit_assertions": ["occurrence", "accuracy"],
        "references": ["ASC 850-10-50-4", "IRC Section 482"],
        "sort_order": 20,
    },
    {
        "code": "RP_003",
        "category": "related_party",
        "subcategory": "personal_guarantee",
        "issue_type": "audit",
        "name": "Personal Guarantees and Owner Commitments Not Disclosed",
        "description": (
            "Personal guarantees provided by owners on business debt, or business "
            "guarantees provided for owner personal obligations, have not been disclosed. "
            "These commitments are material contingencies that affect both parties' "
            "financial positions."
        ),
        "risk_level": "moderate",
        "materiality_note": "Always requires disclosure; material in SBA and credit analysis.",
        "detection_logic": "Loan agreements contain personal guarantee provisions; no corresponding disclosure in financials.",
        "potential_causes": [
            "Personal guarantees not provided to accounting team",
            "Guarantee disclosure considered immaterial without analysis",
        ],
        "suggested_procedures": [
            "Review all loan agreements for personal guarantee provisions",
            "Identify any business guarantees for owner or affiliate obligations",
            "Disclose guarantee obligations in financial statement footnotes",
        ],
        "suggested_ajes": [],
        "management_questions": [
            "Are there personal guarantees outstanding for any business obligations?",
            "Has the business provided guarantees for any owner or affiliate obligations?",
        ],
        "affected_account_types": ["liability"],
        "affected_statements": ["BalanceSheet"],
        "audit_assertions": ["completeness", "presentation"],
        "references": ["ASC 460-10-50", "ASC 850-10"],
        "sort_order": 30,
    },
    {
        "code": "RP_004",
        "category": "related_party",
        "subcategory": "circular_transactions",
        "issue_type": "fraud",
        "name": "Circular or Round-Trip Transactions Between Related Entities",
        "description": (
            "Cash flows between related entities create the appearance of revenue or "
            "activity without economic substance. Round-trip transactions involve cash "
            "flowing out of an entity and returning through a related party, inflating "
            "apparent revenue and creating fictitious business activity."
        ),
        "risk_level": "critical",
        "materiality_note": "Any confirmed round-trip transaction is critical and constitutes fraud.",
        "detection_logic": "Cash paid to related party approximately equals cash received from related party in the same period; related party revenue without corresponding delivery of services.",
        "potential_causes": [
            "Inflating revenue for financing or transaction purposes",
            "Creating appearance of business activity for third-party lenders",
            "Related party loan recorded as revenue to hide the liability",
        ],
        "suggested_procedures": [
            "Map all related party cash flows in the period",
            "Identify offsetting payments where cash leaves and returns",
            "Verify that related party revenue has economic substance",
            "Confirm services or goods were actually delivered",
        ],
        "suggested_ajes": [
            "Dr Revenue / Cr Loan from Related Party — to recharacterize fictitious revenue as borrowing",
        ],
        "management_questions": [
            "Is there any related party revenue for which documentation of service delivery exists?",
            "Are there any offsetting payments between the entity and related parties?",
        ],
        "affected_account_types": ["revenue", "asset"],
        "affected_statements": ["IncomeStatement", "BalanceSheet"],
        "audit_assertions": ["occurrence", "existence"],
        "references": ["AU-C 240", "FASB Concept Statement No. 6"],
        "sort_order": 40,
    },
    {
        "code": "RP_005",
        "category": "related_party",
        "subcategory": "officer_loans",
        "issue_type": "audit",
        "name": "Loans to Officers or Shareholders — Balance Sheet and Legal Compliance",
        "description": (
            "Loans from the entity to officers, directors, or shareholders may violate "
            "Sarbanes-Oxley Section 402 for public companies, state corporate law "
            "for private companies, or SBA ineligibility rules. These must be disclosed "
            "and assessed for compliance."
        ),
        "risk_level": "high",
        "materiality_note": "Always requires disclosure; qualitatively material for public companies and SBA.",
        "detection_logic": "Receivables from officers, directors, or shareholders in the balance sheet.",
        "potential_causes": [
            "Owner draws or advances classified as loans rather than distributions",
            "Business funds used for personal purposes recorded as due from officer",
        ],
        "suggested_procedures": [
            "Identify all outstanding loans to officers, directors, or shareholders",
            "Assess compliance with SOX 402 for public companies",
            "Assess SBA eligibility: SBA generally prohibits loans to principals as part of SBA loan use",
            "Determine whether amounts are collectible; assess reserve need",
        ],
        "suggested_ajes": [
            "Dr Owner Distribution / Cr Due from Officer — to reclassify uncollectable officer loans",
        ],
        "management_questions": [
            "Are there any loans to officers, directors, or shareholders outstanding?",
            "Are these loans documented with interest rates and repayment terms?",
            "Are officer loans expected to be repaid?",
        ],
        "affected_account_types": ["asset"],
        "affected_statements": ["BalanceSheet"],
        "audit_assertions": ["existence", "valuation", "presentation"],
        "references": ["SOX Section 402", "ASC 850-10", "SBA SOP 50-10"],
        "sort_order": 50,
    },
    {
        "code": "RP_006",
        "category": "related_party",
        "subcategory": "succession",
        "issue_type": "qoe",
        "name": "Key Man Risk — Business Dependent on Single Owner/Manager",
        "description": (
            "The business is heavily dependent on a single key individual (owner, "
            "founder, technical expert) and does not have succession plans or key "
            "man insurance in place. Key man risk is a significant factor in QoE, "
            "SBA, and M&A analysis and affects business continuity."
        ),
        "risk_level": "high",
        "materiality_note": "Always flagged in transaction contexts; affects purchase price and loan terms.",
        "detection_logic": "Single owner-operator with no management depth; customer relationships or technical capabilities concentrated in one individual.",
        "potential_causes": [
            "Founder-dependent business model without delegation",
            "Customer relationships maintained exclusively by the owner",
            "Technical skills held solely by one person without documentation",
        ],
        "suggested_procedures": [
            "Assess customer concentration relative to owner relationships",
            "Evaluate management depth and organizational chart",
            "Determine whether key man life insurance is in place",
            "Assess transition risk in acquisition scenario",
        ],
        "suggested_ajes": [],
        "management_questions": [
            "How dependent are key customers on you personally vs. the company?",
            "Is there a management team that could operate the business without you?",
            "Is there key man life insurance in place?",
        ],
        "affected_account_types": ["revenue"],
        "affected_statements": ["IncomeStatement"],
        "audit_assertions": ["completeness"],
        "references": ["QoE best practices", "SBA SOP 50-10"],
        "sort_order": 60,
    },
]
