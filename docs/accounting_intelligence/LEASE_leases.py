"""Leases — 6 issue templates (LEASE_001–LEASE_006)"""

LEASES = [
    {
        "code": "LEASE_001",
        "category": "leases",
        "subcategory": "asc842_adoption",
        "issue_type": "balance_sheet",
        "name": "Operating Leases Not Recognized on Balance Sheet (ASC 842)",
        "description": (
            "Operating leases with terms exceeding 12 months are not recognized as "
            "right-of-use (ROU) assets and lease liabilities under ASC 842. This is "
            "a common finding for entities that have not completed the ASC 842 "
            "transition or that have added new leases post-transition without "
            "recording them correctly."
        ),
        "risk_level": "high",
        "materiality_note": "Material when off-balance-sheet lease commitments exceed 10% of total assets.",
        "detection_logic": "Lease commitments in footnotes exceed recorded ROU asset/liability balance; new lease agreements executed without balance sheet recognition.",
        "potential_causes": [
            "ASC 842 transition not completed",
            "New leases executed and recorded only as rent expense without balance sheet recognition",
            "Short-term lease exception incorrectly applied to leases > 12 months",
            "Embedded lease component in service contracts not identified",
        ],
        "suggested_procedures": [
            "Obtain all lease agreements; classify as finance or operating",
            "Calculate ROU asset and lease liability at commencement date",
            "Identify any embedded leases in service contracts (dedicated assets)",
            "Verify correct discount rate (IBR or implicit rate)",
        ],
        "suggested_ajes": [
            "Dr ROU Asset / Cr Lease Liability — to record operating lease at commencement",
        ],
        "management_questions": [
            "Is the company fully compliant with ASC 842 for all operating leases?",
            "Are there any new lease agreements executed this period that have been recorded?",
            "Are there any service contracts with dedicated equipment that may be embedded leases?",
        ],
        "affected_account_types": ["asset", "liability"],
        "affected_statements": ["BalanceSheet"],
        "audit_assertions": ["completeness", "valuation", "presentation"],
        "references": ["ASC 842-20-25-1", "ASC 842-20-30-1"],
        "sort_order": 10,
    },
    {
        "code": "LEASE_002",
        "category": "leases",
        "subcategory": "classification",
        "issue_type": "audit",
        "name": "Finance Lease vs. Operating Lease Misclassification",
        "description": (
            "Leases are classified as operating when they should be finance leases (or "
            "vice versa) based on the ASC 842 classification criteria. Misclassification "
            "affects both the income statement (finance lease front-loads expense vs. "
            "straight-line for operating) and the cash flow statement (finance lease "
            "payments split between operating and financing activities)."
        ),
        "risk_level": "moderate",
        "materiality_note": "Evaluate impact on lease expense pattern and cash flow classification.",
        "detection_logic": "Leases for specialized equipment or assets that transfer substantially all risks and rewards classified as operating.",
        "potential_causes": [
            "Classification criteria applied incorrectly",
            "Lease term represents majority of useful life but classified as operating",
            "Present value of payments represents substantially all fair value but classified as operating",
        ],
        "suggested_procedures": [
            "Apply ASC 842-20-25-2 classification criteria to each significant lease",
            "Recalculate expense pattern under correct classification",
            "Reclassify cash flow statement if necessary",
        ],
        "suggested_ajes": [
            "Dr/Cr Finance Lease ROU Asset / Dr/Cr Operating Lease ROU Asset — to reclassify",
        ],
        "management_questions": [
            "Are there any leases where the company takes ownership at end of term?",
            "Are there any leases for assets that are specialized with no alternative use?",
            "Have lease classification criteria been formally applied to each lease?",
        ],
        "affected_account_types": ["asset", "liability"],
        "affected_statements": ["BalanceSheet", "IncomeStatement", "CashFlowStatement"],
        "audit_assertions": ["classification", "accuracy"],
        "references": ["ASC 842-20-25-2", "ASC 842-20-25-3"],
        "sort_order": 20,
    },
    {
        "code": "LEASE_003",
        "category": "leases",
        "subcategory": "discount_rate",
        "issue_type": "audit",
        "name": "Incorrect Discount Rate Used for Lease Liability Calculation",
        "description": (
            "The discount rate used to calculate the lease liability is incorrect. "
            "Under ASC 842, the rate implicit in the lease should be used if determinable; "
            "otherwise, the incremental borrowing rate (IBR) should be applied. Using "
            "a rate that is too low overstates the lease liability."
        ),
        "risk_level": "moderate",
        "materiality_note": "Evaluate sensitivity of lease liability to discount rate assumptions.",
        "detection_logic": "IBR used is significantly below market rates for the entity's credit quality and lease term.",
        "potential_causes": [
            "IBR based on risk-free rate rather than entity-specific borrowing rate",
            "Same rate used for all leases regardless of term or credit quality",
            "Rate not updated for changes in credit conditions",
        ],
        "suggested_procedures": [
            "Document IBR determination methodology",
            "Compare IBR to company's actual borrowing rates and market comparables",
            "Recalculate lease liability sensitivity under alternative rates",
        ],
        "suggested_ajes": [
            "Dr/Cr Lease Liability / Cr/Dr ROU Asset — to adjust for discount rate correction",
        ],
        "management_questions": [
            "How was the incremental borrowing rate determined for operating leases?",
            "Is the IBR consistent with the company's current borrowing costs?",
            "Was the implicit rate in the lease considered before defaulting to IBR?",
        ],
        "affected_account_types": ["asset", "liability"],
        "affected_statements": ["BalanceSheet"],
        "audit_assertions": ["valuation", "accuracy"],
        "references": ["ASC 842-20-30-3", "ASC 842-20-30-4"],
        "sort_order": 30,
    },
    {
        "code": "LEASE_004",
        "category": "leases",
        "subcategory": "renewal_options",
        "issue_type": "audit",
        "name": "Lease Term Excludes Reasonably Certain Renewal Options",
        "description": (
            "The lease term used to calculate the ROU asset and lease liability excludes "
            "renewal options that are reasonably certain to be exercised. Under ASC 842, "
            "the lease term should include optional periods when the lessee is reasonably "
            "certain to exercise the option."
        ),
        "risk_level": "moderate",
        "materiality_note": "Material when excluded renewal periods are significant relative to the initial term.",
        "detection_logic": "Lease for key operational facility shows only initial term without renewal periods despite long-term business commitment to location.",
        "potential_causes": [
            "Conservative application of 'reasonably certain' threshold",
            "Failure to reassess renewals when triggering events occur",
            "Significant leasehold improvements indicating intent to renew not considered",
        ],
        "suggested_procedures": [
            "Review renewal options in lease agreements",
            "Assess economic incentive to renew: leasehold improvements, location importance, operational disruption cost",
            "Recalculate lease liability including reasonably certain renewal periods",
        ],
        "suggested_ajes": [
            "Dr ROU Asset / Cr Lease Liability — to add renewal period payments to calculation",
        ],
        "management_questions": [
            "Which operating leases have renewal options?",
            "For leases in key operating locations, is renewal reasonably certain?",
            "Are there significant leasehold improvements that create an economic incentive to renew?",
        ],
        "affected_account_types": ["asset", "liability"],
        "affected_statements": ["BalanceSheet"],
        "audit_assertions": ["completeness", "valuation"],
        "references": ["ASC 842-20-55-2", "ASC 842-20-55-3"],
        "sort_order": 40,
    },
    {
        "code": "LEASE_005",
        "category": "leases",
        "subcategory": "sale_leaseback",
        "issue_type": "audit",
        "name": "Sale-Leaseback Transaction Incorrectly Accounted for",
        "description": (
            "A sale-leaseback transaction has been recorded as a sale and operating "
            "lease when the transfer does not qualify as a sale under ASC 606, or "
            "vice versa. Failed sale-leasebacks must be recorded as a financing "
            "arrangement."
        ),
        "risk_level": "high",
        "materiality_note": "Always material for significant real estate or equipment sale-leaseback transactions.",
        "detection_logic": "Sale-leaseback arrangement executed; gain recognized immediately when leaseback term is substantially all of remaining useful life.",
        "potential_causes": [
            "Repurchase option or control retained, preventing sale recognition",
            "Gain on sale recognized when leaseback creates continuing involvement",
            "Financing arrangement structured as sale-leaseback to achieve off-balance-sheet treatment",
        ],
        "suggested_procedures": [
            "Apply ASC 606 sale criteria to sale-leaseback transactions",
            "If sale qualifies, confirm ROU asset and lease liability recognized",
            "If sale fails, record as financing: asset stays on books, proceeds as borrowing",
            "Assess gain recognition restrictions (proportional recognition for variable-rent leasebacks)",
        ],
        "suggested_ajes": [
            "Dr Asset / Cr Borrowing — to reverse improper sale and record as financing",
        ],
        "management_questions": [
            "Are there any sale-leaseback arrangements in place?",
            "Did the company retain any repurchase options or continuing control?",
            "Was the entire gain recognized immediately or deferred?",
        ],
        "affected_account_types": ["asset", "liability"],
        "affected_statements": ["BalanceSheet", "IncomeStatement"],
        "audit_assertions": ["occurrence", "accuracy", "classification"],
        "references": ["ASC 842-40-25", "ASC 606-10-25-30"],
        "sort_order": 50,
    },
    {
        "code": "LEASE_006",
        "category": "leases",
        "subcategory": "modification",
        "issue_type": "audit",
        "name": "Lease Modification Not Reassessed Under ASC 842",
        "description": (
            "A lease that has been modified (extended, expanded, or reduced) has not "
            "been reassessed under ASC 842 modification guidance. Modifications may "
            "create a new separate lease, or require remeasurement of the existing "
            "lease liability and ROU asset."
        ),
        "risk_level": "moderate",
        "materiality_note": "Evaluate based on significance of modification to lease economics.",
        "detection_logic": "Lease amendment in contract files without corresponding remeasurement of lease liability.",
        "potential_causes": [
            "Lease modification not communicated to accounting team",
            "Modification treated as a new lease without formal reassessment",
            "Concessions given during COVID or economic stress not properly accounted for",
        ],
        "suggested_procedures": [
            "Identify all lease modifications in the period",
            "Apply ASC 842-20-55-14: is modification a new separate lease or remeasurement?",
            "Remeasure liability using updated payments and revised discount rate",
            "Adjust ROU asset for remeasurement difference",
        ],
        "suggested_ajes": [
            "Dr/Cr ROU Asset / Cr/Dr Lease Liability — to reflect modification remeasurement",
        ],
        "management_questions": [
            "Were any lease terms modified, extended, or renegotiated during the period?",
            "Were any rent concessions or abatements received from landlords?",
            "Were modifications evaluated and accounted for under ASC 842?",
        ],
        "affected_account_types": ["asset", "liability"],
        "affected_statements": ["BalanceSheet"],
        "audit_assertions": ["accuracy", "completeness"],
        "references": ["ASC 842-20-55-14", "ASC 842-20-55-27"],
        "sort_order": 60,
    },
]
