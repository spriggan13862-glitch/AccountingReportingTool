from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.sql import func

from app.database import Base


class ViewAccountOverride(Base):
    """
    Per-view override of an account's taxonomy line mapping.

    When view_id is active, this account maps to taxonomy_line_id instead of
    Account.reporting_taxonomy_line_id. Enables GAAP vs QoE vs Management
    re-classification without duplicating accounting data.
    """
    __tablename__ = "view_account_overrides"
    __table_args__ = (
        UniqueConstraint("entity_id", "view_id", "account_id", name="uq_vao_entity_view_account"),
    )

    id = Column(Integer, primary_key=True)
    entity_id = Column(
        Integer,
        ForeignKey("entities.id", ondelete="CASCADE"),
        nullable=True,
    )
    view_id = Column(
        Integer,
        ForeignKey("reporting_taxonomy_views.id", ondelete="CASCADE"),
        nullable=False,
    )
    account_id = Column(
        Integer,
        ForeignKey("accounts.id", ondelete="CASCADE"),
        nullable=False,
    )
    taxonomy_line_id = Column(
        Integer,
        ForeignKey("reporting_taxonomy_lines.id"),
        nullable=True,
    )
    display_label = Column(String(255), nullable=True)
    created_by = Column(String(100), nullable=True)
    created_at = Column(DateTime, nullable=False, server_default=func.now())
    updated_at = Column(DateTime, nullable=True)
