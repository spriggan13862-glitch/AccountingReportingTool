"""CRL-B: Common Reporting Line layer tables

Adds 5 tables:
  common_reporting_lines
  common_reporting_line_aliases
  common_reporting_line_taxonomy_nodes (one-to-many CRL → Taxonomy junction)
  reporting_templates
  reporting_template_crls

Adds columns:
  accounts.common_reporting_line_id  + accounts.crl_state
  import_lines.selected_common_reporting_line_id
  organizations.active_reporting_template_id

Per CRL architecture v2 + final requirements:
  - `code` is immutable system identifier (enforced at app layer).
  - Sub-line hierarchy via parent_crl_id self-FK.
  - One CRL → many Taxonomy Nodes via the junction.
  - Templates expose CRL subsets without changing the catalog.

Revision ID: crl_b_common_reporting_line_layer
Revises: agent_tb_simplify_fsli_staging
Create Date: 2026-06-21
"""
from alembic import op
import sqlalchemy as sa


revision = "crl_b_common_reporting_line_layer"
down_revision = "agent_tb_simplify_fsli_staging"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "common_reporting_lines",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("code", sa.String(80), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("parent_crl_id", sa.Integer(), sa.ForeignKey("common_reporting_lines.id"), nullable=True),
        sa.Column("statement_type", sa.String(40), nullable=False),
        sa.Column("section", sa.String(50), nullable=False),
        sa.Column("normal_balance", sa.String(6), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("is_system", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("is_mandatory", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("organization_id", sa.Integer(), sa.ForeignKey("organizations.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("organization_id", "code", name="uq_crl_org_code"),
    )
    op.create_index("ix_crl_section", "common_reporting_lines", ["section"])
    op.create_index("ix_crl_parent_id", "common_reporting_lines", ["parent_crl_id"])

    op.create_table(
        "common_reporting_line_aliases",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("crl_id", sa.Integer(), sa.ForeignKey("common_reporting_lines.id", ondelete="CASCADE"), nullable=False),
        sa.Column("alias", sa.String(200), nullable=False),
        sa.Column("weight", sa.Float(), nullable=False, server_default="1.0"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("crl_id", "alias", name="uq_crl_alias"),
    )

    op.create_table(
        "common_reporting_line_taxonomy_nodes",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("crl_id", sa.Integer(), sa.ForeignKey("common_reporting_lines.id", ondelete="CASCADE"), nullable=False),
        sa.Column("taxonomy_node_code", sa.String(80), nullable=False),
        sa.Column("is_primary", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("crl_id", "taxonomy_node_code", name="uq_crl_taxonomy_node_code"),
    )

    op.create_table(
        "reporting_templates",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("code", sa.String(80), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("is_system", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("organization_id", sa.Integer(), sa.ForeignKey("organizations.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("organization_id", "code", name="uq_template_org_code"),
    )

    op.create_table(
        "reporting_template_crls",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("template_id", sa.Integer(), sa.ForeignKey("reporting_templates.id", ondelete="CASCADE"), nullable=False),
        sa.Column("crl_id", sa.Integer(), sa.ForeignKey("common_reporting_lines.id", ondelete="CASCADE"), nullable=False),
        sa.Column("is_visible", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("display_label", sa.String(200), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("template_id", "crl_id", name="uq_template_crl"),
    )

    # Columns on existing tables — use batch mode for SQLite compatibility.
    with op.batch_alter_table("accounts") as batch:
        batch.add_column(sa.Column("common_reporting_line_id", sa.Integer(), nullable=True))
        batch.add_column(sa.Column(
            "crl_state", sa.String(20), nullable=False, server_default="unclassified",
        ))
    with op.batch_alter_table("import_lines") as batch:
        batch.add_column(sa.Column("selected_common_reporting_line_id", sa.Integer(), nullable=True))
    with op.batch_alter_table("organizations") as batch:
        batch.add_column(sa.Column("active_reporting_template_id", sa.Integer(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("organizations") as batch:
        batch.drop_column("active_reporting_template_id")
    with op.batch_alter_table("import_lines") as batch:
        batch.drop_column("selected_common_reporting_line_id")
    with op.batch_alter_table("accounts") as batch:
        batch.drop_column("crl_state")
        batch.drop_column("common_reporting_line_id")
    op.drop_table("reporting_template_crls")
    op.drop_table("reporting_templates")
    op.drop_table("common_reporting_line_taxonomy_nodes")
    op.drop_table("common_reporting_line_aliases")
    op.drop_index("ix_crl_parent_id", table_name="common_reporting_lines")
    op.drop_index("ix_crl_section", table_name="common_reporting_lines")
    op.drop_table("common_reporting_lines")
