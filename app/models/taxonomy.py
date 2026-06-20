"""
Taxonomy library models.

A Taxonomy is a complete reporting structure (US GAAP, IFRS, SaaS, etc.).
Each Taxonomy has many TaxonomyNodes arranged in a tree.

System taxonomies (is_system=True) are immutable; users clone them to edit.
User clones reference parent_taxonomy_id back to the system source.

This is distinct from the legacy reporting_taxonomy_lines/views — that system
remains for entity-specific FSLI mapping; this Taxonomy library is the
multi-taxonomy mapping foundation (an account can map into US GAAP + IFRS +
Industry + Management simultaneously).
"""
from sqlalchemy import (
    Boolean, Column, DateTime, Float, ForeignKey, Integer, String, Text,
    UniqueConstraint, func,
)
from sqlalchemy.orm import relationship
from app.database import Base


class Taxonomy(Base):
    __tablename__ = "taxonomies"
    __table_args__ = (
        UniqueConstraint("code", name="uq_taxonomy_lib_code"),
    )

    id = Column(Integer, primary_key=True)
    code = Column(String(50), nullable=False)
    name = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    industry = Column(String(50), nullable=True)
    version = Column(String(20), nullable=True)
    is_system = Column(Boolean, nullable=False, default=False)
    parent_taxonomy_id = Column(Integer, ForeignKey("taxonomies.id"), nullable=True)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)

    nodes = relationship("TaxonomyNode", back_populates="taxonomy", cascade="all, delete-orphan")


class TaxonomyNode(Base):
    __tablename__ = "taxonomy_nodes"
    __table_args__ = (
        UniqueConstraint("taxonomy_id", "code", name="uq_taxonomy_node_code"),
    )

    id = Column(Integer, primary_key=True)
    taxonomy_id = Column(Integer, ForeignKey("taxonomies.id", ondelete="CASCADE"), nullable=False)
    parent_id = Column(Integer, ForeignKey("taxonomy_nodes.id", ondelete="CASCADE"), nullable=True)
    code = Column(String(80), nullable=False)
    name = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    statement_type = Column(String(40), nullable=True)
    financial_statement_section = Column(String(50), nullable=True)
    normal_balance = Column(String(6), nullable=True)
    sort_order = Column(Integer, nullable=False, default=0)
    level = Column(Integer, nullable=False, default=0)
    is_active = Column(Boolean, nullable=False, default=True)
    is_system = Column(Boolean, nullable=False, default=False)
    gaap_reference = Column(String(120), nullable=True)
    ifrs_reference = Column(String(120), nullable=True)
    xbrl_tag = Column(String(150), nullable=True)
    cash_flow_classification = Column(String(20), nullable=True)
    consolidation_treatment = Column(String(30), nullable=True)
    kpi_eligible = Column(Boolean, nullable=False, default=False)
    industry = Column(String(50), nullable=True)
    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)

    taxonomy = relationship("Taxonomy", back_populates="nodes")
    children = relationship(
        "TaxonomyNode",
        backref="parent",
        remote_side=[id],
        cascade="all, delete-orphan",
        single_parent=True,
    )


class AccountTaxonomyMapping(Base):
    """
    Maps an Account to a TaxonomyNode within a Taxonomy.

    One account may have many mappings — one per taxonomy. The unique constraint
    enforces (account_id, taxonomy_id) — an account maps to exactly one node
    per taxonomy.
    """
    __tablename__ = "account_taxonomy_mappings"
    __table_args__ = (
        UniqueConstraint("account_id", "taxonomy_id", name="uq_account_taxonomy"),
    )

    id = Column(Integer, primary_key=True)
    account_id = Column(Integer, ForeignKey("accounts.id", ondelete="CASCADE"), nullable=False)
    taxonomy_id = Column(Integer, ForeignKey("taxonomies.id", ondelete="CASCADE"), nullable=False)
    taxonomy_node_id = Column(Integer, ForeignKey("taxonomy_nodes.id", ondelete="CASCADE"), nullable=False)
    mapping_type = Column(String(30), nullable=False, default="manual")
    confidence_score = Column(Float, nullable=True)
    mapped_by = Column(Integer, nullable=True)
    mapping_source = Column(String(40), nullable=False, default="user_selected")
    is_primary = Column(Boolean, nullable=False, default=False)
    effective_date = Column(DateTime, nullable=True)
    end_date = Column(DateTime, nullable=True)
    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)
