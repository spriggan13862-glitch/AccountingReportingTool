"""
Accounting Intelligence Repository — Static Knowledge Base
Sprint 3.13: 212 issue templates across 26 categories.

Category source files live in docs/accounting_intelligence/ and are loaded
at module import time via importlib. The merged ISSUE_REPOSITORY list is the
single source of truth consumed by the service layer.
"""
import importlib.util
import pathlib
import types

_DOCS_DIR = pathlib.Path(__file__).resolve().parents[2] / "docs" / "accounting_intelligence"


def _load(filename: str) -> types.ModuleType:
    path = _DOCS_DIR / filename
    spec = importlib.util.spec_from_file_location(filename[:-3], path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


_rev   = _load("REV_revenue_recognition.py").REVENUE_RECOGNITION
_ar    = _load("AR_accounts_receivable.py").ACCOUNTS_RECEIVABLE
_inv   = _load("INV_inventory.py").INVENTORY
_cash  = _load("CASH_cash_management.py").CASH_MANAGEMENT
_ap    = _load("AP_accounts_payable.py").ACCOUNTS_PAYABLE
_acl   = _load("ACL_accrued_liabilities.py").ACCRUED_LIABILITIES
_fa    = _load("FA_fixed_assets.py").FIXED_ASSETS
_ia    = _load("IA_intangible_assets.py").INTANGIBLE_ASSETS
_lease = _load("LEASE_leases.py").LEASES
_debt  = _load("DEBT_debt_obligations.py").DEBT_OBLIGATIONS
_eq    = _load("EQ_equity.py").EQUITY
_tax   = _load("TAX_income_tax.py").INCOME_TAX
_pay   = _load("PAY_payroll.py").PAYROLL
_wc    = _load("WC_working_capital.py").WORKING_CAPITAL
_gm    = _load("GM_gross_margin.py").GROSS_MARGIN
_opex  = _load("OPEX_operating_expenses.py").OPERATING_EXPENSES
_ebit  = _load("EBITDA_ebitda_quality.py").EBITDA_QUALITY
_qoe   = _load("QOE_quality_of_earnings.py").QUALITY_OF_EARNINGS
_sba   = _load("SBA_sba_compliance.py").SBA_COMPLIANCE
_rp    = _load("RP_related_party.py").RELATED_PARTY
_cf    = _load("CF_cash_flow.py").CASH_FLOW_STATEMENT
_fr    = _load("FR_financial_reporting.py").FINANCIAL_REPORTING
_disc  = _load("DISC_disclosures.py").DISCLOSURES
_pres  = _load("PRES_presentation.py").PRESENTATION
_fraud = _load("FRAUD_fraud_indicators.py").FRAUD_INDICATORS
_ind   = _load("IND_industry_specific.py").INDUSTRY_SPECIFIC

ISSUE_REPOSITORY: list[dict] = (
    _rev + _ar + _inv + _cash + _ap + _acl + _fa + _ia + _lease +
    _debt + _eq + _tax + _pay + _wc + _gm + _opex + _ebit + _qoe +
    _sba + _rp + _cf + _fr + _disc + _pres + _fraud + _ind
)
