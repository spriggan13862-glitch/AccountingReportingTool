#!/usr/bin/env python
"""
Demo data seeder for internal alpha.

Creates a realistic accounting dataset for "Acme Manufacturing Co." so testers
can exercise every major workflow on first launch.

SAFETY: Refuses to run when ENVIRONMENT=production.

Usage:
    python scripts/seed_demo.py              # seed into accounting.db
    python scripts/seed_demo.py --dry-run   # validate without writing
    python scripts/seed_demo.py --force     # re-seed even if data exists
"""

from __future__ import annotations

import datetime
import sys
import os
from decimal import Decimal
from pathlib import Path

# Make project root importable when running as a script
sys.path.insert(0, str(Path(__file__).parent.parent))

from app.core.config import settings
from app.core.logging_config import configure_logging, get_logger

configure_logging(level="INFO")
logger = get_logger("seed")


# ---------------------------------------------------------------------------
# Safety guard
# ---------------------------------------------------------------------------

def _check_not_production() -> None:
    if settings.ENVIRONMENT == "production":
        raise SystemExit(
            "ERROR: seed_demo.py must not run against production. "
            "Set ENVIRONMENT=development in your .env file."
        )


# ---------------------------------------------------------------------------
# Chart of accounts definition
# ---------------------------------------------------------------------------

COA = [
    # (number, name, type, normal_balance)
    ("1000", "Cash",                           "asset",     "debit"),
    ("1100", "Accounts Receivable",            "asset",     "debit"),
    ("1200", "Inventory",                      "asset",     "debit"),
    ("1500", "Property, Plant & Equipment",    "asset",     "debit"),
    ("1510", "Accumulated Depreciation",       "asset",     "credit"),
    ("2000", "Accounts Payable",               "liability", "credit"),
    ("2100", "Accrued Expenses",               "liability", "credit"),
    ("2500", "Long-term Debt",                 "liability", "credit"),
    ("3000", "Common Stock",                   "equity",    "credit"),
    ("3100", "Retained Earnings",              "equity",    "credit"),
    ("4000", "Product Revenue",                "revenue",   "credit"),
    ("4100", "Service Revenue",                "revenue",   "credit"),
    ("5000", "Cost of Goods Sold",             "expense",   "debit"),
    ("5100", "Salaries Expense",               "expense",   "debit"),
    ("5200", "Rent Expense",                   "expense",   "debit"),
    ("5300", "Depreciation Expense",           "expense",   "debit"),
    ("5900", "Other Operating Expenses",       "expense",   "debit"),
]

# FS line item definitions: (code, name, statement, section, sort, is_subtotal, sign_flip, parent_code)
FS_STRUCTURE = [
    # Balance Sheet — Assets
    ("BS-CA",   "Current Assets",                  "BS", "current_assets",     10, True,  False, None),
    ("BS-CASH", "Cash",                            "BS", "current_assets",     11, False, False, "BS-CA"),
    ("BS-AR",   "Accounts Receivable",             "BS", "current_assets",     12, False, False, "BS-CA"),
    ("BS-INV",  "Inventory",                       "BS", "current_assets",     13, False, False, "BS-CA"),
    ("BS-NCA",  "Non-Current Assets",              "BS", "non_current_assets", 20, True,  False, None),
    ("BS-PPE",  "Property, Plant & Equipment, net","BS", "non_current_assets", 21, False, False, "BS-NCA"),
    ("BS-TA",   "Total Assets",                    "BS", "total_assets",       30, True,  False, None),
    # Balance Sheet — Liabilities
    ("BS-CL",   "Current Liabilities",             "BS", "current_liabilities",40, True,  False, None),
    ("BS-AP",   "Accounts Payable",                "BS", "current_liabilities",41, False, False, "BS-CL"),
    ("BS-ACCR", "Accrued Expenses",                "BS", "current_liabilities",42, False, False, "BS-CL"),
    ("BS-LTL",  "Long-term Liabilities",           "BS", "long_term_liabilities",50,True, False, None),
    ("BS-LTD",  "Long-term Debt",                  "BS", "long_term_liabilities",51,False,False, "BS-LTL"),
    ("BS-TL",   "Total Liabilities",               "BS", "total_liabilities",  60, True,  False, None),
    # Balance Sheet — Equity
    ("BS-EQ",   "Equity",                          "BS", "equity",             70, True,  False, None),
    ("BS-CS",   "Common Stock",                    "BS", "equity",             71, False, False, "BS-EQ"),
    ("BS-RE",   "Retained Earnings",               "BS", "equity",             72, False, False, "BS-EQ"),
    ("BS-TLE",  "Total Liabilities & Equity",      "BS", "total_liabilities_equity",80,True,False,None),
    # Income Statement
    ("IS-REV",  "Revenue",                         "IS", "revenue",            10, True,  False, None),
    ("IS-PROD", "Product Revenue",                 "IS", "revenue",            11, False, False, "IS-REV"),
    ("IS-SVC",  "Service Revenue",                 "IS", "revenue",            12, False, False, "IS-REV"),
    ("IS-EXP",  "Expenses",                        "IS", "expenses",           20, True,  False, None),
    ("IS-COGS", "Cost of Goods Sold",              "IS", "expenses",           21, False, False, "IS-EXP"),
    ("IS-SAL",  "Salaries Expense",                "IS", "expenses",           22, False, False, "IS-EXP"),
    ("IS-RENT", "Rent Expense",                    "IS", "expenses",           23, False, False, "IS-EXP"),
    ("IS-DEPR", "Depreciation Expense",            "IS", "expenses",           24, False, False, "IS-EXP"),
    ("IS-OTH",  "Other Operating Expenses",        "IS", "expenses",           25, False, False, "IS-EXP"),
    ("IS-NI",   "Net Income",                      "IS", "net_income",         30, True,  False, None),
]

# Account → FS line item mapping: (account_number, fs_line_code)
ACCOUNT_MAPPINGS = [
    ("1000", "BS-CASH"),
    ("1100", "BS-AR"),
    ("1200", "BS-INV"),
    ("1500", "BS-PPE"),
    ("1510", "BS-PPE"),   # Accum Depr nets into PPE line (sign handled by normal_balance)
    ("2000", "BS-AP"),
    ("2100", "BS-ACCR"),
    ("2500", "BS-LTD"),
    ("3000", "BS-CS"),
    ("3100", "BS-RE"),
    ("4000", "IS-PROD"),
    ("4100", "IS-SVC"),
    ("5000", "IS-COGS"),
    ("5100", "IS-SAL"),
    ("5200", "IS-RENT"),
    ("5300", "IS-DEPR"),
    ("5900", "IS-OTH"),
]


# ---------------------------------------------------------------------------
# Main seeder
# ---------------------------------------------------------------------------

def seed_demo_data(db, verbose: bool = True, force: bool = False) -> dict:
    """
    Create the full Acme Manufacturing demo dataset.

    Returns a dict of all created objects keyed by role/type.
    Safe to call multiple times if force=False (skips if org already exists).
    """
    from app.models.organization import Organization
    from app.models.entity import Entity
    from app.models.account import Account
    from app.models.scenario import Scenario
    from app.models.fs_line_item import FsLineItem
    from app.models.account_mapping import AccountMapping
    from app.services.organization_service import create_organization, seed_default_roles
    from app.services.user_service import create_user, assign_role
    from app.services.accounting_period_service import create_period
    from app.services.journal_entry_service import create_draft_journal_entry, post_journal_entry
    from app.services.reconciliation_service import create_reconciliation, transition_status
    from app.models.workflow_task import WorkflowTask
    from app.core.security import hash_password
    from app.schemas.journal_entry import JournalEntryCreate, JournalEntryLineCreate

    def log(msg: str) -> None:
        if verbose:
            logger.info(msg)

    def line(n: int, acct_id: int, ent_id: int, **kw) -> JournalEntryLineCreate:
        return JournalEntryLineCreate(line_number=n, account_id=acct_id, entity_id=ent_id, **kw)

    # Idempotency check
    existing = db.query(Organization).filter(Organization.slug == "acme").first()
    if existing and not force:
        log("Demo org 'acme' already exists. Use --force to re-seed. Skipping.")
        return {"skipped": True, "org": existing}

    if existing and force:
        log("Force re-seed: deleting existing demo org data is not supported. "
            "Run reset_local.py first to wipe the database.")
        return {"skipped": True, "org": existing}

    log("=== Seeding Acme Manufacturing demo data ===")

    # ------------------------------------------------------------------
    # Organization & roles
    # ------------------------------------------------------------------
    org = create_organization(db, name="Acme Manufacturing Co.", slug="acme")
    seed_default_roles(db)
    log(f"Created org: {org.name} (id={org.id})")

    # ------------------------------------------------------------------
    # Users
    # ------------------------------------------------------------------
    pw = hash_password("Demo1234!")
    users = {}

    admin = create_user(db, organization_id=org.id, email="admin@acme.com",
                        full_name="Alex Admin", hashed_password=pw, is_superuser=True)
    assign_role(db, user_id=admin.id, role_name="admin", organization_id=org.id)
    users["admin"] = admin

    controller = create_user(db, organization_id=org.id, email="controller@acme.com",
                             full_name="Casey Controller", hashed_password=pw)
    assign_role(db, user_id=controller.id, role_name="controller", organization_id=org.id)
    users["controller"] = controller

    accountant = create_user(db, organization_id=org.id, email="accountant@acme.com",
                             full_name="Sam Accountant", hashed_password=pw)
    assign_role(db, user_id=accountant.id, role_name="accountant", organization_id=org.id)
    users["accountant"] = accountant

    reviewer = create_user(db, organization_id=org.id, email="reviewer@acme.com",
                           full_name="Robin Reviewer", hashed_password=pw)
    assign_role(db, user_id=reviewer.id, role_name="reviewer", organization_id=org.id)
    users["reviewer"] = reviewer

    viewer = create_user(db, organization_id=org.id, email="viewer@acme.com",
                         full_name="Val Viewer", hashed_password=pw)
    assign_role(db, user_id=viewer.id, role_name="viewer", organization_id=org.id)
    users["viewer"] = viewer

    log(f"Created {len(users)} demo users (password: Demo1234!)")

    # ------------------------------------------------------------------
    # Entity
    # ------------------------------------------------------------------
    entity = Entity(
        code="ACME-LLC",
        name="Acme Manufacturing LLC",
        entity_type="operating",
        organization_id=org.id,
        currency="USD",
    )
    db.add(entity)
    db.flush()
    log(f"Created entity: {entity.name} ({entity.code})")

    # ------------------------------------------------------------------
    # Scenario
    # ------------------------------------------------------------------
    scenario = Scenario(
        organization_id=org.id,
        code="ACTUAL-ACME",
        name="Acme Actual",
        scenario_type="actual",
        description="Actual results for Acme Manufacturing",
    )
    db.add(scenario)
    db.flush()
    log(f"Created scenario: {scenario.name}")

    # ------------------------------------------------------------------
    # Chart of accounts
    # ------------------------------------------------------------------
    acct_by_number: dict[str, Account] = {}
    for number, name, acct_type, normal_balance in COA:
        acct = Account(
            account_number=number,
            account_name=name,
            account_type=acct_type,
            normal_balance=normal_balance,
            entity_id=entity.id,
        )
        db.add(acct)
        db.flush()
        acct_by_number[number] = acct
    log(f"Created {len(COA)} accounts")

    # ------------------------------------------------------------------
    # FS line items (parents first, then children)
    # ------------------------------------------------------------------
    fs_by_code: dict[str, FsLineItem] = {}
    for code, name, stmt, section, sort, is_subtotal, sign_flip, parent_code in FS_STRUCTURE:
        parent_id = fs_by_code[parent_code].id if parent_code else None
        item = FsLineItem(
            code=code,
            name=name,
            statement=stmt,
            section=section,
            sort_order=sort,
            is_subtotal=is_subtotal,
            sign_flip=sign_flip,
            parent_line_id=parent_id,
        )
        db.add(item)
        db.flush()
        fs_by_code[code] = item
    log(f"Created {len(FS_STRUCTURE)} FS line items")

    # ------------------------------------------------------------------
    # Account mappings
    # ------------------------------------------------------------------
    for account_number, fs_code in ACCOUNT_MAPPINGS:
        mapping = AccountMapping(
            account_id=acct_by_number[account_number].id,
            fs_line_item_id=fs_by_code[fs_code].id,
            entity_id=None,   # global — applies to all entities
            effective_from=datetime.date(1900, 1, 1),
            effective_to=datetime.date(9999, 12, 31),
        )
        db.add(mapping)
    db.flush()
    log(f"Created {len(ACCOUNT_MAPPINGS)} account mappings")

    # ------------------------------------------------------------------
    # Accounting periods: 2024-01 through 2024-03, plus 2025-01
    # ------------------------------------------------------------------
    periods = {}
    period_defs = [
        (2024, 1, "January 2024",  datetime.date(2024, 1, 1), datetime.date(2024, 1, 31)),
        (2024, 2, "February 2024", datetime.date(2024, 2, 1), datetime.date(2024, 2, 29)),
        (2024, 3, "March 2024",    datetime.date(2024, 3, 1), datetime.date(2024, 3, 31)),
        (2025, 1, "January 2025",  datetime.date(2025, 1, 1), datetime.date(2025, 1, 31)),
    ]
    for fy, fp, pname, start, end in period_defs:
        p = create_period(db, entity_id=entity.id, period_name=pname,
                          start_date=start, end_date=end,
                          fiscal_year=fy, fiscal_period=fp)
        periods[(fy, fp)] = p
    log(f"Created {len(periods)} accounting periods")

    # ------------------------------------------------------------------
    # Opening trial balance (as of 2023-12-31)
    # Debits:  Cash 250k, AR 75k, Inventory 125k, PPE 500k   = 950k
    # Credits: AccumDepr 100k, AP 50k, Accr 25k, LTD 300k,
    #          CommonStock 200k, RE 275k                       = 950k
    # ------------------------------------------------------------------
    ob_data = JournalEntryCreate(
        je_number="OB-2024-001",
        entry_date=datetime.date(2023, 12, 31),
        entity_id=entity.id,
        scenario_id=scenario.id,
        description="Opening trial balance as of 2023-12-31",
        source="opening_balance",
        source_ref="TB-IMPORT-001",
        lines=[
            JournalEntryLineCreate(line_number=1,  account_id=acct_by_number["1000"].id, entity_id=entity.id, debit=Decimal("250000")),
            JournalEntryLineCreate(line_number=2,  account_id=acct_by_number["1100"].id, entity_id=entity.id, debit=Decimal("75000")),
            JournalEntryLineCreate(line_number=3,  account_id=acct_by_number["1200"].id, entity_id=entity.id, debit=Decimal("125000")),
            JournalEntryLineCreate(line_number=4,  account_id=acct_by_number["1500"].id, entity_id=entity.id, debit=Decimal("500000")),
            JournalEntryLineCreate(line_number=5,  account_id=acct_by_number["1510"].id, entity_id=entity.id, credit=Decimal("100000")),
            JournalEntryLineCreate(line_number=6,  account_id=acct_by_number["2000"].id, entity_id=entity.id, credit=Decimal("50000")),
            JournalEntryLineCreate(line_number=7,  account_id=acct_by_number["2100"].id, entity_id=entity.id, credit=Decimal("25000")),
            JournalEntryLineCreate(line_number=8,  account_id=acct_by_number["2500"].id, entity_id=entity.id, credit=Decimal("300000")),
            JournalEntryLineCreate(line_number=9,  account_id=acct_by_number["3000"].id, entity_id=entity.id, credit=Decimal("200000")),
            JournalEntryLineCreate(line_number=10, account_id=acct_by_number["3100"].id, entity_id=entity.id, credit=Decimal("275000")),
        ],
    )
    post_journal_entry(db, ob_data, acting_user=admin)
    log("Posted opening balance JE (OB-2024-001)")

    # ------------------------------------------------------------------
    # January 2024 posted JEs
    # ------------------------------------------------------------------
    jan_jes = [
        JournalEntryCreate(
            je_number="JE-2024-001",
            entry_date=datetime.date(2024, 1, 15),
            entity_id=entity.id, scenario_id=scenario.id,
            description="January product revenue recognition",
            source="manual", created_by="accountant@acme.com",
            lines=[
                line(1, acct_by_number["1100"].id, entity.id, debit=Decimal("100000")),
                line(2, acct_by_number["4000"].id, entity.id, credit=Decimal("100000")),
            ],
        ),
        JournalEntryCreate(
            je_number="JE-2024-002",
            entry_date=datetime.date(2024, 1, 15),
            entity_id=entity.id, scenario_id=scenario.id,
            description="January cost of goods sold",
            source="manual", created_by="accountant@acme.com",
            lines=[
                line(1, acct_by_number["5000"].id, entity.id, debit=Decimal("60000")),
                line(2, acct_by_number["1200"].id, entity.id, credit=Decimal("60000")),
            ],
        ),
        JournalEntryCreate(
            je_number="JE-2024-003",
            entry_date=datetime.date(2024, 1, 31),
            entity_id=entity.id, scenario_id=scenario.id,
            description="January salaries accrual",
            source="manual", created_by="accountant@acme.com",
            lines=[
                line(1, acct_by_number["5100"].id, entity.id, debit=Decimal("45000")),
                line(2, acct_by_number["2000"].id, entity.id, credit=Decimal("45000")),
            ],
        ),
        JournalEntryCreate(
            je_number="JE-2024-004",
            entry_date=datetime.date(2024, 1, 31),
            entity_id=entity.id, scenario_id=scenario.id,
            description="January rent expense",
            source="manual", created_by="accountant@acme.com",
            lines=[
                line(1, acct_by_number["5200"].id, entity.id, debit=Decimal("8000")),
                line(2, acct_by_number["1000"].id, entity.id, credit=Decimal("8000")),
            ],
        ),
        JournalEntryCreate(
            je_number="JE-2024-005",
            entry_date=datetime.date(2024, 1, 28),
            entity_id=entity.id, scenario_id=scenario.id,
            description="Cash collected from customers",
            source="manual", created_by="accountant@acme.com",
            lines=[
                line(1, acct_by_number["1000"].id, entity.id, debit=Decimal("80000")),
                line(2, acct_by_number["1100"].id, entity.id, credit=Decimal("80000")),
            ],
        ),
        JournalEntryCreate(
            je_number="JE-2024-006",
            entry_date=datetime.date(2024, 1, 31),
            entity_id=entity.id, scenario_id=scenario.id,
            description="January depreciation",
            source="manual", created_by="accountant@acme.com",
            lines=[
                line(1, acct_by_number["5300"].id, entity.id, debit=Decimal("5000")),
                line(2, acct_by_number["1510"].id, entity.id, credit=Decimal("5000")),
            ],
        ),
    ]
    for je_data in jan_jes:
        post_journal_entry(db, je_data, acting_user=accountant)
    log(f"Posted {len(jan_jes)} January 2024 JEs")

    # ------------------------------------------------------------------
    # February 2024 posted JEs
    # ------------------------------------------------------------------
    feb_jes = [
        JournalEntryCreate(
            je_number="JE-2024-007",
            entry_date=datetime.date(2024, 2, 15),
            entity_id=entity.id, scenario_id=scenario.id,
            description="February product revenue",
            source="manual", created_by="accountant@acme.com",
            lines=[
                line(1, acct_by_number["1100"].id, entity.id, debit=Decimal("120000")),
                line(2, acct_by_number["4000"].id, entity.id, credit=Decimal("120000")),
            ],
        ),
        JournalEntryCreate(
            je_number="JE-2024-008",
            entry_date=datetime.date(2024, 2, 20),
            entity_id=entity.id, scenario_id=scenario.id,
            description="February service revenue (cash)",
            source="manual", created_by="accountant@acme.com",
            lines=[
                line(1, acct_by_number["1000"].id, entity.id, debit=Decimal("15000")),
                line(2, acct_by_number["4100"].id, entity.id, credit=Decimal("15000")),
            ],
        ),
        JournalEntryCreate(
            je_number="JE-2024-009",
            entry_date=datetime.date(2024, 2, 29),
            entity_id=entity.id, scenario_id=scenario.id,
            description="February salaries",
            source="manual", created_by="accountant@acme.com",
            lines=[
                line(1, acct_by_number["5100"].id, entity.id, debit=Decimal("45000")),
                line(2, acct_by_number["2000"].id, entity.id, credit=Decimal("45000")),
            ],
        ),
    ]
    for je_data in feb_jes:
        post_journal_entry(db, je_data, acting_user=accountant)
    log(f"Posted {len(feb_jes)} February 2024 JEs")

    # ------------------------------------------------------------------
    # Draft JEs (not yet posted — visible in draft preview)
    # ------------------------------------------------------------------
    draft_jes = [
        JournalEntryCreate(
            je_number="DRAFT-2024-001",
            entry_date=datetime.date(2024, 1, 31),
            entity_id=entity.id, scenario_id=scenario.id,
            description="[DRAFT] Audit adjustment — Q1 accrual",
            source="topside", source_ref="AUDIT-2024-Q1",
            created_by="controller@acme.com",
            lines=[
                line(1, acct_by_number["5900"].id, entity.id, debit=Decimal("3500")),
                line(2, acct_by_number["2100"].id, entity.id, credit=Decimal("3500")),
            ],
        ),
        JournalEntryCreate(
            je_number="DRAFT-2024-002",
            entry_date=datetime.date(2024, 2, 29),
            entity_id=entity.id, scenario_id=scenario.id,
            description="[DRAFT] Pending AR write-off review",
            source="manual", created_by="accountant@acme.com",
            lines=[
                line(1, acct_by_number["5900"].id, entity.id, debit=Decimal("5000")),
                line(2, acct_by_number["1100"].id, entity.id, credit=Decimal("5000")),
            ],
        ),
    ]
    for draft_data in draft_jes:
        create_draft_journal_entry(db, draft_data, acting_user=accountant)
    log(f"Created {len(draft_jes)} draft JEs")

    # ------------------------------------------------------------------
    # Sample reconciliation — Cash account for January 2024
    # ------------------------------------------------------------------
    cash_recon = create_reconciliation(
        db,
        organization_id=org.id,
        entity_id=entity.id,
        account_id=acct_by_number["1000"].id,
        period_id=periods[(2024, 1)].id,
        official_balance=Decimal("322000"),   # 250k opening + 80k received − 8k rent
        supporting_balance=Decimal("322000"),
        notes="Bank statement reconciliation for January 2024",
    )
    transition_status(db, cash_recon.id, "in_progress", user_id=accountant.id)
    transition_status(db, cash_recon.id, "prepared", user_id=accountant.id)
    log(f"Created and advanced cash reconciliation (id={cash_recon.id})")

    # AR reconciliation — in_progress
    ar_recon = create_reconciliation(
        db,
        organization_id=org.id,
        entity_id=entity.id,
        account_id=acct_by_number["1100"].id,
        period_id=periods[(2024, 1)].id,
        official_balance=Decimal("95000"),   # 75k opening + 100k revenue − 80k collected
        supporting_balance=Decimal("95000"),
        notes="AR aging reconciliation for January 2024",
    )
    transition_status(db, ar_recon.id, "in_progress", user_id=accountant.id)
    log(f"Created AR reconciliation (id={ar_recon.id})")

    # ------------------------------------------------------------------
    # Sample workflow tasks
    # ------------------------------------------------------------------
    tasks = [
        WorkflowTask(
            organization_id=org.id,
            task_type="period_close",
            title="Close January 2024",
            description="Complete all entries and close the January 2024 accounting period.",
            status="open",
            priority="high",
            assigned_to_user_id=controller.id,
            created_by_user_id=admin.id,
            due_date=datetime.date(2024, 2, 15),
        ),
        WorkflowTask(
            organization_id=org.id,
            task_type="review",
            title="Review Q1 Financial Statements",
            description="Review and sign off on Q1 2024 financial statements.",
            status="open",
            priority="medium",
            assigned_to_user_id=reviewer.id,
            created_by_user_id=controller.id,
        ),
        WorkflowTask(
            organization_id=org.id,
            task_type="reconciliation",
            title="Complete Cash Reconciliation — February 2024",
            description="Tie out cash balance to bank statement for February 2024.",
            status="open",
            priority="medium",
            assigned_to_user_id=accountant.id,
            created_by_user_id=controller.id,
            due_date=datetime.date(2024, 3, 10),
        ),
    ]
    for task in tasks:
        db.add(task)
    db.flush()
    log(f"Created {len(tasks)} workflow tasks")

    db.commit()

    result = {
        "org": org,
        "users": users,
        "entity": entity,
        "scenario": scenario,
        "accounts": acct_by_number,
        "fs_items": fs_by_code,
        "periods": periods,
        "reconciliations": [cash_recon, ar_recon],
        "tasks": tasks,
    }

    log("=== Seed complete ===")
    log(f"  Organization : {org.name}  (id={org.id})")
    log(f"  Entity       : {entity.name}  ({entity.code})")
    log(f"  Accounts     : {len(COA)}")
    log(f"  FS lines     : {len(FS_STRUCTURE)}")
    log(f"  Periods      : {len(periods)}")
    log(f"  Posted JEs   : {len(jan_jes) + len(feb_jes) + 1} (incl. opening balance)")
    log(f"  Draft JEs    : {len(draft_jes)}")
    log(f"  Recons       : 2")
    log(f"  Tasks        : {len(tasks)}")
    log("")
    log("  Demo credentials (password: Demo1234!):")
    for role, u in users.items():
        log(f"    {role:<12} → {u.email}")

    return result


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import argparse

    _check_not_production()

    parser = argparse.ArgumentParser(description="Seed demo data for internal alpha")
    parser.add_argument("--dry-run", action="store_true", help="Validate imports only, no DB writes")
    parser.add_argument("--force",   action="store_true", help="Re-seed even if org exists")
    args = parser.parse_args()

    if args.dry_run:
        logger.info("DRY RUN — imports OK, no data written")
        sys.exit(0)

    from app.database import SessionLocal
    db = SessionLocal()
    try:
        seed_demo_data(db, verbose=True, force=args.force)
    except Exception as exc:
        logger.error("Seed failed: %s", exc)
        db.rollback()
        sys.exit(1)
    finally:
        db.close()
