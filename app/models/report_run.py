from sqlalchemy import Column, DateTime, ForeignKey, Index, Integer, String, Text
from sqlalchemy.sql import func

from app.database import Base

REPORT_STATUSES = frozenset({"pending", "running", "completed", "failed"})
OUTPUT_FORMATS = frozenset({"xlsx", "csv", "json"})
REPORT_TYPES = frozenset({
    "trial_balance",
    "comparative_trial_balance",
    "balance_sheet",
    "income_statement",
    "consolidated_trial_balance",
    "consolidated_balance_sheet",
    "consolidated_income_statement",
    "close_package",
    "lender_package",
    "audit_support_package",
    "qoe_package",
})

# Maps report type → document_type in the documents table
REPORT_TYPE_DOC_TYPE = {
    "trial_balance": "workpaper",
    "comparative_trial_balance": "workpaper",
    "balance_sheet": "workpaper",
    "income_statement": "workpaper",
    "consolidated_trial_balance": "workpaper",
    "consolidated_balance_sheet": "workpaper",
    "consolidated_income_statement": "workpaper",
    "close_package": "workpaper",
    "lender_package": "lender_support",
    "audit_support_package": "audit_support",
    "qoe_package": "other",
}


class ReportRun(Base):
    """
    Persists metadata for every report generation attempt.
    The generated file lives in storage; this record points to it.
    Supports reruns: create a new run from the same parameters.
    """
    __tablename__ = "report_runs"
    __table_args__ = (
        Index("idx_report_runs_org", "organization_id"),
        Index("idx_report_runs_entity", "entity_id"),
        Index("idx_report_runs_status", "organization_id", "status"),
    )

    id = Column(Integer, primary_key=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False)
    created_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    report_type = Column(String(100), nullable=False)
    output_format = Column(String(50), nullable=False, default="xlsx")
    status = Column(String(50), nullable=False, default="pending")
    entity_id = Column(Integer, ForeignKey("entities.id"), nullable=True)
    accounting_period_id = Column(Integer, ForeignKey("accounting_periods.id"), nullable=True)
    scenario_ids_json = Column(String(500), nullable=True)     # JSON array of ints
    parameters_json = Column(Text, nullable=True)              # arbitrary JSON params
    storage_path = Column(String(1000), nullable=True)         # set on completion
    validation_summary_json = Column(Text, nullable=True)      # set on completion
    workflow_summary_json = Column(Text, nullable=True)        # set on completion
    generated_document_id = Column(Integer, ForeignKey("documents.id"), nullable=True)
    created_at = Column(DateTime, nullable=False, server_default=func.now())
    completed_at = Column(DateTime, nullable=True)
