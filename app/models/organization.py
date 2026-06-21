from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String
from sqlalchemy.sql import func

from app.database import Base


class Organization(Base):
    __tablename__ = "organizations"

    id = Column(Integer, primary_key=True)
    name = Column(String(200), nullable=False)
    slug = Column(String(100), nullable=False, unique=True)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, nullable=False, server_default=func.now())
    # CRL-B: which reporting template this org is using by default
    # (drives the wizard's CRL picker subset and report layouts).
    active_reporting_template_id = Column(
        Integer, ForeignKey("reporting_templates.id"), nullable=True,
    )
