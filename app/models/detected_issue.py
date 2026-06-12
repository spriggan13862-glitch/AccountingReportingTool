from sqlalchemy import (
    Boolean, CheckConstraint, Column, DateTime, ForeignKey,
    Index, Integer, String, Text,
)
from sqlalchemy.sql import func

from app.database import Base

ISSUE_SEVERITIES = ("informational", "low", "moderate", "high", "critical")
ISSUE_STATUSES = ("open", "acknowledged", "resolved", "dismissed")


class DetectedIssue(Base):
    """
    An accounting issue detected by the intelligence engine for a specific
    entity and period pair. Immutable once created — status updates only.
    """
    __tablename__ = "detected_issues"
    __table_args__ = (
        Index("idx_det_issue_entity_period", "entity_id", "current_period_id"),
        Index("idx_det_issue_run", "run_id"),
        Index("idx_det_issue_severity", "severity", "status"),
        CheckConstraint(
            "severity IN ('informational','low','moderate','high','critical')",
            name="ck_det_issue_severity",
        ),
        CheckConstraint(
            "status IN ('open','acknowledged','resolved','dismissed')",
            name="ck_det_issue_status",
        ),
    )

    id = Column(Integer, primary_key=True)
    run_id = Column(String(36), nullable=False)                         # UUID for detection run grouping
    entity_id = Column(Integer, ForeignKey("entities.id"), nullable=False)
    current_period_id = Column(Integer, ForeignKey("accounting_periods.id"), nullable=False)
    comparison_period_id = Column(Integer, ForeignKey("accounting_periods.id"), nullable=True)

    issue_code = Column(String(100), nullable=False)                    # e.g. AR_GROWTH_EXCEEDS_REVENUE
    category = Column(String(100), nullable=False)                      # e.g. accounts_receivable
    severity = Column(String(50), nullable=False, default="moderate")
    title = Column(String(500), nullable=False)
    description = Column(Text, nullable=False)
    detection_trigger = Column(Text, nullable=True)                     # human-readable trigger explanation
    affected_accounts_json = Column(Text, nullable=True)                # JSON: list of account IDs
    supporting_metrics_json = Column(Text, nullable=True)               # JSON: dict metric -> value

    suggested_procedures = Column(Text, nullable=True)
    suggested_ajes = Column(Text, nullable=True)

    # Future AI narrative fields (architecture stored, not populated)
    narrative_prompt = Column(Text, nullable=True)
    narrative_output = Column(Text, nullable=True)
    ai_explanation = Column(Text, nullable=True)
    management_questions = Column(Text, nullable=True)

    status = Column(String(50), nullable=False, default="open")
    is_suppressed = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime, nullable=False, server_default=func.now())
    acknowledged_at = Column(DateTime, nullable=True)
    resolved_at = Column(DateTime, nullable=True)


class IssueDetectionThreshold(Base):
    """
    Configurable thresholds for issue detection rules.
    One row per (entity, issue_code) pair; falls back to entity_id=NULL as default.
    """
    __tablename__ = "issue_detection_thresholds"
    __table_args__ = (
        Index("idx_thresh_entity_code", "entity_id", "issue_code"),
        CheckConstraint(
            "threshold_type IN ('pct_change','absolute','ratio','pp_change')",
            name="ck_thresh_type",
        ),
    )

    id = Column(Integer, primary_key=True)
    entity_id = Column(Integer, ForeignKey("entities.id"), nullable=True)   # NULL = global default
    issue_code = Column(String(100), nullable=False)
    threshold_type = Column(String(50), nullable=False)                      # pct_change|absolute|ratio|pp_change
    threshold_value = Column(String(50), nullable=False)                     # stored as string, parsed at runtime
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, nullable=False, server_default=func.now())
