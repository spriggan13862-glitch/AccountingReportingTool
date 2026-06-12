from sqlalchemy import (
    CheckConstraint, Column, DateTime, ForeignKey,
    Index, Integer, String, Text,
)
from sqlalchemy.sql import func

from app.database import Base


class DeliverablePackage(Base):
    __tablename__ = "deliverable_packages"
    __table_args__ = (
        CheckConstraint(
            "package_type IN ('audit','advisor','management','tax','qoe','close','lender','custom')",
            name="ck_dp_package_type",
        ),
        CheckConstraint(
            "status IN ('draft','internal_review','client_review','finalized','archived')",
            name="ck_dp_status",
        ),
        Index("idx_dp_org", "organization_id"),
        Index("idx_dp_status", "status"),
    )

    id = Column(Integer, primary_key=True)
    organization_id = Column(String(100), nullable=False)
    name = Column(String(200), nullable=False)
    package_type = Column(String(50), nullable=False, default="custom")
    status = Column(String(50), nullable=False, default="draft")
    description = Column(Text, nullable=True)
    owner = Column(String(200), nullable=True)
    reporting_view_id = Column(
        Integer,
        ForeignKey("reporting_taxonomy_views.id", ondelete="SET NULL"),
        nullable=True,
    )
    created_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, nullable=False, server_default=func.now())
    updated_at = Column(DateTime, nullable=True)


class DeliverablePackageItem(Base):
    __tablename__ = "deliverable_package_items"
    __table_args__ = (
        CheckConstraint(
            "item_type IN ('journal_entry','adjustment_set','report','financial_statement','document','reconciliation','workpaper')",
            name="ck_dpi_item_type",
        ),
        Index("idx_dpi_package", "package_id"),
    )

    id = Column(Integer, primary_key=True)
    package_id = Column(
        Integer,
        ForeignKey("deliverable_packages.id", ondelete="CASCADE"),
        nullable=False,
    )
    item_type = Column(String(50), nullable=False)
    item_ref = Column(String(200), nullable=False)
    item_label = Column(String(500), nullable=True)
    added_at = Column(DateTime, nullable=False, server_default=func.now())
    added_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)


class DeliverableMemo(Base):
    __tablename__ = "deliverable_memos"
    __table_args__ = (
        CheckConstraint(
            "status IN ('open','pending_client','resolved','na')",
            name="ck_dm_status",
        ),
        Index("idx_dm_package", "package_id"),
    )

    id = Column(Integer, primary_key=True)
    package_id = Column(
        Integer,
        ForeignKey("deliverable_packages.id", ondelete="CASCADE"),
        nullable=False,
    )
    issue = Column(Text, nullable=True)
    observation = Column(Text, nullable=True)
    recommendation = Column(Text, nullable=True)
    client_response = Column(Text, nullable=True)
    status = Column(String(50), nullable=False, default="open")
    created_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, nullable=False, server_default=func.now())
    updated_at = Column(DateTime, nullable=True)
