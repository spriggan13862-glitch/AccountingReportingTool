from sqlalchemy import CheckConstraint, Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.sql import func

from app.database import Base


class AdjustmentPackage(Base):
    __tablename__ = "adjustment_packages"
    __table_args__ = (
        CheckConstraint(
            "package_type IN ('audit','management','tax','qoe','seller','buyer')",
            name="ck_pkg_type",
        ),
        CheckConstraint(
            "status IN ('open','review','finalized')",
            name="ck_pkg_status",
        ),
    )

    id = Column(Integer, primary_key=True)
    organization_id = Column(String(100), nullable=False)
    name = Column(String(200), nullable=False)
    package_type = Column(String(50), nullable=False, default="audit")
    status = Column(String(50), nullable=False, default="open")
    description = Column(Text, nullable=True)
    created_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, nullable=False, server_default=func.now())
    updated_at = Column(DateTime, nullable=True)


class AdjustmentPackageMembership(Base):
    __tablename__ = "adjustment_package_memberships"

    id = Column(Integer, primary_key=True)
    package_id = Column(Integer, ForeignKey("adjustment_packages.id", ondelete="CASCADE"), nullable=False)
    journal_entry_id = Column(Integer, ForeignKey("journal_entries.id", ondelete="CASCADE"), nullable=False)
    added_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    added_at = Column(DateTime, nullable=False, server_default=func.now())


class AdjustmentAdvisorNote(Base):
    __tablename__ = "adjustment_advisor_notes"
    __table_args__ = (
        CheckConstraint(
            "resolution_status IN ('open','pending_client','resolved','na')",
            name="ck_note_resolution",
        ),
    )

    id = Column(Integer, primary_key=True)
    journal_entry_id = Column(Integer, ForeignKey("journal_entries.id", ondelete="CASCADE"), nullable=False, unique=True)
    issue = Column(Text, nullable=True)
    recommendation = Column(Text, nullable=True)
    client_response = Column(Text, nullable=True)
    resolution_status = Column(String(50), nullable=False, default="open")
    updated_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    updated_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, nullable=False, server_default=func.now())
