from sqlalchemy import Boolean, CheckConstraint, Column, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.database import Base


class AdvisorScenario(Base):
    __tablename__ = "advisor_scenarios"
    __table_args__ = (
        CheckConstraint(
            "scenario_type IN ('as_reported','management','management_tax','management_tax_qoe','sba','custom')",
            name="ck_adv_scenario_type",
        ),
    )

    id = Column(Integer, primary_key=True)
    organization_id = Column(String(100), nullable=False)
    name = Column(String(200), nullable=False)
    scenario_type = Column(String(50), nullable=False, default="custom")
    description = Column(Text, nullable=True)
    created_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, nullable=False, server_default=func.now())
    updated_at = Column(DateTime, nullable=True)

    packages = relationship(
        "AdvisorScenarioPackage",
        cascade="all, delete-orphan",
        order_by="AdvisorScenarioPackage.include_order",
    )


class AdvisorScenarioPackage(Base):
    __tablename__ = "advisor_scenario_packages"
    __table_args__ = (
        UniqueConstraint("scenario_id", "package_id", name="uq_adv_scen_pkg"),
    )

    id = Column(Integer, primary_key=True)
    scenario_id = Column(Integer, ForeignKey("advisor_scenarios.id", ondelete="CASCADE"), nullable=False)
    package_id = Column(Integer, ForeignKey("adjustment_packages.id", ondelete="CASCADE"), nullable=False)
    included = Column(Boolean, nullable=False, default=True)
    include_order = Column(Integer, nullable=False, default=0)
