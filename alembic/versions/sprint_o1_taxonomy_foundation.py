"""Sprint O1: Taxonomy library foundation

Adds taxonomies, taxonomy_nodes, account_taxonomy_mappings tables.
Merges existing migration heads (sprint_a_domain_model_fsli_mapping +
sprint_h_locked_field).

Revision ID: sprint_o1_taxonomy_foundation
Revises: sprint_a_domain_model_fsli_mapping, sprint_h_locked_field
Create Date: 2026-06-20
"""
from alembic import op
import sqlalchemy as sa


revision = "sprint_o1_taxonomy_foundation"
down_revision = ("sprint_a_domain_model_fsli_mapping", "sprint_h_locked_field")
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "taxonomies",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("code", sa.String(50), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("industry", sa.String(50), nullable=True),
        sa.Column("version", sa.String(20), nullable=True),
        sa.Column("is_system", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("parent_taxonomy_id", sa.Integer(), sa.ForeignKey("taxonomies.id"), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("code", name="uq_taxonomy_lib_code"),
    )

    op.create_table(
        "taxonomy_nodes",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("taxonomy_id", sa.Integer(), sa.ForeignKey("taxonomies.id", ondelete="CASCADE"), nullable=False),
        sa.Column("parent_id", sa.Integer(), sa.ForeignKey("taxonomy_nodes.id", ondelete="CASCADE"), nullable=True),
        sa.Column("code", sa.String(80), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("statement_type", sa.String(40), nullable=True),
        sa.Column("financial_statement_section", sa.String(50), nullable=True),
        sa.Column("normal_balance", sa.String(6), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("level", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("is_system", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("gaap_reference", sa.String(120), nullable=True),
        sa.Column("ifrs_reference", sa.String(120), nullable=True),
        sa.Column("xbrl_tag", sa.String(150), nullable=True),
        sa.Column("cash_flow_classification", sa.String(20), nullable=True),
        sa.Column("consolidation_treatment", sa.String(30), nullable=True),
        sa.Column("kpi_eligible", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("industry", sa.String(50), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("taxonomy_id", "code", name="uq_taxonomy_node_code"),
    )
    op.create_index("ix_taxonomy_nodes_taxonomy_id", "taxonomy_nodes", ["taxonomy_id"])
    op.create_index("ix_taxonomy_nodes_parent_id", "taxonomy_nodes", ["parent_id"])

    op.create_table(
        "account_taxonomy_mappings",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("account_id", sa.Integer(), sa.ForeignKey("accounts.id", ondelete="CASCADE"), nullable=False),
        sa.Column("taxonomy_id", sa.Integer(), sa.ForeignKey("taxonomies.id", ondelete="CASCADE"), nullable=False),
        sa.Column("taxonomy_node_id", sa.Integer(), sa.ForeignKey("taxonomy_nodes.id", ondelete="CASCADE"), nullable=False),
        sa.Column("mapping_type", sa.String(30), nullable=False, server_default="manual"),
        sa.Column("confidence_score", sa.Float(), nullable=True),
        sa.Column("mapped_by", sa.Integer(), nullable=True),
        sa.Column("mapping_source", sa.String(40), nullable=False, server_default="user_selected"),
        sa.Column("is_primary", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("effective_date", sa.DateTime(), nullable=True),
        sa.Column("end_date", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("account_id", "taxonomy_id", name="uq_account_taxonomy"),
    )
    op.create_index("ix_account_taxonomy_mappings_account_id", "account_taxonomy_mappings", ["account_id"])
    op.create_index("ix_account_taxonomy_mappings_taxonomy_id", "account_taxonomy_mappings", ["taxonomy_id"])
    op.create_index("ix_account_taxonomy_mappings_node_id", "account_taxonomy_mappings", ["taxonomy_node_id"])


def downgrade() -> None:
    op.drop_index("ix_account_taxonomy_mappings_node_id", table_name="account_taxonomy_mappings")
    op.drop_index("ix_account_taxonomy_mappings_taxonomy_id", table_name="account_taxonomy_mappings")
    op.drop_index("ix_account_taxonomy_mappings_account_id", table_name="account_taxonomy_mappings")
    op.drop_table("account_taxonomy_mappings")
    op.drop_index("ix_taxonomy_nodes_parent_id", table_name="taxonomy_nodes")
    op.drop_index("ix_taxonomy_nodes_taxonomy_id", table_name="taxonomy_nodes")
    op.drop_table("taxonomy_nodes")
    op.drop_table("taxonomies")
