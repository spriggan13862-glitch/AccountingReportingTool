"""Intangible Assets — 6 issue templates (IA_001–IA_006)"""

INTANGIBLE_ASSETS = [
    {
        "code": "IA_001",
        "category": "intangible_assets",
        "subcategory": "goodwill_impairment",
        "issue_type": "financial_analytics",
        "name": "Goodwill Impairment Not Tested or Recognized",
        "description": (
            "Goodwill has not been tested for impairment despite indicators that the "
            "fair value of a reporting unit may have fallen below its carrying amount. "
            "Under ASC 350, goodwill must be tested annually and more frequently when "
            "triggering events occur. Unrecognized impairment overstates assets."
        ),
        "risk_level": "high",
        "materiality_note": "Always material when goodwill is a significant asset. Any confirmed impairment must be recognized.",
        "detection_logic": "Reporting unit has experienced sustained operating losses, revenue decline > 15%, or significant adverse market changes without impairment analysis.",
        "potential_causes": [
            "Impairment triggers not identified or evaluated",
            "Management over-optimistic about future cash flows",
            "Acquisition performance below initial projections without write-down",
        ],
        "suggested_procedures": [
            "Identify triggering events for interim impairment testing",
            "Apply qualitative assessment or two-step impairment test",
            "Obtain independent valuation of reporting unit if fair value uncertain",
            "Compare carrying value to estimated fair value; record impairment if required",
        ],
        "suggested_ajes": [
            "Dr Goodwill Impairment Loss / Cr Goodwill — to record impairment",
        ],
        "management_questions": [
            "Have there been any significant adverse changes in the business that acquired goodwill supports?",
            "Has the acquired business met its initial performance projections?",
            "When was the last goodwill impairment test performed?",
        ],
        "affected_account_types": ["asset"],
        "affected_statements": ["BalanceSheet", "IncomeStatement"],
        "audit_assertions": ["valuation", "completeness"],
        "references": ["ASC 350-20-35-28", "ASC 350-20-35-30"],
        "sort_order": 10,
    },
    {
        "code": "IA_002",
        "category": "intangible_assets",
        "subcategory": "amortization",
        "issue_type": "financial_analytics",
        "name": "Intangible Asset Useful Life or Amortization Rate Incorrect",
        "description": (
            "Definite-lived intangible assets (customer lists, patents, non-competes, "
            "trade names) are being amortized over incorrect useful lives or using an "
            "inappropriate method. Incorrect amortization misallocates costs across "
            "periods and may overstate or understate asset values."
        ),
        "risk_level": "moderate",
        "materiality_note": "Evaluate when intangibles are a significant portion of total assets.",
        "detection_logic": "Intangible amortization significantly above or below expected based on asset lives and values; amortization schedules not matching documentation.",
        "potential_causes": [
            "Useful lives not updated for changes in competitive position or contracts",
            "Incorrect classification as indefinite-lived (no amortization) vs. definite-lived",
            "Acquired intangibles with lives not matching purchase price allocation",
        ],
        "suggested_procedures": [
            "Recalculate amortization for significant intangibles against purchase price allocation",
            "Verify useful life assumptions for each intangible class",
            "Confirm indefinite-lived intangibles have been tested for impairment",
        ],
        "suggested_ajes": [
            "Dr/Cr Amortization Expense / Cr/Dr Accumulated Amortization — to correct amortization",
        ],
        "management_questions": [
            "What are the assumed useful lives for each class of intangible asset?",
            "Have useful lives been reviewed for changes in competitive environment or contract terms?",
            "Are any intangibles classified as indefinite-lived? What is the basis?",
        ],
        "affected_account_types": ["asset"],
        "affected_statements": ["BalanceSheet", "IncomeStatement"],
        "audit_assertions": ["valuation", "accuracy"],
        "references": ["ASC 350-30-35", "ASC 350-20-35-1"],
        "sort_order": 20,
    },
    {
        "code": "IA_003",
        "category": "intangible_assets",
        "subcategory": "rd_expense",
        "issue_type": "financial_analytics",
        "name": "Research and Development Costs Improperly Capitalized",
        "description": (
            "Research and development costs that must be expensed under ASC 730 are "
            "being capitalized as intangible assets. R&D costs (other than certain "
            "software development and acquired IPR&D) must be expensed as incurred. "
            "Capitalization overstates assets and understates expenses."
        ),
        "risk_level": "moderate",
        "materiality_note": "Material in technology, biotech, and manufacturing entities with significant R&D programs.",
        "detection_logic": "Intangible assets include capitalized development costs that are pre-technological-feasibility; R&D expense significantly below industry norms.",
        "potential_causes": [
            "Development costs capitalized before technological feasibility established",
            "R&D salaries allocated to intangible asset accounts",
            "Prototype costs capitalized rather than expensed",
        ],
        "suggested_procedures": [
            "Review intangible additions for R&D characteristics",
            "Assess whether technological feasibility has been achieved before capitalization",
            "Compare R&D expense as % of revenue to prior periods and industry",
        ],
        "suggested_ajes": [
            "Dr R&D Expense / Cr Intangible Assets — to reclassify improperly capitalized R&D",
        ],
        "management_questions": [
            "How are R&D costs classified and tracked separately from capitalized development?",
            "At what point is technological feasibility deemed to be achieved?",
            "Are any R&D salaries or materials capitalized to intangibles?",
        ],
        "affected_account_types": ["asset"],
        "affected_statements": ["BalanceSheet", "IncomeStatement"],
        "audit_assertions": ["accuracy", "valuation", "occurrence"],
        "references": ["ASC 730-10-25-1", "ASC 350-40-25"],
        "sort_order": 30,
    },
    {
        "code": "IA_004",
        "category": "intangible_assets",
        "subcategory": "purchase_price",
        "issue_type": "audit",
        "name": "Purchase Price Allocation Incomplete or Stale",
        "description": (
            "A business combination's purchase price has not been properly allocated to "
            "identifiable intangible assets (customer relationships, trade names, patents, "
            "non-competes) under ASC 805, or the allocation was never finalized. "
            "An incomplete PPA understates intangibles and results in excessive goodwill."
        ),
        "risk_level": "high",
        "materiality_note": "Always material for acquisitions with significant intangible content.",
        "detection_logic": "Acquisition with no identified intangibles; goodwill represents > 80% of purchase price without justification; PPA finalization period exceeded 12 months.",
        "potential_causes": [
            "Acquisition completed without formal valuation of intangibles",
            "Entire purchase price allocated to goodwill for simplicity",
            "PPA not finalized within measurement period (12 months)",
        ],
        "suggested_procedures": [
            "Verify that a formal PPA has been prepared for each acquisition",
            "Confirm intangibles were independently valued and are being amortized",
            "Assess whether PPA was finalized within the 12-month measurement period",
            "Review reasonableness of goodwill relative to total acquisition price",
        ],
        "suggested_ajes": [
            "Dr Intangible Assets / Cr Goodwill — to record identifiable intangibles missed in PPA",
        ],
        "management_questions": [
            "Was a formal purchase price allocation performed for this acquisition?",
            "Were identifiable intangibles independently valued?",
            "Has the PPA been finalized within the measurement period?",
        ],
        "affected_account_types": ["asset"],
        "affected_statements": ["BalanceSheet", "IncomeStatement"],
        "audit_assertions": ["completeness", "valuation", "accuracy"],
        "references": ["ASC 805-20-25", "ASC 805-20-30"],
        "sort_order": 40,
    },
    {
        "code": "IA_005",
        "category": "intangible_assets",
        "subcategory": "trademark",
        "issue_type": "financial_analytics",
        "name": "Indefinite-Lived Intangibles Not Tested for Impairment",
        "description": (
            "Trade names, trademarks, or other indefinite-lived intangibles have not "
            "been tested for impairment annually as required by ASC 350. Impairment "
            "may exist if the asset's fair value has declined below its carrying amount "
            "due to competitive pressures, brand erosion, or regulatory changes."
        ),
        "risk_level": "moderate",
        "materiality_note": "Flag when indefinite-lived intangibles are a material balance and annual test is not documented.",
        "detection_logic": "Large indefinite-lived intangible balance with no documented annual impairment test.",
        "potential_causes": [
            "Annual impairment test not performed or not documented",
            "Revenue decline in the brand without corresponding impairment review",
            "Trade name classified as indefinite-lived when useful life is finite",
        ],
        "suggested_procedures": [
            "Verify annual impairment test for each indefinite-lived intangible",
            "Compare carrying value to relief-from-royalty or other fair value estimate",
            "Assess whether indefinite-lived classification still appropriate",
        ],
        "suggested_ajes": [
            "Dr Impairment Loss / Cr Intangible Asset — to record impairment",
        ],
        "management_questions": [
            "Has an annual impairment test been performed for indefinite-lived intangibles?",
            "Have there been any changes in the competitive position or usage of the intangible?",
        ],
        "affected_account_types": ["asset"],
        "affected_statements": ["BalanceSheet", "IncomeStatement"],
        "audit_assertions": ["valuation", "completeness"],
        "references": ["ASC 350-30-35-15", "ASC 350-30-35-18"],
        "sort_order": 50,
    },
    {
        "code": "IA_006",
        "category": "intangible_assets",
        "subcategory": "covenant_noncompete",
        "issue_type": "qoe",
        "name": "Non-Compete Agreement Value Not Reflected in Acquisition Analysis",
        "description": (
            "Non-compete agreements executed in connection with acquisitions or key "
            "employee arrangements are not valued and capitalized as intangible assets. "
            "These agreements have economic value that should be recognized and amortized "
            "over the covenant period. Omission understates intangibles."
        ),
        "risk_level": "low",
        "materiality_note": "Evaluate based on the economic significance of the non-compete to business protection.",
        "detection_logic": "Acquisition or key departure agreement includes non-compete clause; no corresponding intangible asset recorded.",
        "potential_causes": [
            "Legal agreement reviewed but not communicated to accounting",
            "Non-compete value not considered in purchase price allocation",
            "Covenant period too short to be considered worth capitalizing",
        ],
        "suggested_procedures": [
            "Review all non-compete agreements; assess value using income approach (with and without method)",
            "Include non-compete values in PPA for acquisitions",
            "Amortize over the restriction period",
        ],
        "suggested_ajes": [
            "Dr Non-Compete Intangible / Cr Goodwill — to reclassify from goodwill in PPA",
        ],
        "management_questions": [
            "Are there active non-compete agreements with former owners, executives, or acquired entities?",
            "Were non-competes included in the purchase price allocation?",
        ],
        "affected_account_types": ["asset"],
        "affected_statements": ["BalanceSheet", "IncomeStatement"],
        "audit_assertions": ["completeness", "valuation"],
        "references": ["ASC 805-20-55", "ASC 350-30-25"],
        "sort_order": 60,
    },
]
