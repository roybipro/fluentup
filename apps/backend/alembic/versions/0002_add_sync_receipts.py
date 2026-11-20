"""add sync_receipts for idempotent offline sync

Revision ID: 0002_sync_receipts
Revises: 0001_password_hash
Create Date: 2026-11-20
"""
import sqlalchemy as sa
from alembic import op

revision = "0002_sync_receipts"
down_revision = "0001_password_hash"
branch_labels = None
depends_on = None


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    if inspector.has_table("sync_receipts"):
        return
    op.create_table(
        "sync_receipts",
        sa.Column("id", sa.String(length=64), primary_key=True),
        sa.Column("user_id", sa.String(length=64), sa.ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False),
        sa.Column("mutation_id", sa.String(length=160), nullable=False),
        sa.Column("mutation_type", sa.String(length=48), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("user_id", "mutation_id", name="uq_sync_receipt_user_mutation"),
    )
    op.create_index("ix_sync_receipts_user_id", "sync_receipts", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_sync_receipts_user_id", table_name="sync_receipts")
    op.drop_table("sync_receipts")
