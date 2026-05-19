"""M24 close management — CloseChecklist, CloseTask, CloseTaskComment,
CloseTaskAttachment, Workpaper, WorkpaperReference.

Revision ID: 004
Revises: 003
Create Date: 2026-05-18
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "004"
down_revision: Union[str, None] = "003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing = set(inspector.get_table_names())

    if "close_checklists" not in existing:
        op.create_table(
            "close_checklists",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("organization_id", sa.Integer(), sa.ForeignKey("organizations.id"), nullable=False),
            sa.Column("entity_id", sa.Integer(), sa.ForeignKey("entities.id"), nullable=True),
            sa.Column("period_id", sa.Integer(), sa.ForeignKey("accounting_periods.id"), nullable=True),
            sa.Column("close_type", sa.String(20), nullable=False, server_default="monthly"),
            sa.Column("name", sa.String(300), nullable=False),
            sa.Column("status", sa.String(30), nullable=False, server_default="open"),
            sa.Column("target_close_date", sa.Date(), nullable=True),
            sa.Column("actual_close_date", sa.Date(), nullable=True),
            sa.Column("notes", sa.Text(), nullable=True),
            sa.Column("created_by_user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
            sa.Column("approved_by_user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.Column("closed_at", sa.DateTime(), nullable=True),
            sa.Column("updated_at", sa.DateTime(), nullable=True),
        )
        op.create_index("idx_checklist_org", "close_checklists", ["organization_id"])
        op.create_index("idx_checklist_entity_period", "close_checklists", ["entity_id", "period_id"])
        op.create_index("idx_checklist_status", "close_checklists", ["status"])

    if "close_tasks" not in existing:
        op.create_table(
            "close_tasks",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("checklist_id", sa.Integer(), sa.ForeignKey("close_checklists.id", ondelete="CASCADE"), nullable=False),
            sa.Column("organization_id", sa.Integer(), sa.ForeignKey("organizations.id"), nullable=False),
            sa.Column("entity_id", sa.Integer(), sa.ForeignKey("entities.id"), nullable=True),
            sa.Column("task_type", sa.String(50), nullable=False, server_default="manual"),
            sa.Column("title", sa.String(300), nullable=False),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("status", sa.String(30), nullable=False, server_default="not_started"),
            sa.Column("priority", sa.String(20), nullable=False, server_default="medium"),
            sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("assigned_to_user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
            sa.Column("reviewer_user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
            sa.Column("prepared_by_user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
            sa.Column("reviewed_by_user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
            sa.Column("due_date", sa.Date(), nullable=True),
            sa.Column("started_at", sa.DateTime(), nullable=True),
            sa.Column("prepared_at", sa.DateTime(), nullable=True),
            sa.Column("submitted_for_review_at", sa.DateTime(), nullable=True),
            sa.Column("reviewed_at", sa.DateTime(), nullable=True),
            sa.Column("completed_at", sa.DateTime(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(), nullable=True),
            sa.Column("linked_reconciliation_id", sa.Integer(), sa.ForeignKey("reconciliations.id"), nullable=True),
            sa.Column("linked_import_batch_id", sa.Integer(), sa.ForeignKey("import_batches.id"), nullable=True),
            sa.Column("linked_workpaper_id", sa.Integer(), nullable=True),
            sa.Column("blocker_task_ids", sa.JSON(), nullable=True),
            sa.Column("rejection_reason", sa.Text(), nullable=True),
            sa.Column("notes", sa.Text(), nullable=True),
            sa.Column("is_required", sa.Boolean(), nullable=False, server_default="1"),
        )
        op.create_index("idx_ctask_checklist", "close_tasks", ["checklist_id"])
        op.create_index("idx_ctask_status", "close_tasks", ["status"])
        op.create_index("idx_ctask_assigned", "close_tasks", ["assigned_to_user_id"])
        op.create_index("idx_ctask_org", "close_tasks", ["organization_id"])

    if "close_task_comments" not in existing:
        op.create_table(
            "close_task_comments",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("task_id", sa.Integer(), sa.ForeignKey("close_tasks.id", ondelete="CASCADE"), nullable=False),
            sa.Column("author_user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
            sa.Column("comment_text", sa.Text(), nullable=False),
            sa.Column("comment_type", sa.String(30), nullable=False, server_default="comment"),
            sa.Column("prior_status", sa.String(30), nullable=True),
            sa.Column("new_status", sa.String(30), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        )
        op.create_index("idx_ctcomment_task", "close_task_comments", ["task_id"])
        op.create_index("idx_ctcomment_author", "close_task_comments", ["author_user_id"])

    if "close_task_attachments" not in existing:
        op.create_table(
            "close_task_attachments",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("task_id", sa.Integer(), sa.ForeignKey("close_tasks.id", ondelete="CASCADE"), nullable=False),
            sa.Column("document_id", sa.Integer(), sa.ForeignKey("documents.id"), nullable=True),
            sa.Column("attachment_label", sa.String(200), nullable=False),
            sa.Column("original_filename", sa.String(500), nullable=False),
            sa.Column("version_number", sa.Integer(), nullable=False, server_default="1"),
            sa.Column("document_category", sa.String(50), nullable=False, server_default="support"),
            sa.Column("uploaded_by_user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
            sa.Column("uploaded_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.Column("is_superseded", sa.Boolean(), nullable=False, server_default="0"),
            sa.Column("notes", sa.Text(), nullable=True),
        )
        op.create_index("idx_ctattach_task", "close_task_attachments", ["task_id"])

    if "workpapers" not in existing:
        op.create_table(
            "workpapers",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("organization_id", sa.Integer(), sa.ForeignKey("organizations.id"), nullable=False),
            sa.Column("entity_id", sa.Integer(), sa.ForeignKey("entities.id"), nullable=True),
            sa.Column("period_id", sa.Integer(), sa.ForeignKey("accounting_periods.id"), nullable=True),
            sa.Column("close_task_id", sa.Integer(), sa.ForeignKey("close_tasks.id"), nullable=True),
            sa.Column("title", sa.String(300), nullable=False),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("workpaper_type", sa.String(50), nullable=False, server_default="other"),
            sa.Column("status", sa.String(20), nullable=False, server_default="draft"),
            sa.Column("preparer_user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
            sa.Column("reviewer_user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
            sa.Column("reviewed_by_user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
            sa.Column("reviewer_comment", sa.Text(), nullable=True),
            sa.Column("prepared_at", sa.DateTime(), nullable=True),
            sa.Column("submitted_for_review_at", sa.DateTime(), nullable=True),
            sa.Column("reviewed_at", sa.DateTime(), nullable=True),
            sa.Column("finalized_at", sa.DateTime(), nullable=True),
            sa.Column("created_by_user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(), nullable=True),
        )
        op.create_index("idx_wp_org", "workpapers", ["organization_id"])
        op.create_index("idx_wp_entity_period", "workpapers", ["entity_id", "period_id"])
        op.create_index("idx_wp_status", "workpapers", ["status"])
        op.create_index("idx_wp_close_task", "workpapers", ["close_task_id"])

    if "workpaper_references" not in existing:
        op.create_table(
            "workpaper_references",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("workpaper_id", sa.Integer(), sa.ForeignKey("workpapers.id", ondelete="CASCADE"), nullable=False),
            sa.Column("reference_type", sa.String(50), nullable=False),
            sa.Column("reference_id", sa.Integer(), nullable=False),
            sa.Column("notes", sa.Text(), nullable=True),
            sa.Column("added_by_user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
            sa.Column("added_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        )
        op.create_index("idx_wpref_workpaper", "workpaper_references", ["workpaper_id"])
        op.create_index("idx_wpref_type_id", "workpaper_references", ["reference_type", "reference_id"])


def downgrade() -> None:
    op.drop_table("workpaper_references")
    op.drop_table("workpapers")
    op.drop_table("close_task_attachments")
    op.drop_table("close_task_comments")
    op.drop_table("close_tasks")
    op.drop_table("close_checklists")
