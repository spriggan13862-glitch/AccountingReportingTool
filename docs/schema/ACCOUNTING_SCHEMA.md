# Financial Data Schema & Interconnectivity Reference
### For Software Building: Databases · Financial Statements · Variance Tools

---

## Table of Contents

1. [Mental Model: The Data Hierarchy](#1-mental-model-the-data-hierarchy)
2. [Chart of Accounts (COA)](#2-chart-of-accounts-coa)
3. [Taxonomies — Inherent and External](#3-taxonomies--inherent-and-external)
4. [General Ledger & Journal Entries](#4-general-ledger--journal-entries)
5. [Trial Balance](#5-trial-balance)
6. [Financial Statements](#6-financial-statements)
7. [Cross-Statement Linkages (The Three-Statement Model)](#7-cross-statement-linkages-the-three-statement-model)
8. [Variance & Budget Layer](#8-variance--budget-layer)
9. [Full Relational Database Schema](#9-full-relational-database-schema)
10. [Import Logic & Data Normalization Rules](#10-import-logic--data-normalization-rules)
11. [Computation Engine Rules](#11-computation-engine-rules)
12. [Edge Cases & Integrity Rules](#12-edge-cases--integrity-rules)

---

## 1. Mental Model: The Data Hierarchy

Understanding the **direction of data flow** is the single most important concept. Everything derives from one source and flows upward:

```
[SOURCE: Raw Transactions / Journal Entries]
          ↓  aggregated by account + period
[GENERAL LEDGER — account-level activity detail]
          ↓  summarized per account per period
[TRIAL BALANCE — debit/credit balances per account]
          ↓  mapped through COA taxonomy
[FINANCIAL STATEMENTS — structured views by section/line]
          ↓  compared against budget/prior
[VARIANCE ANALYSIS — actuals vs. budget vs. prior period]
```

The **Chart of Accounts** is not in this flow — it is the **master reference layer** that every other object points to. It defines:
- What accounts exist
- What type each account is
- Where each account belongs on which financial statement
- What the normal balance direction is (debit or credit)
- How accounts roll up into each other

The **Taxonomy** is a second reference layer that sits on top of the COA, mapping proprietary account codes to standardized external labels (GAAP, IFRS, XBRL, etc.).

---

## 2. Chart of Accounts (COA)

### 2.1 What It Is

The COA is an enumerated, hierarchical list of every account a business uses to record financial activity. It is the **DNA** of the accounting system — every transaction, every balance, every financial statement line traces back to it.

### 2.2 The Inherent Taxonomy Within the COA

Every COA has an **implicit taxonomy baked into its numbering system**. The most common convention:

| Number Range | Type       | Normal Balance | FS Placement     |
|-------------|------------|---------------|------------------|
| 1000–1999   | Asset      | Debit         | Balance Sheet    |
| 2000–2999   | Liability  | Credit        | Balance Sheet    |
| 3000–3999   | Equity     | Credit        | Balance Sheet    |
| 4000–4999   | Revenue    | Credit        | Income Statement |
| 5000–5999   | COGS       | Debit         | Income Statement |
| 6000–6999   | Operating Expense | Debit | Income Statement |
| 7000–7999   | Other Income/Expense | Both | Income Statement |
| 8000–8999   | Tax        | Debit         | Income Statement |
| 9000–9999   | Intercompany / Eliminations | Both | Varies |

Within each range, the **second digit** typically defines sub-type:
- 1100s = Current Assets
- 1500s = Fixed Assets (PP&E)
- 1700s = Intangibles
- 1900s = Other Long-term Assets

This numbering system IS a taxonomy. Your software must parse it, not just store it.

### 2.3 COA Account Record Schema

```
Account {
  -- Identity
  account_id          : UUID          [PK]
  account_number      : VARCHAR(20)   [UNIQUE, NOT NULL]  -- e.g. "1120"
  account_name        : VARCHAR(255)  [NOT NULL]           -- e.g. "Accounts Receivable"
  account_description : TEXT

  -- Classification (the built-in taxonomy)
  account_type        : ENUM          [NOT NULL]
                        (Asset | Liability | Equity | Revenue | COGS | Expense | OtherIncome | OtherExpense | Tax | Intercompany)
  account_subtype     : VARCHAR(100)                       -- Current Asset, Fixed Asset, etc.
  normal_balance      : ENUM(Debit | Credit)  [NOT NULL]  -- derived from type, but store explicitly
  is_balance_sheet    : BOOLEAN       [computed from type]
  is_income_statement : BOOLEAN       [computed from type]

  -- Hierarchy
  parent_account_id   : UUID          [FK → accounts.account_id, NULLABLE]
  depth_level         : INT           -- 0 = top level, 1 = child, etc.
  sort_order          : INT           -- display ordering within siblings
  account_path        : VARCHAR(500)  -- materialized path e.g. "1000/1100/1120"
  is_header           : BOOLEAN       -- header/group accounts (no direct posting)
  is_postable         : BOOLEAN       -- can transactions be posted to this account?

  -- Financial Statement Mapping
  fs_statement        : ENUM(IncomeStatement | BalanceSheet | CashFlow | StatementOfEquity | None)
  fs_section          : VARCHAR(100)  -- "Current Assets", "Operating Expenses", etc.
  fs_subsection       : VARCHAR(100)  -- "Cash and Cash Equivalents", "SG&A", etc.
  fs_line_label       : VARCHAR(255)  -- the label this account appears under on the FS
  fs_line_order       : INT           -- sort position on the FS
  fs_sign_convention  : INT(-1 | 1)  -- whether to flip sign for FS display
                                      -- (e.g. Expenses are debits, but FS shows positive)

  -- Cash Flow Statement Specific
  cfs_method          : ENUM(Direct | Indirect | NotApplicable)
  cfs_section         : ENUM(Operating | Investing | Financing | NotApplicable)
  cfs_line_label      : VARCHAR(255)
  cfs_sign_convention : INT(-1 | 1)

  -- Tax & Regulatory
  tax_line_code       : VARCHAR(50)   -- IRS form line reference (e.g. "L12" for Schedule C)
  tax_category        : VARCHAR(100)
  is_1099_account     : BOOLEAN

  -- Operational Dimensions (multi-dimensional COA)
  requires_department : BOOLEAN       -- must be tagged with a department
  requires_location   : BOOLEAN
  requires_project    : BOOLEAN
  requires_class      : BOOLEAN       -- QuickBooks "class" or equivalent

  -- Currency & Consolidation
  currency_code       : CHAR(3)       -- ISO 4217, e.g. "USD"
  is_multicurrency    : BOOLEAN
  consolidation_rule  : ENUM(Translate | Remeasure | Eliminate | None)

  -- State
  is_active           : BOOLEAN       [DEFAULT TRUE]
  effective_from      : DATE
  effective_to        : DATE          [NULLABLE — null means still active]
  created_at          : TIMESTAMP
  updated_at          : TIMESTAMP
  created_by          : UUID FK → users
  entity_id           : UUID FK → entities  -- which company/entity owns this account
}
```

### 2.4 COA Hierarchy Rules

The COA tree must enforce:
- A parent account's `account_type` must match all its children's `account_type`
- Header accounts (`is_header = TRUE`) cannot receive journal entry postings
- The root level (parent_account_id IS NULL) should match the major type (Assets, Liabilities, etc.)
- Deleting an account with children is forbidden — must re-parent children first
- Merging two accounts requires re-pointing all historical TB entries

### 2.5 COA Number Parsing Logic

Your import engine should be able to **infer** account_type and normal_balance from account_number using configurable rules:

```
NumberingRule {
  rule_id         : UUID
  range_start     : INT       -- e.g. 1000
  range_end       : INT       -- e.g. 1999
  account_type    : ENUM      -- Asset
  normal_balance  : ENUM      -- Debit
  fs_statement    : ENUM      -- BalanceSheet
  fs_section      : VARCHAR   -- "Assets"
  priority        : INT       -- for overlapping rules
  entity_id       : UUID FK
}
```

This lets you ingest a COA file and auto-classify accounts before human review.

---

## 3. Taxonomies — Inherent and External

### 3.1 The Two Layers of Taxonomy

**Layer 1 — Internal (COA-inherent):** The account_type, fs_section, fs_line_label fields on the COA record constitute an internal taxonomy. This drives your financial statement rendering.

**Layer 2 — External (Standards-based):** GAAP, IFRS, XBRL, industry-specific frameworks map your internal COA to standardized elements for regulatory filing, benchmarking, and interoperability.

### 3.2 External Taxonomy Standards

**US GAAP / FASB:**
- Defines specific financial statement line items and groupings
- Published as the FASB Accounting Standards Codification (ASC)
- Machine-readable version = US-GAAP XBRL taxonomy

**IFRS (International Financial Reporting Standards):**
- Issued by IASB
- Different terminology and groupings from GAAP
- e.g., GAAP says "Inventory" on Balance Sheet; IFRS calls it "Inventories"
- Different treatment for items like R&D, lease accounting, revenue recognition

**XBRL (eXtensible Business Reporting Language):**
- XML-based standard for machine-readable financial data
- Used for SEC EDGAR filings
- Each element has: name, label, data type, balance type (debit/credit), period type (instant/duration)
- Example: `us-gaap:CashAndCashEquivalentsAtCarryingValue`
  - balance type: debit
  - period type: instant (a point-in-time balance)
- Example: `us-gaap:RevenueFromContractWithCustomerExcludingAssessedTax`
  - balance type: credit
  - period type: duration (a period amount)

**SIC / NAICS Industry Codes:**
- Classify the business itself, not the accounts
- Drive which industry-specific taxonomy sub-set applies
- e.g., SIC 6020 = State commercial banks-Federal Reserve members → uses bank-specific COA

**FDIC Call Report (Banking):**
- Highly specific account codes for bank regulatory reporting
- Completely different numbering than general GAAP

**GASB (Government Accounting Standards Board):**
- For state and local governments
- Fund accounting model — very different from corporate GAAP

### 3.3 Taxonomy Table Schema

```
Taxonomy {
  taxonomy_id       : UUID    [PK]
  taxonomy_name     : VARCHAR -- "US-GAAP", "IFRS", "XBRL-US-GAAP-2024", "Internal"
  taxonomy_version  : VARCHAR -- "2024", "2023-Q1", etc.
  taxonomy_type     : ENUM(GAAP | IFRS | XBRL | FDIC | GASB | Internal | Custom)
  publisher         : VARCHAR -- "FASB", "IASB", "SEC", "Internal"
  effective_date    : DATE
  is_active         : BOOLEAN
}

TaxonomyElement {
  element_id        : UUID    [PK]
  taxonomy_id       : UUID    FK → Taxonomy
  element_code      : VARCHAR -- "us-gaap:Cash", "ifrs-full:CashAndCashEquivalents"
  element_label     : VARCHAR -- human-readable: "Cash"
  element_label_verbose : VARCHAR -- "Cash and Cash Equivalents, at Carrying Value"
  parent_element_id : UUID    FK → TaxonomyElement [NULLABLE]
  data_type         : ENUM(monetary | shares | pure | percent | string | date | duration)
  balance_type      : ENUM(debit | credit | none)
  period_type       : ENUM(instant | duration)
                      -- instant = Balance Sheet (point in time)
                      -- duration = P&L, Cash Flow (over a period)
  fs_statement      : ENUM    -- which statement this element belongs to
  fs_section        : VARCHAR
  sort_order        : INT
  is_abstract       : BOOLEAN -- abstract elements are headers, not postable values
  is_deprecated     : BOOLEAN
  deprecation_date  : DATE
}
```

### 3.4 Account-to-Taxonomy Mapping Schema

```
AccountTaxonomyMap {
  map_id            : UUID    [PK]
  account_id        : UUID    FK → Account
  element_id        : UUID    FK → TaxonomyElement
  taxonomy_id       : UUID    FK → Taxonomy
  mapping_type      : ENUM(Exact | Partial | Estimated | Manual)
  confidence_score  : DECIMAL(5,4)  -- 0.0 to 1.0
  mapped_by         : ENUM(System | User | AI | Import)
  mapped_at         : TIMESTAMP
  notes             : TEXT
  is_primary        : BOOLEAN  -- one account can map to multiple taxonomies,
                               -- but only one is "primary" per taxonomy
}
```

### 3.5 Taxonomy Conflicts & Reconciliation

When importing from multiple sources (e.g., a client sends a GAAP-mapped COA but you're filing IFRS), you need:

```
TaxonomyCrosswalk {
  crosswalk_id      : UUID
  from_element_id   : UUID    FK → TaxonomyElement
  to_element_id     : UUID    FK → TaxonomyElement
  from_taxonomy_id  : UUID    FK → Taxonomy
  to_taxonomy_id    : UUID    FK → Taxonomy
  adjustment_note   : TEXT    -- e.g. "IFRS allows capitalized dev costs; GAAP does not"
  requires_manual_review : BOOLEAN
}
```

---

## 4. General Ledger & Journal Entries

### 4.1 What It Is

The General Ledger (GL) is the complete record of every financial transaction, expressed as double-entry bookkeeping. Each transaction has at least two lines (a debit and a credit) that net to zero.

The GL is the source of truth. The Trial Balance is derived from it.

### 4.2 Journal Entry Schema

```
JournalEntry {
  je_id             : UUID    [PK]
  entity_id         : UUID    FK → Entity
  je_number         : VARCHAR [UNIQUE per entity] -- auto-generated sequence
  je_date           : DATE    [NOT NULL]           -- transaction/posting date
  period_id         : UUID    FK → Period          -- which accounting period this belongs to
  source_type       : ENUM(Manual | AutoReversal | Import | Subledger | Consolidation | Eliminating)
  source_reference  : VARCHAR  -- e.g. Invoice #, PO #, bank transaction ID
  description       : TEXT
  status            : ENUM(Draft | Posted | Reversed | Voided)
  reversal_date     : DATE    [NULLABLE]
  reversal_je_id    : UUID    [NULLABLE, FK → JournalEntry]
  is_recurring      : BOOLEAN
  recurring_rule_id : UUID    [NULLABLE]
  created_by        : UUID    FK → User
  approved_by       : UUID    [NULLABLE, FK → User]
  posted_at         : TIMESTAMP
  created_at        : TIMESTAMP
}

JournalEntryLine {
  line_id           : UUID    [PK]
  je_id             : UUID    FK → JournalEntry
  line_number       : INT     -- sequence within the JE
  account_id        : UUID    FK → Account
  -- Dimensional splits
  department_id     : UUID    [NULLABLE, FK → Department]
  location_id       : UUID    [NULLABLE, FK → Location]
  project_id        : UUID    [NULLABLE, FK → Project]
  class_id          : UUID    [NULLABLE, FK → Class]
  customer_id       : UUID    [NULLABLE, FK → Customer]
  vendor_id         : UUID    [NULLABLE, FK → Vendor]
  -- Amounts
  debit_amount      : DECIMAL(20,4)  [DEFAULT 0]
  credit_amount     : DECIMAL(20,4)  [DEFAULT 0]
  amount            : DECIMAL(20,4)  [COMPUTED: debit_amount - credit_amount]
                                     -- positive = debit, negative = credit
  currency_code     : CHAR(3)
  exchange_rate     : DECIMAL(15,8)
  functional_amount : DECIMAL(20,4)  -- amount in entity's functional currency
  description       : VARCHAR(500)
}

-- INTEGRITY RULE: SUM(debit_amount) = SUM(credit_amount) per je_id
-- This is enforced at the DB level via a CHECK constraint on a computed column
-- or via application logic before posting
```

### 4.3 Subledger Integration

Many accounts have subledgers — detailed tracking systems that must reconcile to the GL:

| GL Account | Subledger | Key |
|---|---|---|
| Accounts Receivable | AR Subledger | Customer invoices → must sum to AR balance |
| Accounts Payable | AP Subledger | Vendor bills → must sum to AP balance |
| Inventory | Inventory Subledger | Item-level quantities/costs |
| Fixed Assets | Asset Register | Individual asset depreciation schedules |
| Payroll | Payroll Register | Per-employee pay details |

```
SubledgerReconciliation {
  recon_id          : UUID
  account_id        : UUID    FK → Account
  period_id         : UUID    FK → Period
  gl_balance        : DECIMAL(20,4)
  subledger_balance : DECIMAL(20,4)
  difference        : DECIMAL(20,4)  [COMPUTED]
  is_reconciled     : BOOLEAN
  reconciled_at     : TIMESTAMP
  notes             : TEXT
}
```

---

## 5. Trial Balance

### 5.1 What It Is

The Trial Balance is a **period-end snapshot** of every account's net balance, with debits in one column and credits in another. The fundamental rule: total debits must equal total credits (the accounting equation must always hold).

It is a derived object — computed from the GL — but in practice, systems often store it materialized for performance.

### 5.2 Three Types of Trial Balance

| Type | When Generated | Description |
|------|---------------|-------------|
| Unadjusted | Before period-end close | Raw activity before adjusting entries |
| Adjusted | After adjusting entries | Includes accruals, depreciation, prepaid amortization |
| Post-Closing | After closing entries | Balance sheet only; P&L accounts zeroed to retained earnings |

### 5.3 Trial Balance Schema

```
TrialBalance {
  tb_id             : UUID    [PK]
  entity_id         : UUID    FK → Entity
  period_id         : UUID    FK → Period
  tb_type           : ENUM(Unadjusted | Adjusted | PostClosing)
  generated_at      : TIMESTAMP
  generated_by      : UUID    FK → User
  is_locked         : BOOLEAN  -- prevents modification after sign-off
  total_debits      : DECIMAL(20,4)  [COMPUTED — must = total_credits]
  total_credits     : DECIMAL(20,4)  [COMPUTED]
  is_balanced       : BOOLEAN        [COMPUTED: total_debits = total_credits]
}

TrialBalanceLine {
  tb_line_id        : UUID    [PK]
  tb_id             : UUID    FK → TrialBalance
  account_id        : UUID    FK → Account
  -- Balances
  beginning_balance : DECIMAL(20,4)  -- opening balance of the period
  period_debits     : DECIMAL(20,4)  -- total debit activity in period
  period_credits    : DECIMAL(20,4)  -- total credit activity in period
  ending_balance    : DECIMAL(20,4)  [COMPUTED: beginning_balance + period_debits - period_credits]
  -- Balance presentation
  debit_balance     : DECIMAL(20,4)  -- ending_balance if positive (for debit-normal accounts)
  credit_balance    : DECIMAL(20,4)  -- ending_balance if negative (for credit-normal accounts)
  -- YTD (year to date)
  ytd_debits        : DECIMAL(20,4)
  ytd_credits       : DECIMAL(20,4)
  ytd_net           : DECIMAL(20,4)  [COMPUTED]
  -- Comparative
  prior_period_ending_balance : DECIMAL(20,4)
  prior_year_ending_balance   : DECIMAL(20,4)
  -- Budget
  budget_amount     : DECIMAL(20,4)
  budget_ytd        : DECIMAL(20,4)
  -- Dimensional splits (optional — for detailed TB)
  department_id     : UUID    [NULLABLE]
  location_id       : UUID    [NULLABLE]
}
```

### 5.4 Computing the Trial Balance from the GL

```sql
-- Materialized view logic (conceptual)

INSERT INTO trial_balance_line (tb_id, account_id, ...)
SELECT
  :tb_id,
  jel.account_id,
  -- Beginning balance = ending balance of prior period
  COALESCE(prior.ending_balance, 0)                   AS beginning_balance,
  SUM(jel.debit_amount)                               AS period_debits,
  SUM(jel.credit_amount)                              AS period_credits,
  COALESCE(prior.ending_balance, 0)
    + SUM(jel.debit_amount)
    - SUM(jel.credit_amount)                          AS ending_balance
FROM journal_entry_lines jel
JOIN journal_entries je ON je.je_id = jel.je_id
WHERE je.period_id = :period_id
  AND je.entity_id = :entity_id
  AND je.status = 'Posted'
GROUP BY jel.account_id
```

### 5.5 Balance Presentation Rules

An account's "balance" means different things depending on its type:

| Account Type | Normal Balance | If ending_balance > 0 | If ending_balance < 0 |
|---|---|---|---|
| Asset | Debit | Debit balance (normal) | Credit balance (unusual — overpayment, etc.) |
| Liability | Credit | Debit balance (unusual — prepaid expenses to vendor) | Credit balance (normal) |
| Equity | Credit | Debit balance (unusual — contra equity) | Credit balance (normal) |
| Revenue | Credit | Debit balance (unusual — refund excess) | Credit balance (normal) |
| Expense | Debit | Debit balance (normal) | Credit balance (unusual — refund received) |

Your software must apply `fs_sign_convention` (from the COA) when presenting FS numbers to users. On the Income Statement, expenses display as **positive** numbers even though they have debit balances in the TB.

---

## 6. Financial Statements

### 6.1 Architecture: Templates vs. Rendered Statements

Financial statements have two separable concerns:
1. **Template** — the structure, sections, line labels, calculation rules
2. **Rendered Statement** — the template populated with actual numbers for a period

This separation allows you to:
- Apply the same template to multiple periods (comparatives)
- Apply multiple templates to the same data (GAAP vs. IFRS presentation)
- Store and version templates independently

### 6.2 Financial Statement Template Schema

```
FSTemplate {
  template_id       : UUID    [PK]
  template_name     : VARCHAR  -- "Standard GAAP Income Statement"
  statement_type    : ENUM(IncomeStatement | BalanceSheet | CashFlow | StatementOfEquity | Custom)
  framework         : ENUM(GAAP | IFRS | Custom)
  version           : VARCHAR
  entity_id         : UUID    [NULLABLE — null = global template]
  is_default        : BOOLEAN
  created_at        : TIMESTAMP
}

FSTemplateLine {
  line_id           : UUID    [PK]
  template_id       : UUID    FK → FSTemplate
  parent_line_id    : UUID    [NULLABLE, FK → FSTemplateLine]  -- for subtotals/sections
  line_code         : VARCHAR  -- internal code, e.g. "REV", "COGS", "GROSS_PROFIT"
  line_label        : VARCHAR  -- displayed label: "Total Revenue", "Gross Profit"
  line_order        : INT
  line_type         : ENUM(Header | Detail | Subtotal | Total | Spacer | CustomFormula)
  indent_level      : INT      -- visual indentation for display
  is_bold           : BOOLEAN  -- formatting
  -- How this line gets its value:
  calculation_type  : ENUM(SumChildren | AccountMapping | Formula | Hardcoded | Linked)
  formula           : TEXT     [NULLABLE]
    -- Formula syntax: references other line_codes
    -- e.g. "GROSS_PROFIT = REV - COGS"
    -- e.g. "OPERATING_INCOME = GROSS_PROFIT - OPEX"
  -- Account mapping: which accounts roll into this line
  -- (handled by FSTemplateLineAccountMap table)
  -- Display
  sign_convention   : INT(-1 | 1)  -- flip sign for display
  format_type       : ENUM(Currency | Percent | Ratio | Integer)
  show_in_export    : BOOLEAN
}

FSTemplateLineAccountMap {
  map_id            : UUID    [PK]
  line_id           : UUID    FK → FSTemplateLine
  account_id        : UUID    [NULLABLE, FK → Account]       -- specific account
  account_type      : ENUM    [NULLABLE]                     -- OR: all accounts of this type
  account_subtype   : VARCHAR [NULLABLE]                     -- OR: all accounts of this subtype
  fs_section        : VARCHAR [NULLABLE]                     -- OR: all accounts in this section
  taxonomy_element_id : UUID  [NULLABLE, FK → TaxonomyElement] -- OR: by taxonomy tag
  include_or_exclude : ENUM(Include | Exclude)
  -- The mapping is evaluated in priority order; excludes override includes
  priority          : INT
}
```

### 6.3 Rendered Financial Statement Schema

```
RenderedStatement {
  statement_id      : UUID    [PK]
  entity_id         : UUID    FK → Entity
  template_id       : UUID    FK → FSTemplate
  period_id         : UUID    FK → Period          -- primary period
  comparative_period_ids : UUID[]                  -- comparison periods (array)
  tb_id             : UUID    FK → TrialBalance    -- source data
  tb_type           : ENUM(Unadjusted | Adjusted | PostClosing)
  framework         : ENUM(GAAP | IFRS | Custom)
  generated_at      : TIMESTAMP
  generated_by      : UUID    FK → User
  is_final          : BOOLEAN
  is_audited        : BOOLEAN
  currency_code     : CHAR(3)
  rounding_unit     : ENUM(Units | Thousands | Millions)
}

RenderedStatementLine {
  rendered_line_id  : UUID    [PK]
  statement_id      : UUID    FK → RenderedStatement
  line_id           : UUID    FK → FSTemplateLine
  -- Amounts per period column
  current_period_amount    : DECIMAL(20,4)
  prior_period_amount      : DECIMAL(20,4)   [NULLABLE]
  prior_year_amount        : DECIMAL(20,4)   [NULLABLE]
  budget_amount            : DECIMAL(20,4)   [NULLABLE]
  ytd_amount               : DECIMAL(20,4)   [NULLABLE]
  budget_ytd_amount        : DECIMAL(20,4)   [NULLABLE]
  -- Variance columns (computed)
  vs_prior_period_amt      : DECIMAL(20,4)   [COMPUTED]
  vs_prior_period_pct      : DECIMAL(10,4)   [COMPUTED]
  vs_budget_amt            : DECIMAL(20,4)   [COMPUTED]
  vs_budget_pct            : DECIMAL(10,4)   [COMPUTED]
  vs_prior_year_amt        : DECIMAL(20,4)   [COMPUTED]
  vs_prior_year_pct        : DECIMAL(10,4)   [COMPUTED]
  -- Drill-down support
  source_account_ids       : UUID[]          -- which accounts contributed to this line
  source_tb_line_ids       : UUID[]          -- the specific TB lines that sourced this
}
```

### 6.4 The Three Core Statements in Detail

#### A. Income Statement (Profit & Loss)

**Conceptual structure and computation chain:**

```
Revenue
  Operating Revenue                         = SUM(accounts where type=Revenue, section=Operating)
  Non-operating Revenue                     = SUM(accounts where type=OtherIncome)
Total Revenue                               = Operating Revenue + Non-operating Revenue

Cost of Goods Sold (COGS)                  = SUM(accounts where type=COGS)

Gross Profit                               = Total Revenue - COGS
Gross Margin %                             = Gross Profit / Total Revenue

Operating Expenses
  Sales & Marketing                        = SUM(accounts tagged to this section)
  General & Administrative                 = SUM(accounts tagged to this section)
  Research & Development                   = SUM(accounts tagged to this section)
  Depreciation & Amortization              = SUM(accounts for D&A)
Total Operating Expenses                   = SUM(all operating expense accounts)

Operating Income (EBIT)                    = Gross Profit - Total Operating Expenses

Other Income / (Expense)
  Interest Income                          = SUM(interest income accounts)
  Interest Expense                         = SUM(interest expense accounts)
  Gain/(Loss) on Sale of Assets            = SUM(gain/loss accounts)
Total Other Income / (Expense)             = SUM

Pre-Tax Income (EBT)                       = Operating Income + Total Other Income/(Expense)

Income Tax Expense                         = SUM(tax expense accounts)

Net Income                                 = Pre-Tax Income - Income Tax Expense
```

**Key rules:**
- Revenue and COGS accounts have **credit** normal balances in the TB
- Expense accounts have **debit** normal balances in the TB
- On the IS, expenses display as positive numbers (sign flipped for presentation)
- Net Income flows to the **Balance Sheet Retained Earnings** (the critical linkage)

#### B. Balance Sheet

**Conceptual structure:**

```
ASSETS
  Current Assets
    Cash & Cash Equivalents                = SUM(cash accounts)
    Accounts Receivable, net               = AR - Allowance for Doubtful Accounts
    Inventory                              = SUM(inventory accounts)
    Prepaid Expenses                       = SUM(prepaid accounts)
    Other Current Assets                   = SUM(other current asset accounts)
  Total Current Assets                     = SUM

  Non-Current Assets
    Property, Plant & Equipment, gross     = SUM(PP&E accounts)
    Accumulated Depreciation               = SUM(accum. depr. accounts) [contra-asset]
    PP&E, net                              = PP&E gross - Accumulated Depreciation
    Intangible Assets                      = SUM(intangible accounts)
    Goodwill                               = SUM(goodwill accounts)
    Other Long-term Assets                 = SUM
  Total Non-Current Assets                 = SUM

Total Assets                               = Total Current + Total Non-Current

LIABILITIES
  Current Liabilities
    Accounts Payable                       = SUM(AP accounts)
    Accrued Liabilities                    = SUM(accrued expense accounts)
    Deferred Revenue                       = SUM(deferred revenue accounts)
    Current Portion of Long-term Debt      = SUM(current LTD accounts)
    Other Current Liabilities              = SUM
  Total Current Liabilities                = SUM

  Non-Current Liabilities
    Long-term Debt                         = SUM(LTD accounts)
    Deferred Tax Liability                 = SUM
    Other Long-term Liabilities            = SUM
  Total Non-Current Liabilities            = SUM

Total Liabilities                          = Total Current + Total Non-Current

EQUITY
  Common Stock / Paid-in Capital           = SUM(paid-in capital accounts)
  Additional Paid-in Capital               = SUM(APIC accounts)
  Retained Earnings (Beginning)            = Prior period ending Retained Earnings
  Net Income (Current Period)              = [LINKED FROM INCOME STATEMENT]
  Dividends / Distributions                = SUM(dividend accounts) [contra-equity]
  Other Comprehensive Income (OCI)         = SUM(OCI accounts)
  Treasury Stock                           = SUM(treasury stock accounts) [contra-equity]
Total Equity                               = SUM

Total Liabilities + Equity                 = Total Assets  ← must always balance
```

**Key rules:**
- Contra-asset accounts (Allowance for Doubtful Accounts, Accumulated Depreciation) have **credit** normal balances and net against their parent asset
- Contra-equity accounts (Treasury Stock) have **debit** normal balances
- Retained Earnings is NOT a normal TB account — it is computed: `Prior RE + Net Income - Dividends`
- The Balance Sheet must balance: `Total Assets = Total Liabilities + Total Equity`

#### C. Cash Flow Statement (Indirect Method)

The Cash Flow Statement reconciles Net Income to actual cash movement. It has three sections:

```
OPERATING ACTIVITIES
  Net Income                               [LINKED FROM INCOME STATEMENT]
  Adjustments for non-cash items:
    Depreciation & Amortization            = D&A from IS (add back — non-cash expense)
    Stock-based Compensation               = add back (non-cash)
    Gain/(Loss) on Asset Sales             = remove (investing activity)
    Deferred Income Taxes                  = change in deferred tax accounts
  Changes in Working Capital:
    (Increase)/Decrease in AR              = Prior AR - Current AR
    (Increase)/Decrease in Inventory       = Prior Inventory - Current Inventory
    (Increase)/Decrease in Prepaid         = Prior Prepaid - Current Prepaid
    Increase/(Decrease) in AP              = Current AP - Prior AP
    Increase/(Decrease) in Accrued Liab.  = Current Accrued - Prior Accrued
    Increase/(Decrease) in Deferred Rev.  = Current Deferred Rev - Prior Deferred Rev
Net Cash from Operating Activities         = SUM

INVESTING ACTIVITIES
  Capital Expenditures                     = Change in PP&E + D&A
  Proceeds from Asset Sales                = SUM(asset sale proceeds)
  Acquisitions                             = SUM(acquisition payments)
  Purchases of Investments                 = SUM
  Proceeds from Sale of Investments        = SUM
Net Cash from Investing Activities         = SUM

FINANCING ACTIVITIES
  Proceeds from Borrowings                 = SUM(new debt accounts)
  Repayment of Debt                        = SUM(debt repayment accounts)
  Proceeds from Equity Issuance            = SUM(equity raised)
  Dividends Paid                           = SUM(dividends declared/paid)
  Share Repurchases                        = SUM(treasury stock purchases)
Net Cash from Financing Activities         = SUM

NET CHANGE IN CASH                         = Operating + Investing + Financing
Beginning Cash Balance                     = Prior period ending cash balance
Ending Cash Balance                        = Beginning + Net Change
                                          ← must equal Cash on Balance Sheet
```

**Critical computation rules for CFS (indirect method):**
- Working Capital changes require **two period-end Balance Sheet snapshots** (current and prior)
- Every Balance Sheet account must be mapped to either Operating, Investing, or Financing
- The `cfs_section` and `cfs_sign_convention` fields on the COA record drive this mapping
- Revenue/Expense accounts don't appear directly — they're captured in Net Income, then adjusted out

---

## 7. Cross-Statement Linkages (The Three-Statement Model)

This is the most critical section for your software. The three statements are not independent — they are a **closed system** with mandatory mathematical linkages.

### 7.1 The Four Mandatory Ties

```
┌─────────────────────────────────────────────────────────────────┐
│                    INCOME STATEMENT                             │
│                                                                 │
│  Revenue - Expenses = NET INCOME                               │
│                           │                                    │
└───────────────────────────┼────────────────────────────────────┘
                            │
              ┌─────────────▼─────────────────┐
              │        BALANCE SHEET           │
              │                               │
              │  Retained Earnings (end) =    │
              │  Retained Earnings (begin)    │
              │  + Net Income                 │
              │  - Dividends                  │
              │                               │
              │  TOTAL ASSETS                 │
              │  = TOTAL LIABILITIES + EQUITY │
              │            │                  │
              │       CASH (end) ─────────────┼──────┐
              └───────────────────────────────┘      │
                                                     │
┌────────────────────────────────────────────────────▼───────────┐
│                  CASH FLOW STATEMENT                            │
│                                                                 │
│  Net Income (from IS) ──────────────────────────────────────── │
│  + Non-cash adjustments                                         │
│  + Working capital changes (from BS deltas)                     │
│  = Net Cash from Operations                                     │
│                                                                 │
│  Net Cash from Investing                                        │
│  Net Cash from Financing                                        │
│                           │                                    │
│  Beginning Cash + Net Change = ENDING CASH ◄──── must equal    │
│                                             Cash on Balance Sheet│
└─────────────────────────────────────────────────────────────────┘
```

### 7.2 Linkage Validation Queries

Your software must check these after every statement generation:

```sql
-- Check 1: Net Income ties (IS → BS)
SELECT
  is_net_income.amount        AS income_statement_net_income,
  bs_re_change.amount         AS balance_sheet_re_change,
  bs_dividends.amount         AS dividends,
  (bs_re_change.amount + bs_dividends.amount)  AS bs_implied_net_income,
  ABS(is_net_income.amount - (bs_re_change.amount + bs_dividends.amount)) AS difference
-- difference must be < rounding_threshold (e.g. $1 if rounding to dollars)

-- Check 2: Ending cash ties (CFS → BS)
SELECT
  cfs.ending_cash            AS cfs_ending_cash,
  bs.cash_balance            AS bs_cash_balance,
  ABS(cfs.ending_cash - bs.cash_balance) AS difference
-- difference must be < rounding_threshold

-- Check 3: Balance Sheet balances
SELECT
  bs.total_assets,
  bs.total_liabilities + bs.total_equity  AS liabilities_plus_equity,
  ABS(bs.total_assets - (bs.total_liabilities + bs.total_equity)) AS out_of_balance
-- must = 0
```

### 7.3 The Statement-Link Object

Store these linkages explicitly so your software can trace them:

```
StatementLink {
  link_id           : UUID
  statement_id_from : UUID    FK → RenderedStatement
  line_id_from      : UUID    FK → RenderedStatementLine
  statement_id_to   : UUID    FK → RenderedStatement
  line_id_to        : UUID    FK → RenderedStatementLine
  link_type         : ENUM(NetIncome | RetainedEarnings | CashBalance | Dividends | OCI)
  amount            : DECIMAL(20,4)
  is_validated      : BOOLEAN
  validation_diff   : DECIMAL(20,4)  -- should be near zero
}
```

---

## 8. Variance & Budget Layer

### 8.1 Budget / Forecast Schema

```
BudgetVersion {
  version_id        : UUID    [PK]
  entity_id         : UUID    FK → Entity
  version_name      : VARCHAR  -- "FY2026 Board Approved", "Q2 Reforecast"
  version_type      : ENUM(Budget | Forecast | Reforecast | LongRangePlan)
  fiscal_year       : INT
  status            : ENUM(Draft | Approved | Locked | Superseded)
  approved_by       : UUID    [NULLABLE]
  approved_at       : TIMESTAMP
  created_at        : TIMESTAMP
}

BudgetLine {
  budget_line_id    : UUID    [PK]
  version_id        : UUID    FK → BudgetVersion
  account_id        : UUID    FK → Account
  period_id         : UUID    FK → Period
  -- Dimensional (matches TB dimensional structure)
  department_id     : UUID    [NULLABLE]
  location_id       : UUID    [NULLABLE]
  project_id        : UUID    [NULLABLE]
  -- Amounts
  budget_amount     : DECIMAL(20,4)
  driver_metric     : VARCHAR  -- e.g. "headcount * avg_salary"
  driver_value      : DECIMAL(20,4)
  notes             : TEXT
}
```

### 8.2 Variance Analysis Schema

```
VarianceReport {
  report_id         : UUID    [PK]
  entity_id         : UUID
  report_name       : VARCHAR
  actual_period_id  : UUID    FK → Period
  comparison_type   : ENUM(vsBudget | vsPriorPeriod | vsPriorYear | vsReforecast | Custom)
  comparison_period_id : UUID [NULLABLE]
  budget_version_id : UUID    [NULLABLE]
  template_id       : UUID    FK → FSTemplate  -- uses same FS structure
  generated_at      : TIMESTAMP
}

VarianceReportLine {
  var_line_id       : UUID    [PK]
  report_id         : UUID    FK → VarianceReport
  line_id           : UUID    FK → FSTemplateLine
  account_id        : UUID    [NULLABLE — can be at account or FS-line level]
  -- Actual
  actual_amount     : DECIMAL(20,4)
  actual_ytd        : DECIMAL(20,4)
  -- Comparison
  comparison_amount : DECIMAL(20,4)
  comparison_ytd    : DECIMAL(20,4)
  -- Variance
  variance_amount   : DECIMAL(20,4)  [COMPUTED: actual - comparison]
  variance_ytd      : DECIMAL(20,4)  [COMPUTED]
  variance_pct      : DECIMAL(10,4)  [COMPUTED: variance / comparison]
  variance_ytd_pct  : DECIMAL(10,4)  [COMPUTED]
  -- Significance
  is_favorable      : BOOLEAN        [depends on account type — see rules below]
  is_material       : BOOLEAN        [based on materiality threshold]
  materiality_threshold : DECIMAL(10,4)
  -- Narrative
  variance_comment  : TEXT
  comment_by        : UUID    [NULLABLE]
}
```

### 8.3 Favorable vs. Unfavorable Variance Logic

The sign of a variance only has meaning in context:

| Account Type | Actual > Budget | Actual < Budget |
|---|---|---|
| Revenue | Favorable (F) | Unfavorable (U) |
| COGS | Unfavorable (U) | Favorable (F) |
| Expense | Unfavorable (U) | Favorable (F) |
| Asset | Neutral / Context-dependent | Neutral |
| Liability | Neutral / Context-dependent | Neutral |

```sql
-- Favorable flag logic
is_favorable = CASE
  WHEN account_type IN ('Revenue', 'OtherIncome') 
    THEN variance_amount > 0      -- more revenue = good
  WHEN account_type IN ('COGS', 'Expense', 'OtherExpense', 'Tax')
    THEN variance_amount < 0      -- less expense = good
  ELSE NULL                       -- balance sheet accounts = context-dependent
END
```

### 8.4 Materiality Rules

```
MaterialityRule {
  rule_id           : UUID
  entity_id         : UUID
  rule_name         : VARCHAR
  applies_to        : ENUM(Account | FSSection | FSStatement | AccountType)
  -- Thresholds
  absolute_threshold : DECIMAL(20,4)   -- e.g. $10,000
  percentage_threshold : DECIMAL(10,4) -- e.g. 0.05 (5%)
  threshold_logic   : ENUM(Either | Both)  -- flag if EITHER/BOTH thresholds exceeded
  -- Scope
  account_id        : UUID    [NULLABLE]
  account_type      : ENUM    [NULLABLE]
  fs_section        : VARCHAR [NULLABLE]
}
```

---

## 9. Full Relational Database Schema

### 9.1 Entity / Multi-Company Layer

```sql
CREATE TABLE entities (
  entity_id         UUID PRIMARY KEY,
  entity_name       VARCHAR(255) NOT NULL,
  entity_type       VARCHAR(50),   -- Corporation, LLC, Partnership, etc.
  parent_entity_id  UUID REFERENCES entities(entity_id),
  functional_currency CHAR(3) DEFAULT 'USD',
  fiscal_year_end   VARCHAR(5),    -- "12-31" or "06-30"
  tax_id            VARCHAR(50),
  industry_code     VARCHAR(20),   -- NAICS or SIC
  gaap_framework    VARCHAR(20) DEFAULT 'US-GAAP',
  is_consolidated   BOOLEAN DEFAULT FALSE,
  is_active         BOOLEAN DEFAULT TRUE,
  created_at        TIMESTAMP DEFAULT NOW()
);

CREATE TABLE periods (
  period_id         UUID PRIMARY KEY,
  entity_id         UUID REFERENCES entities(entity_id),
  period_name       VARCHAR(50),   -- "January 2026", "Q1 2026", "FY2026"
  period_type       VARCHAR(20),   -- Month, Quarter, Year, Custom
  fiscal_year       INT,
  fiscal_quarter    INT,           -- 1-4
  fiscal_month      INT,           -- 1-12
  start_date        DATE NOT NULL,
  end_date          DATE NOT NULL,
  is_closed         BOOLEAN DEFAULT FALSE,
  closed_at         TIMESTAMP,
  closed_by         UUID
);
```

### 9.2 Chart of Accounts

```sql
CREATE TABLE accounts (
  account_id            UUID PRIMARY KEY,
  entity_id             UUID REFERENCES entities(entity_id) NOT NULL,
  account_number        VARCHAR(20) NOT NULL,
  account_name          VARCHAR(255) NOT NULL,
  account_description   TEXT,
  account_type          VARCHAR(30) NOT NULL
    CHECK (account_type IN ('Asset','Liability','Equity','Revenue','COGS',
                            'Expense','OtherIncome','OtherExpense','Tax','Intercompany')),
  account_subtype       VARCHAR(100),
  normal_balance        CHAR(6) NOT NULL CHECK (normal_balance IN ('Debit','Credit')),
  parent_account_id     UUID REFERENCES accounts(account_id),
  depth_level           INT DEFAULT 0,
  sort_order            INT,
  account_path          VARCHAR(500),
  is_header             BOOLEAN DEFAULT FALSE,
  is_postable           BOOLEAN DEFAULT TRUE,
  fs_statement          VARCHAR(30),
  fs_section            VARCHAR(100),
  fs_subsection         VARCHAR(100),
  fs_line_label         VARCHAR(255),
  fs_line_order         INT,
  fs_sign_convention    SMALLINT DEFAULT 1 CHECK (fs_sign_convention IN (-1, 1)),
  cfs_section           VARCHAR(20)
    CHECK (cfs_section IN ('Operating','Investing','Financing',NULL)),
  cfs_sign_convention   SMALLINT DEFAULT 1,
  tax_line_code         VARCHAR(50),
  requires_department   BOOLEAN DEFAULT FALSE,
  requires_project      BOOLEAN DEFAULT FALSE,
  currency_code         CHAR(3) DEFAULT 'USD',
  is_active             BOOLEAN DEFAULT TRUE,
  effective_from        DATE,
  effective_to          DATE,
  created_at            TIMESTAMP DEFAULT NOW(),
  updated_at            TIMESTAMP DEFAULT NOW(),
  UNIQUE (entity_id, account_number)
);

CREATE INDEX idx_accounts_entity_type ON accounts(entity_id, account_type);
CREATE INDEX idx_accounts_parent ON accounts(parent_account_id);
CREATE INDEX idx_accounts_fs ON accounts(entity_id, fs_statement, fs_section);
```

### 9.3 Taxonomy Tables

```sql
CREATE TABLE taxonomies (
  taxonomy_id       UUID PRIMARY KEY,
  taxonomy_name     VARCHAR(100) NOT NULL,
  taxonomy_version  VARCHAR(50),
  taxonomy_type     VARCHAR(30),
  publisher         VARCHAR(100),
  effective_date    DATE,
  is_active         BOOLEAN DEFAULT TRUE
);

CREATE TABLE taxonomy_elements (
  element_id        UUID PRIMARY KEY,
  taxonomy_id       UUID REFERENCES taxonomies(taxonomy_id) NOT NULL,
  element_code      VARCHAR(255) NOT NULL,  -- e.g. "us-gaap:Cash"
  element_label     VARCHAR(255),
  element_label_verbose VARCHAR(500),
  parent_element_id UUID REFERENCES taxonomy_elements(element_id),
  data_type         VARCHAR(30),
  balance_type      VARCHAR(10) CHECK (balance_type IN ('debit','credit','none')),
  period_type       VARCHAR(10) CHECK (period_type IN ('instant','duration')),
  fs_statement      VARCHAR(30),
  fs_section        VARCHAR(100),
  sort_order        INT,
  is_abstract       BOOLEAN DEFAULT FALSE,
  is_deprecated     BOOLEAN DEFAULT FALSE,
  UNIQUE (taxonomy_id, element_code)
);

CREATE TABLE account_taxonomy_map (
  map_id            UUID PRIMARY KEY,
  account_id        UUID REFERENCES accounts(account_id) NOT NULL,
  element_id        UUID REFERENCES taxonomy_elements(element_id) NOT NULL,
  taxonomy_id       UUID REFERENCES taxonomies(taxonomy_id) NOT NULL,
  mapping_type      VARCHAR(20),
  confidence_score  DECIMAL(5,4),
  mapped_by         VARCHAR(20),
  mapped_at         TIMESTAMP DEFAULT NOW(),
  is_primary        BOOLEAN DEFAULT TRUE,
  notes             TEXT,
  UNIQUE (account_id, taxonomy_id)  -- one mapping per account per taxonomy
);
```

### 9.4 Journal Entries

```sql
CREATE TABLE journal_entries (
  je_id             UUID PRIMARY KEY,
  entity_id         UUID REFERENCES entities(entity_id) NOT NULL,
  je_number         VARCHAR(50),
  je_date           DATE NOT NULL,
  period_id         UUID REFERENCES periods(period_id) NOT NULL,
  source_type       VARCHAR(30) DEFAULT 'Manual',
  source_reference  VARCHAR(255),
  description       TEXT,
  status            VARCHAR(20) DEFAULT 'Draft'
    CHECK (status IN ('Draft','Posted','Reversed','Voided')),
  reversal_date     DATE,
  reversal_je_id    UUID REFERENCES journal_entries(je_id),
  created_by        UUID,
  approved_by       UUID,
  posted_at         TIMESTAMP,
  created_at        TIMESTAMP DEFAULT NOW()
);

CREATE TABLE journal_entry_lines (
  line_id           UUID PRIMARY KEY,
  je_id             UUID REFERENCES journal_entries(je_id) NOT NULL,
  line_number       INT NOT NULL,
  account_id        UUID REFERENCES accounts(account_id) NOT NULL,
  department_id     UUID,
  location_id       UUID,
  project_id        UUID,
  customer_id       UUID,
  vendor_id         UUID,
  debit_amount      DECIMAL(20,4) DEFAULT 0 CHECK (debit_amount >= 0),
  credit_amount     DECIMAL(20,4) DEFAULT 0 CHECK (credit_amount >= 0),
  currency_code     CHAR(3) DEFAULT 'USD',
  exchange_rate     DECIMAL(15,8) DEFAULT 1,
  functional_debit  DECIMAL(20,4) GENERATED ALWAYS AS (debit_amount * exchange_rate) STORED,
  functional_credit DECIMAL(20,4) GENERATED ALWAYS AS (credit_amount * exchange_rate) STORED,
  description       VARCHAR(500)
);

-- Constraint: Each JE must balance
-- Enforced via trigger or application layer:
-- SUM(debit_amount) = SUM(credit_amount) per je_id
```

### 9.5 Trial Balance

```sql
CREATE TABLE trial_balances (
  tb_id             UUID PRIMARY KEY,
  entity_id         UUID REFERENCES entities(entity_id) NOT NULL,
  period_id         UUID REFERENCES periods(period_id) NOT NULL,
  tb_type           VARCHAR(20) DEFAULT 'Adjusted'
    CHECK (tb_type IN ('Unadjusted','Adjusted','PostClosing')),
  generated_at      TIMESTAMP DEFAULT NOW(),
  is_locked         BOOLEAN DEFAULT FALSE,
  UNIQUE (entity_id, period_id, tb_type)
);

CREATE TABLE trial_balance_lines (
  tb_line_id        UUID PRIMARY KEY,
  tb_id             UUID REFERENCES trial_balances(tb_id) NOT NULL,
  account_id        UUID REFERENCES accounts(account_id) NOT NULL,
  department_id     UUID,
  beginning_balance DECIMAL(20,4) DEFAULT 0,
  period_debits     DECIMAL(20,4) DEFAULT 0,
  period_credits    DECIMAL(20,4) DEFAULT 0,
  ending_balance    DECIMAL(20,4)
    GENERATED ALWAYS AS (beginning_balance + period_debits - period_credits) STORED,
  ytd_debits        DECIMAL(20,4) DEFAULT 0,
  ytd_credits       DECIMAL(20,4) DEFAULT 0,
  prior_period_ending_balance DECIMAL(20,4),
  prior_year_ending_balance   DECIMAL(20,4),
  budget_amount     DECIMAL(20,4),
  budget_ytd        DECIMAL(20,4),
  UNIQUE (tb_id, account_id, department_id)
);

CREATE INDEX idx_tbl_tb_account ON trial_balance_lines(tb_id, account_id);
```

### 9.6 Financial Statement Templates & Rendered Statements

```sql
CREATE TABLE fs_templates (
  template_id       UUID PRIMARY KEY,
  template_name     VARCHAR(255) NOT NULL,
  statement_type    VARCHAR(30) NOT NULL,
  framework         VARCHAR(20) DEFAULT 'GAAP',
  entity_id         UUID,            -- NULL = system-wide default
  is_default        BOOLEAN DEFAULT FALSE,
  version           VARCHAR(20),
  created_at        TIMESTAMP DEFAULT NOW()
);

CREATE TABLE fs_template_lines (
  line_id           UUID PRIMARY KEY,
  template_id       UUID REFERENCES fs_templates(template_id) NOT NULL,
  parent_line_id    UUID REFERENCES fs_template_lines(line_id),
  line_code         VARCHAR(50) NOT NULL,
  line_label        VARCHAR(255) NOT NULL,
  line_order        INT NOT NULL,
  line_type         VARCHAR(20) NOT NULL
    CHECK (line_type IN ('Header','Detail','Subtotal','Total','Spacer','CustomFormula')),
  indent_level      INT DEFAULT 0,
  is_bold           BOOLEAN DEFAULT FALSE,
  calculation_type  VARCHAR(20)
    CHECK (calculation_type IN ('SumChildren','AccountMapping','Formula','Hardcoded','Linked')),
  formula           TEXT,
  sign_convention   SMALLINT DEFAULT 1,
  format_type       VARCHAR(20) DEFAULT 'Currency',
  UNIQUE (template_id, line_code)
);

CREATE TABLE fs_template_line_account_map (
  map_id            UUID PRIMARY KEY,
  line_id           UUID REFERENCES fs_template_lines(line_id) NOT NULL,
  account_id        UUID REFERENCES accounts(account_id),
  account_type      VARCHAR(30),
  account_subtype   VARCHAR(100),
  fs_section        VARCHAR(100),
  taxonomy_element_id UUID REFERENCES taxonomy_elements(element_id),
  include_or_exclude VARCHAR(10) DEFAULT 'Include'
    CHECK (include_or_exclude IN ('Include','Exclude')),
  priority          INT DEFAULT 1
);

CREATE TABLE rendered_statements (
  statement_id      UUID PRIMARY KEY,
  entity_id         UUID REFERENCES entities(entity_id) NOT NULL,
  template_id       UUID REFERENCES fs_templates(template_id) NOT NULL,
  period_id         UUID REFERENCES periods(period_id) NOT NULL,
  tb_id             UUID REFERENCES trial_balances(tb_id) NOT NULL,
  framework         VARCHAR(20),
  generated_at      TIMESTAMP DEFAULT NOW(),
  is_final          BOOLEAN DEFAULT FALSE,
  currency_code     CHAR(3) DEFAULT 'USD',
  rounding_unit     VARCHAR(20) DEFAULT 'Units'
);

CREATE TABLE rendered_statement_lines (
  rendered_line_id  UUID PRIMARY KEY,
  statement_id      UUID REFERENCES rendered_statements(statement_id) NOT NULL,
  line_id           UUID REFERENCES fs_template_lines(line_id) NOT NULL,
  current_period_amount    DECIMAL(20,4),
  prior_period_amount      DECIMAL(20,4),
  prior_year_amount        DECIMAL(20,4),
  budget_amount            DECIMAL(20,4),
  ytd_amount               DECIMAL(20,4),
  budget_ytd_amount        DECIMAL(20,4),
  vs_prior_period_amt      DECIMAL(20,4) GENERATED ALWAYS AS (current_period_amount - prior_period_amount) STORED,
  vs_budget_amt            DECIMAL(20,4) GENERATED ALWAYS AS (current_period_amount - budget_amount) STORED
);
```

### 9.7 Budget & Variance Tables

```sql
CREATE TABLE budget_versions (
  version_id        UUID PRIMARY KEY,
  entity_id         UUID REFERENCES entities(entity_id) NOT NULL,
  version_name      VARCHAR(255) NOT NULL,
  version_type      VARCHAR(30),
  fiscal_year       INT,
  status            VARCHAR(20) DEFAULT 'Draft',
  approved_at       TIMESTAMP,
  created_at        TIMESTAMP DEFAULT NOW()
);

CREATE TABLE budget_lines (
  budget_line_id    UUID PRIMARY KEY,
  version_id        UUID REFERENCES budget_versions(version_id) NOT NULL,
  account_id        UUID REFERENCES accounts(account_id) NOT NULL,
  period_id         UUID REFERENCES periods(period_id) NOT NULL,
  department_id     UUID,
  budget_amount     DECIMAL(20,4),
  notes             TEXT,
  UNIQUE (version_id, account_id, period_id, department_id)
);
```

---

## 10. Import Logic & Data Normalization Rules

### 10.1 Import Source Types & Formats

Your import engine must handle these common formats:

| Source | Format | Key Fields | Notes |
|--------|--------|-----------|-------|
| QuickBooks Export | CSV / IIF / QBO | Account #, Name, Type, Balance | Type naming varies |
| Sage / Intacct | CSV / XML | GL Code, Description, Class | Often has dimensions |
| NetSuite | CSV / SuiteTax XML | Account ID, Type, Subsidiary | Multi-entity support |
| Excel COA | XLSX | Any — needs column mapping | Most common client format |
| XBRL Filing | XML | Namespace:Element, Value | Taxonomy pre-mapped |
| Bank Feed | OFX / CSV | Date, Amount, Description | No account — needs classification |

### 10.2 Import Processing Pipeline

```
STAGE 1: INGEST
  - Read raw file
  - Detect format (CSV, XLSX, XML, IIF, OFX)
  - Map source columns to target schema columns
  - Store raw import as ImportBatch record

STAGE 2: VALIDATE
  - Required fields present?
  - Account numbers unique?
  - Account types valid / mappable?
  - Debits = Credits (for TB and JE imports)?
  - Date ranges valid?
  - Entity exists?

STAGE 3: CLASSIFY
  - Infer account_type from account_number (if not explicitly provided)
  - Infer normal_balance from account_type
  - Infer fs_statement from account_type
  - Suggest fs_section from account_number range
  - Flag accounts that need manual review

STAGE 4: MAP TAXONOMY
  - Match account names/numbers against taxonomy_elements
  - Use fuzzy string matching + rules
  - Store confidence score
  - Flag low-confidence mappings for human review

STAGE 5: LINK
  - Link TB lines to existing accounts (or create new accounts)
  - Link periods to existing periods (or create)
  - Verify referential integrity

STAGE 6: COMPUTE
  - Compute ending balances from debits/credits
  - Verify TB balances (total D = total C)
  - Compute YTD from period-by-period data

STAGE 7: PERSIST
  - Write to staging tables
  - Run integrity checks
  - Promote to production tables on success
  - Rollback on failure (atomic import)
```

### 10.3 Import Batch Schema

```
ImportBatch {
  batch_id          : UUID    [PK]
  entity_id         : UUID    FK → Entity
  import_type       : ENUM(COA | TrialBalance | JournalEntries | Budget | FullExport)
  source_format     : VARCHAR  -- "QuickBooks CSV", "Excel", "XBRL", etc.
  source_filename   : VARCHAR
  raw_file_path     : VARCHAR  -- stored on disk/S3
  period_id         : UUID    [NULLABLE]
  status            : ENUM(Pending | Processing | ValidationFailed | Complete | RolledBack)
  record_count      : INT
  error_count       : INT
  warning_count     : INT
  started_at        : TIMESTAMP
  completed_at      : TIMESTAMP
  imported_by       : UUID    FK → User
}

ImportBatchError {
  error_id          : UUID
  batch_id          : UUID    FK → ImportBatch
  row_number        : INT
  field_name        : VARCHAR
  raw_value         : VARCHAR
  error_type        : ENUM(Missing | InvalidType | DuplicateKey | ReferentialIntegrity | BalanceCheck | Other)
  error_message     : TEXT
  severity          : ENUM(Error | Warning | Info)
  is_resolved       : BOOLEAN
  resolution_note   : TEXT
}
```

### 10.4 Column Mapping Configuration

To support diverse import formats, store configurable column mappings:

```
ImportColumnMap {
  map_id            : UUID
  source_format     : VARCHAR   -- "QuickBooks COA CSV"
  target_table      : VARCHAR   -- "accounts"
  source_column     : VARCHAR   -- "Acct. #"
  target_field      : VARCHAR   -- "account_number"
  transform         : VARCHAR   -- optional: "trim", "uppercase", "parse_date", etc.
  default_value     : VARCHAR   -- if source column missing
  is_required       : BOOLEAN
}
```

### 10.5 Account Type Inference from QuickBooks-style Source Data

QuickBooks uses different type labels than your schema. Store a crosswalk:

```
AccountTypeMap {
  source_label      : VARCHAR   -- "Accounts Receivable", "Other Current Asset"
  source_system     : VARCHAR   -- "QuickBooks"
  mapped_type       : VARCHAR   -- "Asset"
  mapped_subtype    : VARCHAR   -- "Current Asset"
  mapped_fs_section : VARCHAR   -- "Current Assets"
  normal_balance    : VARCHAR   -- "Debit"
}
```

Common QuickBooks → Schema mappings:

| QB Type | account_type | account_subtype |
|---------|-------------|----------------|
| Bank | Asset | Current Asset |
| Accounts Receivable | Asset | Current Asset |
| Other Current Asset | Asset | Current Asset |
| Fixed Asset | Asset | Fixed Asset |
| Other Asset | Asset | Long-term Asset |
| Accounts Payable | Liability | Current Liability |
| Credit Card | Liability | Current Liability |
| Other Current Liability | Liability | Current Liability |
| Long Term Liability | Liability | Non-current Liability |
| Equity | Equity | Stockholders Equity |
| Income | Revenue | Operating Revenue |
| Other Income | OtherIncome | Non-operating Income |
| Cost of Goods Sold | COGS | COGS |
| Expense | Expense | Operating Expense |
| Other Expense | OtherExpense | Non-operating Expense |

---

## 11. Computation Engine Rules

### 11.1 Financial Statement Rendering Algorithm

```python
def render_financial_statement(template_id, tb_id, period_id, comparative_periods=[]):
    lines = get_template_lines_ordered(template_id)
    results = {}

    for line in lines:
        if line.calculation_type == 'AccountMapping':
            # Get all accounts mapped to this line
            accounts = get_mapped_accounts(line.line_id)
            amount = sum_tb_balances(accounts, tb_id)
            amount = amount * line.sign_convention  # flip if needed

        elif line.calculation_type == 'SumChildren':
            # Sum all direct children lines
            amount = sum(results[child.line_code] for child in get_children(line.line_id))

        elif line.calculation_type == 'Formula':
            # Evaluate formula referencing other line codes
            amount = evaluate_formula(line.formula, results)
            # e.g. formula = "GROSS_PROFIT = REV - COGS"

        elif line.calculation_type == 'Linked':
            # Pull value from another statement (cross-statement link)
            amount = get_linked_value(line.link_source)

        results[line.line_code] = amount

    return results
```

### 11.2 Balance Sheet Sign Rules for Rendering

```
ASSETS section:
  Debit balance on account → display as POSITIVE on BS
  Credit balance on account (contra-asset) → display as NEGATIVE or NET
    e.g. Accum. Depreciation has credit balance → shows as negative under PP&E

LIABILITIES section:
  Credit balance → display as POSITIVE (normal)
  Debit balance → display as NEGATIVE

EQUITY section:
  Credit balance → display as POSITIVE
  Treasury Stock (contra equity, debit normal) → display as NEGATIVE

INCOME STATEMENT:
  Revenue: credit balance → display as POSITIVE
  Expenses: debit balance → display as POSITIVE (sign flipped for presentation)
  Net Income: positive if profitable
```

### 11.3 YTD vs. Period Balance Logic

| Account Type | Balance Behavior | YTD Meaning |
|---|---|---|
| Balance Sheet (Asset, Liability, Equity) | **Cumulative** — balance carries forward | YTD = ending balance (same as period) |
| Income Statement (Revenue, Expense) | **Period-based** — reset each fiscal year | YTD = sum of all periods from fiscal year start through current period |

This is one of the most critical distinctions. Your software must:
- For BS accounts: present the **ending balance** regardless of period selection
- For IS accounts: sum all periods from fiscal year start to selected period end date

```sql
-- YTD for Income Statement accounts
SELECT
  a.account_id,
  SUM(tbl.period_debits - tbl.period_credits) AS ytd_amount
FROM trial_balance_lines tbl
JOIN trial_balances tb ON tb.tb_id = tbl.tb_id
JOIN periods p ON p.period_id = tb.period_id
JOIN accounts a ON a.account_id = tbl.account_id
WHERE tb.entity_id = :entity_id
  AND p.fiscal_year = :fiscal_year
  AND p.end_date <= :selected_period_end_date
  AND a.account_type IN ('Revenue','COGS','Expense','OtherIncome','OtherExpense','Tax')
GROUP BY a.account_id
```

### 11.4 Retained Earnings Computation

Retained Earnings is the single most misunderstood account in accounting software. It must be computed, not simply pulled from a TB line:

```sql
-- Retained Earnings for any given period end date
WITH
  prior_re AS (
    -- Opening RE balance = prior fiscal year end RE account balance
    SELECT tbl.ending_balance AS prior_retained_earnings
    FROM trial_balance_lines tbl
    JOIN trial_balances tb ON tb.tb_id = tbl.tb_id
    JOIN accounts a ON a.account_id = tbl.account_id
    JOIN periods p ON p.period_id = tb.period_id
    WHERE tb.entity_id = :entity_id
      AND a.account_subtype = 'Retained Earnings'
      AND p.end_date = :prior_fiscal_year_end_date
  ),
  ytd_net_income AS (
    -- Current year's net income through selected period
    SELECT SUM(tbl.ending_balance * a.fs_sign_convention) AS net_income
    FROM trial_balance_lines tbl
    JOIN accounts a ON a.account_id = tbl.account_id
    JOIN trial_balances tb ON tb.tb_id = tbl.tb_id
    JOIN periods p ON p.period_id = tb.period_id
    WHERE tb.entity_id = :entity_id
      AND a.fs_statement = 'IncomeStatement'
      AND p.fiscal_year = :current_fiscal_year
      AND p.end_date <= :selected_period_end_date
  ),
  ytd_dividends AS (
    SELECT SUM(tbl.ending_balance) AS dividends
    FROM trial_balance_lines tbl
    JOIN accounts a ON a.account_id = tbl.account_id
    -- filter for dividend distribution accounts
  )
SELECT
  prior_re.prior_retained_earnings
  + ytd_net_income.net_income
  - ytd_dividends.dividends AS retained_earnings
FROM prior_re, ytd_net_income, ytd_dividends
```

### 11.5 Cash Flow Statement Computation (Indirect Method)

```
Step 1: Start with Net Income (from IS computation)

Step 2: Add back non-cash items (these are P&L accounts with cfs_section = 'Operating')
        - Depreciation & Amortization
        - Stock-based compensation
        - Amortization of debt discount
        - Deferred tax expense

Step 3: Remove gains/losses (reclassify to Investing)
        - Subtract: Gain on asset sale (IS credit → CFS debit to remove)
        - Add back: Loss on asset sale (IS debit already in net income)

Step 4: Working Capital Changes
        For each current asset account (cfs_section = 'Operating'):
          WC change = Prior period balance - Current period balance
          (increase in asset = USE of cash = negative CFS impact)
        For each current liability account (cfs_section = 'Operating'):
          WC change = Current period balance - Prior period balance
          (increase in liability = SOURCE of cash = positive CFS impact)

Step 5: Investing Activities
        For each account with cfs_section = 'Investing':
          Change = Current balance - Prior balance (adjusted for disposals)
          PP&E purchases = (Current PP&E - Prior PP&E) + D&A + disposals at cost

Step 6: Financing Activities
        For each account with cfs_section = 'Financing':
          Change = Current balance - Prior balance
          New debt proceeds = positive
          Debt repayment = negative
          Equity issuance = positive
          Dividends paid = negative

Step 7: Reconcile
        Ending Cash = Beginning Cash + Net Operating + Net Investing + Net Financing
        Verify vs. Cash account on Balance Sheet
```

---

## 12. Edge Cases & Integrity Rules

### 12.1 Debit/Credit Pitfalls

**Contra Accounts:** These are accounts with the opposite normal balance of their parent category. They MUST be handled as exceptions in your rendering engine:

| Account | Type | Normal Balance | Display Behavior |
|---------|------|---------------|-----------------|
| Allowance for Doubtful Accounts | Asset | Credit | Netting against AR |
| Accumulated Depreciation | Asset | Credit | Netting against PP&E |
| Discount on Notes Receivable | Asset | Credit | Netting against NR |
| Treasury Stock | Equity | Debit | Reduces total equity |
| Sales Returns & Allowances | Revenue | Debit | Reduces total revenue |
| Purchase Discounts | COGS | Credit | Reduces COGS |

Your COA schema handles this via `fs_sign_convention = -1` on these accounts, and your rendering engine multiplies by this field before display.

### 12.2 Multi-Entity / Consolidation Rules

```
ConsolidationElimination {
  elimination_id    : UUID
  parent_entity_id  : UUID
  child_entity_id   : UUID
  account_id        : UUID
  elimination_type  : ENUM(Intercompany | InvestmentInSub | DividendsReceived | Other)
  period_id         : UUID
  amount            : DECIMAL(20,4)
  -- Intercompany eliminations require matching entry in both entities
  matching_account_id : UUID    -- the offsetting intercompany account
}
```

### 12.3 Multi-Currency Rules

```
When entity functional currency ≠ transaction currency:
  - Record both original currency and functional currency amounts on JEL
  - Use exchange rate at transaction date for income statement items
  - Use closing rate for balance sheet items at period end
  - Translation difference → goes to OCI (Other Comprehensive Income), not P&L
  - Remeasurement difference → goes to P&L (for foreign currency transactions)
```

### 12.4 Period Closing Controls

```
ClosingControl {
  control_id        : UUID
  entity_id         : UUID
  period_id         : UUID
  check_type        : ENUM(BalanceCheck | SubledgerRecon | CrossStatement | Intercompany | Materiality)
  status            : ENUM(Pass | Fail | Warning | Override)
  checked_at        : TIMESTAMP
  override_by       : UUID    [NULLABLE]
  override_reason   : TEXT
}
```

Period cannot close until all controls pass (or are explicitly overridden with approval).

### 12.5 Rounding Rules

When displaying in thousands or millions, rounding can break the balance sheet:
```
Round each line individually, NOT the total
Display a "Rounding" line if totals don't tie after rounding
This is standard practice in audited financial statements
```

### 12.6 Fiscal Year ≠ Calendar Year

Your period table must support non-December fiscal year ends:
- Fiscal Year 2026 might run July 1 2025 → June 30 2026
- Month 1 of FY2026 = July 2025
- Retained Earnings "reset" occurs at fiscal year end, not December 31

The `fiscal_year`, `fiscal_month`, and `fiscal_quarter` columns on the periods table handle this. All YTD calculations use `fiscal_year` grouping, not calendar year.

---

## Summary: Interconnectivity Map

```
IMPORT ──→ ImportBatch ──→ ImportBatchError (validation feedback)
               │
               ▼
      ┌────────────────┐
      │ CHART OF       │◄── NumberingRule (type inference)
      │ ACCOUNTS       │◄── AccountTypeMap (source crosswalk)
      │ (accounts)     │──→ AccountTaxonomyMap ──→ TaxonomyElement ──→ Taxonomy
      └───────┬────────┘
              │ FK: account_id
              ▼
      ┌────────────────┐
      │ JOURNAL ENTRY  │
      │ LINES          │──→ JournalEntry (period, status, source)
      └───────┬────────┘
              │ aggregated per period
              ▼
      ┌────────────────┐         ┌────────────────┐
      │ TRIAL BALANCE  │◄────────│ BUDGET LINES   │
      │ LINES          │         │ (BudgetVersion)│
      └───────┬────────┘         └────────────────┘
              │ mapped through FSTemplateLineAccountMap
              ▼
      ┌────────────────────────────────────────────┐
      │ FS TEMPLATE ──→ FS TEMPLATE LINES          │
      │ (structure)      (sections, formulas)      │
      └──────────────────────┬─────────────────────┘
                             │ rendered
                             ▼
      ┌────────────────────────────────────────────┐
      │ RENDERED STATEMENTS ──→ RENDERED LINES     │
      │   Income Statement   (actuals per line)    │
      │   Balance Sheet      + prior period        │
      │   Cash Flow          + budget              │
      └──────────────────────┬─────────────────────┘
                             │ compared
                             ▼
      ┌────────────────────────────────────────────┐
      │ VARIANCE REPORT ──→ VARIANCE LINES         │
      │   actual vs. budget                        │
      │   actual vs. prior period                  │
      │   actual vs. prior year                    │
      │   favorable/unfavorable flagging           │
      │   materiality classification               │
      └────────────────────────────────────────────┘
```

---

*Document Version 1.0 — Accounting Tool Schema Project*
*Covers: COA, Trial Balance, Financial Statements, Taxonomy Mapping,*
*Journal Entries, Consolidation, Variance Analysis, Import Pipeline*
