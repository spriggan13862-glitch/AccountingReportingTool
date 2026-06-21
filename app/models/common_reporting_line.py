"""
Common Reporting Line (CRL) layer — primary reporting classification.

Architecture (5 layers):
  Source Account → Entity COA → CRL → Taxonomy Node(s) → Reporting View → FS

CRL is industry-neutral. Industry-specific detail lives in the Taxonomy
layer beneath. One CRL can map to MANY Taxonomy Nodes (e.g. CRL_REVENUE
maps to product / service / subscription / healthcare patient revenue /
construction contract revenue).

Per the architecture v2 spec:
  - `code` is immutable system identifier (CRL_CASH, CRL_AR, ...).
  - `name` is user-editable display label.
  - All downstream logic (FS, consolidation, bridge, KPI) references
    `code`, never `name`.
  - Two mandatory system CRLs (UNCLASSIFIED, NEEDS_REVIEW) — no posted
    account ever has NULL common_reporting_line_id.
"""
from sqlalchemy import (
    Boolean, Column, DateTime, Float, ForeignKey, Integer, String, Text,
    UniqueConstraint, func,
)
from sqlalchemy.orm import relationship
from app.database import Base


class CommonReportingLine(Base):
    __tablename__ = "common_reporting_lines"
    __table_args__ = (
        UniqueConstraint("organization_id", "code", name="uq_crl_org_code"),
    )

    id = Column(Integer, primary_key=True)

    # Immutable. Used by report logic, migrations, templates, rollups.
    # Service layer enforces no-update; database stores plain VARCHAR.
    code = Column(String(80), nullable=False)

    # Editable display label.
    name = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)

    # Self-FK for sub-line hierarchy (e.g. Salaries under Payroll Expense).
    parent_crl_id = Column(Integer, ForeignKey("common_reporting_lines.id"), nullable=True)

    statement_type = Column(String(40), nullable=False)
    section = Column(String(50), nullable=False)
    normal_balance = Column(String(6), nullable=True)
    sort_order = Column(Integer, nullable=False, default=0)

    is_system = Column(Boolean, nullable=False, default=True)
    is_mandatory = Column(Boolean, nullable=False, default=False)
    is_active = Column(Boolean, nullable=False, default=True)

    # NULL = system catalog; non-null = org-specific clone (clone-on-edit).
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=True)

    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)

    aliases = relationship(
        "CommonReportingLineAlias",
        back_populates="crl",
        cascade="all, delete-orphan",
    )
    taxonomy_nodes = relationship(
        "CommonReportingLineTaxonomyNode",
        back_populates="crl",
        cascade="all, delete-orphan",
    )


class CommonReportingLineAlias(Base):
    """Keyword hints for the rule engine. Higher weight = stronger match."""
    __tablename__ = "common_reporting_line_aliases"
    __table_args__ = (
        UniqueConstraint("crl_id", "alias", name="uq_crl_alias"),
    )

    id = Column(Integer, primary_key=True)
    crl_id = Column(Integer, ForeignKey("common_reporting_lines.id", ondelete="CASCADE"), nullable=False)
    alias = Column(String(200), nullable=False)
    weight = Column(Float, nullable=False, default=1.0)
    created_at = Column(DateTime, server_default=func.now(), nullable=False)

    crl = relationship("CommonReportingLine", back_populates="aliases")


class CommonReportingLineTaxonomyNode(Base):
    """
    Junction supporting one-to-many CRL → Taxonomy Node.

    A single CRL (e.g. CRL_REVENUE) maps to several taxonomy nodes
    across taxonomies — Product / Service / Subscription Revenue under
    US GAAP, plus Healthcare Patient Revenue, plus Construction
    Contract Revenue. The mapping rules for industry templates wire
    multiple nodes to the same CRL.

    `is_primary` marks the canonical node for back-translation
    (CRL → preferred TaxonomyNode for legacy back-compat).
    """
    __tablename__ = "common_reporting_line_taxonomy_nodes"
    __table_args__ = (
        UniqueConstraint("crl_id", "taxonomy_node_code", name="uq_crl_taxonomy_node_code"),
    )

    id = Column(Integer, primary_key=True)
    crl_id = Column(Integer, ForeignKey("common_reporting_lines.id", ondelete="CASCADE"), nullable=False)

    # We store by node CODE (not node id) so links survive re-seeding the
    # taxonomy. The resolver service joins to taxonomy_nodes at query time.
    taxonomy_node_code = Column(String(80), nullable=False)

    is_primary = Column(Boolean, nullable=False, default=False)
    sort_order = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime, server_default=func.now(), nullable=False)

    crl = relationship("CommonReportingLine", back_populates="taxonomy_nodes")


class ReportingTemplate(Base):
    """
    Industry/scope template that exposes a CRL subset (does NOT modify
    the underlying CRL catalog).
    """
    __tablename__ = "reporting_templates"
    __table_args__ = (
        UniqueConstraint("organization_id", "code", name="uq_template_org_code"),
    )

    id = Column(Integer, primary_key=True)
    code = Column(String(80), nullable=False)
    name = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    is_system = Column(Boolean, nullable=False, default=True)
    is_active = Column(Boolean, nullable=False, default=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=True)
    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)

    template_crls = relationship(
        "ReportingTemplateCrl",
        back_populates="template",
        cascade="all, delete-orphan",
    )


class ReportingTemplateCrl(Base):
    """Junction — which CRLs a template exposes, in what order, with optional label override."""
    __tablename__ = "reporting_template_crls"
    __table_args__ = (
        UniqueConstraint("template_id", "crl_id", name="uq_template_crl"),
    )

    id = Column(Integer, primary_key=True)
    template_id = Column(Integer, ForeignKey("reporting_templates.id", ondelete="CASCADE"), nullable=False)
    crl_id = Column(Integer, ForeignKey("common_reporting_lines.id", ondelete="CASCADE"), nullable=False)
    is_visible = Column(Boolean, nullable=False, default=True)
    sort_order = Column(Integer, nullable=False, default=0)
    display_label = Column(String(200), nullable=True)
    created_at = Column(DateTime, server_default=func.now(), nullable=False)

    template = relationship("ReportingTemplate", back_populates="template_crls")
    crl = relationship("CommonReportingLine")
