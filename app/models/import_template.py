from sqlalchemy import (
    JSON, Boolean, Column, DateTime, ForeignKey,
    Index, Integer, String, Text,
)
from sqlalchemy.sql import func

from app.database import Base


class ImportTemplate(Base):
    """
    Reusable column-mapping template for recurring imports from the same source.

    Examples: "QuickBooks Desktop", "QBO Trial Balance", "NetSuite GL Export".
    Stores the column_mapping dict and source_format so users don't have to
    re-configure mappings every time they import from the same system.
    """
    __tablename__ = "import_templates"
    __table_args__ = (
        Index("idx_itemplate_org", "organization_id"),
    )

    id = Column(Integer, primary_key=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False)

    name = Column(String(100), nullable=False)
    description = Column(Text, nullable=True)
    source_format = Column(String(20), nullable=False, default="csv")

    # column_mapping: {"standard_field": "source_column_header"}
    column_mapping = Column(JSON, nullable=False, default=dict)

    is_active = Column(Boolean, nullable=False, default=True)
    created_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, nullable=False, server_default=func.now())
    updated_at = Column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())
