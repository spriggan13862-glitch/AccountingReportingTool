"""Inventory — 10 issue templates (INV_001–INV_010)"""

INVENTORY = [
    {
        "code": "INV_001",
        "category": "inventory",
        "subcategory": "obsolescence",
        "issue_type": "financial_analytics",
        "name": "Inventory Obsolescence Reserve Inadequate",
        "description": (
            "The reserve for slow-moving, excess, or obsolete inventory is insufficient "
            "relative to the aging profile of inventory on hand. Under ASC 330, inventory "
            "must be measured at the lower of cost or net realizable value (NRV). An "
            "inadequate reserve overstates inventory and understates cost of goods sold."
        ),
        "risk_level": "high",
        "materiality_note": "Flag when on-hand inventory exceeds 90-day forward demand without reserve, or when reserve % is below historical write-off rates.",
        "detection_logic": "Inventory turnover declining; inventory days increasing; reserve as % of gross inventory declining.",
        "potential_causes": [
            "Obsolescence reserve not updated for slow-moving SKUs",
            "Product line discontinued but inventory not reserved",
            "Technology change making existing inventory unsaleable",
            "Seasonal items not fully reserved at end of selling season",
            "Acquired inventory carried at acquisition cost without NRV assessment",
        ],
        "suggested_procedures": [
            "Obtain inventory aging by SKU; identify items with no sales activity >90 days",
            "Compare reserve percentage to prior years and actual write-off rates",
            "Test NRV for a sample of inventory items: net selling price minus selling costs",
            "Review subsequent sales activity and pricing for period-end inventory",
            "Assess whether discontinued or end-of-life items are reserved",
        ],
        "suggested_ajes": [
            "Dr Inventory Write-Down (COGS) / Cr Inventory Obsolescence Reserve — to increase reserve",
        ],
        "management_questions": [
            "What is the methodology for calculating the obsolescence reserve?",
            "Are there any product lines being discontinued or phased out?",
            "What is the policy for reserving slow-moving inventory (e.g., >120 days on hand)?",
            "Have there been any changes in technology or customer preferences affecting inventory demand?",
        ],
        "affected_account_types": ["asset", "cogs"],
        "affected_statements": ["IncomeStatement", "BalanceSheet"],
        "audit_assertions": ["valuation", "completeness", "accuracy"],
        "references": ["ASC 330-10-35-1", "ASC 330-10-35-14"],
        "sort_order": 10,
    },
    {
        "code": "INV_002",
        "category": "inventory",
        "subcategory": "costing",
        "issue_type": "financial_analytics",
        "name": "Inventory Cost Method Inconsistency or Change",
        "description": (
            "The cost method used for inventory (FIFO, LIFO, weighted average, specific "
            "identification) has been changed without adequate disclosure, or is applied "
            "inconsistently across inventory categories. Changes in accounting principle "
            "require retrospective application and disclosure under ASC 250."
        ),
        "risk_level": "moderate",
        "materiality_note": "Any change in inventory costing method is at least qualitatively material.",
        "detection_logic": "Gross margin changes unexplained by price/volume; inventory turnover ratio unusual; cost layer methodology inconsistencies.",
        "potential_causes": [
            "Switch from FIFO to weighted average to reduce COGS in a rising cost environment",
            "New ERP system applying different cost method without disclosure",
            "Different methods applied across warehouse locations or product categories",
        ],
        "suggested_procedures": [
            "Confirm inventory cost method per accounting policy and compare to ERP configuration",
            "Recalculate COGS under stated method for a sample of items",
            "Identify any method changes in the current or prior period",
            "Assess retroactive adjustment required for any changes",
        ],
        "suggested_ajes": [
            "Retroactive cumulative effect adjustment — specific to method and circumstances",
        ],
        "management_questions": [
            "What cost method is used for inventory? Has this changed in the past 3 years?",
            "Is the same method applied consistently across all inventory categories?",
            "Were there any ERP system changes affecting inventory costing?",
        ],
        "affected_account_types": ["asset", "cogs"],
        "affected_statements": ["IncomeStatement", "BalanceSheet"],
        "audit_assertions": ["consistency", "accuracy", "valuation"],
        "references": ["ASC 330-10-30", "ASC 250-10-45-2"],
        "sort_order": 20,
    },
    {
        "code": "INV_003",
        "category": "inventory",
        "subcategory": "physical_count",
        "issue_type": "audit",
        "name": "Physical Inventory Count Not Performed or Inadequate",
        "description": (
            "A physical inventory count has not been performed or the count procedures "
            "were inadequate to support the reported inventory balance. Absent a reliable "
            "count, the recorded inventory balance cannot be verified, and any errors, "
            "theft, or shrinkage remain undetected."
        ),
        "risk_level": "high",
        "materiality_note": "Material whenever inventory is a significant balance sheet item; always required for annual audits.",
        "detection_logic": "Significant inventory balance with no documented physical count in the current year; perpetual records not reconciled to physical count.",
        "potential_causes": [
            "Count deferred indefinitely due to operational disruption",
            "Cycle count program not covering all inventory annually",
            "Count performed by employees without adequate supervision",
            "Significant adjustments to perpetual records without investigation",
        ],
        "suggested_procedures": [
            "Observe or review documentation for the most recent physical count",
            "Assess whether count procedures were adequate: tag control, blind counts, supervisor oversight",
            "Reconcile perpetual inventory records to physical count; investigate significant variances",
            "Review inventory adjustment journal entries for unusual items",
        ],
        "suggested_ajes": [
            "Dr COGS / Cr Inventory — to record shrinkage or count variances identified",
        ],
        "management_questions": [
            "When was the last physical inventory count performed?",
            "What procedures are used for the physical count?",
            "Are perpetual records reconciled to physical counts? What variances were found?",
        ],
        "affected_account_types": ["asset", "cogs"],
        "affected_statements": ["BalanceSheet", "IncomeStatement"],
        "audit_assertions": ["existence", "completeness", "valuation"],
        "references": ["ASC 330-10-45", "AU-C 501"],
        "sort_order": 30,
    },
    {
        "code": "INV_004",
        "category": "inventory",
        "subcategory": "lower_of_cost_or_nrv",
        "issue_type": "audit",
        "name": "Inventory Valued Above Net Realizable Value",
        "description": (
            "Inventory is carried at cost in excess of net realizable value (NRV), "
            "violating ASC 330's lower of cost or NRV requirement. NRV equals estimated "
            "selling price minus estimated costs to complete and sell. Overvalued inventory "
            "overstates assets and understates COGS."
        ),
        "risk_level": "high",
        "materiality_note": "Flag when known selling prices for inventory categories fall below recorded cost.",
        "detection_logic": "Recent sales prices below inventory cost; write-downs in subsequent periods; gross margin negative on specific product lines.",
        "potential_causes": [
            "Commodity price decline making cost exceed current market value",
            "Contract cancellation leaving inventory without a buyer",
            "Competitive pricing pressure forcing below-cost selling",
            "Obsolete inventory not yet written to NRV",
        ],
        "suggested_procedures": [
            "Obtain recent sales prices or firm purchase orders; compare to inventory cost",
            "For WIP and finished goods, estimate costs to complete and compare to expected selling price",
            "Test a sample of inventory items for NRV compliance",
            "Review subsequent period sales margins for evidence of below-cost selling",
        ],
        "suggested_ajes": [
            "Dr Inventory Write-Down (COGS) / Cr Inventory — to reduce inventory to NRV",
        ],
        "management_questions": [
            "Have selling prices for any product categories fallen below cost?",
            "Are there any contracts for which inventory has been purchased but the contract is at risk?",
            "What is the most recent selling price for the top 10 inventory items by value?",
        ],
        "affected_account_types": ["asset", "cogs"],
        "affected_statements": ["IncomeStatement", "BalanceSheet"],
        "audit_assertions": ["valuation", "accuracy"],
        "references": ["ASC 330-10-35-1", "ASC 330-10-35-14"],
        "sort_order": 40,
    },
    {
        "code": "INV_005",
        "category": "inventory",
        "subcategory": "cutoff",
        "issue_type": "audit",
        "name": "Inventory Receiving Cutoff Error",
        "description": (
            "Inventory received before period end has not been recorded in the period's "
            "inventory and accounts payable, or inventory shipped before period end is "
            "still counted in ending inventory. Receiving cutoff errors result in "
            "mismatched inventory and AP balances."
        ),
        "risk_level": "moderate",
        "materiality_note": "Evaluate relative to total inventory balance; higher risk for large period-end receipts.",
        "detection_logic": "AP and inventory not moving consistently; receipts in transit at period end not properly accrued or excluded.",
        "potential_causes": [
            "Receiving dock entries not posted until items are moved to warehouse",
            "Goods in transit recorded in inventory without corresponding AP accrual",
            "Vendor invoices matched in subsequent period for goods received at period end",
        ],
        "suggested_procedures": [
            "Test receiving cutoff: obtain receiving log for last 5 days of period and first 5 days after",
            "Verify inventory and AP are recorded in the same period for period-end receipts",
            "Review goods in transit and accrued receipts balance",
        ],
        "suggested_ajes": [
            "Dr Inventory / Cr Accounts Payable — to accrue inventory received but not yet invoiced",
            "Dr Cost of Goods Sold / Cr Inventory — to remove inventory counted but already shipped",
        ],
        "management_questions": [
            "How are period-end receipts handled when the vendor invoice has not yet been received?",
            "What is the process for accruing goods in transit at period end?",
        ],
        "affected_account_types": ["asset", "liability"],
        "affected_statements": ["BalanceSheet"],
        "audit_assertions": ["completeness", "cutoff", "existence"],
        "references": ["ASC 330-10-30", "AU-C 501"],
        "sort_order": 50,
    },
    {
        "code": "INV_006",
        "category": "inventory",
        "subcategory": "overhead_absorption",
        "issue_type": "financial_analytics",
        "name": "Overhead Absorption Rate Incorrect — Manufacturing Cost Distortion",
        "description": (
            "The overhead absorption rate used to capitalize manufacturing overhead into "
            "inventory is incorrect, resulting in over- or under-absorbed overhead. "
            "Over-absorption understates COGS and overstates inventory; under-absorption "
            "does the reverse."
        ),
        "risk_level": "moderate",
        "materiality_note": "Flag when absorbed overhead differs from actual overhead by more than 10%.",
        "detection_logic": "Overhead variance accounts have large, uncleared balances; COGS as % of revenue inconsistent with production volume and cost structure.",
        "potential_causes": [
            "Standard cost rates not updated for changes in actual overhead costs",
            "Volume variance from underutilized capacity not written off to COGS",
            "Fixed overhead treated as variable in rate calculation",
            "Abnormal production costs capitalized instead of expensed",
        ],
        "suggested_procedures": [
            "Obtain overhead absorption rate and compare to actual overhead for the period",
            "Quantify over- or under-absorbed overhead; assess disposition",
            "Verify that abnormal idle capacity costs are not capitalized",
            "Test standard cost rates against actual costs for a sample of production runs",
        ],
        "suggested_ajes": [
            "Dr COGS / Cr Overhead Variance — to close under-absorbed overhead to COGS",
            "Dr Overhead Variance / Cr COGS — to eliminate over-absorbed overhead",
        ],
        "management_questions": [
            "When were the standard overhead rates last updated?",
            "How are overhead variances treated at period end?",
            "Has production volume changed significantly from the base used to set absorption rates?",
        ],
        "affected_account_types": ["asset", "cogs"],
        "affected_statements": ["IncomeStatement", "BalanceSheet"],
        "audit_assertions": ["valuation", "accuracy"],
        "references": ["ASC 330-10-30-7", "ASC 330-10-30-8"],
        "sort_order": 60,
    },
    {
        "code": "INV_007",
        "category": "inventory",
        "subcategory": "consignment",
        "issue_type": "audit",
        "name": "Consignment Inventory Incorrectly Included or Excluded",
        "description": (
            "Inventory held on consignment from vendors is included in the entity's "
            "inventory balance (it should not be), or inventory consigned to customers "
            "is excluded from inventory (it should remain on the consignor's books until "
            "sold). Both errors misstate inventory and require adjustment."
        ),
        "risk_level": "moderate",
        "materiality_note": "Material when consignment inventory is significant relative to total inventory.",
        "detection_logic": "Consignment arrangements identified in vendor or customer contracts; inventory count includes items not owned by the entity.",
        "potential_causes": [
            "Physical count team unaware of consignment arrangement",
            "ERP system not configured to segregate consignment inventory",
            "Consignment-out inventory excluded from count without evaluation",
        ],
        "suggested_procedures": [
            "Identify all consignment-in and consignment-out arrangements",
            "Verify consignment-in inventory is excluded from the entity's balance",
            "Verify consignment-out inventory is still included until sold",
            "Confirm with consignees the quantity and value of consignment-out inventory",
        ],
        "suggested_ajes": [
            "Dr COGS / Cr Inventory — to remove consignment-in inventory incorrectly included",
            "Dr Inventory / Cr COGS — to add back consignment-out inventory incorrectly excluded",
        ],
        "management_questions": [
            "Are there any inventory items held on consignment from vendors?",
            "Is any company inventory consigned to distributors or dealers?",
            "How are consignment arrangements tracked in the inventory system?",
        ],
        "affected_account_types": ["asset"],
        "affected_statements": ["BalanceSheet"],
        "audit_assertions": ["existence", "completeness", "valuation"],
        "references": ["ASC 606-10-55-80", "ASC 330-10-45"],
        "sort_order": 70,
    },
    {
        "code": "INV_008",
        "category": "inventory",
        "subcategory": "shrinkage",
        "issue_type": "fraud",
        "name": "Unexplained Inventory Shrinkage — Potential Theft or Fraud",
        "description": (
            "Inventory shrinkage (the difference between recorded and physically counted "
            "inventory) is significantly above historical norms without adequate "
            "explanation. Abnormal shrinkage may indicate employee theft, vendor short "
            "shipments, or recording fictitious inventory purchases."
        ),
        "risk_level": "high",
        "materiality_note": "Flag when shrinkage exceeds 1% of inventory for retail or 0.5% for manufacturing/distribution.",
        "detection_logic": "Inventory adjustment entries significantly above prior periods; shrinkage % of COGS increasing.",
        "potential_causes": [
            "Employee theft of inventory",
            "Vendor short shipments recorded at full invoice amount",
            "Fictitious purchase transactions creating false inventory balances",
            "Damage or spoilage not reported timely",
        ],
        "suggested_procedures": [
            "Analyze inventory adjustment entries by location, date, and approver",
            "Compare shrinkage percentages to prior periods and industry benchmarks",
            "Assess segregation of duties over receiving, warehouse, and accounting",
            "Test receiving documents against vendor invoices for short shipments",
        ],
        "suggested_ajes": [
            "Dr Inventory Shrinkage (COGS) / Cr Inventory — to record confirmed shrinkage",
        ],
        "management_questions": [
            "What is the historical shrinkage rate? Has it changed?",
            "What controls exist over warehouse access and inventory movement?",
            "Are there any specific incidents or locations with elevated shrinkage?",
        ],
        "affected_account_types": ["asset", "cogs"],
        "affected_statements": ["IncomeStatement", "BalanceSheet"],
        "audit_assertions": ["existence", "completeness"],
        "references": ["AU-C 240", "COSO Control Environment"],
        "sort_order": 80,
    },
    {
        "code": "INV_009",
        "category": "inventory",
        "subcategory": "wip",
        "issue_type": "financial_analytics",
        "name": "Work-in-Process Inventory Build Without Revenue Recognition",
        "description": (
            "Work-in-process (WIP) inventory is growing without a corresponding increase "
            "in completed goods or recognized revenue. A sustained WIP build may indicate "
            "production inefficiencies, over-capitalized labor and overhead, or deferred "
            "cost recognition."
        ),
        "risk_level": "moderate",
        "materiality_note": "Flag when WIP as % of total inventory exceeds 30% or increases more than 20 percentage points.",
        "detection_logic": "WIP balance growing faster than revenue and finished goods; WIP days outstanding increasing.",
        "potential_causes": [
            "Production bottleneck preventing completion of WIP",
            "Overhead costs increasingly capitalized into WIP rather than expensed",
            "Custom orders with extended lead times building WIP without near-term revenue",
            "Errors in stage-of-completion reporting",
        ],
        "suggested_procedures": [
            "Obtain WIP schedule with stage of completion and cost components",
            "Assess reasonableness of overhead capitalized into WIP",
            "Verify that WIP is at cost, not above NRV",
            "Compare WIP turnover to prior periods and production schedules",
        ],
        "suggested_ajes": [
            "Dr COGS / Cr WIP Inventory — to expense abnormal production costs not eligible for capitalization",
        ],
        "management_questions": [
            "What is driving the increase in WIP inventory?",
            "Are there any production bottlenecks or delays?",
            "What overhead costs are being capitalized into WIP?",
        ],
        "affected_account_types": ["asset", "cogs"],
        "affected_statements": ["BalanceSheet", "IncomeStatement"],
        "audit_assertions": ["valuation", "completeness", "accuracy"],
        "references": ["ASC 330-10-30-7", "ASC 330-10-30-1"],
        "sort_order": 90,
    },
    {
        "code": "INV_010",
        "category": "inventory",
        "subcategory": "turnover",
        "issue_type": "qoe",
        "name": "Inventory Buildup Masking Revenue Recognition Issues",
        "description": (
            "Rapid inventory buildup coincides with slowing revenue growth, suggesting "
            "that the company is producing goods it cannot sell or is using inventory "
            "accumulation to absorb overhead and inflate margins. This is a key indicator "
            "in QoE analysis and financial statement fraud detection."
        ),
        "risk_level": "high",
        "materiality_note": "Flag when inventory growth rate exceeds revenue growth rate by more than 20 percentage points.",
        "detection_logic": "Inventory growing faster than revenue; inventory turnover ratio declining; days inventory outstanding increasing significantly.",
        "potential_causes": [
            "Demand destruction not yet reflected in production plans",
            "Channel stuffing: goods shipped to distributors with right-of-return",
            "Overhead absorption manipulation: overproducing to lower per-unit cost",
            "Speculative inventory build based on expected price increases",
        ],
        "suggested_procedures": [
            "Calculate inventory turnover for current and prior 4 quarters",
            "Assess inventory by product line relative to forward sales orders or backlog",
            "Review purchase commitments for inventory that cannot be absorbed",
            "Analyze gross margin trend; flag margin improvement from overhead absorption",
        ],
        "suggested_ajes": [
            "Dr COGS / Cr Inventory — to record appropriate write-down if NRV below cost",
        ],
        "management_questions": [
            "What is the current order backlog relative to inventory on hand?",
            "Has the production plan been adjusted for slowing demand?",
            "Are there purchase commitments for inventory that may not be needed?",
        ],
        "affected_account_types": ["asset", "cogs"],
        "affected_statements": ["BalanceSheet", "IncomeStatement"],
        "audit_assertions": ["valuation", "completeness", "existence"],
        "references": ["ASC 330-10-35", "QoE best practices"],
        "sort_order": 100,
    },
]
