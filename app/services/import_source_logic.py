"""
Import source type capabilities.

COA (Chart of Accounts):
  - Creates/updates Account records with hierarchy (parent_account_id)
  - Sets account_type, normal_balance, account_number, account_name
  - Does NOT create balance entries (no period balances)
  - Does NOT require a period or scenario

TB (Trial Balance):
  - Parses account number + name from each row
  - Matches to existing COA accounts or creates new ones
  - Creates TrialBalanceBalance entries (or JE with debit/credit) for a period
  - Suggests FSLI taxonomy line assignment
  - Requires: entity_id, period_id (as-of date)
  - Optional: scenario_id

GL (General Ledger):
  - Imports individual transactions/journal entries
  - Derives period activity (debit/credit per account per period)
  - Creates Account records if they don't exist
  - Requires opening balances to derive ending balances (cannot stand alone)
  - Requires: entity_id, period

Financial Statement (PDF/Excel):
  - Imports presentation-level line items (not raw accounts)
  - Maps to taxonomy/FSLI lines (not account-level)
  - Does NOT provide account-level detail unless explicitly present
  - Useful for: building comparison, seeding FSLI structure
"""

from __future__ import annotations

from sqlalchemy.orm import Session


IMPORT_SOURCE_CAPABILITIES: dict[str, dict] = {
    'coa': {
        'creates_accounts': True,
        'creates_hierarchy': True,
        'creates_balances': False,
        'requires_period': False,
        'requires_scenario': False,
        'suggests_fsli': False,
        'provides': ['account_number', 'account_name', 'account_type', 'normal_balance', 'parent_account_id'],
        'label': 'Chart of Accounts',
    },
    'tb': {
        'creates_accounts': True,
        'creates_hierarchy': False,
        'creates_balances': True,
        'requires_period': True,
        'requires_scenario': False,
        'suggests_fsli': True,
        'provides': ['account_number', 'account_name', 'period_balance', 'fsli_suggestion'],
        'label': 'Trial Balance',
    },
    'gl': {
        'creates_accounts': True,
        'creates_hierarchy': False,
        'creates_balances': True,  # derived
        'requires_period': True,
        'requires_scenario': False,
        'suggests_fsli': False,
        'provides': ['transactions', 'account_activity', 'journal_entries'],
        'label': 'General Ledger',
    },
    'fs': {
        'creates_accounts': False,
        'creates_hierarchy': False,
        'creates_balances': False,  # line-level only
        'requires_period': False,
        'requires_scenario': False,
        'suggests_fsli': True,
        'provides': ['fs_line_items', 'presentation_amounts'],
        'label': 'Financial Statement (PDF/Excel)',
    },
}


def get_readiness_status(entity_id: int, period_id: int | None, db: Session) -> dict:
    """
    Returns readiness matrix for an entity+period:
    {
      'coa_available': bool,
      'coa_account_count': int,
      'tb_available': bool,
      'tb_has_balances': bool,
      'gl_available': bool,
      'fs_available': bool,
      'taxonomy_mapped_pct': float,
      'unmapped_account_count': int,
      'ready_for_accounting_view': bool,
      'ready_for_fs_presentation': bool,
      'ready_for_bridge': bool,
      'ready_for_drilldown': bool,
      'missing_for_accounting_view': list[str],
      'missing_for_fs_presentation': list[str],
    }
    """
    from app.models.account import Account
    from app.models.import_batch import ImportBatch
    from app.models.journal_entry import JournalEntry
    from app.models.pdf_import_batch import PDFImportBatch
    from app.models.view_account_override import ViewAccountOverride

    # COA: count active accounts for this entity
    coa_count = db.query(Account).filter(Account.entity_id == entity_id).count()
    coa_available = coa_count > 0

    # TB: count posted ImportBatch rows for this entity (+ optionally this period)
    tb_q = db.query(ImportBatch).filter(
        ImportBatch.entity_id == entity_id,
        ImportBatch.status == "posted",
    )
    if period_id is not None:
        tb_q = tb_q.filter(ImportBatch.period_id == period_id)
    tb_count = tb_q.count()
    tb_available = tb_count > 0
    tb_has_balances = tb_available

    # GL: posted JournalEntries where source='gl_import' for this entity (+ optionally period)
    gl_q = db.query(JournalEntry).filter(
        JournalEntry.entity_id == entity_id,
        JournalEntry.status == "posted",
        JournalEntry.source == "gl_import",
    )
    gl_count = gl_q.count()
    gl_available = gl_count > 0

    # FS: count PDFImportBatch rows in "applied" status for this entity
    fs_count = (
        db.query(PDFImportBatch)
        .filter(
            PDFImportBatch.entity_id == entity_id,
            PDFImportBatch.status == "applied",
        )
        .count()
    )
    fs_available = fs_count > 0

    # Taxonomy mapping %: accounts with non-null FSLI mapping
    # Check both ViewAccountOverride (entity-scoped) AND Account.reporting_taxonomy_line_id as fallback
    if coa_count > 0:
        # Accounts with a ViewAccountOverride mapping
        override_mapped = (
            db.query(ViewAccountOverride.account_id)
            .join(Account, Account.id == ViewAccountOverride.account_id)
            .filter(
                Account.entity_id == entity_id,
                ViewAccountOverride.taxonomy_line_id.isnot(None),
            )
            .distinct()
            .subquery()
        )
        # Accounts mapped directly on Account.reporting_taxonomy_line_id (but NOT in override)
        direct_mapped = (
            db.query(Account.id)
            .filter(
                Account.entity_id == entity_id,
                Account.reporting_taxonomy_line_id.isnot(None),
                Account.id.notin_(db.query(override_mapped.c.account_id)),
            )
            .distinct()
            .subquery()
        )
        # Union count
        override_count = db.query(override_mapped).count()
        direct_count = db.query(direct_mapped).count()
        mapped_count = override_count + direct_count
        taxonomy_mapped_pct = round((mapped_count / coa_count) * 100, 1)
        unmapped_account_count = coa_count - mapped_count
    else:
        taxonomy_mapped_pct = 0.0
        unmapped_account_count = 0

    # Readiness gates
    ready_for_accounting_view = coa_available and tb_has_balances
    ready_for_fs_presentation = coa_available and tb_has_balances and taxonomy_mapped_pct >= 80.0
    ready_for_bridge = coa_available and tb_has_balances
    ready_for_drilldown = coa_available and tb_has_balances and gl_available

    # What's missing explanations
    missing_for_accounting_view: list[str] = []
    if not coa_available:
        missing_for_accounting_view.append("No Chart of Accounts — upload a COA file or TB to create accounts")
    if not tb_has_balances:
        missing_for_accounting_view.append("No posted Trial Balance — upload and post a TB to create period balances")

    missing_for_fs_presentation: list[str] = []
    if not coa_available:
        missing_for_fs_presentation.append("No Chart of Accounts")
    if not tb_has_balances:
        missing_for_fs_presentation.append("No posted Trial Balance")
    if taxonomy_mapped_pct < 80.0:
        missing_for_fs_presentation.append(
            f"Taxonomy mapping only {taxonomy_mapped_pct:.0f}% complete — need 80% to generate financial statements"
        )

    return {
        'coa_available': coa_available,
        'coa_account_count': coa_count,
        'tb_available': tb_available,
        'tb_has_balances': tb_has_balances,
        'gl_available': gl_available,
        'fs_available': fs_available,
        'taxonomy_mapped_pct': taxonomy_mapped_pct,
        'unmapped_account_count': unmapped_account_count,
        'ready_for_accounting_view': ready_for_accounting_view,
        'ready_for_fs_presentation': ready_for_fs_presentation,
        'ready_for_bridge': ready_for_bridge,
        'ready_for_drilldown': ready_for_drilldown,
        'missing_for_accounting_view': missing_for_accounting_view,
        'missing_for_fs_presentation': missing_for_fs_presentation,
    }
