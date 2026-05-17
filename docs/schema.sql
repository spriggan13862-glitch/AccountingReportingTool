-- =============================================================================
-- Accounting Tool — Database Schema v1
-- Target: PostgreSQL 14+ (SQLite-compatible with minor tweaks noted inline)
-- =============================================================================
--
-- Core design principle: BALANCES ARE NEVER STORED. They are always computed
-- by summing journal_entry_lines up through a given date for a given account
-- and entity. Trial balance uploads are converted into "opening balance"
-- journal entries so that everything lives in one unified ledger.
--
-- This means: a JE booked in 2023 automatically affects 2024 and 2025 opening
-- balances, because those balances are just SUM(entries WHERE date <= 12/31/YYYY).
-- =============================================================================


-- =============================================================================
-- ENTITIES — legal entities, divisions, carve-out targets, consolidation groups
-- =============================================================================
CREATE TABLE entities (
    id              SERIAL PRIMARY KEY,
    code            VARCHAR(20)  NOT NULL UNIQUE,   -- e.g. 'US01', 'CARVE_A'
    name            VARCHAR(200) NOT NULL,
    entity_type     VARCHAR(20)  NOT NULL,          -- 'operating', 'consolidation', 'elimination'
    parent_id       INTEGER REFERENCES entities(id),-- for consolidation hierarchies
    currency        VARCHAR(3)   NOT NULL DEFAULT 'USD',
    active          BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK (entity_type IN ('operating', 'consolidation', 'elimination', 'carveout'))
);

CREATE INDEX idx_entities_parent ON entities(parent_id);


-- =============================================================================
-- ENTITY GROUPS — defines which entities roll up into a consolidation
-- (Many-to-many: an entity can belong to multiple consolidation views,
--  e.g. "Total Co" and "North America")
-- =============================================================================
CREATE TABLE entity_group_members (
    consolidation_entity_id  INTEGER NOT NULL REFERENCES entities(id),
    member_entity_id         INTEGER NOT NULL REFERENCES entities(id),
    ownership_pct            NUMERIC(7,4) NOT NULL DEFAULT 100.0000,
    effective_from           DATE,
    effective_to             DATE,
    PRIMARY KEY (consolidation_entity_id, member_entity_id)
);


-- =============================================================================
-- CHART OF ACCOUNTS — the master list of accounts
-- (Shared across entities by default; can be entity-specific via entity_id)
-- =============================================================================
CREATE TABLE accounts (
    id              SERIAL PRIMARY KEY,
    account_number  VARCHAR(50)  NOT NULL,
    account_name    VARCHAR(200) NOT NULL,
    account_type    VARCHAR(20)  NOT NULL,  -- asset, liability, equity, revenue, expense
    normal_balance  VARCHAR(6)   NOT NULL,  -- 'debit' or 'credit'
    entity_id       INTEGER REFERENCES entities(id),  -- NULL = global account
    parent_account_id INTEGER REFERENCES accounts(id),-- for sub-accounts/rollups
    active          BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (entity_id, account_number),
    CHECK (account_type IN ('asset', 'liability', 'equity', 'revenue', 'expense')),
    CHECK (normal_balance IN ('debit', 'credit'))
);

CREATE INDEX idx_accounts_number ON accounts(account_number);
CREATE INDEX idx_accounts_type ON accounts(account_type);


-- =============================================================================
-- FINANCIAL STATEMENT LINE ITEMS — the structure of the BS/IS/CF
-- =============================================================================
CREATE TABLE fs_line_items (
    id              SERIAL PRIMARY KEY,
    code            VARCHAR(50)  NOT NULL UNIQUE,  -- e.g. 'BS_CASH', 'IS_REV_PRODUCT'
    name            VARCHAR(200) NOT NULL,
    statement       VARCHAR(10)  NOT NULL,         -- 'BS', 'IS', 'CF'
    section         VARCHAR(50),                   -- 'current_assets', 'opex', etc.
    sort_order      INTEGER      NOT NULL DEFAULT 0,
    parent_line_id  INTEGER REFERENCES fs_line_items(id),
    is_subtotal     BOOLEAN      NOT NULL DEFAULT FALSE,
    sign_flip       BOOLEAN      NOT NULL DEFAULT FALSE,  -- display contra-accounts
    CHECK (statement IN ('BS', 'IS', 'CF'))
);


-- =============================================================================
-- ACCOUNT MAPPING — maps accounts to FS line items
-- Versioned by effective date so a re-map mid-year doesn't break history
-- =============================================================================
CREATE TABLE account_mappings (
    id              SERIAL PRIMARY KEY,
    account_id      INTEGER NOT NULL REFERENCES accounts(id),
    fs_line_item_id INTEGER NOT NULL REFERENCES fs_line_items(id),
    entity_id       INTEGER REFERENCES entities(id),  -- NULL = applies to all entities
    effective_from  DATE NOT NULL DEFAULT '1900-01-01',
    effective_to    DATE NOT NULL DEFAULT '9999-12-31',
    created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_mappings_account ON account_mappings(account_id);
CREATE INDEX idx_mappings_entity  ON account_mappings(entity_id);


-- =============================================================================
-- SCENARIOS — actual, budget, forecast, pro-forma, carve-out adjustments, etc.
-- Every JE belongs to a scenario. Financials are pulled for a scenario (or
-- a stack of scenarios: e.g. Actual + Pro-Forma Adjustments).
-- =============================================================================
CREATE TABLE scenarios (
    id              SERIAL PRIMARY KEY,
    code            VARCHAR(50)  NOT NULL UNIQUE,
    name            VARCHAR(200) NOT NULL,
    scenario_type   VARCHAR(30)  NOT NULL,  -- actual, topside, pro_forma, elimination, carveout, budget, forecast
    description     TEXT,
    active          BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK (scenario_type IN ('actual','topside','pro_forma','elimination','carveout','budget','forecast'))
);

-- Seed the basic ones so the app works out of the box
INSERT INTO scenarios (code, name, scenario_type) VALUES
    ('ACTUAL',     'Actual',                'actual'),
    ('TOPSIDE',    'Top-side Adjustments',  'topside'),
    ('PROFORMA',   'Pro-forma Adjustments', 'pro_forma'),
    ('ELIM',       'Consolidation Eliminations', 'elimination'),
    ('CARVEOUT',   'Carve-out Adjustments', 'carveout');


-- =============================================================================
-- JOURNAL ENTRIES — the heart of the system
-- Every financial fact is a JE. Trial balance uploads become opening-balance JEs.
-- =============================================================================
CREATE TABLE journal_entries (
    id              SERIAL PRIMARY KEY,
    je_number       VARCHAR(50)  NOT NULL UNIQUE,    -- human-readable ref
    entry_date      DATE         NOT NULL,            -- accounting date (drives period)
    entity_id       INTEGER      NOT NULL REFERENCES entities(id),
    scenario_id     INTEGER      NOT NULL REFERENCES scenarios(id),
    description     TEXT         NOT NULL,
    source          VARCHAR(50)  NOT NULL DEFAULT 'manual', -- manual, tb_import, system, ai_suggested
    source_ref      VARCHAR(200),                    -- e.g. uploaded filename, AI request id
    status          VARCHAR(20)  NOT NULL DEFAULT 'posted',  -- draft, posted, reversed
    reversal_of_id  INTEGER REFERENCES journal_entries(id),
    created_by      VARCHAR(100),
    created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    posted_at       TIMESTAMP,
    CHECK (status IN ('draft','posted','reversed'))
);

CREATE INDEX idx_je_date     ON journal_entries(entry_date);
CREATE INDEX idx_je_entity   ON journal_entries(entity_id);
CREATE INDEX idx_je_scenario ON journal_entries(scenario_id);
CREATE INDEX idx_je_status   ON journal_entries(status);


-- =============================================================================
-- JOURNAL ENTRY LINES — the debit/credit detail
-- Constraint: every JE must have debits = credits (enforced at app layer + trigger)
-- =============================================================================
CREATE TABLE journal_entry_lines (
    id              SERIAL PRIMARY KEY,
    journal_entry_id INTEGER     NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
    line_number     INTEGER      NOT NULL,
    account_id      INTEGER      NOT NULL REFERENCES accounts(id),
    entity_id       INTEGER      NOT NULL REFERENCES entities(id),  -- usually same as JE, but allows intercompany
    debit           NUMERIC(20,2) NOT NULL DEFAULT 0,
    credit          NUMERIC(20,2) NOT NULL DEFAULT 0,
    description     TEXT,
    CHECK (debit  >= 0),
    CHECK (credit >= 0),
    CHECK (NOT (debit > 0 AND credit > 0))  -- a line is debit OR credit, not both
);

CREATE INDEX idx_jel_je       ON journal_entry_lines(journal_entry_id);
CREATE INDEX idx_jel_account  ON journal_entry_lines(account_id);
CREATE INDEX idx_jel_entity   ON journal_entry_lines(entity_id);


-- =============================================================================
-- TRIAL BALANCE IMPORTS — provenance for uploaded TBs
-- The actual TB data is stored as JEs in scenario=ACTUAL, source='tb_import'.
-- This table just records the upload metadata.
-- =============================================================================
CREATE TABLE tb_imports (
    id              SERIAL PRIMARY KEY,
    entity_id       INTEGER      NOT NULL REFERENCES entities(id),
    as_of_date      DATE         NOT NULL,
    filename        VARCHAR(500) NOT NULL,
    row_count       INTEGER,
    total_debits    NUMERIC(20,2),
    total_credits   NUMERIC(20,2),
    je_id           INTEGER REFERENCES journal_entries(id),  -- the resulting JE
    status          VARCHAR(20)  NOT NULL DEFAULT 'pending', -- pending, processed, failed
    error_message   TEXT,
    uploaded_by     VARCHAR(100),
    uploaded_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
);


-- =============================================================================
-- VIEW: account balances at a point in time
-- Usage:  SELECT * FROM v_account_balance
--         WHERE entity_id = 1 AND as_of_date <= '2024-12-31'
-- =============================================================================
CREATE VIEW v_je_line_detail AS
SELECT
    jel.id              AS line_id,
    je.id               AS je_id,
    je.entry_date,
    je.entity_id        AS je_entity_id,
    jel.entity_id       AS line_entity_id,
    je.scenario_id,
    jel.account_id,
    a.account_number,
    a.account_name,
    a.account_type,
    a.normal_balance,
    jel.debit,
    jel.credit,
    (jel.debit - jel.credit) AS net_debit,
    je.status
FROM journal_entry_lines jel
JOIN journal_entries je ON je.id = jel.journal_entry_id
JOIN accounts a         ON a.id  = jel.account_id
WHERE je.status = 'posted';


-- =============================================================================
-- HELPER: get balance for an account/entity through a date and scenario stack
-- (Implemented as a function so the app can pass scenario lists cleanly)
-- =============================================================================
-- Example call: SELECT get_account_balance(account_id, entity_id, '2024-12-31', ARRAY[1,2,3]);
-- Returns the net debit balance (positive = debit, negative = credit).
CREATE OR REPLACE FUNCTION get_account_balance(
    p_account_id   INTEGER,
    p_entity_id    INTEGER,
    p_as_of        DATE,
    p_scenario_ids INTEGER[]
) RETURNS NUMERIC AS $$
    SELECT COALESCE(SUM(debit - credit), 0)
    FROM v_je_line_detail
    WHERE account_id    = p_account_id
      AND line_entity_id = p_entity_id
      AND entry_date    <= p_as_of
      AND scenario_id = ANY(p_scenario_ids);
$$ LANGUAGE SQL STABLE;


-- =============================================================================
-- AUDIT LOG — every change to JEs, mappings, etc.
-- =============================================================================
CREATE TABLE audit_log (
    id              SERIAL PRIMARY KEY,
    table_name      VARCHAR(50)  NOT NULL,
    record_id       INTEGER      NOT NULL,
    action          VARCHAR(20)  NOT NULL,   -- insert, update, delete
    changed_by      VARCHAR(100),
    changed_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    old_values      JSONB,
    new_values      JSONB
);

CREATE INDEX idx_audit_table_record ON audit_log(table_name, record_id);


-- =============================================================================
-- USAGE NOTES
-- =============================================================================
-- 1. When you upload a TB for entity E at date D:
--    a. Insert a row in tb_imports
--    b. Create ONE journal_entry: entity=E, date=D, scenario=ACTUAL, source='tb_import'
--    c. Create one journal_entry_line per TB row (account, debit, credit)
--    d. Verify SUM(debits) = SUM(credits) — reject if not
--
-- 2. To get a balance sheet for entity E as of 12/31/2024 (Actual only):
--    For each BS fs_line_item:
--      sum get_account_balance() for every account mapped to it,
--      filtered to entity E, date <= 12/31/2024, scenarios=[ACTUAL]
--
-- 3. To get BS as of 12/31/2024 INCLUDING pro-forma:
--    Same query but scenarios=[ACTUAL, PROFORMA, TOPSIDE]
--
-- 4. To get consolidated BS for parent entity P as of 12/31/2024:
--    Sum balances across all member_entity_ids where consolidation_entity_id = P
--    PLUS any JEs booked directly to P with scenario=ELIM
--
-- 5. For a carve-out: create a new entity 'CARVE_X', then book carve-out
--    adjustment JEs (allocations, stranded costs, etc.) in scenario=CARVEOUT.
--    Carve-out financials = parent actuals - removed entity actuals + carve-out adjustments
-- =============================================================================
