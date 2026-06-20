"""
Compute NI Impact and BS Impact from JE lines.
Uses balance engine — no hardcoded impact maps.
"""
from app.services.balance_engine import get_accounting_signed_balance, get_presentation_amount
from app.models.account import Account
from app.models.journal_entry_line import JournalEntryLine

IS_TYPES = {'revenue', 'cogs', 'expense', 'other_income', 'other_expense'}
BS_TYPES = {'asset', 'liability', 'equity', 'contra_asset', 'contra_equity', 'contra_revenue'}


def compute_je_impact(je_id: int, db) -> dict:
    """
    Compute the NI and BS impact of a journal entry from its lines.

    NI Impact: sum of presentation amounts for IS account lines
      - Revenue credit → positive NI (increases net income)
      - Expense debit → negative NI (decreases net income)
      - COGS debit → negative NI

    BS Impact: net balance sheet effect
      - Asset debit → positive BS impact (increases assets)
      - Liability credit → negative BS impact (increases liabilities)
      - Equity credit → positive BS impact

    Returns:
    {
      'ni_impact': float,
      'bs_impact': float,
      'asset_impact': float,
      'liability_impact': float,
      'equity_impact': float,
      'line_details': list[dict],
    }
    """
    lines = db.query(JournalEntryLine).filter_by(journal_entry_id=je_id).all()
    account_ids = [l.account_id for l in lines]
    accounts = {a.id: a for a in db.query(Account).filter(Account.id.in_(account_ids)).all()}

    ni_impact = 0.0
    asset_impact = 0.0
    liability_impact = 0.0
    equity_impact = 0.0
    line_details = []

    for line in lines:
        acct = accounts.get(line.account_id)
        if not acct:
            continue

        acct_type = acct.account_type.lower()
        accounting_bal = get_accounting_signed_balance(
            acct_type, float(line.debit or 0), float(line.credit or 0)
        )
        pres_amount = get_presentation_amount(acct_type, accounting_bal)

        if acct_type in IS_TYPES:
            if acct_type in {'revenue', 'other_income'}:
                ni_impact += pres_amount
            else:
                ni_impact -= pres_amount

        if acct_type in {'asset', 'contra_asset'}:
            asset_impact += accounting_bal
        elif acct_type == 'liability':
            liability_impact += accounting_bal
        elif acct_type in {'equity', 'contra_equity'}:
            equity_impact += accounting_bal

        line_details.append({
            'account_id': line.account_id,
            'account_number': acct.account_number,
            'account_name': acct.account_name,
            'account_type': acct_type,
            'debit': float(line.debit or 0),
            'credit': float(line.credit or 0),
            'accounting_balance': accounting_bal,
            'presentation_amount': pres_amount,
        })

    bs_impact = asset_impact - liability_impact + equity_impact

    return {
        'ni_impact': ni_impact,
        'bs_impact': bs_impact,
        'asset_impact': asset_impact,
        'liability_impact': liability_impact,
        'equity_impact': equity_impact,
        'line_details': line_details,
    }
