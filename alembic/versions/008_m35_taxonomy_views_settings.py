"""M35 — Enterprise Reporting Taxonomy: views, settings, enhanced taxonomy lines

Revision ID: 008
Revises: 007
Create Date: 2026-05-20
"""
from alembic import op
import sqlalchemy as sa

revision = "008"
down_revision = "007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    from sqlalchemy import inspect as sa_inspect
    bind = op.get_bind()
    inspector = sa_inspect(bind)
    existing_tables = set(inspector.get_table_names())

    # ------------------------------------------------------------------
    # reporting_taxonomy_views (new table)
    # ------------------------------------------------------------------
    if "reporting_taxonomy_views" not in existing_tables:
        op.create_table(
            "reporting_taxonomy_views",
            sa.Column("id", sa.Integer, primary_key=True),
            sa.Column("code", sa.String(50), nullable=False),
            sa.Column("name", sa.String(200), nullable=False),
            sa.Column("description", sa.Text, nullable=True),
            sa.Column("is_default", sa.Boolean, nullable=False, server_default="0"),
            sa.Column("is_system_defined", sa.Boolean, nullable=False, server_default="0"),
            sa.Column("active", sa.Boolean, nullable=False, server_default="1"),
            sa.Column("created_at", sa.DateTime, server_default=sa.func.now(), nullable=False),
            sa.Column("updated_at", sa.DateTime, server_default=sa.func.now(), nullable=False),
            sa.UniqueConstraint("code", name="uq_view_code"),
        )

    # ------------------------------------------------------------------
    # reporting_presentation_settings (new table)
    # ------------------------------------------------------------------
    if "reporting_presentation_settings" not in existing_tables:
        op.create_table(
            "reporting_presentation_settings",
            sa.Column("id", sa.Integer, primary_key=True),
            sa.Column("org_id", sa.Integer, nullable=True),
            sa.Column("display_scaling", sa.String(20), nullable=False, server_default="actual"),
            sa.Column("decimal_places", sa.Integer, nullable=False, server_default="0"),
            sa.Column("negative_format", sa.String(20), nullable=False, server_default="parentheses"),
            sa.Column("show_account_numbers", sa.Boolean, nullable=False, server_default="1"),
            sa.Column("collapse_subtotals", sa.Boolean, nullable=False, server_default="0"),
            sa.Column("show_hierarchy_indent", sa.Boolean, nullable=False, server_default="1"),
            sa.Column("show_zero_balance", sa.Boolean, nullable=False, server_default="0"),
            sa.Column("hide_inactive", sa.Boolean, nullable=False, server_default="1"),
            sa.Column("date_format", sa.String(20), nullable=False, server_default="long"),
            sa.Column("currency_symbol", sa.String(5), nullable=False, server_default="$"),
            sa.Column("bold_subtotals", sa.Boolean, nullable=False, server_default="1"),
            sa.Column("underline_totals", sa.Boolean, nullable=False, server_default="1"),
            sa.Column("alternate_row_shading", sa.Boolean, nullable=False, server_default="0"),
            sa.Column("default_view_id", sa.Integer, nullable=True),
            sa.Column("created_at", sa.DateTime, server_default=sa.func.now(), nullable=False),
            sa.Column("updated_at", sa.DateTime, server_default=sa.func.now(), nullable=False),
            sa.UniqueConstraint("org_id", name="uq_settings_org"),
        )

    # ------------------------------------------------------------------
    # Enhance reporting_taxonomy_lines (add new columns if absent)
    # ------------------------------------------------------------------
    if "reporting_taxonomy_lines" in existing_tables:
        existing_cols = {c["name"] for c in inspector.get_columns("reporting_taxonomy_lines")}

        # SQLite does not allow non-constant defaults in ALTER TABLE ADD COLUMN.
        # Use a constant string for datetime columns and nullable=True.
        is_sqlite = bind.dialect.name == "sqlite"
        dt_default = None if is_sqlite else sa.func.now()

        new_cols = [
            ("short_name",       sa.Column("short_name", sa.String(50), nullable=True)),
            ("statement_type",   sa.Column("statement_type", sa.String(30), nullable=True)),
            ("hierarchy_depth",  sa.Column("hierarchy_depth", sa.Integer, nullable=False, server_default="0")),
            ("normal_balance",   sa.Column("normal_balance", sa.String(6), nullable=True)),
            ("sign_behavior",    sa.Column("sign_behavior", sa.String(20), nullable=True, server_default="positive")),
            ("description",      sa.Column("description", sa.Text, nullable=True)),
            ("active",           sa.Column("active", sa.Boolean, nullable=False, server_default="1")),
            ("editable",         sa.Column("editable", sa.Boolean, nullable=False, server_default="1")),
            ("system_defined",   sa.Column("system_defined", sa.Boolean, nullable=False, server_default="0")),
            ("sec_xbrl_tag",     sa.Column("sec_xbrl_tag", sa.String(100), nullable=True)),
            ("created_at",       sa.Column("created_at", sa.DateTime, server_default=dt_default, nullable=True)),
            ("updated_at",       sa.Column("updated_at", sa.DateTime, server_default=dt_default, nullable=True)),
        ]

        for col_name, col_def in new_cols:
            if col_name not in existing_cols:
                op.add_column("reporting_taxonomy_lines", col_def)


def downgrade() -> None:
    from sqlalchemy import inspect as sa_inspect
    bind = op.get_bind()
    inspector = sa_inspect(bind)
    existing_tables = set(inspector.get_table_names())

    if "reporting_presentation_settings" in existing_tables:
        op.drop_table("reporting_presentation_settings")

    if "reporting_taxonomy_views" in existing_tables:
        op.drop_table("reporting_taxonomy_views")

    # SQLite doesn't support DROP COLUMN cleanly — skip column removal on downgrade
    if bind.dialect.name != "sqlite" and "reporting_taxonomy_lines" in existing_tables:
        for col in ["short_name", "statement_type", "hierarchy_depth", "normal_balance",
                    "sign_behavior", "description", "active", "editable", "system_defined",
                    "sec_xbrl_tag", "created_at", "updated_at"]:
            op.drop_column("reporting_taxonomy_lines", col)
