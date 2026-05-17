# Accounting Tool — v1 Spec

A repository / database for financial data that ingests trial balances and mappings, produces financial statements, and supports top-side journal entries, pro-forma entries, eliminations, and carve-outs. Designed to scale from single-entity reporting to multi-entity consolidation and M&A scenarios.

## Core principle

**Balances are never stored — they are always computed from journal entries.** Trial balance uploads are converted to "opening balance" journal entries. This is what makes a 2023 adjustment automatically flow through to 2024 and 2025 balances: those balances are just SUM(entries WHERE date <= cutoff).

## Tech stack

- **Backend:** Python 3.11+, FastAPI, SQLAlchemy 2.0, Pydantic v2
- **Database:** PostgreSQL 14+ (use SQLite for local dev if preferred)
- **Frontend:** Streamlit for v1 (single-file UI per page)
- **File parsing:** pandas + openpyxl for TB and mapping uploads
- **Testing:** pytest, with a separate test database
- **Migrations:** Alembic

## Project structure

```
accounting_tool/
├── alembic/                  # DB migrations
├── app/
│   ├── __init__.py
│   ├── main.py               # FastAPI app entry
│   ├── config.py             # settings (DB URL, etc.)
│   ├── db.py                 # SQLAlchemy session + engine
│   ├── models/               # SQLAlchemy models (one file per table group)
│   │   ├── entity.py
│   │   ├── account.py
│   │   ├── journal.py
│   │   ├── scenario.py
│   │   └── fs_structure.py
│   ├── schemas/              # Pydantic request/response models
│   ├── routers/              # FastAPI routes
│   │   ├── entities.py
│   │   ├── accounts.py
│   │   ├── mappings.py
│   │   ├── tb_import.py
│   │   ├── journal_entries.py
│   │   └── financials.py
│   ├── services/             # business logic (the important stuff)
│   │   ├── tb_importer.py    # parses TB file -> creates JE
│   │   ├── financials.py     # builds BS/IS/CF from JEs
│   │   ├── consolidation.py  # rolls up entities + eliminations
│   │   └── validators.py     # debits=credits, BS balances, etc.
│   └── ai/                   # (later) Claude-powered features
│       └── mapper.py         # auto-suggest account mappings
├── ui/
│   └── app.py                # Streamlit UI
├── tests/
│   ├── conftest.py
│   ├── test_tb_import.py
│   ├── test_journal_entries.py
│   ├── test_financials.py
│   └── test_consolidation.py
├── schema.sql                # raw SQL schema (reference)
├── pyproject.toml
├── README.md
└── .env.example
```

## V1 feature scope

### Must have
1. Create / list / update entities (operating + consolidation types)
2. Define / upload a chart of accounts
3. Define / upload an FS line item structure (BS, IS)
4. Upload an account-to-FS-line mapping (CSV/Excel)
5. Upload a trial balance for an entity at a given date → creates a JE in scenario ACTUAL
6. Create manual journal entries (header + lines) in any scenario
7. View a balance sheet for (entity, as-of-date, scenario-stack)
8. View an income statement for (entity, period start, period end, scenario-stack)
9. Basic Streamlit UI covering the above flows
10. Tests for: debits=credits enforcement, BS balances, period rollforward, scenario stacking

### Out of scope for v1 (do not build yet)
- Cash flow statement (add in v1.1 — needs indirect method logic)
- Multi-currency / FX translation
- Full consolidation with eliminations (v1.1)
- Carve-out wizard (v1.2)
- AI-powered mapping suggestions (v2)
- User auth / multi-user (v2)
- Audit log UI (data is captured, no UI yet)

## API endpoints (v1)

```
# Entities
POST   /entities                          create entity
GET    /entities                          list entities
GET    /entities/{id}                     get entity
PATCH  /entities/{id}                     update entity

# Accounts
POST   /accounts                          create account
POST   /accounts/bulk-upload              upload CoA via CSV
GET    /accounts                          list (filter by entity_id)

# FS structure
POST   /fs-line-items                     create FS line
POST   /fs-line-items/bulk-upload         upload FS structure
GET    /fs-line-items                     list

# Mappings
POST   /mappings                          create mapping
POST   /mappings/bulk-upload              upload mapping file
GET    /mappings                          list (filter by entity_id)

# Scenarios
GET    /scenarios                         list scenarios
POST   /scenarios                         create scenario

# Trial balance
POST   /tb-imports                        upload TB file (multipart/form-data)
                                          body: entity_id, as_of_date, file
GET    /tb-imports                        list past imports
GET    /tb-imports/{id}                   detail

# Journal entries
POST   /journal-entries                   create JE (header + lines in one call)
GET    /journal-entries                   list (filter by entity, scenario, date range)
GET    /journal-entries/{id}              detail
POST   /journal-entries/{id}/reverse      create a reversing JE

# Financials
GET    /financials/balance-sheet          query params: entity_id, as_of_date, scenario_ids[]
GET    /financials/income-statement       query params: entity_id, start_date, end_date, scenario_ids[]
GET    /financials/trial-balance          query params: entity_id, as_of_date, scenario_ids[]
```

## Key file formats

### Trial balance upload (CSV or XLSX)
| account_number | account_name | debit | credit |
|----------------|--------------|-------|--------|
| 1010           | Cash         | 50000 | 0      |
| 2010           | A/P          | 0     | 30000  |
| ...            | ...          | ...   | ...    |

Validation: sum(debit) must equal sum(credit). Unknown account_numbers are flagged.

### Mapping upload (CSV or XLSX)
| account_number | fs_line_code   | entity_code | effective_from |
|----------------|----------------|-------------|----------------|
| 1010           | BS_CASH        | (blank=all) | (optional)     |
| 4010           | IS_REV_PRODUCT |             |                |

## Critical business logic

### Trial balance import flow
1. Parse file, validate columns present, validate debits = credits.
2. For each row, look up account by `(entity_id, account_number)`. If not found, fail with a list of unknown accounts (don't auto-create — that's a user decision).
3. Create one `journal_entries` row: scenario=ACTUAL, source='tb_import', date=as_of_date, description=f"TB import for {entity} as of {date}".
4. Create one `journal_entry_lines` row per TB row.
5. Save the `tb_imports` record with `je_id` linking to the JE.
6. If a TB has already been imported for that (entity, as_of_date) — soft-fail and require user to reverse the previous import first. Never silently overwrite.

### Balance sheet generation
1. Inputs: `entity_id`, `as_of_date`, `scenario_ids` (list).
2. For each BS `fs_line_item`:
   - Find all accounts mapped to it (respecting entity and effective dating).
   - For each account, call `get_account_balance(account_id, entity_id, as_of_date, scenario_ids)`.
   - Sum, applying `sign_flip` for display.
3. Compute subtotals per `is_subtotal` and `parent_line_id`.
4. Assert that Total Assets = Total Liabilities + Equity. If not, return a warning with the imbalance amount (do not silently round).

### Income statement generation
1. Inputs: `entity_id`, `start_date`, `end_date`, `scenario_ids`.
2. For each IS `fs_line_item`:
   - Find mapped accounts.
   - Sum JE lines where `entry_date BETWEEN start_date AND end_date` and entity/scenario match.
3. Net income flows to retained earnings on the BS (computed view — not a stored JE in v1).

### Period rollforward (the key feature)
There is no separate "rollforward" process. Because balances are computed from the entry log:
- Asking for the BS as of 12/31/2024 sums all entries through 12/31/2024.
- If a user books a JE dated 6/30/2023 today, tomorrow's 12/31/2024 BS will reflect it automatically.
- Year-end closing entries (zeroing P&L to retained earnings) ARE explicit JEs the user books — v1 leaves this manual; v1.1 can add a "close period" automation.

## Tests that must exist before merging v1

```python
# test_journal_entries.py
def test_je_rejects_unbalanced_lines()           # debits != credits
def test_je_rejects_line_with_both_debit_and_credit()
def test_reversing_je_zeros_out_original()

# test_tb_import.py
def test_tb_import_creates_je_with_correct_lines()
def test_tb_import_rejects_unbalanced_file()
def test_tb_import_rejects_unknown_accounts()
def test_duplicate_tb_import_for_same_entity_date_is_blocked()

# test_financials.py
def test_bs_balances_after_tb_import()           # Assets = L + E
def test_2023_je_flows_into_2024_opening_balance()  # the headline test
def test_scenario_stack_actual_only_vs_actual_plus_proforma_differ()
def test_topside_je_changes_bs_but_only_in_topside_scenario()

# test_consolidation.py (stub for v1, full impl in v1.1)
def test_two_entities_sum_correctly_at_parent()
```

## Streamlit UI pages (v1)

1. **Home** — entity selector, "current view" badge showing entity + as-of-date + scenarios.
2. **Setup** — upload CoA, FS structure, mappings. Status indicators showing what's loaded.
3. **Trial Balance Import** — file uploader, preview, validation results, commit button.
4. **Journal Entries** — table of JEs (filterable), "+ New JE" form with line items, "Reverse" button.
5. **Financials** — tabs for BS / IS / TB. Date and scenario pickers at top. Download to Excel button.

Each page is a single Python file under `ui/pages/`. Streamlit's multi-page app pattern.

## Setup commands (Claude Code: run these to bootstrap)

```bash
# 1. Initialize repo
mkdir accounting_tool && cd accounting_tool
git init
python -m venv .venv && source .venv/bin/activate

# 2. Install deps
pip install fastapi uvicorn sqlalchemy alembic psycopg2-binary pydantic pydantic-settings \
            pandas openpyxl python-multipart streamlit requests \
            pytest pytest-asyncio httpx

# 3. Save deps
pip freeze > requirements.txt

# 4. Create project scaffold (per "Project structure" above)

# 5. Init alembic
alembic init alembic

# 6. Translate schema.sql into SQLAlchemy models in app/models/
#    (Use the provided schema.sql as the source of truth)

# 7. Generate first migration
alembic revision --autogenerate -m "initial schema"
alembic upgrade head

# 8. Build endpoints in this order:
#    entities -> accounts -> fs_line_items -> mappings -> scenarios
#    -> tb_imports -> journal_entries -> financials

# 9. Write tests for each module as you build it

# 10. Build Streamlit UI last, once API endpoints are working
```

## Definition of done for v1

- All endpoints listed above return correct data.
- All listed tests pass.
- A user can: upload a CoA → upload FS structure → upload mappings → upload a 2023 TB → upload a 2024 TB → see BS and IS for both years → book a top-side JE dated 2023 → see the 2024 BS automatically reflect it.
- README explains how to run locally and how to run tests.
- `.env.example` documents required env vars.

## What comes after v1

- **v1.1:** Consolidation (entity_group_members rollup), elimination JEs, cash flow statement (indirect method).
- **v1.2:** Carve-out workflow (clone entity → apply allocation JEs → produce carve-out financials).
- **v1.3:** Period close automation, retained-earnings auto-flow.
- **v2.0:** AI features — auto-mapping suggestions, variance commentary, anomaly flags, natural-language queries over the JE ledger.
- **v2.1:** Multi-user, auth, role-based access (especially around posted-JE edits).
- **v3.0:** Multi-currency, FX revaluation, intercompany matching.

## Notes for the AI builder (Claude Code)

- The provided `schema.sql` is the **source of truth** for the data model. Translate it faithfully into SQLAlchemy models — do not redesign tables.
- Every financial calculation must have a corresponding test.
- Reject silent failures: if debits ≠ credits, surface the exact imbalance. If a BS doesn't balance, surface by how much.
- Use `NUMERIC(20,2)` (or `Decimal` in Python) for all monetary values — never floats.
- The `get_account_balance` SQL function is the canonical way to query balances. The financials service should call it (or replicate its logic in SQLAlchemy) rather than reinventing aggregation.
- When in doubt about accounting correctness, stop and ask. Wrong financials are worse than missing features.
